// ═══════════════════════════════════════════════════════════════════════════
// Bradesco — a REDE: cliente mTLS, token OAuth2 e chamada. Sem regra de
// negócio (essa mora em bradescoCobranca.ts).
//
// Medido no sandbox em 06/11/2026 (`bradesco-teste`):
//   - o certificado é pedido no handshake inicial — o Deno fala DIRETO, sem o
//     relay que a NFS-e precisa (lá o IIS pede por renegociação);
//   - token: POST form-urlencoded, 200 em ~0,5 s, `Bearer`, 3.600 s, escopo CBON;
//   - as chamadas aceitam `Authorization: Bearer <token>`.
//
// ⚠️ O ambiente vem da CARTEIRA (`fin_cobranca_carteiras.ambiente`), nunca de
// parâmetro da requisição. Cada ambiente tem os SEUS quatro secrets; produção
// sem secrets recusa dizendo quais faltam.
// ═══════════════════════════════════════════════════════════════════════════

import { jsonBancario, lerJsonBancario } from "./bradescoCobranca.ts";

export type Ambiente = "sandbox" | "producao";

const BASES: Record<Ambiente, string> = {
  sandbox: "https://openapisandbox.prebanco.com.br",
  producao: "https://openapi.bradesco.com.br",
};
const PREFIXO: Record<Ambiente, string> = {
  sandbox: "BRADESCO_SANDBOX_",
  producao: "BRADESCO_",
};

export const CAMINHOS = {
  token: "/auth/server-mtls/v2/token",
  registroHibrido: "/boleto-hibrido/cobranca-registro/v1/gerarBoleto",
  consultaHibrido: "/boleto-hibrido/cobranca-consulta-titulo/v1/consultar",
  baixa: "/boleto/cobranca-baixa/v1/baixar",
  liquidadosHibrido: "/boleto-hibrido/cobranca-lista/v1/listar",
} as const;

/** Secret colado no painel pode vir com `\n` literal, `\r` ou espaços nas pontas. */
function pem(v: string | undefined): string | null {
  if (!v) return null;
  const t = v.replace(/\\n/g, "\n").replace(/\r/g, "").trim();
  return t ? t + "\n" : null;
}

type Conexao = { cli: Deno.HttpClient; base: string; clientId: string; clientSecret: string };
const conexoes = new Map<Ambiente, Conexao>();
// ⚠️ O token dura 1 h: pedir um por chamada é desperdício e o banco limita.
// Guardado na memória da instância (some quando ela recicla — aí pede outro).
const tokens = new Map<Ambiente, { token: string; expira: number }>();

export class ErroBradesco extends Error {
  constructor(msg: string, public etapa: string) { super(msg); }
}

function conexao(amb: Ambiente): Conexao {
  const pronta = conexoes.get(amb);
  if (pronta) return pronta;
  const p = PREFIXO[amb];
  const cert = pem(Deno.env.get(`${p}CERT_PEM`));
  const key = pem(Deno.env.get(`${p}KEY_PEM`));
  const clientId = Deno.env.get(`${p}CLIENT_ID`)?.trim();
  const clientSecret = Deno.env.get(`${p}CLIENT_SECRET`)?.trim();
  const faltam = [
    !cert && `${p}CERT_PEM`, !key && `${p}KEY_PEM`,
    !clientId && `${p}CLIENT_ID`, !clientSecret && `${p}CLIENT_SECRET`,
  ].filter(Boolean);
  if (faltam.length) throw new ErroBradesco(`Faltam secrets no Supabase: ${faltam.join(", ")}.`, "secrets");
  const c: Conexao = {
    cli: Deno.createHttpClient({ cert: cert!, key: key! }),
    base: BASES[amb], clientId: clientId!, clientSecret: clientSecret!,
  };
  conexoes.set(amb, c);
  return c;
}

export type Resposta = { http: number | null; texto: string; corpo: unknown; ms: number; erroRede?: string };

async function enviar(c: Conexao, caminho: string, init: RequestInit): Promise<Resposta> {
  const t0 = Date.now();
  try {
    const r = await fetch(c.base + caminho, { ...init, client: c.cli, signal: AbortSignal.timeout(30_000) } as RequestInit);
    const texto = await r.text();
    let corpo: unknown = null;
    try { corpo = lerJsonBancario(texto); } catch { corpo = texto.slice(0, 4000); }
    return { http: r.status, texto, corpo, ms: Date.now() - t0 };
  } catch (e) {
    return { http: null, texto: "", corpo: null, ms: Date.now() - t0, erroRede: String(e) };
  }
}

async function token(amb: Ambiente, c: Conexao): Promise<string> {
  const t = tokens.get(amb);
  if (t && t.expira > Date.now() + 60_000) return t.token;
  const r = await enviar(c, CAMINHOS.token, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "client_credentials", client_id: c.clientId, client_secret: c.clientSecret }).toString(),
  });
  const corpo = (r.corpo ?? {}) as Record<string, unknown>;
  if (r.http !== 200 || typeof corpo.access_token !== "string") {
    throw new ErroBradesco(
      r.erroRede ? `Sem conexão com o Bradesco: ${r.erroRede}` : `O Bradesco recusou o token (${r.http}): ${r.texto.slice(0, 300)}`,
      "token",
    );
  }
  const seg = Number(corpo.expires_in ?? 3600);
  tokens.set(amb, { token: corpo.access_token, expira: Date.now() + (Number.isFinite(seg) ? seg : 3600) * 1000 });
  return corpo.access_token;
}

/**
 * POST JSON autenticado. O corpo sai por `jsonBancario` (bigint intacto) e a
 * resposta volta por `lerJsonBancario`. ⚠️ Falha de token SOBE (nada foi
 * enviado); falha de rede na chamada VOLTA como `http: null` — quem chama
 * decide, porque no registro ela significa "o banco PODE ter registrado".
 */
export async function postar(amb: Ambiente, caminho: string, corpo: unknown): Promise<Resposta> {
  const c = conexao(amb);
  const t = await token(amb, c);
  const r = await enviar(c, caminho, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${t}` },
    body: jsonBancario(corpo),
  });
  if (r.http === 401) tokens.delete(amb);   // token revogado: o próximo pede outro
  return r;
}

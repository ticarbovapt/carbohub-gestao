// ═══════════════════════════════════════════════════════════════════════════
// bradesco-teste — FASE 1 da cobrança Bradesco: a nossa função FALA com o banco?
//
// Responde duas perguntas, nesta ordem, e nada além delas:
//
//   1. o token sai?  (certificado + chave + client_id/secret batem — mTLS)
//   2. o registro de boleto responde?  (comum e híbrido, corpos "Sucesso")
//
// ⚠️ SÓ SANDBOX, e a URL é FIXA. A de produção fica COMENTADA: descomentar é
// gesto deliberado, nunca parâmetro passado por engano. Esta função apresenta o
// certificado da empresa — um `host` livre a faria proxy de mTLS para qualquer
// servidor (a mesma regra da `nfse-dps-teste`).
//
// ⚠️ O sandbox responde por CENÁRIO FIXO: os corpos abaixo são os "Sucesso"
// das collections Postman do portal (06/11/2026), copiados como estão — inclusive
// as datas de 2024/2025 e o beneficiário de teste. Trocar por dados nossos faz o
// sandbox devolver erro de negociação, que se leria como "a integração não
// funciona". No registro híbrido, o cenário é escolhido pelo `cnegocCobr`.
//
// ⚠️ Nada de segredo na resposta: do token sai só o tamanho, o tipo e a
// validade. A resposta do Bradesco é devolvida (é massa de teste do sandbox).
//
// ⚠️ Não entra em cron. Chamada pelo SQL Editor com o X-Cron-Secret
// (supabase/consultas/bradesco_teste_sandbox.sql).
// ═══════════════════════════════════════════════════════════════════════════

const MARCA = "bradesco-teste";
const BASE = "https://openapisandbox.prebanco.com.br";
// const BASE = "https://openapi.bradesco.com.br";   // PRODUÇÃO — não descomentar sem decisão

const TOKEN_PATH = "/auth/server-mtls/v2/token";
const REGISTRO_COMUM = "/boleto/cobranca-registro/v1/cobranca";
const REGISTRO_HIBRIDO = "/boleto-hibrido/cobranca-registro/v1/gerarBoleto";

function json(corpo: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify({ funcao: MARCA, ...corpo }, null, 2), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** Secret colado no painel pode vir com `\n` literal, `\r` ou espaços nas pontas. */
function pem(v: string | undefined): string | null {
  if (!v) return null;
  const t = v.replace(/\\n/g, "\n").replace(/\r/g, "").trim();
  return t ? t + "\n" : null;
}

/**
 * JSON com inteiros GRANDES intactos. ⚠️ A negociação do Bradesco
 * (`cnegocCobr`, `nuNegociacao` = agência + conta) tem 18 dígitos e passa do
 * maior inteiro exato do JavaScript (2^53): `111111111111111111` virava
 * `111111111111111100` sem erro nenhum — medido no 1º teste do sandbox
 * (06/11/2026). Campo assim é `bigint` (sufixo `n`) e sai no JSON como número,
 * dígito a dígito.
 */
export function jsonBancario(v: unknown): string {
  return JSON.stringify(v, (_k, x) => (typeof x === "bigint" ? `__INT__${x}` : x))
    .replace(/"__INT__(-?\d+)"/g, "$1");
}

// ── Corpos "Sucesso" das collections de SANDBOX (copiados como estão) ──────
const CORPO_COMUM = {
  nuCPFCNPJ: 31759489, filialCPFCNPJ: 1, ctrlCPFCNPJ: 55, idProduto: 9,
  nuNegociacao: 285600000000222652n, nuCliente: "1",
  dtEmissaoTitulo: "27.05.2025", dtVencimentoTitulo: "27.08.2025",
  vlNominalTitulo: "500.00", cdEspecieTitulo: 2, cindcdAceitSacdo: "2",
  percentualJuros: 0, vlJuros: "5.00", qtdeDiasJuros: 1,
  percentualMulta: "20.00", vlMulta: 0, qtdeDiasMulta: 1,
  percentualDesconto1: 0, vlDesconto1: "50.00", dataLimiteDesconto1: "29.05.2025",
  nomePagador: "CLIENTE", logradouroPagador: "AVENIDA COPACABANA", nuLogradouroPagador: "237",
  cepPagador: 0, complementoCepPagador: 0, bairroPagador: "ALPHAVILLE",
  municipioPagador: "BARUERI", ufPagador: "SP", cdIndCpfcnpjPagador: 1, nuCpfcnpjPagador: 98765432111,
  nomeSacadorAvalista: "PARCEIRO", logradouroSacadorAvalista: "AV SAO PAULO", nuLogradouroSacadorAvalista: "4",
  complementoLogradouroSacadorAvalista: "", cepSacadorAvalista: 0, complementoCepSacadorAvalista: 0,
  bairroSacadorAvalista: "VILA 237", municipioSacadorAvalista: "OSASCO", ufSacadorAvalista: "SP",
  cdIndCpfcnpjSacadorAvalista: 1, nuCpfcnpjSacadorAvalista: 12345678999, enderecoSacadorAvalista: "RUA BRA",
  dddFoneSacadorAvalista: 0, foneSacadorAvalista: 0,
  listaMsgs: [{ mensagem: "$$.*$$" }, { mensagem: "$$.*$$" }],
};

const CORPO_HIBRIDO = {
  ctitloCobrCdent: 0, registrarTitulo: 1, nroCpfCnpjBenef: 68542653, codUsuario: "APISERVIC",
  filCpfCnpjBenef: "1018", tipoAcesso: 2, digCpfCnpjBenef: 38, cpssoaJuridContr: "", ctpoContrNegoc: "",
  cidtfdProdCobr: 9, nseqContrNegoc: "", cnegocCobr: 111111111111111111n, filler: "", eNseqContrNegoc: "",
  tipoRegistro: 1, codigoBanco: 237, cprodtServcOper: "", demisTitloCobr: "17.12.2024",
  ctitloCliCdent: "TESTEBIA", dvctoTitloCobr: "20.02.2025", cidtfdTpoVcto: "", vnmnalTitloCobr: 6000,
  cindcdEconmMoeda: 9, cespceTitloCobr: 2, qmoedaNegocTitlo: 0, ctpoProteTitlo: 0, cindcdAceitSacdo: "N",
  ctpoPrzProte: 0, ctpoPrzDecurs: 0, ctpoProteDecurs: 0, cctrlPartcTitlo: 0, cindcdPgtoParcial: "N",
  cformaEmisPplta: "02", qtdePgtoParcial: 0, qtdDecurPrz: "0", codNegativacao: "0", diasNegativacao: "0",
  ptxJuroVcto: 0, filler1: "", vdiaJuroMora: 0, pmultaAplicVcto: 0, qdiaInicJuro: 0, vmultaAtrsoPgto: 0,
  pdescBonifPgto01: 0, qdiaInicMulta: 0, vdescBonifPgto01: 0, pdescBonifPgto02: 0, dlimDescBonif1: "",
  vdescBonifPgto02: 0, pdescBonifPgto03: 0, dlimDescBonif2: "", vdescBonifPgto03: 0, ctpoPrzCobr: 0,
  dlimDescBonif3: "", pdescBonifPgto: 0, dlimBonifPgto: "", vdescBonifPgto: 0, vabtmtTitloCobr: 0,
  filler2: "", viofPgtoTitlo: 0, isacdoTitloCobr: "TESTE EMPRESA PGIT", enroLogdrSacdo: "TESTE",
  elogdrSacdoTitlo: "TESTE", ecomplLogdrSacdo: "TESTE", ccepSacdoTitlo: 6332, ebairoLogdrSacdo: "TESTE",
  ccomplCepSacdo: 130, imunSacdoTitlo: "TESTE", indCpfCnpjSacdo: 1, csglUfSacdo: "SP", renderEletrSacdo: "",
  cdddFoneSacdo: 0, nroCpfCnpjSacdo: 38453450803, bancoDeb: 0, cfoneSacdoTitlo: 0, agenciaDebDv: 0,
  agenciaDeb: 0, bancoCentProt: 0, contaDeb: 0, isacdrAvalsTitlo: "", agenciaDvCentPr: 0,
  enroLogdrSacdr: "0", elogdrSacdrAvals: "", ecomplLogdrSacdr: "", ccomplCepSacdr: 0, ebairoLogdrSacdr: "",
  csglUfSacdr: "", ccepSacdrTitlo: 0, imunSacdrAvals: "", indCpfCnpjSacdr: 0, renderEletrSacdr: "",
  nroCpfCnpjSacdr: 0, cdddFoneSacdr: 0, filler3: "0", cfoneSacdrTitlo: 0, iconcPgtoSpi: "", fase: "1",
  cindcdCobrMisto: "S", ialiasAdsaoCta: "", ilinkGeracQrcd: "", caliasAdsaoCta: "", wqrcdPdraoMercd: "",
  validadeAposVencimento: "", filler4: "", idLoc: "",
};

type Resp = { status: number | null; ms: number; corpo: unknown; erro?: string; alpn?: string };

async function chamar(cli: Deno.HttpClient, url: string, init: RequestInit): Promise<Resp> {
  const t0 = Date.now();
  try {
    const r = await fetch(url, { ...init, client: cli, signal: AbortSignal.timeout(25_000) } as RequestInit);
    const txt = await r.text();
    let corpo: unknown = txt.slice(0, 6000);
    try { corpo = JSON.parse(txt); } catch { /* fica texto */ }
    return { status: r.status, ms: Date.now() - t0, corpo };
  } catch (e) {
    return { status: null, ms: Date.now() - t0, corpo: null, erro: String(e) };
  }
}

Deno.serve(async (req: Request): Promise<Response> => {
  // ⚠️ Fecha quando o segredo não existe — nunca abre (regra do repo).
  const segredo = Deno.env.get("CRON_SECRET");
  if (!segredo) return json({ ok: false, erro: "CRON_SECRET ausente no servidor" }, 500);
  if (req.headers.get("X-Cron-Secret") !== segredo) return json({ ok: false, erro: "Unauthorized" }, 401);

  const cert = pem(Deno.env.get("BRADESCO_SANDBOX_CERT_PEM"));
  const key = pem(Deno.env.get("BRADESCO_SANDBOX_KEY_PEM"));
  const clientId = Deno.env.get("BRADESCO_SANDBOX_CLIENT_ID")?.trim();
  const clientSecret = Deno.env.get("BRADESCO_SANDBOX_CLIENT_SECRET")?.trim();
  const faltando = [
    !cert && "BRADESCO_SANDBOX_CERT_PEM", !key && "BRADESCO_SANDBOX_KEY_PEM",
    !clientId && "BRADESCO_SANDBOX_CLIENT_ID", !clientSecret && "BRADESCO_SANDBOX_CLIENT_SECRET",
  ].filter(Boolean);
  if (faltando.length) return json({ ok: false, etapa: "secrets", faltando }, 500);
  if (!/BEGIN CERTIFICATE/.test(cert!)) return json({ ok: false, etapa: "secrets", erro: "BRADESCO_SANDBOX_CERT_PEM não tem a linha BEGIN CERTIFICATE" }, 500);
  if (!/BEGIN (RSA )?PRIVATE KEY/.test(key!)) return json({ ok: false, etapa: "secrets", erro: "BRADESCO_SANDBOX_KEY_PEM não tem a linha BEGIN PRIVATE KEY" }, 500);

  const pedido = await req.json().catch(() => ({})) as { passo?: string };
  const passo = pedido.passo ?? "tudo";   // token | comum | hibrido | tudo

  let cli: Deno.HttpClient;
  try {
    cli = Deno.createHttpClient({ cert: cert!, key: key! });
  } catch (e) {
    return json({ ok: false, etapa: "createHttpClient", erro: String(e) }, 500);
  }

  // ── 1. token ──────────────────────────────────────────────────────────────
  const form = new URLSearchParams({ grant_type: "client_credentials", client_id: clientId!, client_secret: clientSecret! });
  const tok = await chamar(cli, BASE + TOKEN_PATH, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  });
  const t = (tok.corpo ?? {}) as Record<string, unknown>;
  const accessToken = typeof t.access_token === "string" ? t.access_token : null;
  const token = {
    status: tok.status, ms: tok.ms, erro: tok.erro,
    ok: !!accessToken,
    token_type: t.token_type ?? null, expires_in: t.expires_in ?? null, scope: t.scope ?? null,
    tamanho_do_token: accessToken?.length ?? 0,
    // Sem token, a resposta do Bradesco é a explicação (não traz segredo).
    resposta: accessToken ? undefined : tok.corpo,
  };
  if (!accessToken || passo === "token") {
    cli.close();
    return json({ ok: !!accessToken, ambiente: "sandbox", token });
  }

  // ── 2. registro — testa o header com e sem "Bearer" (a doc não diz) ───────
  async function registrar(caminho: string, corpo: unknown) {
    const tentativas: Record<string, unknown>[] = [];
    for (const forma of ["Bearer", "cru"] as const) {
      const auth = forma === "Bearer" ? `Bearer ${accessToken}` : accessToken!;
      const r = await chamar(cli, BASE + caminho, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: auth },
        body: jsonBancario(corpo),
      });
      tentativas.push({ authorization: forma, status: r.status, ms: r.ms, erro: r.erro, resposta: r.corpo });
      // Recusa de autorização ⇒ tenta a outra forma; qualquer outra resposta já é a do registro.
      if (r.status !== 401 && r.status !== 403) break;
    }
    return tentativas;
  }

  const resultado: Record<string, unknown> = { ok: true, ambiente: "sandbox", token };
  if (passo === "tudo" || passo === "comum") resultado.registro_comum = await registrar(REGISTRO_COMUM, CORPO_COMUM);
  if (passo === "tudo" || passo === "hibrido") resultado.registro_hibrido = await registrar(REGISTRO_HIBRIDO, CORPO_HIBRIDO);
  cli.close();
  return json(resultado);
});

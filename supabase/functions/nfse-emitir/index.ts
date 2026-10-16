// ═══════════════════════════════════════════════════════════════════════════
// nfse-emitir — a NFS-e do CarboVAPT pelo Portal Nacional, a partir do pedido
//
// Chamada pelo NAVEGADOR (Finanças → Faturamento → "Emitir NFS-e"), por gente
// logada que tem o app do Finanças. A tela mostra o que vai na nota, a pessoa
// confere e confirma; aqui:
//
//   1. confere quem chama (JWT + `carbo_tem_app(['carbo_financas'])`)
//   2. reserva o nDPS no banco (série 2, contador nosso)
//   3. monta e assina o DPS (`_shared/nfseDps.ts`)
//   4. manda pelo `nfse-relay` (Node no Vercel do Finanças — o Deno não faz a
//      renegociação TLS que o SEFIN exige)
//   5. grava a resposta CRUA e o estado
//
// ⚠️ O VALOR, o DOCUMENTO e o NOME do tomador vêm do PEDIDO, lidos aqui no
// servidor — nunca do corpo da requisição. A tela edita endereço, descrição,
// competência e o indicador de operação; trocar o tomador ou o valor é outra
// venda, não uma correção na nota.
//
// ── ⚠️ DUAS TRAVAS INDEPENDENTES CONTRA PRODUÇÃO ──────────────────────────
//   1. `AMBIENTE = 2` aqui (tpAmb no XML)
//   2. o destino FIXO do relay, que é a produção restrita
// Ir para produção é mudar as DUAS, de propósito, num commit que diga isso.
// DPS aceito em produção é nota fiscal com número, que só se desfaz com
// cancelamento.
// ═══════════════════════════════════════════════════════════════════════════

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import {
  agoraBrasilia, assinar, C_IND_OP_VALIDOS, dpsCompleto, gunzipB64, gzipB64,
  lerResposta, limpo, montarId, montarInfDps, type Tomador,
} from "../_shared/nfseDps.ts";

// ⚠️ 2 = PRODUÇÃO RESTRITA (homologação). Produção é 1 — e o relay também
// precisa trocar de destino. Uma sem a outra é recusada pelo SEFIN (tpAmb
// diferente do ambiente), o que é o modo certo de falhar.
const AMBIENTE: 1 | 2 = 2;
const SERIE = "2";

// Prestador — os mesmos dados do gabarito aceito pelo ADN.
const PREST = {
  cnpj: "36060692000100",
  cLocEmi: "2408102",          // Natal/RN
  fone: "8432075055",
  email: "fiscal@carbovapt.com.br",
};

// ⚠️ Lista FECHADA de origens: esta função emite documento fiscal no CNPJ da
// empresa. Só o Finanças a chama.
const ORIGENS = [
  "https://finance.carbohub.com.br",
  "http://localhost:8083",
];
function cors(req: Request) {
  const o = req.headers.get("origin") ?? "";
  return {
    "Access-Control-Allow-Origin": ORIGENS.includes(o) ? o : ORIGENS[0],
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  };
}

const URL_SB = Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

type Resultado = {
  status: "autorizada" | "rejeitada" | "falha" | "indeterminado";
  http: number | null; resposta: string; erro: string | null;
  chave?: string | null; nNfse?: string | null; xml?: string | null; codigos?: string[];
};

/** Manda pelo relay e CLASSIFICA o que voltou. A classificação é a decisão inteira. */
async function enviar(gz: string): Promise<Resultado> {
  const relayUrl = Deno.env.get("NFSE_RELAY_URL") ?? "https://finance.carbohub.com.br/api/nfse-relay";
  const segredo = Deno.env.get("NFSE_RELAY_SECRET");
  if (!segredo) return { status: "falha", http: null, resposta: "", erro: "NFSE_RELAY_SECRET ausente no Supabase. Nada foi enviado." };

  let res: Response;
  let texto: string;
  try {
    res = await fetch(relayUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Relay-Secret": segredo },
      body: JSON.stringify({ dpsXmlGZipB64: gz }),
      signal: AbortSignal.timeout(60000),
    });
    texto = await res.text();
  } catch (e) {
    // ⚠️ O relay pode ter recebido e enviado antes de a conexão cair.
    return { status: "indeterminado", http: null, resposta: "", erro: `Sem resposta do relay (${String(e)}). A nota PODE ter saído.` };
  }

  let r: { ok?: boolean; status?: number; resposta?: string; erro?: string; etapa?: string } = {};
  try { r = JSON.parse(texto); } catch { /* abaixo */ }

  // Relay recusou ANTES de falar com o SEFIN (segredo, config, corpo): nada saiu.
  // ⚠️ Só vale quando é o RELAY dizendo isso (JSON dele, `ok: false`, sem
  // `status` do SEFIN). Um 500 em HTML é o Vercel caindo — pode ter sido no
  // meio do envio, e aí a nota pode ter saído.
  const recusaDoRelay = r.ok === false && r.status === undefined && typeof r.erro === "string";
  if (recusaDoRelay && [400, 401, 405, 500].includes(res.status)) {
    return { status: "falha", http: res.status, resposta: texto.slice(0, 20000), erro: `Relay recusou (${res.status}): ${r.erro ?? texto.slice(0, 300)}. Nada foi enviado ao portal.` };
  }
  // Rede/TLS entre o relay e o SEFIN: pode ter sido antes ou depois de enviar.
  if (typeof r.status !== "number") {
    return { status: "indeterminado", http: res.status, resposta: texto.slice(0, 20000), erro: `Falha entre o relay e o portal: ${r.erro ?? texto.slice(0, 300)}. A nota PODE ter saído.` };
  }

  const corpo = String(r.resposta ?? "");
  const lido = lerResposta(corpo);
  if (r.status >= 200 && r.status < 300 && lido.chave) {
    let xml: string | null = null;
    let nNfse: string | null = null;
    if (lido.nfseGz) {
      try {
        xml = await gunzipB64(lido.nfseGz);
        nNfse = xml.match(/<nNFSe>(\d+)<\/nNFSe>/)?.[1] ?? null;
      } catch { /* o XML virá pela sincronização do ADN */ }
    }
    return { status: "autorizada", http: r.status, resposta: corpo, erro: null, chave: lido.chave, nNfse, xml };
  }
  if (r.status >= 400 && r.status < 500) {
    return { status: "rejeitada", http: r.status, resposta: corpo, erro: lido.mensagem, codigos: lido.codigos };
  }
  // 2xx sem chave, 5xx: o portal não disse nem sim nem não.
  return { status: "indeterminado", http: r.status, resposta: corpo, erro: `O portal respondeu ${r.status} sem chave de acesso: ${lido.mensagem}` };
}

Deno.serve(async (req: Request): Promise<Response> => {
  const h = { "Content-Type": "application/json", ...cors(req) };
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(req) });
  const json = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: h });
  if (req.method !== "POST") return json({ ok: false, erro: "Use POST" }, 405);

  // ── 1. Quem chama ─────────────────────────────────────────────────────
  const auth = req.headers.get("Authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return json({ ok: false, erro: "Faça login." }, 401);
  const comoUsuario = createClient(URL_SB, ANON, { global: { headers: { Authorization: auth } } });
  const { data: u } = await comoUsuario.auth.getUser(auth.slice(7));
  if (!u?.user) return json({ ok: false, erro: "Sessão inválida." }, 401);
  const { data: pode, error: ePode } = await comoUsuario.rpc("carbo_tem_app", { p_flags: ["carbo_financas"] });
  if (ePode || pode !== true) return json({ ok: false, erro: "Emitir NFS-e é do Finanças: você não tem o app." }, 403);

  const cert = Deno.env.get("NFSE_CERT_PEM");
  const key = Deno.env.get("NFSE_KEY_PEM");
  if (!cert || !key) return json({ ok: false, erro: "Certificado ausente no servidor (NFSE_CERT_PEM / NFSE_KEY_PEM)." }, 500);

  // ── 2. O que a tela confirmou ─────────────────────────────────────────
  const b = await req.json().catch(() => ({})) as Record<string, any>;
  const orderId = String(b.order_id ?? "");
  const cIndOp = String(b.c_ind_op ?? "");
  const dCompet = String(b.d_compet ?? "");
  const descricao = limpo(b.descricao, 2000);
  const t = (b.tomador ?? {}) as Record<string, unknown>;
  const reusar = b.reusar_id ? String(b.reusar_id) : null;
  const { dhEmi, hoje } = agoraBrasilia();

  const faltas: string[] = [];
  if (!/^[0-9a-f-]{36}$/i.test(orderId)) faltas.push("pedido");
  // ⚠️ Sem padrão: o indicador varia por serviço, e escolher é da pessoa.
  if (!(C_IND_OP_VALIDOS as readonly string[]).includes(cIndOp)) faltas.push("indicador da operação");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dCompet) || dCompet > hoje) faltas.push("competência (não pode ser futura)");
  if (descricao.length < 5) faltas.push("descrição do serviço");
  const cMun = String(t.cMun ?? "").replace(/\D/g, "");
  const cep = String(t.cep ?? "").replace(/\D/g, "");
  if (cMun.length !== 7) faltas.push("código IBGE do município do tomador");
  if (cep.length !== 8) faltas.push("CEP do tomador");
  const lgr = limpo(String(t.lgr ?? ""), 255);
  const bairro = limpo(String(t.bairro ?? ""), 60);
  if (!lgr) faltas.push("logradouro do tomador");
  if (!bairro) faltas.push("bairro do tomador");
  if (faltas.length) return json({ ok: false, erro: `Falta ou está inválido: ${faltas.join(", ")}.` }, 400);

  const tomadorTela = {
    cMun, cep, lgr,
    nro: limpo(String(t.nro ?? ""), 60) || "S/N",
    cpl: limpo(String(t.cpl ?? ""), 156),
    bairro,
    fone: String(t.fone ?? "").replace(/\D/g, "").slice(0, 20),
    email: limpo(String(t.email ?? ""), 80),
  };

  const admin = createClient(URL_SB, SERVICE, { auth: { persistSession: false } });

  // ── 3. Reserva, monta, assina, envia ──────────────────────────────────
  // ⚠️ Na RESTRITA o ambiente é COMPARTILHADO e outros já usaram números com o
  // nosso CNPJ (E0014 medido em 08/10). Lá, E0014 avança para o próximo
  // número. Em PRODUÇÃO, nunca: E0014 lá significa que o número é nosso e já
  // virou nota — avançar emitiria a segunda.
  const maxTentativas = AMBIENTE === 2 && !reusar ? 8 : 1;
  let ultimo: { id: string; resultado: Resultado; nDps: number } | null = null;

  for (let tentativa = 0; tentativa < maxTentativas; tentativa++) {
    const { data: reserva, error: eRes } = await admin.rpc("carbo_nfse_emissao_reservar", {
      p_order: orderId, p_user: u.user.id, p_ambiente: AMBIENTE, p_serie: SERIE,
      p_dados: { c_ind_op: cIndOp, d_compet: dCompet, descricao, inf_comp: null, tomador: tomadorTela },
      p_reusar: tentativa === 0 ? reusar : null,
    });
    if (eRes || !reserva) return json({ ok: false, erro: eRes?.message ?? "Não consegui reservar o número da DPS." }, 400);

    const doc = String(reserva.documento ?? "").replace(/\D/g, "");
    const nome = limpo(reserva.nome, 300);
    // O rodapé do cruzamento: é por ele que a nota volta ao pedido.
    const infComp = limpo([
      `PEDIDO: ${reserva.order_number}.`,
      reserva.vendedor ? `Vendedor: ${limpo(reserva.vendedor, 120)}.` : "",
      reserva.po_number ? `Pedido de compra do cliente: ${limpo(reserva.po_number, 60)}.` : "",
    ].filter(Boolean).join(" "), 2000);

    // ⚠️ Reenvio de um `indeterminado` que falha ANTES de sair volta a
    // `indeterminado`, nunca `falha`: a primeira tentativa continua podendo
    // ter emitido, e `falha` liberaria um número novo — a nota em dobro.
    const concluirFalha = async (erro: string) => {
      await admin.rpc("carbo_nfse_emissao_concluir", {
        p_id: reserva.id, p_status: reserva.reuso ? "indeterminado" : "falha", p_http_status: null, p_resposta: "", p_erro: erro, p_inf_comp: infComp,
      });
      return json({ ok: false, erro }, 400);
    };
    if (doc.length !== 11 && doc.length !== 14) return await concluirFalha("O pedido não tem CPF/CNPJ válido do cliente.");
    if (!nome) return await concluirFalha("O pedido não tem o nome do cliente.");

    const toma: Tomador = { doc, nome, ...tomadorTela };
    const nDPS = String(reserva.n_dps);
    const id = montarId(PREST.cLocEmi, PREST.cnpj, SERIE, nDPS);
    const inf = montarInfDps({
      tpAmb: String(AMBIENTE) as "1" | "2",
      cLocEmi: PREST.cLocEmi, cnpjPrest: PREST.cnpj, fonePrest: PREST.fone, emailPrest: PREST.email,
      serie: SERIE, nDPS, dhEmi, dCompet, toma,
      descServ: descricao, infComp, valor: Number(reserva.valor).toFixed(2), cIndOp,
    }, id);

    let gz: string;
    try {
      gz = await gzipB64(dpsCompleto(inf, await assinar(inf, id, cert, key)));
    } catch (e) {
      return await concluirFalha(`Não consegui assinar o DPS: ${String(e)}. Nada foi enviado.`);
    }

    const resultado = await enviar(gz);
    let erro = resultado.erro;
    // ⚠️ Reenvio do MESMO número que volta E0014 = a primeira tentativa EMITIU.
    if (reserva.reuso && resultado.codigos?.includes("E0014")) {
      resultado.status = "indeterminado";
      erro = "O portal diz que este número JÁ EXISTE: a primeira tentativa emitiu a nota. NÃO emita outra — ela aparece na sincronização do Portal Nacional.";
    }
    const { error: eConc } = await admin.rpc("carbo_nfse_emissao_concluir", {
      p_id: reserva.id, p_status: resultado.status, p_http_status: resultado.http,
      p_resposta: resultado.resposta.slice(0, 20000), p_chave: resultado.chave ?? null,
      p_n_nfse: resultado.nNfse ?? null, p_xml: resultado.xml ?? null, p_erro: erro, p_inf_comp: infComp,
    });
    // ⚠️ Não gravou o desfecho: a linha fica `enviando` e vira `indeterminado`
    // em 5 min — o lado seguro. Mas a nota pode estar AUTORIZADA: o log e a
    // resposta precisam dizer isso, senão ela some até a sincronização do ADN.
    if (eConc) console.error("[nfse-emitir] desfecho NÃO gravado", reserva.id, resultado.status, resultado.chave, eConc);
    ultimo = { id: reserva.id, resultado: { ...resultado, erro: eConc ? `${erro ?? ""} (⚠️ o resultado não foi gravado: ${eConc.message})`.trim() : erro }, nDps: reserva.n_dps };

    const numeroOcupado = resultado.status === "rejeitada" && resultado.codigos?.includes("E0014");
    if (!(numeroOcupado && AMBIENTE === 2)) break;
  }

  const r = ultimo!.resultado;
  return json({
    ok: r.status === "autorizada",
    ambiente: AMBIENTE === 1 ? "producao" : "producao_restrita",
    emissao_id: ultimo!.id,
    serie: SERIE, n_dps: ultimo!.nDps,
    status: r.status, chave_acesso: r.chave ?? null, n_nfse: r.nNfse ?? null,
    erro: r.erro, http_status: r.http,
  });
});

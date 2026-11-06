// ═══════════════════════════════════════════════════════════════════════════
// bradesco-cobranca — boleto HÍBRIDO (boleto + Pix) pelo Bradesco, a partir do
// título do contas a receber. Chamada pelo NAVEGADOR (Finanças), por gente
// logada que tem o app.
//
//   acao "emitir"     registra o boleto do título (matriz ou filial)
//   acao "consultar"  2ª via: confere no banco e atualiza (pago, baixado…)
//   acao "cancelar"   pede a baixa (código 57) — o boleto deixa de ser pagável
//   acao "endereco_nf" o endereço do pagador pelo XML da NF do Bling (a tela
//                     pede quando o JSON da nota não o trouxe)
//
// Regras em _shared/bradescoCobranca.ts (testadas); rede em _shared/bradescoApi.ts.
//
// ⚠️ VALOR, NOME e o título vêm do BANCO (fin_boleto_reservar), nunca do corpo
// da requisição. A tela manda o endereço do pagador, o vencimento e — só quando
// o título não tem — o CPF/CNPJ.
//
// ⚠️ SANDBOX: o banco só aceita os corpos FIXOS do cenário "Sucesso", então lá
// vai `_shared/bradescoSandbox.ts` e o corpo montado com o título real fica
// guardado em `fin_boletos.corpo_montado` — é ele que se confere. Quem decide o
// ambiente é a CARTEIRA ativa da empresa, nunca a requisição.
//
// ⚠️ `indeterminado` é estado, não erro: sem resposta (rede, 5xx, 2xx sem
// linha), o banco PODE ter registrado. A tela oferece "Consultar no banco" e
// trava o "Emitir" até a consulta decidir — emitir outro seria boleto em dobro.
// ═══════════════════════════════════════════════════════════════════════════

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import {
  baixaAceita, corpoBaixa, corpoConsulta, errosDoBanco, faltasDoPagador, formatarLinha,
  jsonBancario, lerConsulta, lerRegistroHibrido, montarHibrido, multaEJuros, centavos,
  tituloInexistente, enderecoDoXmlNfe, urlXmlConfiavel, enderecoDoContatoBling, type Carteira, type Pagador,
} from "../_shared/bradescoCobranca.ts";
import { CAMINHOS, ErroBradesco, postar, type Ambiente } from "../_shared/bradescoApi.ts";
import { SANDBOX_BAIXA, SANDBOX_CONSULTA_HIBRIDO, SANDBOX_REGISTRO_HIBRIDO } from "../_shared/bradescoSandbox.ts";

// ⚠️ Lista FECHADA de origens: esta função registra cobrança no CNPJ da empresa.
const ORIGENS = ["https://finance.carbohub.com.br", "http://localhost:8083"];
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

type Json = Record<string, any>;
const texto = (v: unknown, max = 200) => String(v ?? "").trim().slice(0, max);

Deno.serve(async (req: Request): Promise<Response> => {
  const h = { "Content-Type": "application/json", ...cors(req) };
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(req) });
  const json = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: h });
  if (req.method !== "POST") return json({ ok: false, erro: "Use POST" }, 405);

  // ── Quem chama ──────────────────────────────────────────────────────────
  const auth = req.headers.get("Authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return json({ ok: false, erro: "Faça login." }, 401);
  const comoUsuario = createClient(URL_SB, ANON, { global: { headers: { Authorization: auth } } });
  const { data: u } = await comoUsuario.auth.getUser(auth.slice(7));
  if (!u?.user) return json({ ok: false, erro: "Sessão inválida." }, 401);
  const { data: pode, error: ePode } = await comoUsuario.rpc("carbo_tem_app", { p_flags: ["carbo_financas"] });
  if (ePode || pode !== true) return json({ ok: false, erro: "Boleto é do Finanças: você não tem o app." }, 403);

  const admin = createClient(URL_SB, SERVICE, { auth: { persistSession: false } });
  const b = await req.json().catch(() => ({})) as Json;

  try {
    if (b.acao === "emitir") return json(await emitir(admin, u.user.id, b));
    if (b.acao === "consultar") return json(await consultar(admin, b));
    if (b.acao === "cancelar") return json(await cancelar(admin, u.user.id, b));
    if (b.acao === "endereco_nf") return json(await enderecoDaNf(admin, b));
    return json({ ok: false, erro: "Ação desconhecida." }, 400);
  } catch (e) {
    // ErroBradesco = token/secrets: NADA foi enviado ao banco.
    const msg = e instanceof Error ? e.message : String(e);
    return json({ ok: false, erro: msg, etapa: e instanceof ErroBradesco ? e.etapa : undefined }, 400);
  }
});

// ── EMITIR ─────────────────────────────────────────────────────────────────
async function emitir(admin: any, userId: string, b: Json) {
  const p = (b.pagador ?? {}) as Json;
  const pagadorTela = {
    cep: texto(p.cep, 9), logradouro: texto(p.logradouro, 80), numero: texto(p.numero, 10),
    complemento: texto(p.complemento, 30), bairro: texto(p.bairro, 60), cidade: texto(p.cidade, 60),
    uf: texto(p.uf, 2).toUpperCase(), email: texto(p.email, 70), fone: texto(p.fone, 20),
    documento: texto(p.documento, 20),
  };
  // Nome e documento vêm do título (servidor): aqui só o endereço.
  const faltas = faltasDoPagador({ ...pagadorTela, nome: "x", documento: "00000000000" });
  if (faltas.length) return { ok: false, erro: `Falta ou está inválido: ${faltas.join(", ")}.` };
  const vencimento = texto(b.vencimento, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(vencimento)) return { ok: false, erro: "Vencimento inválido." };

  const { data: r, error: eRes } = await admin.rpc("fin_boleto_reservar", {
    p_user: userId,
    p_receivable: b.receivable_id ?? null,
    p_bling2: b.bling2_conta_id ?? null,
    p_vencimento: vencimento,
    p_pagador: pagadorTela,
  });
  if (eRes || !r) return { ok: false, erro: eRes?.message ?? "Não consegui reservar o boleto." };

  const amb = r.ambiente as Ambiente;
  const carteira: Carteira = {
    cnpj: r.carteira.cnpj, carteira: Number(r.carteira.carteira), negociacao: String(r.carteira.negociacao),
    especie: Number(r.carteira.especie), multa_pct: Number(r.carteira.multa_pct), juros_mes_pct: Number(r.carteira.juros_mes_pct),
  };
  const pagador: Pagador = { ...pagadorTela, nome: r.pagador.nome, documento: r.pagador.documento };
  const concluir = (status: string, extra: Json) => admin.rpc("fin_boleto_concluir", {
    p_id: r.id, p_status: status, p_http: extra.http ?? null, p_resposta: extra.resposta ?? "",
    p_corpo_montado: extra.montado ?? null, p_corpo_enviado: extra.enviado ?? null,
    p_registro: extra.registro ?? {}, p_erro: extra.erro ?? null,
  });

  let montado: Json;
  try {
    montado = montarHibrido(carteira, {
      nosso_numero: Number(r.nosso_numero), seu_numero: r.seu_numero,
      emissao: r.emissao, vencimento: r.vencimento, valor: Number(r.valor),
    }, pagador);
  } catch (e) {
    await concluir("falha", { erro: `Não consegui montar o boleto: ${String(e)}. Nada foi enviado.` });
    return { ok: false, boleto_id: r.id, status: "falha", erro: `Não consegui montar o boleto: ${String(e)}` };
  }
  const enviado = amb === "sandbox" ? SANDBOX_REGISTRO_HIBRIDO : montado;
  const { multa, jurosDia } = multaEJuros(centavos(Number(r.valor)), carteira);

  let resp;
  try {
    resp = await postar(amb, CAMINHOS.registroHibrido, enviado);
  } catch (e) {
    // Token ou secrets: a chamada de registro NÃO saiu.
    const erro = `${e instanceof Error ? e.message : String(e)} Nada foi enviado.`;
    await concluir("falha", { montado: jsonBancario(montado), erro });
    return { ok: false, boleto_id: r.id, status: "falha", erro };
  }

  const reg = lerRegistroHibrido(resp.corpo);
  let status: "registrado" | "rejeitado" | "indeterminado";
  let erro: string | null = null;
  if (resp.http === null) {
    status = "indeterminado";
    erro = `Sem resposta do banco (${resp.erroRede}). O boleto PODE ter sido registrado: consulte antes de emitir outro.`;
  } else if (resp.http >= 200 && resp.http < 300 && reg.linha_digitavel) {
    status = "registrado";
    if (amb === "producao" && reg.nosso_numero && Number(reg.nosso_numero) !== Number(r.nosso_numero)) {
      erro = `O banco devolveu o nosso número ${reg.nosso_numero}, e reservamos ${r.nosso_numero}.`;
    }
  } else if (resp.http >= 400 && resp.http < 500) {
    status = "rejeitado";
    erro = errosDoBanco(resp.corpo).join(" · ") || `O banco recusou (${resp.http}).`;
  } else {
    status = "indeterminado";
    erro = `O banco respondeu ${resp.http} sem a linha digitável. O boleto PODE ter sido registrado: consulte antes de emitir outro.`;
  }

  const { error: eConc } = await concluir(status, {
    http: resp.http, resposta: resp.texto.slice(0, 20000),
    montado: jsonBancario(montado), enviado: jsonBancario(enviado),
    registro: { ...reg, multa_cent: multa, juros_dia_cent: jurosDia }, erro,
  });
  // ⚠️ Não gravou o desfecho: a linha fica `enviando` e, em 5 min, a consulta a
  // trata como indeterminada — o lado seguro. Mas o log tem de dizer.
  if (eConc) console.error("[bradesco-cobranca] desfecho NÃO gravado", r.id, status, reg.linha_digitavel, eConc);

  return {
    ok: status === "registrado", boleto_id: r.id, status, ambiente: amb,
    nosso_numero: reg.nosso_numero ?? String(r.nosso_numero),
    linha_digitavel: reg.linha_digitavel ? formatarLinha(reg.linha_digitavel) : null,
    erro: eConc ? `${erro ?? ""} (⚠️ o resultado não foi gravado: ${eConc.message})`.trim() : erro,
  };
}

// ── Boleto + carteira, lidos como service role ─────────────────────────────
async function lerBoleto(admin: any, id: unknown) {
  if (!/^[0-9a-f-]{36}$/i.test(String(id ?? ""))) throw new Error("Boleto inválido.");
  const { data, error } = await admin.from("fin_boletos")
    .select("id, status, ambiente, nosso_numero, nosso_numero_banco, enviado_em, carteira:fin_cobranca_carteiras(cnpj, carteira, negociacao)")
    .eq("id", id).maybeSingle();
  if (error || !data) throw new Error(error?.message ?? "Boleto não encontrado.");
  return data as Json;
}

// ── CONSULTAR ──────────────────────────────────────────────────────────────
async function consultar(admin: any, b: Json) {
  const bol = await lerBoleto(admin, b.boleto_id);
  if (!["registrado", "indeterminado", "enviando"].includes(bol.status)) {
    return { ok: false, erro: `Boleto ${bol.status}: não há o que consultar.` };
  }
  const amb = bol.ambiente as Ambiente;
  const nn = bol.nosso_numero_banco ?? bol.nosso_numero;
  const corpo = amb === "sandbox" ? SANDBOX_CONSULTA_HIBRIDO : corpoConsulta(bol.carteira, nn);
  const resp = await postar(amb, CAMINHOS.consultaHibrido, corpo);

  if (resp.http === null) return { ok: false, erro: `Sem resposta do banco: ${resp.erroRede}` };
  const atualizar = (status: string, campos: Json) => admin.rpc("fin_boleto_atualizar", {
    p_id: bol.id, p_status: status, p_resposta: resp.texto.slice(0, 20000), p_campos: campos,
  });

  if (resp.http >= 200 && resp.http < 300 && !tituloInexistente(resp.corpo)) {
    const c = lerConsulta(resp.corpo);
    const { error } = await atualizar(c.situacao, {
      status_banco: c.status_banco, linha_digitavel: c.linha_digitavel, pix_copia_cola: c.pix_copia_cola,
      pago_em: c.pago_em, valor_pago: c.valor_pago, erro: null,
    });
    if (error) return { ok: false, erro: error.message };
    return { ok: true, status: c.situacao, status_banco: c.status_banco, pago_em: c.pago_em, valor_pago: c.valor_pago };
  }
  // ⚠️ Só "o título NÃO existe" libera um indeterminado para `falha` (e, com
  // isso, para emitir de novo). Qualquer outra recusa mantém como está.
  if (tituloInexistente(resp.corpo) && bol.status !== "registrado") {
    const { error } = await atualizar("falha", { erro: "O banco informa que este boleto não existe: pode emitir outro." });
    if (error) return { ok: false, erro: error.message };
    return { ok: true, status: "falha", erro: "O banco informa que este boleto não existe." };
  }
  return { ok: false, erro: errosDoBanco(resp.corpo).join(" · ") || `O banco respondeu ${resp.http}.` };
}

// ── CANCELAR (baixa 57) ────────────────────────────────────────────────────
async function cancelar(admin: any, userId: string, b: Json) {
  const bol = await lerBoleto(admin, b.boleto_id);
  if (bol.status !== "registrado") return { ok: false, erro: `Só se cancela boleto registrado (este está ${bol.status}).` };
  const amb = bol.ambiente as Ambiente;
  const nn = bol.nosso_numero_banco ?? bol.nosso_numero;
  const corpo = amb === "sandbox" ? SANDBOX_BAIXA : corpoBaixa(bol.carteira, nn);
  const resp = await postar(amb, CAMINHOS.baixa, corpo);
  if (resp.http === null) return { ok: false, erro: `Sem resposta do banco: ${resp.erroRede}. Consulte antes de tentar de novo.` };
  if (!baixaAceita(resp.http, resp.corpo)) {
    return { ok: false, erro: errosDoBanco(resp.corpo).join(" · ") || `O banco recusou a baixa (${resp.http}).` };
  }
  const { error } = await admin.rpc("fin_boleto_atualizar", {
    p_id: bol.id, p_status: "cancelado", p_resposta: resp.texto.slice(0, 20000),
    p_campos: { status_banco: "BAIXADO CONFORME SEU PEDIDO", erro: null }, p_user: userId,
  });
  if (error) return { ok: false, erro: `O banco baixou, mas não consegui gravar aqui: ${error.message}` };
  return { ok: true, status: "cancelado" };
}

// ── ENDEREÇO do pagador, pelo Bling ───────────────────────────────────────
// Ordem: NF (JSON do espelho) → CADASTRO do contato no Bling (`GET /contatos/{id}`,
// endereço de cobrança) → XML da NF. O título e o contato saem do BANCO: a tela
// não manda id nem URL — esta função não baixa o que alguém escolher, e o XML
// só de `*.bling.com.br`.
// ⚠️ O token do Bling é SÓ LIDO (a regra de toda função fora do bling-sync):
// perto de vencer, pula o cadastro em vez de renovar.
const BLING_API = "https://api.bling.com.br/Api/v3";
const MARGEM_TOKEN_MS = 2 * 60 * 1000;

async function tokenBling(admin: any, conta: 1 | 2): Promise<string | null> {
  // A MESMA leitura das funções que já rodam: bling-contas-espelho (conta 1) e
  // bling2-contas (conta 2).
  const { data } = conta === 1
    ? await admin.from("bling_integration").select("access_token, expires_at").eq("is_active", true).maybeSingle()
    : await admin.from("bling2_integration").select("access_token, expires_at")
        .eq("is_active", true).order("connected_at", { ascending: false }).limit(1).maybeSingle();
  if (!data?.access_token) return null;
  if (new Date(data.expires_at).getTime() - Date.now() < MARGEM_TOKEN_MS) return null;
  return data.access_token as string;
}

async function contatoDoBling(admin: any, conta: 1 | 2, contatoId: number) {
  const token = await tokenBling(admin, conta);
  if (!token) return { motivo: `o acesso ao Bling ${conta} está sendo renovado; tente de novo em 1 minuto` };
  try {
    const r = await fetch(`${BLING_API}/contatos/${contatoId}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) return { motivo: `o Bling ${conta} não devolveu o cadastro do cliente (${r.status})` };
    const j = await r.json().catch(() => null);
    const e = enderecoDoContatoBling(j?.data ?? j);
    return e ? { endereco: e } : { motivo: "o cadastro do cliente no Bling está sem CEP" };
  } catch (e) {
    return { motivo: `o Bling ${conta} não respondeu (${String(e).slice(0, 80)})` };
  }
}

async function enderecoDaNf(admin: any, b: Json) {
  const { data: t, error } = await admin.rpc("fin_boleto_titulo", {
    p_receivable: b.receivable_id ?? null, p_bling2: b.bling2_conta_id ?? null, p_travar: false,
  });
  if (error || !t) return { ok: false, erro: error?.message ?? "Título não encontrado." };

  let nfs: Json[] = [];
  if (t.documento) {
    const { data } = await admin.rpc("fin_boleto_nfs_do_cliente", { p_doc: t.documento, p_limite: 5 });
    nfs = (data ?? []) as Json[];
    const comJson = nfs.find((n) => n.endereco?.cep);
    if (comJson) return { ok: true, endereco: comJson.endereco, origem: `Endereço da NF ${comJson.numero}` };
  }

  // O cadastro do cliente no Bling — pelo contato do PRÓPRIO título.
  let motivo = "o título não tem o contato do Bling";
  if (t.contato_id && (t.conta === 1 || t.conta === 2)) {
    const c = await contatoDoBling(admin, t.conta, Number(t.contato_id));
    if ("endereco" in c && c.endereco) return { ok: true, endereco: c.endereco, origem: "Cadastro do cliente no Bling" };
    motivo = (c as { motivo: string }).motivo;
  }

  let tentadas = 0;
  for (const n of nfs) {
    if (!urlXmlConfiavel(n.xml_url) || tentadas >= 3) continue;
    tentadas++;
    try {
      const r = await fetch(n.xml_url, { signal: AbortSignal.timeout(8000) });
      if (!r.ok) continue;
      const e = enderecoDoXmlNfe(await r.text());
      if (e) return { ok: true, endereco: e, origem: `Endereço da NF ${n.numero}` };
    } catch { /* tenta a próxima nota */ }
  }
  const nfTxt = nfs.length ? `${nfs.length} NF(s) sem endereço legível` : "nenhuma NF com este CPF/CNPJ";
  return { ok: false, erro: `Endereço não encontrado: ${motivo}; ${nfTxt}.` };
}

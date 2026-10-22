// ─────────────────────────────────────────────────────────────────────────────
// bling-contas-baixar — a baixa feita no Finanças VAI para o Bling 1 (matriz),
// e o estorno também. Chamada pelo NAVEGADOR (JWT), logo depois da baixa local.
//
//   acao "baixar"   POST /contas/<tipo>/<id>/baixar   → guarda o borderô
//   acao "estornar" DELETE /borderos/<id>              → só o borderô que ESTA
//                                                         função criou
//
// ⚠️ ESCREVE dado financeiro em outro sistema. Por isso:
//   • Liga e desliga por CADASTRO (`fin_bling_baixa_config`), que nasce
//     DESLIGADO; `teste_ids` libera títulos UM A UM para o teste antes de ligar.
//     Desligado, responde `pulado` e não fala com o Bling.
//   • A baixa LOCAL já aconteceu quando esta função é chamada, e a falha daqui
//     NÃO a desfaz: fica em `bling_baixa_erro` e a tela mostra com "tentar de
//     novo". O inverso (Bling pago, sistema aberto) é o erro caro — dinheiro
//     contado como recebido que ninguém marcou.
//   • ⚠️ Reconfere o título NO BLING antes de baixar: já pago lá ⇒ não baixa de
//     novo (borderô em dobro), só registra. Cancelado lá ⇒ recusa.
//   • ⚠️ Só desfaz borderô NOSSO e de UM título só. Borderô pode cobrir vários
//     títulos (o "pagamentos" é lista): apagá-lo desfaria a baixa de outros,
//     calado. Baixa feita no próprio Bling se desfaz no Bling.
//   • ⚠️ NUNCA renova o token por conta própria (o `refresh_token` troca a cada
//     renovação, e duas funções renovando derrubariam a EMISSÃO DE NF). Perto de
//     vencer, pede ao `bling-sync` — o único que renova — e relê.
//   • Trava por linha (`bling_baixa_tentando_em`): dois cliques ou duas abas não
//     criam dois borderôs.
// ─────────────────────────────────────────────────────────────────────────────
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
// A regra da baixa é a MESMA da filial (`bling2-contas`): um arquivo só.
import { decidirBaixa, diaBrasilia } from "../_shared/blingContasRegra.ts";

const URL_SB = Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CRON_SECRET = Deno.env.get("CRON_SECRET");
const BLING_API = "https://api.bling.com.br/Api/v3";
const MARGEM_TOKEN_MS = 2 * 60 * 1000;

// Chamada pelo navegador: a fronteira é o SSO (`*.carbohub.com.br`). A porta de
// verdade é o JWT + o app do Finanças, conferidos abaixo.
function cors(req: Request) {
  const o = req.headers.get("origin") ?? "";
  const ok = /^https:\/\/([a-z0-9-]+\.)*carbohub\.com\.br$/.test(o) || /^http:\/\/localhost:\d+$/.test(o);
  return {
    "Access-Control-Allow-Origin": ok ? o : "https://finance.carbohub.com.br",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  };
}

type Tipo = "pagar" | "receber";
const TABELA: Record<Tipo, string> = { pagar: "purchase_payables", receber: "receivables" };
const ESPELHO: Record<Tipo, string> = { pagar: "bling_contas_pagar", receber: "bling_contas_receber" };
const QUANDO: Record<Tipo, string> = { pagar: "paid_at", receber: "received_at" };
const QUEM: Record<Tipo, string> = { pagar: "paid_by", receber: "received_by" };
const PAGO: Record<Tipo, string> = { pagar: "pago", receber: "recebido" };

class BlingRecusou extends Error { constructor(public status: number, msg: string) { super(msg); } }

async function bling(token: string, metodo: string, caminho: string, corpo?: unknown, tentativa = 0): Promise<any> {
  const r = await fetch(`${BLING_API}${caminho}`, {
    method: metodo,
    headers: { Authorization: `Bearer ${token}`, ...(corpo ? { "Content-Type": "application/json" } : {}) },
    body: corpo ? JSON.stringify(corpo) : undefined,
  });
  if (r.status === 429 && tentativa < 3) {
    await new Promise((ok) => setTimeout(ok, 1000 * 2 ** tentativa));
    return bling(token, metodo, caminho, corpo, tentativa + 1);
  }
  const texto = await r.text().catch(() => "");
  if (!r.ok) {
    // O Bling explica a recusa no corpo (`error.description` / `error.fields`).
    let motivo = texto.slice(0, 400);
    try {
      const j = JSON.parse(texto);
      const campos = (j?.error?.fields ?? []).map((f: any) => f?.msg ?? f?.element).filter(Boolean).join("; ");
      motivo = [j?.error?.description ?? j?.error?.message, campos].filter(Boolean).join(" — ") || motivo;
    } catch { /* corpo não é JSON: fica o texto */ }
    throw new BlingRecusou(r.status, `Bling ${r.status}: ${motivo}`);
  }
  if (!texto) return {};
  try { return JSON.parse(texto); } catch { return {}; }
}

const dormir = (ms: number) => new Promise((ok) => setTimeout(ok, ms));

/**
 * ENSAIO — responde "a baixa funcionaria?" SEM escrever em lugar nenhum: nem no
 * Bling, nem aqui. Lê o token, lê cada título no Bling AGORA e devolve o corpo
 * EXATO que seria enviado (pela mesma `decidirBaixa`). E lê um borderô de
 * título já quitado, que é de onde vem a data de pagamento no sentido inverso.
 * Chamado pelo SQL Editor com o X-Cron-Secret — por isso existe sem JWT.
 * ⚠️ O que ele NÃO prova: o Bling ACEITAR o POST. Isso só um envio de verdade.
 */
async function ensaio(b: Record<string, unknown>): Promise<Record<string, unknown>> {
  const db = createClient(URL_SB, SERVICE, { auth: { persistSession: false } });
  const tipos: Tipo[] = b.tipo === "pagar" ? ["pagar"] : b.tipo === "receber" ? ["receber"] : ["receber", "pagar"];
  const limite = Math.min(Math.max(Number(b.limite) || 5, 1), 25);
  const saida: Record<string, unknown> = { marcador: "bling-contas-baixar-ensaio", escreveu: false };

  const { data: cfg } = await db.from("fin_bling_baixa_config").select("ativo, teste_ids, portador_padrao_id").maybeSingle();
  saida.config = cfg ?? "sem linha em fin_bling_baixa_config";

  const { data: integ } = await db.from("bling_integration")
    .select("access_token, expires_at").eq("is_active", true).maybeSingle();
  if (!integ?.access_token) return { ...saida, ok: false, mensagem: "Sem integração ativa do Bling 1." };
  // ⚠️ O ensaio NÃO pede renovação (não tem usuário para chamar o bling-sync).
  if (new Date(integ.expires_at).getTime() - Date.now() < MARGEM_TOKEN_MS) {
    return { ...saida, ok: false, mensagem: "Token do Bling perto de vencer — o bling-sync renova; rode o ensaio de novo em alguns minutos." };
  }
  const token = integ.access_token as string;
  const hoje = diaBrasilia(null);

  for (const tipo of tipos) {
    const tabela = TABELA[tipo];
    let q = db.from(tabela).select("id, bling_id, status, amount, due_date")
      .eq("source", "bling").not("bling_id", "is", null);
    const ids = Array.isArray(b.ids) ? (b.ids as unknown[]).map(String).filter((x) => /^[0-9a-f-]{36}$/i.test(x)) : [];
    q = ids.length ? q.in("id", ids) : q.not("status", "in", `(${PAGO[tipo]},cancelado)`)
      .order("due_date", { ascending: false }).limit(limite);
    const { data: locais, error } = await q;
    if (error) { saida[tipo] = { erro: `ler ${tabela}: ${error.message}` }; continue; }

    const titulos: unknown[] = [];
    const contagem: Record<string, number> = {};
    for (const t of (locais ?? []).slice(0, 25)) {
      await dormir(350);
      try {
        const d = (await bling(token, "GET", `/contas/${tipo}/${t.bling_id}`))?.data ?? {};
        const r = decidirBaixa(tipo, d, cfg?.portador_padrao_id, hoje, "nome de quem baixou");
        contagem[r.decisao] = (contagem[r.decisao] ?? 0) + 1;
        titulos.push({
          id: t.id, bling_id: t.bling_id, status_aqui: t.status, valor: t.amount, vencimento: t.due_date,
          no_bling: { situacao: d.situacao ?? null, valor: d.valor ?? null, saldo: d.saldo ?? null,
                      portador: d.portador?.id ?? null, categoria: d.categoria?.id ?? null },
          decisao: r.decisao,
          ...(r.decisao === "enviar"
            ? { enviaria: { metodo: "POST", caminho: `/contas/${tipo}/${t.bling_id}/baixar`, corpo: r.corpo } }
            : { mensagem: r.mensagem }),
        });
      } catch (e) {
        contagem.erro_ao_ler = (contagem.erro_ao_ler ?? 0) + 1;
        titulos.push({ id: t.id, bling_id: t.bling_id, erro: e instanceof Error ? e.message : String(e) });
      }
    }

    // O sentido inverso: a data de pagamento vem do borderô de título quitado.
    let bordero: unknown = "nenhum título quitado com borderô no espelho";
    const { data: quitado } = await db.from(ESPELHO[tipo]).select("bling_id, borderos:detalhe->borderos")
      .in("situacao", ["2", "3"]).not("detalhe", "is", null).order("bling_id", { ascending: false }).limit(50);
    const com = (quitado ?? []).find((x: any) => Array.isArray(x.borderos) && x.borderos.length);
    if (com) {
      const idB = Math.max(...(com as any).borderos.map((x: any) => Number(typeof x === "object" ? x?.id : x)).filter((n: number) => n > 0));
      try {
        await dormir(350);
        const bo = (await bling(token, "GET", `/borderos/${idB}`))?.data ?? {};
        bordero = { titulo_bling_id: (com as any).bling_id, bordero_id: idB, data: bo.data ?? null,
                    chaves: Object.keys(bo), pagamentos: Array.isArray(bo.pagamentos) ? bo.pagamentos.length : null };
      } catch (e) {
        bordero = { titulo_bling_id: (com as any).bling_id, bordero_id: idB, erro: e instanceof Error ? e.message : String(e) };
      }
    } else if ((quitado ?? []).length) {
      bordero = { mensagem: "títulos quitados SEM borderôs no detalhe", exemplo: quitado![0] };
    }
    saida[tipo] = { contagem, titulos, bordero_amostra: bordero };
  }
  return { ...saida, ok: true };
}

Deno.serve(async (req: Request): Promise<Response> => {
  const h = { "Content-Type": "application/json", ...cors(req) };
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(req) });
  const json = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: h });
  if (req.method !== "POST") return json({ ok: false, mensagem: "Use POST" }, 405);

  // ── 0. Ensaio (SQL Editor, X-Cron-Secret): só lê, nunca escreve ──────────
  const segredo = req.headers.get("x-cron-secret");
  if (segredo != null) {
    const marcador = "bling-contas-baixar-ensaio";   // é por ele que o SQL Editor acha a resposta
    if (!CRON_SECRET) return json({ marcador, ok: false, mensagem: "CRON_SECRET ausente no servidor." }, 500);
    if (segredo !== CRON_SECRET) return json({ marcador, ok: false, mensagem: "não autorizado" }, 401);
    const corpo = await req.json().catch(() => ({})) as Record<string, unknown>;
    if (corpo.ensaio !== true) return json({ marcador, ok: false, mensagem: "Com o segredo só se roda o ENSAIO ({\"ensaio\": true})." }, 400);
    try { return json(await ensaio(corpo)); }
    catch (e) { return json({ marcador, ok: false, mensagem: e instanceof Error ? e.message : String(e) }, 500); }
  }

  // ── 1. Quem chama ─────────────────────────────────────────────────────────
  const auth = req.headers.get("Authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return json({ ok: false, mensagem: "Faça login." }, 401);
  const comoUsuario = createClient(URL_SB, ANON, { global: { headers: { Authorization: auth } } });
  const { data: u } = await comoUsuario.auth.getUser(auth.slice(7));
  if (!u?.user) return json({ ok: false, mensagem: "Sessão inválida." }, 401);
  const { data: pode, error: ePode } = await comoUsuario.rpc("carbo_tem_app", { p_flags: ["carbo_financas"] });
  if (ePode || pode !== true) return json({ ok: false, mensagem: "Baixa no Bling é do Finanças: você não tem o app." }, 403);

  const b = await req.json().catch(() => ({})) as Record<string, unknown>;
  const acao = String(b.acao ?? "");
  const tipo = String(b.tipo ?? "") as Tipo;
  const id = String(b.id ?? "");
  if (!["baixar", "estornar"].includes(acao) || !TABELA[tipo] || !/^[0-9a-f-]{36}$/i.test(id)) {
    return json({ ok: false, mensagem: "Pedido inválido (acao, tipo, id)." }, 400);
  }

  const db = createClient(URL_SB, SERVICE, { auth: { persistSession: false } });
  const tabela = TABELA[tipo];

  // ── 2. O interruptor ──────────────────────────────────────────────────────
  const { data: cfg, error: eCfg } = await db.from("fin_bling_baixa_config")
    .select("ativo, teste_ids, portador_padrao_id").maybeSingle();
  if (eCfg) return json({ ok: false, mensagem: `Configuração ilegível: ${eCfg.message}` }, 500);
  const liberado = !!cfg?.ativo || ((cfg?.teste_ids ?? []) as string[]).includes(id);
  if (!liberado) return json({ ok: true, pulado: "desligado", mensagem: "Envio ao Bling desligado — a baixa ficou só no sistema." });

  // ── 3. O título daqui ─────────────────────────────────────────────────────
  const { data: t, error: eT } = await db.from(tabela)
    .select(`id, source, bling_id, status, amount, ${QUANDO[tipo]}, ${QUEM[tipo]}, bling_baixa_em, bling_baixa_bordero, bling_baixa_tentando_em`)
    .eq("id", id).maybeSingle();
  if (eT) return json({ ok: false, mensagem: `Ler o título: ${eT.message}` }, 500);
  if (!t) return json({ ok: false, mensagem: "Título não encontrado." }, 404);
  const tt = t as Record<string, any>;
  if (tt.source !== "bling" || !tt.bling_id) {
    return json({ ok: true, pulado: "nao_e_do_bling", mensagem: "Título não veio do Bling — nada a enviar." });
  }

  // ── 4. Trava: uma tentativa por vez por título ────────────────────────────
  const { data: pego } = await db.from(tabela)
    .update({ bling_baixa_tentando_em: new Date().toISOString() })
    .eq("id", id)
    .or(`bling_baixa_tentando_em.is.null,bling_baixa_tentando_em.lt.${new Date(Date.now() - 120_000).toISOString()}`)
    .select("id");
  if (!pego?.length) return json({ ok: false, mensagem: "Já há um envio deste título em andamento — aguarde e atualize." }, 409);

  const marcar = async (campos: Record<string, unknown>) => {
    await db.from(tabela).update({ ...campos, bling_baixa_tentando_em: null }).eq("id", id);
  };

  try {
    // ── 5. O token: lê; perto de vencer, pede ao bling-sync (o único que renova)
    const lerToken = async () => (await db.from("bling_integration")
      .select("access_token, expires_at").eq("is_active", true).maybeSingle()).data;
    let integ = await lerToken();
    if (integ && new Date(integ.expires_at).getTime() - Date.now() < MARGEM_TOKEN_MS) {
      await fetch(`${URL_SB}/functions/v1/bling-sync`, {
        method: "POST",
        headers: { Authorization: auth, "Content-Type": "application/json" },
        body: JSON.stringify({ entity: "naturezas" }),   // a ação mais leve: só serve para o token ser renovado
      }).catch(() => null);
      integ = await lerToken();
    }
    if (!integ?.access_token || new Date(integ.expires_at).getTime() < Date.now()) {
      throw new Error("Sem token válido do Bling 1 (a integração está desconectada?).");
    }
    const token = integ.access_token as string;

    // ── 6. O título no Bling, AGORA ───────────────────────────────────────────
    const d = (await bling(token, "GET", `/contas/${tipo}/${tt.bling_id}`))?.data ?? {};
    const situacao = d.situacao != null ? String(d.situacao) : null;

    if (acao === "baixar") {
      if (tt.status !== PAGO[tipo]) {
        await marcar({});
        return json({ ok: false, mensagem: "O título não está baixado no sistema." }, 400);
      }
      if (tt.bling_baixa_bordero) {
        await marcar({ bling_baixa_erro: null });
        return json({ ok: true, pulado: "ja_enviado", mensagem: "Esta baixa já está no Bling.", bordero: tt.bling_baixa_bordero });
      }
      const { data: perfil } = await db.from("profiles").select("full_name").eq("id", u.user.id).maybeSingle();
      const quem = (perfil?.full_name as string | null)?.trim() || null;
      const dec = decidirBaixa(tipo, d, cfg?.portador_padrao_id, diaBrasilia(tt[QUANDO[tipo]]), quem);
      if (dec.decisao === "ja_pago_no_bling") {
        // Pago lá por alguém: NÃO baixa de novo. Sem borderô nosso — o estorno
        // desta baixa é no Bling.
        await marcar({ bling_baixa_em: new Date().toISOString(), bling_baixa_erro: null });
        return json({ ok: true, pulado: "ja_pago_no_bling", mensagem: dec.mensagem });
      }
      if (dec.decisao !== "enviar") {
        await marcar({ bling_baixa_erro: dec.mensagem });
        return json({ ok: false, mensagem: dec.mensagem });
      }
      const corpo = dec.corpo;

      const r = await bling(token, "POST", `/contas/${tipo}/${tt.bling_id}/baixar`, corpo);
      const bordero = Number(r?.data?.bordero?.id ?? r?.bordero?.id ?? r?.data?.id) || null;
      const agora = new Date().toISOString();
      await marcar({ bling_baixa_em: agora, bling_baixa_bordero: bordero, bling_baixa_erro: null });
      // O espelho passa a dizer a verdade já, sem esperar a próxima rodada —
      // senão o aplicador dos 10 min leria "aberto no Bling" com dado velho.
      await db.from(ESPELHO[tipo]).update({ situacao: "2", data_pagamento: corpo.data, detalhe_em: null })
        .eq("bling_id", tt.bling_id);
      return json({ ok: true, mensagem: "Baixa enviada ao Bling.", bordero });
    }

    // ── acao === "estornar" ───────────────────────────────────────────────────
    if (!tt.bling_baixa_bordero) {
      if (situacao === "2" || situacao === "3") {
        await marcar({});
        return json({ ok: false, mensagem: "A baixa deste título está no Bling e não foi feita pelo sistema — desfaça no Bling; o sistema acompanha em até 15 min." });
      }
      await marcar({ bling_baixa_em: null, bling_baixa_erro: null });
      return json({ ok: true, pulado: "nada_no_bling", mensagem: "Nada a desfazer no Bling." });
    }
    const bo = (await bling(token, "GET", `/borderos/${tt.bling_baixa_bordero}`))?.data ?? {};
    const pagamentos = Array.isArray(bo.pagamentos) ? bo.pagamentos.length : 0;
    if (pagamentos > 1) {
      await marcar({});
      return json({ ok: false, mensagem: `O borderô ${tt.bling_baixa_bordero} cobre ${pagamentos} títulos no Bling — desfaça lá, para não estornar os outros.` });
    }
    await bling(token, "DELETE", `/borderos/${tt.bling_baixa_bordero}`);
    await marcar({ bling_baixa_em: null, bling_baixa_bordero: null, bling_baixa_erro: null });
    await db.from(ESPELHO[tipo]).update({ situacao: "1", data_pagamento: null, detalhe_em: null })
      .eq("bling_id", tt.bling_id);
    return json({ ok: true, mensagem: "Baixa desfeita no Bling." });
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e);
    await marcar(acao === "baixar" ? { bling_baixa_erro: m } : {});
    return json({ ok: false, mensagem: m });
  }
});

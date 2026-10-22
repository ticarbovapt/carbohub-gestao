// ─────────────────────────────────────────────────────────────────────────────
// bling2-contas — contas a pagar/receber da FILIAL (Bling 2), nos dois sentidos.
//
//   Bling 2 → sistema   acao "espelho" (cron, X-Cron-Secret, a cada 10 min)
//   sistema → Bling 2   acao "baixar" / "estornar" (tela do Finanças, JWT)
//   ensaio              { ensaio: true } (SQL Editor, X-Cron-Secret) — SÓ LÊ
//
// ⚠️ ESPELHO QUE ESCALA. O `bling2-sync` (fases contas_*) relê o HISTÓRICO
// INTEIRO a cada rodada — custo que cresce com cada título já quitado. Aqui a
// rodada lê só os ABERTOS (`fin_bling2_baixa_config.filtro_abertos`), que é o
// que muda; quem SAIU da lista de abertos (foi pago, cancelado) ganha o detalhe
// um a um, e o borderô dá a data do pagamento. O custo segue o volume de
// títulos EM ABERTO, não o tamanho do histórico.
//   ⚠️ Se o Bling IGNORAR o filtro (vier título quitado na lista), a rodada NÃO
//   grava nada daquele tipo e diz isso no log — "sumiu da lista" só significa
//   "foi pago" se a lista é mesmo a de abertos (`planejarEspelho`).
//   ⚠️ O `bling2-sync` continua como está (a varredura completa): é ACRÉSCIMO.
//   O gatilho `bling2_contas_nao_apaga_pagamento` impede que a listagem dele,
//   que não traz data de pagamento, apague a data que o borderô deu.
//
// ⚠️ A BAIXA vai PRIMEIRO ao Bling, ao contrário da matriz: a filial não tem
// título próprio aqui (só o espelho), então "baixado aqui e recusado lá" não
// existe — se o Bling recusa, nada mudou, e a tela diz o motivo. Mesmas travas
// da matriz: interruptor que nasce DESLIGADO (+ `teste_ids`), reconfere o
// título no Bling antes, trava por linha, e só desfaz borderô NOSSO de UM
// título.
//
// ⚠️ NUNCA RENOVA o token do Bling 2. Quem renova é o `bling2-sync` (o
// incremental de 1 min renova quando faltam < 5 min); token perto de vencer ⇒
// esta função PULA (espelho) ou pede para tentar em 1 min (baixa). Duas
// funções renovando = o `refresh_token` queimado e a integração desativada.
// ─────────────────────────────────────────────────────────────────────────────
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  conferirBaixa, decidirBaixa, diaBrasilia, dataDaBaixa, estaAberta, idsDeBordero, lerAjustes, planejarEspelho,
  type LocalConta, type ListadaConta, type TipoConta,
} from "../_shared/blingContasRegra.ts";

const URL_SB = Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CRON_SECRET = Deno.env.get("CRON_SECRET");
const BLING_API = "https://api.bling.com.br/Api/v3";

const MARGEM_ESPELHO_MS = 3 * 60 * 1000;
const MARGEM_BAIXA_MS = 90 * 1000;
const PAUSA_MS = 350;                       // o Bling aceita ~3 req/s
const MAX_PAGINAS = 100;                    // 10.000 abertos por tipo; passou disso, a lista não é completa
const DETALHES_POR_RODADA = 60;
// ⚠️ A função é morta em 150 s, e morta não grava o log. O de RECEBER para mais
// cedo para sobrar tempo ao de PAGAR.
const ORCAMENTO_MS: Record<TipoConta, number> = { receber: 60_000, pagar: 125_000 };
const FILTRO_PADRAO = "situacoes[]=1&situacoes[]=3";

type Db = ReturnType<typeof createClient>;
const TABELA: Record<TipoConta, string> = { receber: "bling2_contas_receber", pagar: "bling2_contas_pagar" };
const ID_CONTATO: Record<TipoConta, string> = { receber: "cliente_id", pagar: "fornecedor_id" };
const NOME_CONTATO: Record<TipoConta, string> = { receber: "cliente", pagar: "fornecedor" };
const SEM_NOME: Record<TipoConta, string> = { receber: "Cliente não identificado", pagar: "Fornecedor não identificado" };

const dormir = (ms: number) => new Promise((ok) => setTimeout(ok, ms));
const numOuNull = (v: unknown): number | null => (v == null || v === "" || isNaN(Number(v)) ? null : Number(v));

/**
 * Desfaz o borderô que a baixa ACABOU de criar, quando a conferência divergiu
 * (o Bling ignora campo desconhecido calado). ⚠️ Só se cobrir UM título.
 * Devolve a frase que completa a mensagem da tela.
 */
async function desfazerBordero(token: string, bordero: number | null): Promise<string> {
  if (!bordero) return "O Bling não devolveu o borderô: confira e desfaça a baixa no Bling.";
  try {
    const bo = (await bling(token, "GET", `/borderos/${bordero}`))?.data ?? {};
    const n = Array.isArray(bo.pagamentos) ? bo.pagamentos.length : 0;
    if (n > 1) return `O borderô ${bordero} cobre ${n} títulos — desfaça a baixa no Bling.`;
    await bling(token, "DELETE", `/borderos/${bordero}`);
    return "A baixa foi DESFEITA no Bling — faça-a lá, ou tente de novo sem esse ajuste.";
  } catch (e) {
    return `E não deu para desfazer (${e instanceof Error ? e.message : String(e)}) — desfaça o borderô ${bordero} no Bling.`;
  }
}
const dataOuNull = (v: unknown): string | null => {
  const s = typeof v === "string" ? v.slice(0, 10) : "";
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && s !== "0000-00-00" ? s : null;
};

class BlingRecusou extends Error { constructor(public status: number, msg: string) { super(msg); } }

async function bling(token: string, metodo: string, caminho: string, corpo?: unknown, tentativa = 0): Promise<any> {
  const r = await fetch(`${BLING_API}${caminho}`, {
    method: metodo,
    headers: { Authorization: `Bearer ${token}`, ...(corpo ? { "Content-Type": "application/json" } : {}) },
    body: corpo ? JSON.stringify(corpo) : undefined,
  });
  if (r.status === 429 && tentativa < 4) {
    await dormir(1000 * 2 ** tentativa);
    return bling(token, metodo, caminho, corpo, tentativa + 1);
  }
  const texto = await r.text().catch(() => "");
  if (!r.ok) {
    let motivo = texto.slice(0, 400);
    try {
      const j = JSON.parse(texto);
      const campos = (j?.error?.fields ?? []).map((f: any) => f?.msg ?? f?.element).filter(Boolean).join("; ");
      motivo = [j?.error?.description ?? j?.error?.message, campos].filter(Boolean).join(" — ") || motivo;
    } catch { /* corpo não é JSON: fica o texto */ }
    throw new BlingRecusou(r.status, `Bling ${r.status} em ${metodo} ${caminho.split("?")[0]}: ${motivo}`);
  }
  if (!texto) return {};
  try { return JSON.parse(texto); } catch { return {}; }
}

/** O token do Bling 2, SÓ LIDO. Nulo = sem integração ou perto de vencer. */
async function lerToken(db: Db, margemMs: number): Promise<{ token: string | null; motivo?: string }> {
  const { data } = await db.from("bling2_integration").select("access_token, expires_at")
    .eq("is_active", true).order("connected_at", { ascending: false }).limit(1).maybeSingle();
  if (!data?.access_token) return { token: null, motivo: "sem integração ativa com o Bling 2" };
  if (new Date(data.expires_at as string).getTime() - Date.now() < margemMs) {
    return { token: null, motivo: "token do Bling 2 sendo renovado pelo bling2-sync" };
  }
  return { token: data.access_token as string };
}

async function lerConfig(db: Db) {
  const { data, error } = await db.from("fin_bling2_baixa_config")
    .select("ativo, teste_ids, portador_padrao_id, filtro_abertos").maybeSingle();
  if (error) throw new Error(`Configuração ilegível (fin_bling2_baixa_config): ${error.message}`);
  return {
    ativo: !!data?.ativo,
    teste_ids: ((data?.teste_ids ?? []) as string[]).map(String),
    portador_padrao_id: data?.portador_padrao_id ?? null,
    filtro_abertos: (data?.filtro_abertos as string | null)?.trim() || FILTRO_PADRAO,
  };
}

/** A listagem de ABERTOS do Bling, página a página. */
async function listarAbertos(token: string, tipo: TipoConta, filtro: string) {
  const linhas: any[] = [];
  let completo = false;
  for (let pagina = 1; pagina <= MAX_PAGINAS; pagina++) {
    const resp = await bling(token, "GET", `/contas/${tipo}?pagina=${pagina}&limite=100&${filtro}`);
    const contas: any[] = resp?.data ?? [];
    linhas.push(...contas);
    if (contas.length < 100) { completo = true; break; }
    await dormir(PAUSA_MS);
  }
  return { linhas, completo };
}

const paraListada = (c: any): ListadaConta => ({
  bling_id: Number(c.id),
  situacao: c.situacao != null ? String(c.situacao) : null,
  valor: numOuNull(c.valor ?? c.valorTotal),
  saldo: numOuNull(c.saldo),
  vencimento: dataOuNull(c.vencimento ?? c.dataVencimento),
});

/** A data do pagamento: o borderô mais recente do título. Nula se não houver. */
async function dataDoBordero(token: string, detalhe: any): Promise<string | null> {
  const ids = idsDeBordero(detalhe?.borderos);
  if (!ids.length) return null;
  await dormir(PAUSA_MS);
  const bo = (await bling(token, "GET", `/borderos/${Math.max(...ids)}`))?.data ?? {};
  return dataOuNull(bo.data ?? bo.dataPagamento);
}

// ── Bling 2 → sistema ───────────────────────────────────────────────────────
async function espelho(db: Db, token: string, cfg: Awaited<ReturnType<typeof lerConfig>>, inicio: number) {
  const resumo: Record<string, unknown> = {};
  for (const tipo of ["receber", "pagar"] as TipoConta[]) {
    const tabela = TABELA[tipo];
    const r: Record<string, unknown> = {};
    resumo[tipo] = r;
    try {
      const { linhas, completo } = await listarAbertos(token, tipo, cfg.filtro_abertos);
      const listados = linhas.map(paraListada);
      r.abertos_no_bling = listados.length;
      r.lista_completa = completo;

      // Aqui: os ABERTOS (para saber quem sumiu) + os listados que já existem
      // (reaberto, valor mudado). Nunca o histórico inteiro.
      const locais = new Map<number, LocalConta>();
      const guardar = (x: any) => locais.set(Number(x.bling_id), {
        situacao: x.situacao == null ? null : String(x.situacao),
        valor: numOuNull(x.valor), saldo: numOuNull(x.saldo), vencimento: dataOuNull(x.vencimento),
      });
      for (let de = 0; ; de += 1000) {
        const { data, error } = await db.from(tabela).select("bling_id, situacao, valor, saldo, vencimento")
          .in("situacao", ["1", "3"]).order("bling_id").range(de, de + 999);
        if (error) throw new Error(`ler ${tabela}: ${error.message}`);
        (data ?? []).forEach(guardar);
        if (!data || data.length < 1000) break;
      }
      const faltam = listados.map((l) => l.bling_id).filter((id) => !locais.has(id));
      for (let i = 0; i < faltam.length; i += 200) {
        const { data, error } = await db.from(tabela).select("bling_id, situacao, valor, saldo, vencimento")
          .in("bling_id", faltam.slice(i, i + 200));
        if (error) throw new Error(`ler ${tabela}: ${error.message}`);
        (data ?? []).forEach(guardar);
      }

      const plano = planejarEspelho(locais, listados);
      if (plano.filtroIgnorado) {
        r.erro = `O Bling ignorou o filtro "${cfg.filtro_abertos}" (veio título quitado/cancelado na lista de abertos) — nada gravado deste tipo.`;
        continue;
      }
      // Lista cortada no teto: "não está na lista" deixa de significar "saiu".
      if (!completo) plano.sumiram = [];
      const porId = new Map(linhas.map((c) => [Number(c.id), c]));
      const agora = new Date().toISOString();

      // Novos: entram inteiros (o nome do contato vem do cadastro do Bling 2).
      if (plano.novos.length) {
        const idsContato = [...new Set(plano.novos.map((id) => Number(porId.get(id)?.contato?.id ?? porId.get(id)?.fornecedor?.id ?? porId.get(id)?.cliente?.id) || 0).filter(Boolean))];
        const nomes = new Map<number, string>();
        for (let i = 0; i < idsContato.length; i += 200) {
          const { data } = await db.from("bling2_contacts").select("bling_id, nome, fantasia").in("bling_id", idsContato.slice(i, i + 200));
          for (const c of data ?? []) nomes.set(Number(c.bling_id), (c.nome as string) || (c.fantasia as string) || "");
        }
        const novas = plano.novos.map((id) => {
          const c = porId.get(id);
          const contato = c?.contato ?? c?.fornecedor ?? c?.cliente ?? {};
          const idC = Number(contato?.id) || null;
          return {
            bling_id: id,
            numero: String(c.numeroDocumento || c.numero || c.id),
            [ID_CONTATO[tipo]]: idC,
            [NOME_CONTATO[tipo]]: contato?.nome || contato?.fantasia || (idC && nomes.get(idC)) || SEM_NOME[tipo],
            valor: numOuNull(c.valor ?? c.valorTotal) ?? 0,
            saldo: numOuNull(c.saldo),
            vencimento: dataOuNull(c.vencimento ?? c.dataVencimento),
            data_emissao: dataOuNull(c.dataEmissao ?? c.data),
            situacao: c.situacao != null ? String(c.situacao) : null,
            historico: c.historico || c.observacoes || null,
            raw_data: c,
            synced_at: agora,
            updated_at: agora,
          };
        });
        for (let i = 0; i < novas.length; i += 200) {
          const { error } = await db.from(tabela).upsert(novas.slice(i, i + 200), { onConflict: "bling_id" });
          if (error) throw new Error(`gravar novos em ${tabela}: ${error.message}`);
        }
      }
      r.novos = plano.novos.length;

      // Mudaram: só os campos que a listagem traz (nunca apaga com nulo).
      for (const id of plano.mudaram) {
        const l = paraListada(porId.get(id));
        const { error } = await db.from(tabela).update({
          situacao: l.situacao,
          ...(l.valor != null ? { valor: l.valor } : {}),
          ...(l.saldo != null ? { saldo: l.saldo } : {}),
          ...(l.vencimento ? { vencimento: l.vencimento } : {}),
          raw_data: porId.get(id),
          synced_at: agora,
          updated_at: agora,
        }).eq("bling_id", id);
        if (error) throw new Error(`atualizar ${tabela} ${id}: ${error.message}`);
      }
      r.mudaram = plano.mudaram.length;

      // Sumiram da lista de abertos: o detalhe diz o que aconteceu.
      let detalhados = 0, quitados = 0, comData = 0, naoEncontrados = 0;
      for (const id of plano.sumiram.slice(0, DETALHES_POR_RODADA)) {
        if (Date.now() - inicio > ORCAMENTO_MS[tipo]) break;
        await dormir(PAUSA_MS);
        let d: any;
        try {
          d = (await bling(token, "GET", `/contas/${tipo}/${id}`))?.data ?? {};
        } catch (e) {
          if (e instanceof BlingRecusou && e.status === 404) {
            // ⚠️ O título NÃO EXISTE mais no Bling (excluído lá). Marcar é o que
            // faz a fila ANDAR: só pular deixava os mesmos 60 voltarem toda
            // rodada (medido em 22/10: 60 de 60 com 404, fila parada em 631).
            // E é o que tira do "em aberto" o que não está aberto em lugar
            // nenhum — a varredura do bling2-sync só ACRESCENTA, nunca remove.
            naoEncontrados++;
            const { error } = await db.from(tabela).update({
              situacao: "excluido", detalhe_em: new Date().toISOString(),
              synced_at: new Date().toISOString(), updated_at: new Date().toISOString(),
            }).eq("bling_id", id);
            if (error) throw new Error(`marcar excluído ${tabela} ${id}: ${error.message}`);
            continue;
          }
          throw e;
        }
        const situacao = d.situacao != null ? String(d.situacao) : null;
        let dataPag: string | null = null;
        if (situacao === "2" || situacao === "3") {
          quitados++;
          try { dataPag = await dataDoBordero(token, d); } catch { /* a data fica para a próxima; nunca derruba a rodada */ }
          if (dataPag) comData++;
        }
        const { error } = await db.from(tabela).update({
          situacao,
          ...(numOuNull(d.valor) != null ? { valor: numOuNull(d.valor) } : {}),
          ...(numOuNull(d.saldo) != null ? { saldo: numOuNull(d.saldo) } : {}),
          // Voltou a aberto (estornado no Bling) perde a data; quitado sem
          // borderô legível mantém a que tinha (o gatilho também garante).
          ...(dataPag ? { data_pagamento: dataPag } : estaAberta(situacao) ? { data_pagamento: null } : {}),
          detalhe: d,
          detalhe_em: agora,
          synced_at: agora,
          updated_at: agora,
        }).eq("bling_id", id);
        if (error) throw new Error(`detalhe ${tabela} ${id}: ${error.message}`);
        detalhados++;
      }
      r.sumiram = plano.sumiram.length;
      r.detalhados = detalhados;
      r.quitados = quitados;
      r.com_data_de_pagamento = comData;
      if (naoEncontrados) r.nao_encontrados_no_bling = naoEncontrados;
      r.faltam_detalhe = Math.max(0, plano.sumiram.length - detalhados - naoEncontrados);
      if (naoEncontrados) r.marcados_excluidos = naoEncontrados;
    } catch (e) {
      r.erro = e instanceof Error ? e.message : String(e);
      if (e instanceof BlingRecusou && e.status === 401) break;   // token morto: não insiste no outro tipo
    }
  }
  return resumo;
}

// ── Ensaio: só lê ───────────────────────────────────────────────────────────
async function ensaio(db: Db, b: Record<string, unknown>) {
  const saida: Record<string, unknown> = { marcador: "bling2-contas-ensaio", escreveu: false };
  const cfg = await lerConfig(db);
  saida.config = cfg;
  const { token, motivo } = await lerToken(db, MARGEM_ESPELHO_MS);
  if (!token) return { ...saida, ok: false, mensagem: `${motivo} — rode o ensaio de novo em alguns minutos.` };
  const limite = Math.min(Math.max(Number(b.limite) || 5, 1), 25);
  const hoje = diaBrasilia(null);

  for (const tipo of ["receber", "pagar"] as TipoConta[]) {
    const r: Record<string, unknown> = {};
    saida[tipo] = r;
    try {
      // O filtro funciona? A 1ª página COM e SEM ele, contada por situação.
      const contar = (lista: any[]) => lista.reduce((m: Record<string, number>, c) => {
        const k = c.situacao != null ? String(c.situacao) : "nula"; m[k] = (m[k] ?? 0) + 1; return m;
      }, {});
      const sem = (await bling(token, "GET", `/contas/${tipo}?pagina=1&limite=100`))?.data ?? [];
      await dormir(PAUSA_MS);
      const com = (await bling(token, "GET", `/contas/${tipo}?pagina=1&limite=100&${cfg.filtro_abertos}`))?.data ?? [];
      r.filtro = {
        sem_filtro_pagina1: contar(sem),
        com_filtro_pagina1: contar(com),
        funciona: com.length > 0 && com.every((c: any) => estaAberta(c.situacao != null ? String(c.situacao) : null)),
        listagem_traz_saldo: com.some((c: any) => c.saldo != null),
        chaves_da_listagem: com[0] ? Object.keys(com[0]) : [],
      };

      // O que a baixa FARIA com alguns abertos (mesma `decidirBaixa`).
      const { data: abertos } = await db.from(TABELA[tipo]).select("id, bling_id, valor, vencimento")
        .in("situacao", ["1", "3"]).order("vencimento", { ascending: true }).limit(limite);
      const titulos: unknown[] = [];
      const contagem: Record<string, number> = {};
      for (const t of abertos ?? []) {
        await dormir(PAUSA_MS);
        try {
          const d = (await bling(token, "GET", `/contas/${tipo}/${t.bling_id}`))?.data ?? {};
          const dec = decidirBaixa(tipo, d, cfg.portador_padrao_id, hoje, "nome de quem baixou");
          contagem[dec.decisao] = (contagem[dec.decisao] ?? 0) + 1;
          titulos.push({
            id: t.id, bling_id: t.bling_id, valor: t.valor, vencimento: t.vencimento,
            no_bling: { situacao: d.situacao ?? null, valor: d.valor ?? null, saldo: d.saldo ?? null,
                        portador: d.portador?.id ?? null, categoria: d.categoria?.id ?? null, borderos: d.borderos ?? null },
            decisao: dec.decisao,
            ...(dec.decisao === "enviar"
              ? { enviaria: { metodo: "POST", caminho: `/contas/${tipo}/${t.bling_id}/baixar`, corpo: dec.corpo } }
              : { mensagem: dec.mensagem }),
          });
        } catch (e) {
          contagem.erro_ao_ler = (contagem.erro_ao_ler ?? 0) + 1;
          titulos.push({ id: t.id, bling_id: t.bling_id, erro: e instanceof Error ? e.message : String(e) });
        }
      }
      r.contagem = contagem;
      r.titulos = titulos;

      // O sentido inverso: a data de um título quitado, pelo borderô.
      const quitado = sem.find((c: any) => String(c.situacao) === "2");
      if (quitado) {
        await dormir(PAUSA_MS);
        const d = (await bling(token, "GET", `/contas/${tipo}/${quitado.id}`))?.data ?? {};
        let data: string | null = null, erro: string | null = null;
        try { data = await dataDoBordero(token, d); } catch (e) { erro = e instanceof Error ? e.message : String(e); }
        r.bordero_amostra = { titulo_bling_id: quitado.id, borderos: d.borderos ?? null, data, erro,
                              chaves_do_detalhe: Object.keys(d) };
      } else {
        r.bordero_amostra = "nenhum título quitado na 1ª página";
      }
    } catch (e) {
      r.erro = e instanceof Error ? e.message : String(e);
    }
  }
  return { ...saida, ok: true };
}

// ── CORS (a tela chama do navegador; a porta de verdade é o JWT) ────────────
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

Deno.serve(async (req: Request): Promise<Response> => {
  const h = { "Content-Type": "application/json", ...cors(req) };
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(req) });
  const json = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: h });
  if (req.method !== "POST") return json({ ok: false, mensagem: "Use POST" }, 405);
  const db = createClient(URL_SB, SERVICE, { auth: { persistSession: false } });

  // ── Máquina (cron / SQL Editor): espelho ou ensaio ───────────────────────
  const segredo = req.headers.get("x-cron-secret");
  if (segredo != null) {
    const marcador = "bling2-contas-ensaio";
    if (!CRON_SECRET) return json({ marcador, ok: false, mensagem: "CRON_SECRET ausente no servidor." }, 500);
    if (segredo !== CRON_SECRET) return json({ marcador, ok: false, mensagem: "não autorizado" }, 401);
    const corpo = await req.json().catch(() => ({})) as Record<string, unknown>;

    if (corpo.ensaio === true) {
      try { return json(await ensaio(db, corpo)); }
      catch (e) { return json({ marcador, ok: false, mensagem: e instanceof Error ? e.message : String(e) }, 500); }
    }
    if (corpo.acao !== "espelho") return json({ ok: false, mensagem: 'Com o segredo: {"acao":"espelho"} ou {"ensaio":true}.' }, 400);

    const inicio = Date.now();
    // ⚠️ O desfecho vai para o NOSSO log, sempre — `cron.job_run_details`
    // marca `succeeded` quando o POST sai, não quando a rodada dá certo.
    const log = async (ok: boolean, resumo: Record<string, unknown>) => {
      await db.from("bling2_contas_espelho_log").insert({ ok, ms: Date.now() - inicio, resumo });
      await db.from("bling2_contas_espelho_log").delete().lt("rodou_em", new Date(Date.now() - 7 * 864e5).toISOString());
    };
    try {
      const cfg = await lerConfig(db);
      const { token, motivo } = await lerToken(db, MARGEM_ESPELHO_MS);
      if (!token) { await log(true, { pulado: motivo }); return json({ pulado: motivo }); }
      const resumo = await espelho(db, token, cfg, inicio);
      const ok = !Object.values(resumo).some((r: any) => r?.erro);
      await log(ok, resumo);
      return json({ ok, ...resumo });
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      await log(false, { erro: m });
      return json({ ok: false, erro: m }, 500);
    }
  }

  // ── Gente: baixar / estornar ──────────────────────────────────────────────
  const auth = req.headers.get("Authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return json({ ok: false, mensagem: "Faça login." }, 401);
  const comoUsuario = createClient(URL_SB, ANON, { global: { headers: { Authorization: auth } } });
  const { data: u } = await comoUsuario.auth.getUser(auth.slice(7));
  if (!u?.user) return json({ ok: false, mensagem: "Sessão inválida." }, 401);
  const { data: pode, error: ePode } = await comoUsuario.rpc("carbo_tem_app", { p_flags: ["carbo_financas"] });
  if (ePode || pode !== true) return json({ ok: false, mensagem: "Baixa no Bling é do Finanças: você não tem o app." }, 403);

  const b = await req.json().catch(() => ({})) as Record<string, unknown>;
  const acao = String(b.acao ?? "");
  const tipo = String(b.tipo ?? "") as TipoConta;
  const id = String(b.id ?? "");
  if (!["baixar", "estornar"].includes(acao) || !TABELA[tipo] || !/^[0-9a-f-]{36}$/i.test(id)) {
    return json({ ok: false, mensagem: "Pedido inválido (acao, tipo, id)." }, 400);
  }
  const tabela = TABELA[tipo];
  const dia = dataDaBaixa(b.data, diaBrasilia(null));
  if (acao === "baixar" && !dia) return json({ ok: false, mensagem: "Data da baixa inválida (não pode ser no futuro)." }, 400);

  let cfg: Awaited<ReturnType<typeof lerConfig>>;
  try { cfg = await lerConfig(db); } catch (e) { return json({ ok: false, mensagem: (e as Error).message }, 500); }
  if (!cfg.ativo && !cfg.teste_ids.includes(id)) {
    return json({ ok: false, pulado: "desligado", mensagem: "A baixa da filial no Bling ainda está desligada — nada foi feito." }, 409);
  }

  const { data: t, error: eT } = await db.from(tabela)
    .select("id, bling_id, situacao, valor, cb_baixa_bordero, cb_baixa_tentando_em").eq("id", id).maybeSingle();
  if (eT) return json({ ok: false, mensagem: `Ler o título: ${eT.message}` }, 500);
  if (!t) return json({ ok: false, mensagem: "Título não encontrado." }, 404);
  const tt = t as Record<string, any>;

  // Trava: uma tentativa por vez por título (dois cliques, duas abas).
  const { data: pego } = await db.from(tabela).update({ cb_baixa_tentando_em: new Date().toISOString() })
    .eq("id", id)
    .or(`cb_baixa_tentando_em.is.null,cb_baixa_tentando_em.lt.${new Date(Date.now() - 120_000).toISOString()}`)
    .select("id");
  if (!pego?.length) return json({ ok: false, mensagem: "Já há um envio deste título em andamento — aguarde e atualize." }, 409);

  const { data: perfil } = await db.from("profiles").select("full_name").eq("id", u.user.id).maybeSingle();
  const quem = (perfil?.full_name as string | null)?.trim() || null;
  const aj = lerAjustes(b.ajustes);
  const registrar = async (ok: boolean, mensagem: string, bordero: number | null = null) => {
    const linha = {
      acao, tipo, conta_id: id, bling_id: tt.bling_id, ok, mensagem, bordero,
      data_baixa: acao === "baixar" ? dia : null, user_id: u.user.id, user_nome: quem,
    };
    // `ajustes` é coluna da 20261133: antes do SQL o insert com ela falha, e o
    // log não pode sumir por isso — vai sem ela.
    const { error } = await db.from("fin_bling2_baixa_log").insert({ ...linha, ajustes: b.ajustes ?? null });
    if (error) await db.from("fin_bling2_baixa_log").insert(linha);
  };
  const soltar = async (campos: Record<string, unknown> = {}) => {
    await db.from(tabela).update({ ...campos, cb_baixa_tentando_em: null }).eq("id", id);
  };

  try {
    const { token, motivo } = await lerToken(db, MARGEM_BAIXA_MS);
    if (!token) throw new Error(`${motivo} — tente de novo em 1 minuto.`);
    const d = (await bling(token, "GET", `/contas/${tipo}/${tt.bling_id}`))?.data ?? {};
    const situacao = d.situacao != null ? String(d.situacao) : null;
    const agora = new Date().toISOString();

    if (acao === "baixar") {
      const dec = decidirBaixa(tipo, d, cfg.portador_padrao_id, dia!, quem, aj);
      if (dec.decisao === "ja_pago_no_bling") {
        // Pago lá por alguém: NÃO baixa de novo; só traz o espelho para a verdade.
        let dataPag: string | null = null;
        try { dataPag = await dataDoBordero(token, d); } catch { /* fica sem data */ }
        await soltar({ situacao, ...(dataPag ? { data_pagamento: dataPag } : {}), detalhe: d, detalhe_em: agora, cb_baixa_erro: null });
        await registrar(true, dec.mensagem);
        return json({ ok: true, pulado: "ja_pago_no_bling", mensagem: dec.mensagem });
      }
      if (dec.decisao !== "enviar") {
        await soltar({ cb_baixa_erro: dec.mensagem });
        await registrar(false, dec.mensagem);
        return json({ ok: false, mensagem: dec.mensagem });
      }
      const r = await bling(token, "POST", `/contas/${tipo}/${tt.bling_id}/baixar`, dec.corpo);
      const bordero = Number(r?.data?.bordero?.id ?? r?.bordero?.id ?? r?.data?.id) || null;
      const parcial = dec.esperado.parcial;

      // ── A conferência: o título relido tem de bater com o esperado ────────
      await dormir(700);
      let depois: any = null;
      try { depois = (await bling(token, "GET", `/contas/${tipo}/${tt.bling_id}`))?.data ?? null; }
      catch { /* não deu para reler: segue sem conferir */ }
      const divergencia = depois ? conferirBaixa(dec.esperado, depois) : null;
      if (divergencia) {
        const m = `${divergencia} ${await desfazerBordero(token, bordero)}`;
        await soltar({ cb_baixa_erro: m, detalhe_em: null });
        await registrar(false, m, bordero);
        return json({ ok: false, mensagem: m, corpo_enviado: dec.corpo });
      }
      let borderoLido: unknown = null;
      if (bordero) {
        try { borderoLido = (await bling(token, "GET", `/borderos/${bordero}`))?.data ?? null; } catch { /* só medida */ }
      }
      const saldoDepois = depois?.saldo != null ? numOuNull(depois.saldo) : dec.esperado.saldoDepois;

      if (parcial) {
        // ⚠️ O borderô da parcial NÃO vai para o título: ele continua aberto, e
        // a próxima baixa (o resto) precisa poder acontecer. Desfaz-se no Bling.
        await soltar({ situacao: "3", saldo: saldoDepois, detalhe_em: null, cb_baixa_erro: null });
        await registrar(true, `Baixa parcial no Bling 2 — ficam ${saldoDepois} em aberto.`, bordero);
        return json({
          ok: true, parcial: true, bordero, conferido: !!depois, bordero_lido: borderoLido,
          mensagem: `Baixa parcial feita no Bling da filial — ficam R$ ${dec.esperado.saldoDepois.toFixed(2).replace(".", ",")} em aberto.`,
        });
      }
      // O espelho diz a verdade JÁ — o detalhe é relido na próxima rodada.
      await soltar({
        situacao: "2", data_pagamento: dia, detalhe_em: null, ...(saldoDepois != null ? { saldo: saldoDepois } : {}),
        cb_baixa_em: agora, cb_baixa_por: u.user.id, cb_baixa_por_nome: quem,
        cb_baixa_bordero: bordero, cb_baixa_erro: null,
      });
      // Os ajustes ficam no título para a tela (coluna da 20261133; ausente, ignora).
      await db.from(tabela).update({
        baixa_ajustes: {
          portador_id: aj.portadorId ?? null, juros: aj.juros ?? 0, multa: aj.multa ?? 0,
          desconto: aj.desconto ?? 0, tarifa: aj.tarifa ?? 0, valor: dec.esperado.valor > 0 ? dec.esperado.valor : null,
          historico: aj.historico ?? null,
        },
      }).eq("id", id);
      await registrar(true, "Baixa enviada ao Bling 2.", bordero);
      return json({ ok: true, mensagem: "Baixa feita no Bling da filial.", bordero, conferido: !!depois, bordero_lido: borderoLido });
    }

    // ── estornar ────────────────────────────────────────────────────────────
    if (!tt.cb_baixa_bordero) {
      await soltar();
      const m = situacao === "2" || situacao === "3"
        ? "Esta baixa não foi feita pelo sistema — desfaça no Bling; o sistema acompanha em até 10 min."
        : "Nada a desfazer no Bling.";
      await registrar(false, m);
      return json({ ok: false, mensagem: m });
    }
    const bo = (await bling(token, "GET", `/borderos/${tt.cb_baixa_bordero}`))?.data ?? {};
    const pagamentos = Array.isArray(bo.pagamentos) ? bo.pagamentos.length : 0;
    if (pagamentos > 1) {
      await soltar();
      const m = `O borderô ${tt.cb_baixa_bordero} cobre ${pagamentos} títulos no Bling — desfaça lá, para não estornar os outros.`;
      await registrar(false, m);
      return json({ ok: false, mensagem: m });
    }
    await bling(token, "DELETE", `/borderos/${tt.cb_baixa_bordero}`);
    // Relê o título: ele pode voltar PARCIAL (outro borderô antes do nosso), e
    // situação e saldo têm de ser os do Bling, não um "aberto" presumido.
    let depois: any = {};
    try { await dormir(PAUSA_MS); depois = (await bling(token, "GET", `/contas/${tipo}/${tt.bling_id}`))?.data ?? {}; }
    catch { /* a próxima rodada do espelho corrige */ }
    const sitDepois = depois.situacao != null ? String(depois.situacao) : "1";
    await soltar({
      situacao: sitDepois,
      ...(numOuNull(depois.saldo) != null ? { saldo: numOuNull(depois.saldo) } : { saldo: tt.valor }),
      ...(sitDepois === "1" ? { data_pagamento: null } : {}),
      detalhe: Object.keys(depois).length ? depois : null, detalhe_em: Object.keys(depois).length ? new Date().toISOString() : null,
      cb_baixa_em: null, cb_baixa_por: null, cb_baixa_por_nome: null, cb_baixa_bordero: null, cb_baixa_erro: null,
    });
    await db.from(tabela).update({ baixa_ajustes: null }).eq("id", id);   // coluna ausente: ignora
    await registrar(true, "Baixa desfeita no Bling 2.", Number(tt.cb_baixa_bordero));
    return json({ ok: true, mensagem: "Baixa desfeita no Bling da filial." });
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e);
    await soltar(acao === "baixar" ? { cb_baixa_erro: m } : {});
    await registrar(false, m);
    return json({ ok: false, mensagem: m });
  }
});

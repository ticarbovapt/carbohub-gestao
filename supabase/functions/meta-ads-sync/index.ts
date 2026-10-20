// ─────────────────────────────────────────────────────────────────────────────
// meta-ads-sync — traz gasto e conversão das contas de anúncio da Meta
//
// ⚠️ POR QUE NÃO TEM OAUTH AQUI (e o Bling tem)
//
// O Bling entrega token que expira em horas, então `bling-auth` existe para
// fazer o refresh. A Meta, para uso próprio, entrega token de **System User**
// (Business Manager → Usuários do sistema → Gerar token, com `ads_read`), e
// esse token **não expira**. Montar o dança de OAuth aqui seria três arquivos
// e uma tabela de token a mais para resolver um problema que não existe.
//
// Consequência do desenho: o token vive num secret (`META_ADS_ACCESS_TOKEN`) e
// NÃO no banco. Ninguém logado no sistema consegue lê-lo, nem por SQL.
//
// ⚠️ A JANELA É MÓVEL, E ISSO NÃO É DESPERDÍCIO
//
// A Meta atribui compra de hoje a clique de até 7 dias atrás: a linha do dia 01
// muda quando relida no dia 05. Por isso relemos `dias` (padrão 30) a cada
// rodada e gravamos com UPSERT, em vez de acrescentar só o dia anterior. Ler de
// novo é barato; ficar com ROAS subestimado para sempre é caro.
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
// ⚠️ CORS PRÓPRIO, não o `_shared/cors.ts`: aquela lista é a das funções do
// WhatsApp, fechada de propósito (elas escrevem pelo número da empresa). A tela
// de anúncios vive no Admin e no Marketing (20/10/2026); aqui vale qualquer
// https://*.carbohub.com.br — a porta de verdade é o JWT + time interno.
function cors(req: Request, metodos = "GET, POST, OPTIONS") {
  const origin = req.headers.get("origin") || "";
  let ok = false;
  try {
    const u = new URL(origin);
    ok = (u.protocol === "https:" && u.hostname.endsWith(".carbohub.com.br")) ||
      (u.protocol === "http:" && u.hostname === "localhost");
  } catch { ok = false; }
  return {
    "Access-Control-Allow-Origin": ok ? origin : "https://admin.carbohub.com.br",
    "Access-Control-Allow-Methods": metodos,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Vary": "Origin",
  };
}
import { ehTimeInterno } from "../_shared/interfacesInternas.ts";

// Fixada de propósito. A v25.0 é a atual (fev/2026); a v26 ainda não saiu.
// ⚠️ Subir de versão é decisão consciente — a Meta aposenta métrica entre
// versões (reach e impressão de story saíram do Graph em jun/2026).
const GRAPH = "https://graph.facebook.com/v25.0";

// O que pedimos por linha. `inline_link_clicks` é o clique no LINK; `clicks`
// conta curtida e "ver mais" junto, e é por isso que o CTR do gerenciador
// parece maior do que o do site.
const FIELDS = [
  "account_id", "account_currency",
  // O objetivo da campanha (OUTCOME_SALES, OUTCOME_ENGAGEMENT…): é ele que
  // separa "gastou e não vendeu" de "campanha de engajamento, que não vende
  // mesmo" no painel (20261113). Fica no `raw`, sem coluna própria.
  "objective",
  "campaign_id", "campaign_name",
  "adset_id", "adset_name",
  "ad_id", "ad_name",
  "spend", "impressions", "clicks", "inline_link_clicks",
  "reach", "frequency",
  "actions", "action_values",
  "date_start", "date_stop",
].join(",");

// ⚠️ A ORDEM IMPORTA. `omni_purchase` já vem deduplicado entre site, app e
// loja física; `purchase` e o evento cru do pixel contam a mesma venda de novo
// quando os dois disparam. Pegamos o primeiro que existir, nunca a soma.
const TIPOS_DE_COMPRA = [
  "omni_purchase",
  "purchase",
  "offsite_conversion.fb_pixel_purchase",
];

interface AcaoMeta { action_type?: string; value?: string }

function primeiraAcao(acoes: unknown): number {
  if (!Array.isArray(acoes)) return 0;
  const lista = acoes as AcaoMeta[];
  for (const tipo of TIPOS_DE_COMPRA) {
    const achou = lista.find((a) => a?.action_type === tipo);
    if (achou) return Number(achou.value ?? 0) || 0;
  }
  return 0;
}

// ── Extras: criativo e segmentos (20261115) ─────────────────────────────────
//
// ⚠️ Os dois vêm DEPOIS do insight principal e numa tentativa própria: falhar
// aqui não pode desfazer o gasto já gravado, que é o número que importa. A
// falha APARECE (linha `:extras` no log, com o erro), nunca some.

/**
 * Lê todas as páginas de um endpoint do Graph, com teto.
 *
 * ⚠️ "Please reduce the amount of data you're asking for" (medido em
 * 20/10/2026, na primeira rodada dos extras) não é limite de cota: a Meta
 * recusa a PÁGINA por ficar pesada demais — o criativo expandido pesa muito
 * por linha. A resposta é pedir a MESMA página com metade do `limit`, até um
 * piso; abaixo dele o erro sobe, porque aí o problema não é o tamanho.
 */
const PEDE_MENOS = /reduce the amount of data/i;
async function lerPaginas(url: string, teto: number, piso = 10): Promise<Record<string, unknown>[]> {
  const linhas: Record<string, unknown>[] = [];
  let proxima: string | null = url;
  for (let pagina = 0; proxima && pagina < teto; pagina++) {
    const resp: Response = await fetch(proxima);
    const json = await resp.json().catch(() => ({}));
    if (!resp.ok || json?.error) {
      const msg: string = json?.error?.message ?? `HTTP ${resp.status}`;
      const u = new URL(proxima);
      const limite = Number(u.searchParams.get("limit") ?? 25);
      if (PEDE_MENOS.test(msg) && limite > piso) {
        u.searchParams.set("limit", String(Math.max(piso, Math.floor(limite / 2))));
        proxima = u.toString();
        pagina--; // a mesma página, menor — não conta no teto
        continue;
      }
      throw new Error(`Graph respondeu: ${msg}`);
    }
    linhas.push(...((json.data ?? []) as Record<string, unknown>[]));
    proxima = (json.paging?.next as string | undefined) ?? null;
  }
  return linhas;
}

/** Corta [inicio, ate] em janelas de `dias` (datas ISO, inclusivas). */
function janelas(inicio: string, ate: string, dias: number): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  const fim = new Date(`${ate}T12:00:00Z`);
  for (let d = new Date(`${inicio}T12:00:00Z`); d <= fim; ) {
    const ini = d.toISOString().slice(0, 10);
    const f = new Date(d); f.setUTCDate(f.getUTCDate() + dias - 1);
    out.push([ini, (f < fim ? f : fim).toISOString().slice(0, 10)]);
    d = new Date(f); d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

// As três perguntas de "quem compra e onde". Nível de CONTA, por dia: por
// anúncio a tabela multiplicaria por ~70 sem a tela usar o detalhe.
// ⚠️ A Meta modela parte das conversões por segmento (iOS/consentimento):
// a soma dos segmentos não precisa fechar com o total — e a tela diz isso.
const SEGMENTOS: Array<{ dimensao: string; breakdowns: string; chaves: [string, string | null] }> = [
  { dimensao: "idade_genero",   breakdowns: "age,gender",                         chaves: ["age", "gender"] },
  { dimensao: "posicionamento", breakdowns: "publisher_platform,platform_position", chaves: ["publisher_platform", "platform_position"] },
  { dimensao: "regiao",         breakdowns: "region",                             chaves: ["region", null] },
];

async function sincronizarExtras(
  admin: ReturnType<typeof createClient>, token: string, actId: string, inicio: string, ate: string,
): Promise<{ criativos: number; segmentos: number; erros: string[] }> {
  // ⚠️ QUATRO partes independentes (criativos + três dimensões): uma recusada
  // não impede as outras, e cada falha entra na lista com o NOME da parte.
  // Medido em 20/10/2026: com um `throw` só, a recusa de uma parte deixou a
  // tela com miniatura e idade, sem região, e o aviso não dizia qual faltou.
  const erros: string[] = [];
  let criativos = 0;
  let segmentos = 0;

  // 1. O criativo de cada anúncio: miniatura, imagem, texto e status.
  //    `thumbnail_width/height` pede a miniatura maior (o padrão é 64 px).
  //    ⚠️ A URL da Meta é assinada e VENCE em dias — por isso é relida a cada
  //    rodada, em vez de guardada uma vez.
  //    ⚠️ `limit` 50: o criativo expandido é pesado e 200 por página foi
  //    recusado. O `lerPaginas` ainda divide sozinho se a Meta reclamar.
  try {
    const ads = await lerPaginas(`${GRAPH}/${actId}/ads?${new URLSearchParams({
      fields: "id,name,effective_status,creative.thumbnail_width(320).thumbnail_height(320){id,thumbnail_url,image_url,object_type,title,body}",
      limit: "50", access_token: token,
    })}`, 60);
    const linhas = ads.map((a) => {
      const c = (a.creative ?? {}) as Record<string, unknown>;
      return {
        ad_id: String(a.id ?? ""), act_id: actId, nome: (a.name as string) ?? null,
        status: (a.effective_status as string) ?? null,
        thumbnail_url: (c.thumbnail_url as string) ?? null, image_url: (c.image_url as string) ?? null,
        tipo: (c.object_type as string) ?? null, titulo: (c.title as string) ?? null, texto: (c.body as string) ?? null,
        atualizado_em: new Date().toISOString(),
      };
    }).filter((c) => c.ad_id);
    for (let i = 0; i < linhas.length; i += 500) {
      const { error } = await admin.from("meta_ads_criativos").upsert(linhas.slice(i, i + 500), { onConflict: "ad_id" });
      if (error) throw new Error(error.message);
    }
    criativos = linhas.length;
  } catch (e) {
    erros.push(`criativos: ${e instanceof Error ? e.message : String(e)}`);
  }

  // 2. Os segmentos, por dia, na MESMA janela do insight principal — mas
  //    pedidos em janelas de 15 dias: 90 dias × região (~27 estados) num
  //    pedido só é o que a Meta recusa por tamanho.
  for (const seg of SEGMENTOS) {
    try {
      let n = 0;
      for (const [de, ateJanela] of janelas(inicio, ate, 15)) {
        const linhas = await lerPaginas(`${GRAPH}/${actId}/insights?${new URLSearchParams({
          level: "account", time_increment: "1", breakdowns: seg.breakdowns,
          time_range: JSON.stringify({ since: de, until: ateJanela }),
          fields: "spend,impressions,inline_link_clicks,actions,action_values,date_start",
          limit: "200", access_token: token,
        })}`, 40);
        const gravar = linhas.map((r) => ({
          dia: r.date_start, act_id: actId, dimensao: seg.dimensao,
          chave1: String(r[seg.chaves[0]] ?? "desconhecido"),
          chave2: seg.chaves[1] ? String(r[seg.chaves[1]] ?? "desconhecido") : "",
          spend: Number(r.spend ?? 0) || 0, impressions: Number(r.impressions ?? 0) || 0,
          link_clicks: Number(r.inline_link_clicks ?? 0) || 0,
          compras: primeiraAcao(r.actions), valor: primeiraAcao(r.action_values),
          raw: r, sincronizado_em: new Date().toISOString(),
        }));
        for (let i = 0; i < gravar.length; i += 500) {
          const { error } = await admin.from("meta_ads_segmentos")
            .upsert(gravar.slice(i, i + 500), { onConflict: "dia,act_id,dimensao,chave1,chave2" });
          if (error) throw new Error(error.message);
        }
        n += gravar.length;
      }
      segmentos += n;
    } catch (e) {
      erros.push(`${seg.dimensao}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return { criativos, segmentos, erros };
}

function diaISO(d: Date): string {
  return d.toISOString().slice(0, 10);
}

Deno.serve(async (req: Request): Promise<Response> => {
  const headers = { ...cors(req, "POST, OPTIONS"), "Content-Type": "application/json" };
  if (req.method === "OPTIONS") return new Response(null, { headers });

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const token = Deno.env.get("META_ADS_ACCESS_TOKEN");
  const cronSecret = Deno.env.get("CRON_SECRET");

  if (!supabaseUrl || !serviceKey) {
    return new Response(JSON.stringify({ error: "Missing Supabase configuration" }), { status: 500, headers });
  }

  // ── Autorização: cron pelo segredo, gente pelo JWT ────────────────────────
  // O botão "Sincronizar agora" da tela manda o JWT de quem clicou; o pg_cron
  // manda o X-Cron-Secret. Um dos dois precisa passar.
  const secretRecebido = req.headers.get("X-Cron-Secret");
  const ehCron = !!secretRecebido && !!cronSecret && secretRecebido === cronSecret;

  const admin = createClient(supabaseUrl, serviceKey);

  // ⚠️ Quem chama pela TELA tem de ser do time interno: o portal de lojas e o
  // de licenciados usam a MESMA `profiles`, e um lojista logado não tem o que
  // fazer aqui. Escolher a conta de anúncio (`descobrir`/`usar`/`desligar`)
  // exige ainda a flag do Admin — é a tela onde isso mora.
  let podeEscolherConta = false;
  if (!ehCron) {
    const auth = req.headers.get("Authorization") ?? "";
    const jwt = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    const { data: userData, error: userErr } = await admin.auth.getUser(jwt);
    if (userErr || !userData?.user) {
      console.warn("[meta-ads-sync] Chamada sem cron-secret válido e sem JWT de usuário.");
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers });
    }
    const { data: perfil } = await admin.from("profiles")
      .select("allowed_interfaces").eq("id", userData.user.id).maybeSingle();
    const interfaces = (perfil?.allowed_interfaces ?? []) as string[];
    if (!(await ehTimeInterno(admin, interfaces))) {
      return new Response(JSON.stringify({ error: "Só o time interno usa os anúncios da Meta." }), { status: 403, headers });
    }
    podeEscolherConta = interfaces.includes("carbo_admin");
  }

  // ⚠️ Checado DEPOIS da autorização, para não contar a quem não passou que o
  // token existe ou não.
  if (!token) {
    return new Response(
      JSON.stringify({
        error: "META_ADS_ACCESS_TOKEN não configurado",
        comofazer: "Business Manager → Usuários do sistema → gerar token com ads_read, e salvar como secret do projeto.",
      }),
      { status: 500, headers },
    );
  }

  try {
    const body = await req.json().catch(() => ({})) as {
      dias?: number; act_id?: string; source?: string;
      acao?: "sincronizar" | "descobrir" | "usar" | "desligar";
    };

    // ── Escolher a conta, sem ninguém ter de procurar o `act_…` ─────────────
    //
    // ⚠️ O cadastro continua MANUAL (o comentário de `meta_ads_accounts` diz
    // por quê: o token pode enxergar conta que não é nossa). O que muda é que a
    // tela LISTA o que o token enxerga e a pessoa clica — em vez de achar o id
    // no Gerenciador e mandar por SQL. `usar` só aceita conta que está NESSA
    // lista, lida de novo aqui: id digitado não entra.
    if (body.acao === "descobrir" || body.acao === "usar" || body.acao === "desligar") {
      if (!podeEscolherConta) {
        return new Response(JSON.stringify({ error: "Só quem tem o Admin escolhe a conta de anúncio." }), { status: 403, headers });
      }

      if (body.acao === "desligar") {
        if (!body.act_id) return new Response(JSON.stringify({ error: "act_id é obrigatório." }), { status: 400, headers });
        const { error } = await admin.from("meta_ads_accounts")
          .update({ ativo: false, atualizado_em: new Date().toISOString() }).eq("act_id", body.act_id);
        if (error) throw new Error(`Falha ao desligar a conta: ${error.message}`);
        return new Response(JSON.stringify({ success: true }), { headers });
      }

      const visiveis: Array<{ act_id: string; nome: string; moeda: string | null; status: number | null }> = [];
      let url: string | null = `${GRAPH}/me/adaccounts?${new URLSearchParams({
        fields: "id,name,currency,account_status", limit: "100", access_token: token,
      })}`;
      for (let pagina = 0; url && pagina < 10; pagina++) {
        const resp: Response = await fetch(url);
        const json = await resp.json().catch(() => ({}));
        if (!resp.ok || json?.error) {
          throw new Error(`Graph respondeu: ${json?.error?.message ?? `HTTP ${resp.status}`}`);
        }
        for (const c of (json.data ?? []) as Record<string, unknown>[]) {
          visiveis.push({
            act_id: String(c.id ?? ""),
            nome: String(c.name ?? c.id ?? ""),
            moeda: (c.currency as string | undefined) ?? null,
            status: typeof c.account_status === "number" ? c.account_status : null,
          });
        }
        url = (json.paging?.next as string | undefined) ?? null;
      }

      if (body.acao === "descobrir") {
        return new Response(JSON.stringify({ success: true, contas: visiveis }), { headers });
      }

      const escolhida = visiveis.find((c) => c.act_id === body.act_id);
      if (!escolhida) {
        return new Response(JSON.stringify({ error: "Essa conta não está entre as que o token enxerga." }), { status: 400, headers });
      }
      const { error } = await admin.from("meta_ads_accounts").upsert({
        act_id: escolhida.act_id, apelido: escolhida.nome, moeda: escolhida.moeda,
        ativo: true, atualizado_em: new Date().toISOString(),
      }, { onConflict: "act_id" });
      if (error) throw new Error(`Falha ao cadastrar a conta: ${error.message}`);
      return new Response(JSON.stringify({ success: true, conta: escolhida }), { headers });
    }

    const origem = body.source === "cron" ? "cron" : "manual";
    // Teto de 90 dias: acima disso a Meta pagina demais e a função estoura o
    // tempo antes de gravar qualquer coisa. Backfill maior é rodada repetida.
    const dias = Math.min(Math.max(Number(body.dias) || 30, 1), 90);

    const ate = new Date();
    const desde = new Date(ate.getTime() - (dias - 1) * 24 * 60 * 60 * 1000);

    let q = admin.from("meta_ads_accounts").select("act_id, apelido, desde").eq("ativo", true);
    if (body.act_id) q = q.eq("act_id", body.act_id);
    const { data: contas, error: contasErr } = await q;

    if (contasErr) throw new Error(`Falha ao ler meta_ads_accounts: ${contasErr.message}`);

    if (!contas || contas.length === 0) {
      // Não é erro: é o estado de quem ainda não cadastrou conta nenhuma.
      console.log("[meta-ads-sync] Nenhuma conta ativa em meta_ads_accounts — nada a fazer.");
      await admin.from("meta_ads_sync_log").insert({
        origem, linhas: 0, ok: true, erro: "nenhuma conta ativa cadastrada",
        desde: diaISO(desde), ate: diaISO(ate),
      });
      return new Response(
        JSON.stringify({ success: true, contas: 0, linhas: 0, aviso: "Nenhuma conta ativa em meta_ads_accounts." }),
        { headers },
      );
    }

    const resultado: Array<{ act_id: string; linhas: number; ok: boolean; erro?: string }> = [];

    for (const conta of contas) {
      const t0 = Date.now();
      // Conta que começou depois do início da janela não tem o que entregar
      // antes disso — e pedir gera erro na Meta, não lista vazia.
      const inicio = conta.desde && conta.desde > diaISO(desde) ? conta.desde : diaISO(desde);

      try {
        const params = new URLSearchParams({
          level: "ad",
          time_increment: "1",
          time_range: JSON.stringify({ since: inicio, until: diaISO(ate) }),
          fields: FIELDS,
          limit: "500",
          access_token: token,
        });

        let url: string | null = `${GRAPH}/${conta.act_id}/insights?${params}`;
        const linhas: Record<string, unknown>[] = [];
        let pagina = 0;

        // ⚠️ Teto de páginas. Sem ele, um `paging.next` que a Meta devolve em
        // loop (acontece quando a conta é grande e a janela é longa) prende a
        // função até o timeout e a rodada inteira se perde sem gravar nada.
        while (url && pagina < 40) {
          const resp: Response = await fetch(url);
          const json = await resp.json().catch(() => ({}));

          if (!resp.ok || json?.error) {
            const m = json?.error?.message ?? `HTTP ${resp.status}`;
            throw new Error(`Graph respondeu: ${m}`);
          }

          for (const r of (json.data ?? []) as Record<string, unknown>[]) {
            linhas.push({
              dia: r.date_start,
              ad_id: String(r.ad_id ?? ""),
              // O `account_id` da Meta vem SEM o prefixo act_; usamos o nosso
              // para a FK bater.
              act_id: conta.act_id,
              campaign_id: r.campaign_id ?? null,
              campaign_name: r.campaign_name ?? null,
              adset_id: r.adset_id ?? null,
              adset_name: r.adset_name ?? null,
              ad_name: r.ad_name ?? null,
              spend: Number(r.spend ?? 0) || 0,
              impressions: Number(r.impressions ?? 0) || 0,
              clicks: Number(r.clicks ?? 0) || 0,
              link_clicks: Number(r.inline_link_clicks ?? 0) || 0,
              reach: Number(r.reach ?? 0) || 0,
              frequency: Number(r.frequency ?? 0) || 0,
              meta_compras: primeiraAcao(r.actions),
              meta_valor_compras: primeiraAcao(r.action_values),
              moeda: r.account_currency ?? null,
              raw: r,
              sincronizado_em: new Date().toISOString(),
            });
          }

          url = (json.paging?.next as string | undefined) ?? null;
          pagina++;
        }

        // Grava em lotes: um upsert de milhares de linhas de uma vez estoura o
        // payload e a rodada inteira volta como erro.
        let gravadas = 0;
        for (let i = 0; i < linhas.length; i += 500) {
          const lote = linhas.slice(i, i + 500);
          const { error } = await admin
            .from("meta_ads_insights_daily")
            .upsert(lote, { onConflict: "dia,ad_id" });
          if (error) throw new Error(`Falha ao gravar lote: ${error.message}`);
          gravadas += lote.length;
        }

        console.log(`[meta-ads-sync] ${conta.act_id} (${conta.apelido}): ${gravadas} linhas, ${pagina} página(s).`);
        await admin.from("meta_ads_sync_log").insert({
          origem, act_id: conta.act_id, desde: inicio, ate: diaISO(ate),
          linhas: gravadas, ok: true, duracao_ms: Date.now() - t0,
        });
        resultado.push({ act_id: conta.act_id, linhas: gravadas, ok: true });

        // Os extras numa tentativa À PARTE: o gasto acima já está gravado.
        // ⚠️ A linha `:extras` é gravada SEMPRE, ok ou não: é ela que diz à
        // tela que a falha anterior dos extras já passou.
        const t1 = Date.now();
        let ex: { criativos: number; segmentos: number; erros: string[] };
        try {
          ex = await sincronizarExtras(admin, token, conta.act_id, inicio, diaISO(ate));
        } catch (e) {
          ex = { criativos: 0, segmentos: 0, erros: [e instanceof Error ? e.message : String(e)] };
        }
        console.log(`[meta-ads-sync] ${conta.act_id}: ${ex.criativos} criativos, ${ex.segmentos} linhas de segmento.`);
        if (ex.erros.length) console.error(`[meta-ads-sync] ${conta.act_id} extras com falha:`, ex.erros.join(" | "));
        await admin.from("meta_ads_sync_log").insert({
          origem: `${origem}:extras`, act_id: conta.act_id, desde: inicio, ate: diaISO(ate),
          linhas: ex.criativos + ex.segmentos, ok: ex.erros.length === 0,
          erro: ex.erros.length ? ex.erros.join(" | ") : null, duracao_ms: Date.now() - t1,
        });

      } catch (e) {
        // ⚠️ Uma conta com problema (token sem permissão nela, conta desativada
        // pela Meta) NÃO pode derrubar as outras. Loga, marca e segue.
        const msg = e instanceof Error ? e.message : String(e);
        console.error(`[meta-ads-sync] ${conta.act_id} falhou:`, msg);
        await admin.from("meta_ads_sync_log").insert({
          origem, act_id: conta.act_id, desde: inicio, ate: diaISO(ate),
          linhas: 0, ok: false, erro: msg, duracao_ms: Date.now() - t0,
        });
        resultado.push({ act_id: conta.act_id, linhas: 0, ok: false, erro: msg });
      }
    }

    const total = resultado.reduce((s, r) => s + r.linhas, 0);
    const todasOk = resultado.every((r) => r.ok);

    return new Response(
      JSON.stringify({
        success: todasOk,
        janela: { desde: diaISO(desde), ate: diaISO(ate), dias },
        contas: resultado.length,
        linhas: total,
        detalhe: resultado,
      }),
      { status: todasOk ? 200 : 207, headers },
    );

  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[meta-ads-sync] Falha geral:", msg);
    return new Response(JSON.stringify({ success: false, error: msg }), { status: 500, headers });
  }
});

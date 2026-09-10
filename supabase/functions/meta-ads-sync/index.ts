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
import { cors } from "../_shared/cors.ts";

// Fixada de propósito. A v25.0 é a atual (fev/2026); a v26 ainda não saiu.
// ⚠️ Subir de versão é decisão consciente — a Meta aposenta métrica entre
// versões (reach e impressão de story saíram do Graph em jun/2026).
const GRAPH = "https://graph.facebook.com/v25.0";

// O que pedimos por linha. `inline_link_clicks` é o clique no LINK; `clicks`
// conta curtida e "ver mais" junto, e é por isso que o CTR do gerenciador
// parece maior do que o do site.
const FIELDS = [
  "account_id", "account_currency",
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

  if (!ehCron) {
    const auth = req.headers.get("Authorization") ?? "";
    const jwt = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    const { data: userData, error: userErr } = await admin.auth.getUser(jwt);
    if (userErr || !userData?.user) {
      console.warn("[meta-ads-sync] Chamada sem cron-secret válido e sem JWT de usuário.");
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers });
    }
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
    const body = await req.json().catch(() => ({})) as { dias?: number; act_id?: string; source?: string };
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

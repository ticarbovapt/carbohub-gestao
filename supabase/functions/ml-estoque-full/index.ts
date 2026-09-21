/**
 * ml-estoque-full — espelha o estoque do Fulfillment do Mercado Livre
 *
 * Só LÊ do ML e grava em `ml_estoque_full`. Não escreve nada no ML, não mexe
 * em `warehouse_stock`, não deduz nada.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ⚠️ O QUE É CERTO E O QUE É TENTATIVA
 *
 * Os dois endpoints do caminho principal são estáveis e bem conhecidos:
 *
 *   GET /users/{seller}/items/search?search_type=scan   os ids dos anúncios
 *   GET /items?ids=a,b,c                                até 20 por chamada
 *
 * `available_quantity` do anúncio É o saldo disponível para venda no ML, e é
 * ele que a tela mostra.
 *
 * ⚠️ O detalhe por inventário (`/inventories/{id}/stock/fulfillment`) NÃO foi
 * confirmado. Ele entra como enriquecimento OPCIONAL: se responder, grava
 * `nao_disponivel` e `detalhe_full`; se não, deixa NULO e segue.
 *
 * Nulo ali significa "não perguntei ou não respondeu" — NUNCA zero. Zero é um
 * saldo válido, e confundir os dois é a doença do `Math.round` inventando o
 * `×1`: ausência disfarçada de resposta some da lista de trabalho.
 *
 * ⚠️ `search_type=scan` e não offset: o modo offset PARA em 1000 anúncios, sem
 * erro — devolve menos e parece completo. Mesma família do teto de 1.000 do
 * PostgREST que escondeu metade do Dashboard Comercial.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { contasAtivas, mlFetch, type ContaML } from "../_shared/ml.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const LOTE_ITENS = 20;   // teto do /items?ids=
const TETO_ANUNCIOS = 5000;

interface LinhaEspelho {
  item_id: string;
  variation_id: string;
  seller_id: number;
  title: string | null;
  seller_sku: string | null;
  status: string | null;
  logistic_type: string | null;
  inventory_id: string | null;
  disponivel: number | null;
  nao_disponivel: number | null;
  detalhe_full: unknown | null;
  raw: unknown;
  sincronizado_em: string;
}

/** SKU do anúncio: `seller_custom_field` ou o atributo SELLER_SKU. */
function skuDoAnuncio(x: Record<string, unknown>): string | null {
  const direto = x.seller_custom_field as string | null;
  if (direto && String(direto).trim() !== "") return String(direto).trim();

  const attrs = (x.attributes ?? []) as Record<string, unknown>[];
  const a = attrs.find((t) => t.id === "SELLER_SKU");
  const v = (a?.value_name ?? null) as string | null;
  return v && v.trim() !== "" ? v.trim() : null;
}

/** Detalhe do fulfillment. Devolve null em QUALQUER problema — é opcional. */
async function detalheFull(
  conta: ContaML, inventoryId: string,
): Promise<{ nao_disponivel: number | null; detalhe: unknown } | null> {
  try {
    const res = await mlFetch(supabase as never, conta,
      `/inventories/${inventoryId}/stock/fulfillment`, {}, 2);
    if (!res || !res.ok) return null;
    const j = await res.json() as Record<string, unknown>;
    // ⚠️ Não invento o formato: guardo o corpo inteiro em `detalhe_full` e só
    // extraio o campo se ele estiver onde se espera. Se o formato for outro,
    // `nao_disponivel` fica nulo e o dado cru continua disponível para eu
    // olhar depois — em vez de um número inventado na tela.
    const naoDisp = typeof j.not_available_quantity === "number"
      ? j.not_available_quantity as number
      : null;
    return { nao_disponivel: naoDisp, detalhe: j };
  } catch {
    return null;
  }
}

async function espelharConta(conta: ContaML): Promise<Record<string, unknown>> {
  const ids: string[] = [];
  let scroll: string | null = null;

  // ── 1. Todos os ids, por scan ────────────────────────────────────────────
  for (;;) {
    const caminho = `/users/${conta.seller_id}/items/search?search_type=scan&limit=100`
      + (scroll ? `&scroll_id=${encodeURIComponent(scroll)}` : "");
    const res = await mlFetch(supabase as never, conta, caminho);
    if (!res) return { erro: "sem token" };
    if (!res.ok) {
      const corpo = await res.text().catch(() => "");
      await supabase.rpc("ml_conta_marcar_erro", {
        p_seller_id: conta.seller_id,
        p_erro: `items/search ${res.status}: ${corpo.slice(0, 300)}`,
        p_fatal: false,
      });
      return { erro: `items/search ${res.status}` };
    }
    const j = await res.json() as { results?: string[]; scroll_id?: string };
    const lote = j.results ?? [];
    ids.push(...lote);
    scroll = j.scroll_id ?? null;
    // Fim: sem scroll ou lote vazio. ⚠️ O teto existe para um scroll que não
    // termina não virar laço infinito consumindo cota.
    if (!scroll || lote.length === 0 || ids.length >= TETO_ANUNCIOS) break;
  }

  if (ids.length === 0) return { anuncios: 0 };

  // ── 2. Detalhes, 20 por chamada ──────────────────────────────────────────
  const agora = new Date().toISOString();
  const linhas: LinhaEspelho[] = [];

  for (let i = 0; i < ids.length; i += LOTE_ITENS) {
    const bloco = ids.slice(i, i + LOTE_ITENS);
    const res = await mlFetch(supabase as never, conta, `/items?ids=${bloco.join(",")}`);
    if (!res || !res.ok) continue;

    const arr = await res.json() as { code?: number; body?: Record<string, unknown> }[];
    for (const entrada of arr) {
      if (entrada.code !== 200 || !entrada.body) continue;
      const it = entrada.body;
      const logistica = ((it.shipping ?? {}) as Record<string, unknown>).logistic_type as string | null;

      const base = {
        item_id: String(it.id),
        seller_id: conta.seller_id,
        title: (it.title as string) ?? null,
        status: (it.status as string) ?? null,
        logistic_type: logistica ?? null,
        raw: it,
        sincronizado_em: agora,
      };

      const variacoes = (it.variations ?? []) as Record<string, unknown>[];

      if (variacoes.length === 0) {
        linhas.push({
          ...base,
          variation_id: "",
          seller_sku: skuDoAnuncio(it),
          inventory_id: (it.inventory_id as string) ?? null,
          disponivel: typeof it.available_quantity === "number"
            ? it.available_quantity as number : null,
          nao_disponivel: null,
          detalhe_full: null,
        });
      } else {
        // ⚠️ Uma linha por VARIAÇÃO. Somar cedo esconderia qual cor/tamanho
        // zerou — e é justamente essa a informação que faz alguém repor.
        for (const v of variacoes) {
          linhas.push({
            ...base,
            variation_id: String(v.id ?? ""),
            seller_sku: (v.seller_sku as string) ?? skuDoAnuncio(it),
            inventory_id: (v.inventory_id as string) ?? null,
            disponivel: typeof v.available_quantity === "number"
              ? v.available_quantity as number : null,
            nao_disponivel: null,
            detalhe_full: null,
          });
        }
      }
    }
  }

  // ── 3. Enriquecimento OPCIONAL, só para o que é fulfillment ──────────────
  let comDetalhe = 0;
  for (const l of linhas) {
    if (l.logistic_type !== "fulfillment" || !l.inventory_id) continue;
    const d = await detalheFull(conta, l.inventory_id);
    if (d) {
      l.nao_disponivel = d.nao_disponivel;
      l.detalhe_full = d.detalhe;
      comDetalhe++;
    }
  }

  // ── 4. Grava ─────────────────────────────────────────────────────────────
  if (linhas.length > 0) {
    const { error } = await supabase.from("ml_estoque_full")
      .upsert(linhas, { onConflict: "item_id,variation_id" });
    if (error) return { erro: `gravacao: ${error.message}` };
  }

  // ⚠️ Anúncio que SUMIU do ML (encerrado) ficaria aqui para sempre, mostrando
  // um saldo que não existe mais. Some o que não veio nesta rodada.
  await supabase.from("ml_estoque_full")
    .delete()
    .eq("seller_id", conta.seller_id)
    .lt("sincronizado_em", agora);

  return {
    anuncios: ids.length,
    linhas: linhas.length,
    fulfillment: linhas.filter((l) => l.logistic_type === "fulfillment").length,
    com_detalhe: comDetalhe,
  };
}

Deno.serve(async (req: Request) => {
  // ⚠️ AUSÊNCIA FECHA. Sem o segredo, 500 com mensagem explícita — nunca
  // aceita. E 401 separado para chave errada: um 401 para os dois faz falha de
  // configuração se disfarçar de chamada indevida.
  const segredo = Deno.env.get("CRON_SECRET");
  if (!segredo) {
    console.error("[ml-estoque-full] CRON_SECRET ausente no servidor");
    return new Response(JSON.stringify({ ok: false, erro: "CRON_SECRET ausente no servidor" }),
      { status: 500, headers: { "Content-Type": "application/json" } });
  }
  const informado = req.headers.get("x-cron-secret") ?? new URL(req.url).searchParams.get("secret");
  if (informado !== segredo) {
    return new Response(JSON.stringify({ ok: false, erro: "nao autorizado" }),
      { status: 401, headers: { "Content-Type": "application/json" } });
  }

  const contas = await contasAtivas(supabase as never);
  const resultado: Record<string, unknown> = {};

  for (const conta of contas as ContaML[]) {
    // ⚠️ Só a conta do FULL. A LogHouse despacha daqui e o estoque dela é o
    // `warehouse_stock` do HUB-SP — espelhar os anúncios dela criaria um
    // segundo número para a mesma prateleira, e aí ninguém sabe qual vale.
    if (conta.platform_key !== "mercadolivre_full") continue;
    try {
      resultado[conta.platform_key] = await espelharConta(conta);
    } catch (e) {
      resultado[conta.platform_key] = { erro: (e as Error).message };
    }
  }

  if (Object.keys(resultado).length === 0) {
    resultado["aviso"] = "nenhuma conta mercadolivre_full ativa";
  }

  console.log("[ml-estoque-full]", JSON.stringify(resultado));
  return new Response(JSON.stringify({ ok: true, ...resultado }),
    { headers: { "Content-Type": "application/json" } });
});

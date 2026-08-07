import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  getNuvemshopCreds, fetchNuvemshopOrdersSince, mapNuvemshopOrder, enrichUnitsReal,
} from "../_shared/nuvemshop.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

type Platform = "mercadolivre" | "amazon" | "tiktok" | "shopee" | "nuvemshop";

// ─── Token helper ─────────────────────────────────────────────────────────────

async function getMercadoLivreToken(): Promise<{ accessToken: string; sellerId: string; lastSyncedAt: Date } | null> {
  const { data, error } = await supabase
    .from("system_tokens")
    .select("access_token,refresh_token,expires_at,seller_id,last_synced_at")
    .eq("id", "mercadolivre")
    .maybeSingle();

  if (error || !data) {
    console.warn("[mercadolivre] Token not found in system_tokens — skipping sync");
    return null;
  }

  // Refresh if expired (or within 5 min of expiry)
  const expiresAt = data.expires_at ? new Date(data.expires_at).getTime() : 0;
  if (Date.now() >= expiresAt - 5 * 60 * 1000) {
    try {
      const res = await fetch("https://api.mercadolibre.com/oauth/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type:    "refresh_token",
          client_id:     Deno.env.get("ML_CLIENT_ID")!,
          client_secret: Deno.env.get("ML_CLIENT_SECRET")!,
          refresh_token: data.refresh_token,
        }),
      });
      if (res.ok) {
        const t = await res.json() as { access_token: string; refresh_token: string; expires_in: number };
        await supabase.from("system_tokens").upsert({
          id:            "mercadolivre",
          access_token:  t.access_token,
          refresh_token: t.refresh_token,
          expires_at:    new Date(Date.now() + t.expires_in * 1000).toISOString(),
          seller_id:     data.seller_id,
          updated_at:    new Date().toISOString(),
        }, { onConflict: "id" });
        return { accessToken: t.access_token, sellerId: data.seller_id, lastSyncedAt: data.last_synced_at ? new Date(data.last_synced_at) : new Date(Date.now() - 48 * 60 * 60 * 1000) };
      }
    } catch (e) {
      console.error("[mercadolivre] Token refresh failed:", e);
    }
    return null;
  }

  // last_synced_at: from where to pick up. If never synced before, go back 48h as safety net.
  const lastSyncedAt = data.last_synced_at
    ? new Date(data.last_synced_at)
    : new Date(Date.now() - 48 * 60 * 60 * 1000);

  return { accessToken: data.access_token, sellerId: data.seller_id, lastSyncedAt };
}

// ─── Platform pullers ─────────────────────────────────────────────────────────

async function pullMercadoLivre(): Promise<Record<string, unknown>[]> {
  const creds = await getMercadoLivreToken();
  if (!creds) return [];
  const { accessToken, sellerId, lastSyncedAt } = creds;

  // Always sync from last checkpoint — covers gaps of any length (weekend, vacation, etc.)
  // Cap at 30 days to avoid hitting ML API limits
  const maxLookback = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const since = lastSyncedAt < maxLookback ? maxLookback : lastSyncedAt;

  console.log(`[mercadolivre] Syncing from ${since.toISOString()}`);
  // ⚠️ Filtra por ATUALIZAÇÃO, não por criação.
  //
  // Era `date_created.from`. Com ele, o pedido só é buscado na janela em que
  // nasceu: despachado ou entregue depois, nunca mais volta — e o status dele
  // congela para sempre no nosso espelho. Foi assim que 25 pedidos do ML já
  // entregues ficaram parados em "pago" e a esteira nunca os moveu.
  //
  // `order.date_last_updated.from` traz de volta todo pedido que MUDOU desde o
  // checkpoint, que é exatamente quando há algo novo para gravar.
  const url = `https://api.mercadolibre.com/orders/search?seller=${sellerId}`
    + `&sort=date_desc&order.date_last_updated.from=${since.toISOString()}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) { console.error("[mercadolivre] API error", res.status); return []; }
  const json = await res.json() as { results: Record<string, unknown>[] };

  // Status do envio, um por pedido (não por item: o envio é do pedido inteiro).
  const envioPorPedido = new Map<string, string | null>();
  for (const order of (json.results ?? [])) {
    const shippingId = (order.shipping as Record<string, unknown>)?.id;
    envioPorPedido.set(String(order.id), await fetchMLShipmentStatus(accessToken, shippingId));
  }

  const rows = (json.results ?? []).flatMap((order) => {
    const items = order.order_items as Record<string, unknown>[] ?? [];
    // O envio manda quando existe; senão vale o status do pagamento.
    const statusFinal = envioPorPedido.get(String(order.id))
      ?? normalizeMLStatus(String(order.status ?? ""));
    return items.map((item) => ({
      platform:     "mercadolivre",
      order_id:     `${order.id}-${(item.item as Record<string, unknown>)?.id}`,
      product_sku:  (item.item as Record<string, unknown>)?.seller_sku ?? null,
      product_name: (item.item as Record<string, unknown>)?.title ?? null,
      quantity:     Number(item.quantity ?? 1),
      units_real:   Number(item.quantity ?? 1),
      unit_price:   Number(item.unit_price ?? 0),
      total:        Number(item.unit_price ?? 0) * Number(item.quantity ?? 1),
      status:       statusFinal,
      ordered_at:   String(order.date_created ?? new Date().toISOString()),
      sync_source:  "cron",
      raw:          order,
    }));
  });

  // Update checkpoint so next run starts from now (no gaps, no double-fetching unnecessarily)
  await supabase.from("system_tokens")
    .update({ last_synced_at: new Date().toISOString() })
    .eq("id", "mercadolivre");

  return rows;
}

// ── Status do ENVIO no Mercado Livre ──────────────────────────────────────
//
// ⚠️ `order.status` do ML é o status do PAGAMENTO — ele chega em `paid` e
// para ali para sempre. O andamento do envio mora noutro recurso, apontado por
// `order.shipping.id`, e é preciso buscá-lo: GET /shipments/{id}.
//
// Sem isto, todo pedido do ML fica eternamente em "paid" no nosso espelho e a
// esteira do on-line nunca move o card para "em trânsito"/"entregue" — foi
// exatamente o que aconteceu: 25 pedidos do ML empilhados na etiqueta, todos
// já entregues na vida real.
//
// Uma chamada por pedido, dentro da integração que já existe. Falha em
// consultar NÃO derruba o pedido: devolve null e o status do pagamento vale,
// que é o comportamento antigo.
async function fetchMLShipmentStatus(
  accessToken: string, shippingId: unknown
): Promise<string | null> {
  const id = shippingId != null ? String(shippingId) : "";
  if (!id) return null;
  try {
    const res = await fetch(`https://api.mercadolibre.com/shipments/${id}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) { console.error("[mercadolivre] shipment", id, res.status); return null; }
    const s = await res.json() as { status?: string; substatus?: string };
    return normalizeMLShipmentStatus(String(s?.status ?? ""));
  } catch (e) {
    console.error("[mercadolivre] shipment", id, "falhou:", e);
    return null;
  }
}

// Vocabulário do recurso /shipments. `pending`, `handling` e `ready_to_ship`
// são antes da coleta — continuam valendo como "pago, a enviar", e por isso
// devolvem null (o status do pagamento prevalece).
function normalizeMLShipmentStatus(s: string): string | null {
  const map: Record<string, string> = {
    shipped:       "shipped",
    delivered:     "delivered",
    not_delivered: "shipped",   // tentativa falhou: ainda está em trânsito
    cancelled:     "cancelled",
  };
  return map[s] ?? null;
}

function normalizeMLStatus(s: string): string {
  const map: Record<string, string> = {
    confirmed: "pending", payment_required: "pending",
    partially_paid: "pending", payment_in_process: "pending",
    paid: "paid",                 // pago, aguardando despacho → consome (card "A enviar")
    shipped: "shipped", partially_delivered: "shipped",
    delivered: "delivered", cancelled: "cancelled",
  };
  return map[s] ?? "pending";
}

const LWA_TOKEN_URL = "https://api.amazon.com/auth/o2/token";
const SP_API_BASE   = "https://sellingpartnerapi-na.amazon.com";
const BRAZIL_MKT_ID = "A2Q3Y263D00KWC";

async function getAmazonToken(): Promise<{ accessToken: string; sellerId: string; lastSyncedAt: Date } | null> {
  const { data, error } = await supabase
    .from("system_tokens")
    .select("access_token,refresh_token,expires_at,seller_id,last_synced_at")
    .eq("id", "amazon")
    .maybeSingle();

  if (error || !data) {
    console.warn("[amazon] Token not found in system_tokens — skipping sync");
    return null;
  }

  // Refresh if expired (or within 5 min of expiry)
  const expiresAt = data.expires_at ? new Date(data.expires_at).getTime() : 0;
  if (Date.now() >= expiresAt - 5 * 60 * 1000) {
    try {
      const res = await fetch(LWA_TOKEN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type:    "refresh_token",
          refresh_token: data.refresh_token,
          client_id:     Deno.env.get("AMAZON_CLIENT_ID")!,
          client_secret: Deno.env.get("AMAZON_CLIENT_SECRET")!,
        }),
      });
      if (res.ok) {
        const t = await res.json() as { access_token: string; refresh_token: string; expires_in: number };
        await supabase.from("system_tokens").upsert({
          id:            "amazon",
          access_token:  t.access_token,
          refresh_token: t.refresh_token,
          expires_at:    new Date(Date.now() + t.expires_in * 1000).toISOString(),
          seller_id:     data.seller_id,
          updated_at:    new Date().toISOString(),
        }, { onConflict: "id" });
        return {
          accessToken:  t.access_token,
          sellerId:     data.seller_id,
          lastSyncedAt: data.last_synced_at ? new Date(data.last_synced_at) : new Date(Date.now() - 48 * 60 * 60 * 1000),
        };
      } else {
        console.error("[amazon] Token refresh failed:", res.status, await res.text());
      }
    } catch (e) {
      console.error("[amazon] Token refresh error:", e);
    }
    return null;
  }

  return {
    accessToken:  data.access_token,
    sellerId:     data.seller_id,
    lastSyncedAt: data.last_synced_at ? new Date(data.last_synced_at) : new Date(Date.now() - 48 * 60 * 60 * 1000),
  };
}

function normalizeAmazonStatus(s: string): string {
  const map: Record<string, string> = {
    Pending:            "pending",  // aguardando pagamento → não consome
    Unshipped:          "paid",     // pago, aguardando despacho → consome (card "A enviar")
    PartiallyShipped:   "shipped",  // parte já despachada → Em Transporte
    Shipped:            "shipped",  // despachado → Em Transporte
    Delivered:          "delivered",
    Canceled:           "cancelled",
  };
  return map[s] ?? "pending";
}

async function fetchAmazonOrders(accessToken: string, since: Date): Promise<Record<string, unknown>[]> {
  const orders: Record<string, unknown>[] = [];
  let nextToken: string | undefined;

  do {
    const params = new URLSearchParams({
      MarketplaceIds: BRAZIL_MKT_ID,
      CreatedAfter:   since.toISOString(),
      OrderStatuses:  "Unshipped,PartiallyShipped,Shipped,Canceled,Pending",
    });
    if (nextToken) params.set("NextToken", nextToken);

    const res = await fetch(`${SP_API_BASE}/orders/v0/orders?${params}`, {
      headers: {
        "Authorization":       `Bearer ${accessToken}`,
        "x-amz-access-token":  accessToken,
        "Content-Type":        "application/json",
      },
    });

    if (!res.ok) {
      console.error("[amazon] Orders API error:", res.status, await res.text());
      break;
    }

    const json = await res.json() as {
      payload?: {
        Orders?: Record<string, unknown>[];
        NextToken?: string;
      };
    };

    const batch = json.payload?.Orders ?? [];
    orders.push(...batch);
    nextToken = json.payload?.NextToken;

    // Cap at 50 orders per sync to avoid rate limits
    if (orders.length >= 50) break;
  } while (nextToken);

  return orders.slice(0, 50);
}

async function fetchOrderItems(accessToken: string, orderId: string): Promise<Record<string, unknown>[]> {
  const res = await fetch(`${SP_API_BASE}/orders/v0/orders/${orderId}/orderItems`, {
    headers: {
      "Authorization":      `Bearer ${accessToken}`,
      "x-amz-access-token": accessToken,
      "Content-Type":       "application/json",
    },
  });

  if (!res.ok) {
    console.warn("[amazon] OrderItems API error for", orderId, res.status);
    return [];
  }

  const json = await res.json() as { payload?: { OrderItems?: Record<string, unknown>[] } };
  return json.payload?.OrderItems ?? [];
}

async function pullAmazon(since: Date): Promise<Record<string, unknown>[]> {
  const creds = await getAmazonToken();
  if (!creds) { console.warn("[amazon] No valid token — skipping sync"); return []; }
  const { accessToken, sellerId, lastSyncedAt } = creds;

  // Always sync from last checkpoint — covers gaps of any length
  const maxLookback = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const syncSince = lastSyncedAt < maxLookback ? maxLookback : lastSyncedAt;

  console.log(`[amazon] Syncing from ${syncSince.toISOString()}`);

  const orders = await fetchAmazonOrders(accessToken, syncSince);
  if (orders.length === 0) {
    console.log("[amazon] No new orders");
    await supabase.from("system_tokens")
      .update({ last_synced_at: new Date().toISOString() })
      .eq("id", "amazon");
    return [];
  }

  // Batch fetch order items for each order
  const rows: Record<string, unknown>[] = [];
  for (const order of orders) {
    const orderId = String(order.AmazonOrderId ?? "");
    const items   = await fetchOrderItems(accessToken, orderId);

    if (items.length === 0) {
      // Fallback: create one row from the order-level data
      rows.push({
        platform:     "amazon",
        order_id:     orderId,
        product_sku:  null,
        product_name: null,
        quantity:     1,
        units_real:   1,
        unit_price:   Number((order.OrderTotal as Record<string, unknown>)?.Amount ?? 0),
        total:        Number((order.OrderTotal as Record<string, unknown>)?.Amount ?? 0),
        status:       normalizeAmazonStatus(String(order.OrderStatus ?? "")),
        ordered_at:   String(order.PurchaseDate ?? new Date().toISOString()),
        sync_source:  "cron",
        raw:          order,
      });
    } else {
      for (const item of items) {
        const qty       = Number(item.QuantityOrdered ?? 1);
        const unitPrice = Number((item.ItemPrice as Record<string, unknown>)?.Amount ?? 0) / (qty || 1);
        rows.push({
          platform:     "amazon",
          order_id:     `${orderId}-${item.OrderItemId}`,
          product_sku:  (item.SellerSKU as string) ?? null,
          product_name: (item.Title as string) ?? null,
          quantity:     qty,
          units_real:   qty,
          unit_price:   unitPrice,
          total:        Number((item.ItemPrice as Record<string, unknown>)?.Amount ?? 0),
          status:       normalizeAmazonStatus(String(order.OrderStatus ?? "")),
          ordered_at:   String(order.PurchaseDate ?? new Date().toISOString()),
          sync_source:  "cron",
          raw:          { ...order, _item: item },
        });
      }
    }
  }

  // Update checkpoint so next run starts from now
  await supabase.from("system_tokens")
    .update({ last_synced_at: new Date().toISOString() })
    .eq("id", "amazon");

  return rows;
}

async function pullTikTok(since: Date): Promise<Record<string, unknown>[]> {
  // TODO: implement TikTok Shop API GET /order/list with HMAC-SHA256 signing
  // Requires: app_key, app_secret, access_token, shop_id
  const appKey = Deno.env.get("TIKTOK_APP_KEY");
  if (!appKey) { console.warn("[tiktok] Credentials not configured — skipping sync"); return []; }
  console.warn("[tiktok] TikTok Shop API integration pending — add implementation when credentials are ready");
  return [];
}

async function pullShopee(since: Date): Promise<Record<string, unknown>[]> {
  // TODO: implement Shopee Open Platform GET /api/v2/order/get_order_list with HMAC-SHA256 signing
  // Requires: partner_id, partner_key, access_token, shop_id
  const partnerId = Deno.env.get("SHOPEE_PARTNER_ID");
  if (!partnerId) { console.warn("[shopee] Credentials not configured — skipping sync"); return []; }
  console.warn("[shopee] Shopee API integration pending — add implementation when credentials are ready");
  return [];
}

async function pullNuvemshop(): Promise<Record<string, unknown>[]> {
  const creds = await getNuvemshopCreds(supabase);
  if (!creds) { console.warn("[nuvemshop] Sem token — pulando sync"); return []; }
  const { accessToken, storeId, lastSyncedAt } = creds;

  // Sincroniza desde o último checkpoint, com teto de 30 dias.
  const maxLookback = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const since = lastSyncedAt < maxLookback ? maxLookback : lastSyncedAt;

  console.log(`[nuvemshop] Sincronizando desde ${since.toISOString()}`);
  const orders = await fetchNuvemshopOrdersSince(accessToken, storeId, since);

  // Mesma função de mapeamento do webhook → order_id idêntico, upsert idempotente.
  //
  // ⚠️ O número do pedido (#276) é gravado AQUI, e não só dentro do
  // normalizador, de propósito: o painel do Supabase publica uma função por
  // vez, substituindo o index.ts — o arquivo `_shared` fica para trás. Com a
  // atribuição aqui, publicar só esta função já faz o vínculo funcionar.
  //
  // É o número que o Bling guarda em `numero_loja`, e sem ele a esteira do
  // on-line não consegue mover o card para "em trânsito"/"entregue", que é
  // justamente o que a plataforma sabe e o Bling não.
  const mapped = orders.flatMap((o) => {
    const num = (o as any)?.number != null ? String((o as any).number) : null;
    return mapNuvemshopOrder(o, "cron")
      .map((r) => ({ ...r, platform_order_number: num })) as any[];
  });
  const rows = await enrichUnitsReal(supabase, mapped);

  // Atualiza o checkpoint para a próxima execução.
  await supabase.from("system_tokens")
    .update({ last_synced_at: new Date().toISOString() })
    .eq("id", "nuvemshop");

  return rows as unknown as Record<string, unknown>[];
}

// ─── Main ─────────────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok");

  // since is now managed per-platform inside each puller via last_synced_at
  const since = new Date(Date.now() - 2 * 60 * 60 * 1000); // kept for Amazon/TikTok/Shopee stubs

  const pullers: Record<Platform, (d: Date) => Promise<Record<string, unknown>[]>> = {
    mercadolivre: () => pullMercadoLivre(),
    amazon:       pullAmazon,
    tiktok:       pullTikTok,
    shopee:       pullShopee,
    nuvemshop:    () => pullNuvemshop(),
  };

  const results: Record<string, number | string> = {};

  for (const [platform, pull] of Object.entries(pullers)) {
    try {
      const orders = await pull(since);
      if (orders.length === 0) { results[platform] = 0; continue; }
      const { error } = await supabase
        .from("ecommerce_orders")
        .upsert(orders, { onConflict: "platform,order_id" });
      if (error) { results[platform] = `error: ${error.message}`; }
      else        { results[platform] = orders.length; }
    } catch (e) {
      results[platform] = `error: ${(e as Error).message}`;
    }
  }

  console.log("[ecommerce-sync]", JSON.stringify(results));
  return new Response(JSON.stringify({ ok: true, synced: results }), {
    headers: { "Content-Type": "application/json" },
  });
});

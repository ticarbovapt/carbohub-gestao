import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

type Platform = "mercadolivre" | "amazon" | "tiktok" | "shopee";

// ─── Platform pullers ─────────────────────────────────────────────────────────
// Each function fetches recent orders from the platform API.
// Returns normalized rows ready to upsert into ecommerce_orders.
// Replace the stub bodies with real API calls once credentials are available.

async function pullMercadoLivre(since: Date): Promise<Record<string, unknown>[]> {
  const accessToken = Deno.env.get("ML_ACCESS_TOKEN");
  const sellerId    = Deno.env.get("ML_SELLER_ID");
  if (!accessToken || !sellerId) {
    console.warn("[mercadolivre] Credentials not configured — skipping sync");
    return [];
  }
  // GET /orders/search?seller={sellerId}&sort=date_desc&date_created.from={since}
  const url = `https://api.mercadolibre.com/orders/search?seller=${sellerId}&sort=date_desc&date_created.from=${since.toISOString()}`;
  const res  = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) { console.error("[mercadolivre] API error", res.status); return []; }
  const json = await res.json() as { results: Record<string, unknown>[] };
  return (json.results ?? []).flatMap((order) => {
    const items = order.order_items as Record<string, unknown>[] ?? [];
    return items.map((item) => ({
      platform:     "mercadolivre",
      order_id:     `${order.id}-${(item.item as Record<string, unknown>)?.id}`,
      product_sku:  (item.item as Record<string, unknown>)?.seller_sku ?? null,
      product_name: (item.item as Record<string, unknown>)?.title ?? null,
      quantity:     Number(item.quantity ?? 1),
      units_real:   Number(item.quantity ?? 1),
      unit_price:   Number(item.unit_price ?? 0),
      total:        Number(item.unit_price ?? 0) * Number(item.quantity ?? 1),
      status:       normalizeMLStatus(String(order.status ?? "")),
      ordered_at:   String(order.date_created ?? new Date().toISOString()),
      sync_source:  "cron",
      raw:          order,
    }));
  });
}

function normalizeMLStatus(s: string): string {
  const map: Record<string, string> = {
    confirmed: "pending", payment_required: "pending",
    partially_paid: "pending", payment_in_process: "pending",
    paid: "shipped", shipped: "shipped", partially_delivered: "shipped",
    delivered: "delivered", cancelled: "cancelled",
  };
  return map[s] ?? "pending";
}

async function pullAmazon(since: Date): Promise<Record<string, unknown>[]> {
  // TODO: implement SP-API OAuth + GET /orders/v0/orders?LastUpdatedAfter={since}&MarketplaceIds={marketplace}
  // Requires: client_id, client_secret, refresh_token, lwa_endpoint, sp_api_endpoint
  const clientId = Deno.env.get("AMAZON_CLIENT_ID");
  if (!clientId) { console.warn("[amazon] Credentials not configured — skipping sync"); return []; }
  console.warn("[amazon] SP-API integration pending — add implementation when credentials are ready");
  return [];
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

// ─── Main ─────────────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  // Can be called by Supabase cron or manually
  if (req.method === "OPTIONS") return new Response("ok");

  // Sync last 2 hours by default (overlaps with previous run for safety)
  const since = new Date(Date.now() - 2 * 60 * 60 * 1000);

  const pullers: Record<Platform, (d: Date) => Promise<Record<string, unknown>[]>> = {
    mercadolivre: pullMercadoLivre,
    amazon:       pullAmazon,
    tiktok:       pullTikTok,
    shopee:       pullShopee,
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

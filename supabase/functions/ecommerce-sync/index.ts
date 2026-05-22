import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

type Platform = "mercadolivre" | "amazon" | "tiktok" | "shopee";

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
  const url = `https://api.mercadolibre.com/orders/search?seller=${sellerId}&sort=date_desc&date_created.from=${since.toISOString()}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) { console.error("[mercadolivre] API error", res.status); return []; }
  const json = await res.json() as { results: Record<string, unknown>[] };

  const rows = (json.results ?? []).flatMap((order) => {
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

  // Update checkpoint so next run starts from now (no gaps, no double-fetching unnecessarily)
  await supabase.from("system_tokens")
    .update({ last_synced_at: new Date().toISOString() })
    .eq("id", "mercadolivre");

  return rows;
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

// ─── AWS Sig V4 helpers ───────────────────────────────────────────────────────

async function sha256Hex(data: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(data));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
}

async function hmac256(key: ArrayBuffer, msg: string): Promise<ArrayBuffer> {
  const k = await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return crypto.subtle.sign("HMAC", k, new TextEncoder().encode(msg));
}

async function sigV4Headers(
  method: string, url: string, lwaToken: string,
  awsKey: string, awsSecret: string,
): Promise<Headers> {
  const u = new URL(url);
  const now = new Date();
  const amzDate  = now.toISOString().replace(/[-:]/g, "").slice(0, 15) + "Z";
  const dateStamp = amzDate.slice(0, 8);
  const region   = "us-east-1";
  const service  = "execute-api";

  const canonHeaders = `host:${u.host}\nx-amz-access-token:${lwaToken}\nx-amz-date:${amzDate}\n`;
  const signedHeaders = "host;x-amz-access-token;x-amz-date";

  const sortedQuery = [...u.searchParams.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");

  const canonReq = [method, u.pathname, sortedQuery, canonHeaders, signedHeaders, await sha256Hex("")].join("\n");
  const credScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, credScope, await sha256Hex(canonReq)].join("\n");

  const enc = (s: string) => new TextEncoder().encode(s).buffer;
  let key: ArrayBuffer = enc(`AWS4${awsSecret}`);
  for (const part of [dateStamp, region, service, "aws4_request"]) key = await hmac256(key, part);

  const sigBuf = await hmac256(key, stringToSign);
  const sig = [...new Uint8Array(sigBuf)].map(b => b.toString(16).padStart(2, "0")).join("");

  const h = new Headers();
  h.set("host", u.host);
  h.set("x-amz-access-token", lwaToken);
  h.set("x-amz-date", amzDate);
  h.set("Authorization", `AWS4-HMAC-SHA256 Credential=${awsKey}/${credScope}, SignedHeaders=${signedHeaders}, Signature=${sig}`);
  return h;
}

// ─── Amazon token helper ──────────────────────────────────────────────────────

async function getAmazonToken(): Promise<{ accessToken: string; marketplaceId: string; lastSyncedAt: Date } | null> {
  const { data } = await supabase
    .from("system_tokens")
    .select("access_token,refresh_token,expires_at,seller_id,last_synced_at")
    .eq("id", "amazon")
    .maybeSingle();

  const refreshToken = Deno.env.get("AMAZON_REFRESH_TOKEN") ?? data?.refresh_token;
  if (!refreshToken) {
    console.warn("[amazon] AMAZON_REFRESH_TOKEN não configurado — pulando sync");
    return null;
  }

  const expiresAt   = data?.expires_at ? new Date(data.expires_at).getTime() : 0;
  const needsRefresh = !data?.access_token || Date.now() >= expiresAt - 5 * 60 * 1000;

  if (needsRefresh) {
    const clientId     = Deno.env.get("AMAZON_CLIENT_ID");
    const clientSecret = Deno.env.get("AMAZON_CLIENT_SECRET");
    if (!clientId || !clientSecret) {
      console.warn("[amazon] Faltam AMAZON_CLIENT_ID / AMAZON_CLIENT_SECRET");
      return null;
    }

    const res = await fetch("https://api.amazon.com/auth/o2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type:    "refresh_token",
        client_id:     clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
      }),
    });

    if (!res.ok) {
      console.error("[amazon] LWA refresh falhou:", res.status, await res.text());
      return null;
    }

    const t = await res.json() as { access_token: string; expires_in: number };
    const marketplaceId = Deno.env.get("AMAZON_MARKETPLACE_ID") ?? data?.seller_id ?? "A2Q3Y263D00KWC";

    await supabase.from("system_tokens").upsert({
      id:            "amazon",
      access_token:  t.access_token,
      refresh_token: refreshToken,
      expires_at:    new Date(Date.now() + t.expires_in * 1000).toISOString(),
      seller_id:     marketplaceId,
      updated_at:    new Date().toISOString(),
    }, { onConflict: "id" });

    return {
      accessToken:  t.access_token,
      marketplaceId,
      lastSyncedAt: data?.last_synced_at ? new Date(data.last_synced_at) : new Date(Date.now() - 48 * 60 * 60 * 1000),
    };
  }

  return {
    accessToken:  data!.access_token,
    marketplaceId: data!.seller_id ?? Deno.env.get("AMAZON_MARKETPLACE_ID") ?? "A2Q3Y263D00KWC",
    lastSyncedAt:  data!.last_synced_at ? new Date(data!.last_synced_at) : new Date(Date.now() - 48 * 60 * 60 * 1000),
  };
}

function normalizeAmazonStatus(s: string): string {
  const map: Record<string, string> = {
    Pending:             "pending",
    PendingAvailability: "pending",
    Unshipped:           "pending",
    PartiallyShipped:    "shipped",
    Shipped:             "shipped",
    InvoiceUnconfirmed:  "shipped",
    Delivered:           "delivered",
    Canceled:            "cancelled",
    Unfulfillable:       "cancelled",
  };
  return map[s] ?? "pending";
}

async function pullAmazon(_since: Date): Promise<Record<string, unknown>[]> {
  const creds = await getAmazonToken();
  if (!creds) return [];

  const awsKey    = Deno.env.get("AMAZON_AWS_ACCESS_KEY");
  const awsSecret = Deno.env.get("AMAZON_AWS_SECRET_KEY");
  if (!awsKey || !awsSecret) {
    console.warn("[amazon] Faltam AMAZON_AWS_ACCESS_KEY / AMAZON_AWS_SECRET_KEY — sync suspenso. Token válido, mas pedidos não serão puxados.");
    return [];
  }

  const { accessToken, marketplaceId, lastSyncedAt } = creds;
  const maxLookback = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const since = lastSyncedAt < maxLookback ? maxLookback : lastSyncedAt;

  const spEndpoint = Deno.env.get("AMAZON_SP_API_ENDPOINT") ?? "https://sellingpartnerapi-na.amazon.com";

  // Pull orders list
  const ordersUrl = new URL(`${spEndpoint}/orders/v0/orders`);
  ordersUrl.searchParams.set("MarketplaceIds",   marketplaceId);
  ordersUrl.searchParams.set("LastUpdatedAfter", since.toISOString());
  ordersUrl.searchParams.set("MaxResultsPerPage", "50");

  const ordersHeaders = await sigV4Headers("GET", ordersUrl.toString(), accessToken, awsKey, awsSecret);
  const ordersRes     = await fetch(ordersUrl.toString(), { headers: ordersHeaders });

  if (!ordersRes.ok) {
    console.error("[amazon] Falha ao buscar pedidos:", ordersRes.status, await ordersRes.text());
    return [];
  }

  const ordersJson = await ordersRes.json() as {
    payload?: {
      Orders?: Array<{
        AmazonOrderId: string;
        PurchaseDate:  string;
        OrderStatus:   string;
        OrderTotal?:   { Amount: string; CurrencyCode: string };
      }>;
    };
  };

  const orders = ordersJson.payload?.Orders ?? [];
  console.log(`[amazon] ${orders.length} pedidos desde ${since.toISOString()}`);

  const rows: Record<string, unknown>[] = [];

  for (const order of orders) {
    // SP-API order items rate limit: 0.5 req/s → wait 2.1s between calls
    await new Promise(r => setTimeout(r, 2100));

    const itemsUrl     = `${spEndpoint}/orders/v0/orders/${order.AmazonOrderId}/orderItems`;
    const itemsHeaders = await sigV4Headers("GET", itemsUrl, accessToken, awsKey, awsSecret);
    const itemsRes     = await fetch(itemsUrl, { headers: itemsHeaders });

    if (!itemsRes.ok) {
      console.error(`[amazon] Falha ao buscar itens de ${order.AmazonOrderId}:`, itemsRes.status);
      continue;
    }

    const itemsJson = await itemsRes.json() as {
      payload?: {
        OrderItems?: Array<{
          ASIN:             string;
          SellerSKU?:       string;
          Title?:           string;
          QuantityOrdered:  number;
          ItemPrice?:       { Amount: string; CurrencyCode: string };
        }>;
      };
    };

    for (const item of itemsJson.payload?.OrderItems ?? []) {
      const qty   = item.QuantityOrdered ?? 1;
      const total = parseFloat(item.ItemPrice?.Amount ?? "0");
      rows.push({
        platform:     "amazon",
        order_id:     `${order.AmazonOrderId}-${item.ASIN}`,
        product_sku:  item.SellerSKU ?? item.ASIN,
        product_name: item.Title ?? null,
        quantity:     qty,
        units_real:   qty,
        unit_price:   qty > 0 ? total / qty : 0,
        total,
        status:       normalizeAmazonStatus(order.OrderStatus),
        ordered_at:   order.PurchaseDate,
        sync_source:  "cron",
        raw:          { order, item },
      });
    }
  }

  // Update sync checkpoint
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

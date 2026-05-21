import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { crypto } from "https://deno.land/std@0.208.0/crypto/mod.ts";
import { encodeHex } from "https://deno.land/std@0.208.0/encoding/hex.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

// ─── Types ───────────────────────────────────────────────────────────────────

type Platform = "mercadolivre" | "amazon" | "tiktok" | "shopee";

interface NormalizedOrder {
  platform: Platform;
  order_id: string;
  product_sku: string | null;
  product_name: string | null;
  quantity: number;
  units_real: number;    // populated as quantity for now; updated when SKU catalog is wired
  unit_price: number;
  total: number;
  status: string;
  ordered_at: string;    // ISO timestamp
  raw: unknown;
}

// ─── Signature validators ─────────────────────────────────────────────────────

async function hmacSHA256(key: string, message: string): Promise<string> {
  const keyBytes = new TextEncoder().encode(key);
  const msgBytes = new TextEncoder().encode(message);
  const cryptoKey = await crypto.subtle.importKey(
    "raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, msgBytes);
  return encodeHex(new Uint8Array(sig));
}

async function validateMercadoLivre(req: Request, body: string): Promise<boolean> {
  const secret = Deno.env.get("ML_WEBHOOK_SECRET");
  if (!secret) return true; // skip validation if secret not configured
  const xSig = req.headers.get("x-signature") ?? "";
  // ML sends: ts=<timestamp>,v1=<hmac>
  const parts = Object.fromEntries(xSig.split(",").map(s => s.split("=")));
  const dataId = new URL(req.url).searchParams.get("data.id") ?? "";
  const expected = await hmacSHA256(secret, `id:${dataId};request-id:${req.headers.get("x-request-id") ?? ""};ts:${parts.ts ?? ""}`);
  return expected === parts.v1;
}

async function validateAmazon(req: Request, body: string): Promise<boolean> {
  // Amazon SP-API uses SNS signature — validate topic ARN as minimum check
  const topicArn = Deno.env.get("AMAZON_SNS_TOPIC_ARN");
  if (!topicArn) return true;
  try {
    const msg = JSON.parse(body);
    return msg.TopicArn === topicArn;
  } catch { return false; }
}

async function validateTikTok(req: Request, body: string): Promise<boolean> {
  const secret = Deno.env.get("TIKTOK_APP_SECRET");
  if (!secret) return true;
  const timestamp = req.headers.get("x-tts-timestamp") ?? "";
  const received  = req.headers.get("x-tts-signature") ?? "";
  const expected  = await hmacSHA256(secret, timestamp + body);
  return expected === received;
}

async function validateShopee(req: Request, body: string): Promise<boolean> {
  const key = Deno.env.get("SHOPEE_PARTNER_KEY");
  if (!key) return true;
  const partnerId = Deno.env.get("SHOPEE_PARTNER_ID") ?? "";
  const path      = new URL(req.url).pathname;
  const timestamp = req.headers.get("x-shopee-timestamp") ?? "";
  const auth      = req.headers.get("Authorization") ?? "";
  const baseStr   = `${partnerId}${path}${timestamp}`;
  const expected  = await hmacSHA256(key, baseStr);
  return auth === expected;
}

// ─── Normalizers ─────────────────────────────────────────────────────────────

function normalizeMercadoLivre(body: unknown, platform: Platform): NormalizedOrder[] {
  // ML webhooks send one notification per event; order details must be fetched via API
  // For now, store the notification and trigger a sync
  const b = body as Record<string, unknown>;
  if (b.topic !== "orders_v2") return []; // only process order events
  return [{
    platform,
    order_id:     String(b.resource ?? b.id ?? ""),
    product_sku:  null,
    product_name: null,
    quantity:     1,
    units_real:   1,
    unit_price:   0,
    total:        0,
    status:       "pending",
    ordered_at:   b.sent ? new Date(b.sent as string).toISOString() : new Date().toISOString(),
    raw:          body,
  }];
  // NOTE: After storing the notification, the cron sync function will fetch full order details
}

function normalizeAmazon(body: unknown, platform: Platform): NormalizedOrder[] {
  // Amazon SP-API SNS notification — contains order IDs to fetch
  const b = body as Record<string, unknown>;
  const payload = b.Message ? JSON.parse(b.Message as string) : b;
  const orderId = payload?.OrderId ?? payload?.AmazonOrderId ?? String(payload?.NotificationData ?? "");
  if (!orderId) return [];
  return [{
    platform,
    order_id:     orderId,
    product_sku:  null,
    product_name: null,
    quantity:     1,
    units_real:   1,
    unit_price:   0,
    total:        0,
    status:       payload?.OrderStatus?.toLowerCase()?.replace("unshipped", "pending") ?? "pending",
    ordered_at:   payload?.PurchaseDate ?? new Date().toISOString(),
    raw:          body,
  }];
}

function normalizeTikTok(body: unknown, platform: Platform): NormalizedOrder[] {
  const b = body as Record<string, unknown>;
  const orders: NormalizedOrder[] = [];
  const data = (b.data as Record<string, unknown>) ?? b;
  const orderId = String(data.order_id ?? b.order_id ?? "");
  if (!orderId) return [];
  const lineItems = (data.line_items as unknown[]) ?? [];
  if (lineItems.length === 0) {
    orders.push({
      platform,
      order_id:     orderId,
      product_sku:  null,
      product_name: null,
      quantity:     1,
      units_real:   1,
      unit_price:   0,
      total:        Number(data.payment_info?.original_total_product_price ?? 0) / 100000,
      status:       String(data.status ?? "pending").toLowerCase(),
      ordered_at:   data.create_time ? new Date(Number(data.create_time) * 1000).toISOString() : new Date().toISOString(),
      raw:          body,
    });
  } else {
    for (const item of lineItems as Record<string, unknown>[]) {
      orders.push({
        platform,
        order_id:     `${orderId}-${item.id ?? item.sku_id}`,
        product_sku:  String(item.seller_sku ?? ""),
        product_name: String(item.product_name ?? ""),
        quantity:     Number(item.quantity ?? 1),
        units_real:   Number(item.quantity ?? 1), // updated by cron when SKU catalog is wired
        unit_price:   Number(item.sale_price ?? 0) / 100000,
        total:        Number(item.sale_price ?? 0) / 100000 * Number(item.quantity ?? 1),
        status:       String(data.status ?? "pending").toLowerCase(),
        ordered_at:   data.create_time ? new Date(Number(data.create_time) * 1000).toISOString() : new Date().toISOString(),
        raw:          item,
      });
    }
  }
  return orders;
}

function normalizeShopee(body: unknown, platform: Platform): NormalizedOrder[] {
  const b = body as Record<string, unknown>;
  if (b.code !== 0) return []; // error notification
  const data = b.data as Record<string, unknown>;
  const orderId = String(data?.ordersn ?? "");
  if (!orderId) return [];
  const items = (data?.item_list as Record<string, unknown>[]) ?? [];
  if (items.length === 0) {
    return [{
      platform,
      order_id:     orderId,
      product_sku:  null,
      product_name: null,
      quantity:     1,
      units_real:   1,
      unit_price:   0,
      total:        Number(data.total_amount ?? 0),
      status:       normalizeShopeeStatus(String(data.status ?? "")),
      ordered_at:   data.create_time ? new Date(Number(data.create_time) * 1000).toISOString() : new Date().toISOString(),
      raw:          body,
    }];
  }
  return items.map((item) => ({
    platform,
    order_id:     `${orderId}-${item.item_id}`,
    product_sku:  String(item.item_sku ?? ""),
    product_name: String(item.item_name ?? ""),
    quantity:     Number(item.model_quantity_purchased ?? 1),
    units_real:   Number(item.model_quantity_purchased ?? 1),
    unit_price:   Number(item.model_discounted_price ?? 0),
    total:        Number(item.model_discounted_price ?? 0) * Number(item.model_quantity_purchased ?? 1),
    status:       normalizeShopeeStatus(String(data.status ?? "")),
    ordered_at:   data.create_time ? new Date(Number(data.create_time) * 1000).toISOString() : new Date().toISOString(),
    raw:          item,
  }));
}

function normalizeShopeeStatus(s: string): string {
  const map: Record<string, string> = {
    UNPAID: "pending", READY_TO_SHIP: "pending", PROCESSED: "shipped",
    SHIPPED: "shipped", COMPLETED: "delivered", CANCELLED: "cancelled", IN_CANCEL: "cancelled",
  };
  return map[s.toUpperCase()] ?? "pending";
}

// ─── Main handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: { "Access-Control-Allow-Origin": "*" } });
  }
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  // Extract platform from URL: /ecommerce-webhook/<platform>
  const url      = new URL(req.url);
  const segments = url.pathname.split("/").filter(Boolean);
  const platform = segments[segments.length - 1] as Platform;

  if (!["mercadolivre", "amazon", "tiktok", "shopee"].includes(platform)) {
    return new Response("Unknown platform", { status: 400 });
  }

  const body = await req.text();

  // Validate signature
  const validators: Record<Platform, (r: Request, b: string) => Promise<boolean>> = {
    mercadolivre: validateMercadoLivre,
    amazon:       validateAmazon,
    tiktok:       validateTikTok,
    shopee:       validateShopee,
  };

  const valid = await validators[platform](req, body);
  if (!valid) {
    console.error(`[${platform}] Invalid signature`);
    return new Response("Unauthorized", { status: 401 });
  }

  let parsed: unknown;
  try { parsed = JSON.parse(body); } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  // Normalize to common schema
  const normalizers: Record<Platform, (b: unknown, p: Platform) => NormalizedOrder[]> = {
    mercadolivre: normalizeMercadoLivre,
    amazon:       normalizeAmazon,
    tiktok:       normalizeTikTok,
    shopee:       normalizeShopee,
  };

  const orders = normalizers[platform](parsed, platform);

  if (orders.length === 0) {
    // Acknowledge but nothing to store (e.g. non-order event)
    return new Response(JSON.stringify({ ok: true, stored: 0 }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  const { error } = await supabase
    .from("ecommerce_orders")
    .upsert(orders, { onConflict: "platform,order_id" });

  if (error) {
    console.error(`[${platform}] DB error:`, error.message);
    return new Response("Internal error", { status: 500 });
  }

  console.log(`[${platform}] Stored ${orders.length} order(s)`);
  return new Response(JSON.stringify({ ok: true, stored: orders.length }), {
    headers: { "Content-Type": "application/json" },
  });
});

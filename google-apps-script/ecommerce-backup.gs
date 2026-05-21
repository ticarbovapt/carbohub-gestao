/**
 * Ecommerce Orders — Google Sheets Backup
 *
 * Deploy como Web App no Google Apps Script:
 *   Extensions → Apps Script → Deploy → New deployment → Web app
 *   Execute as: Me | Who has access: Anyone
 *
 * Cole a URL gerada como segundo webhook nas plataformas (abaixo da URL do Supabase).
 * Esta planilha é 100% independente do Supabase — se o webhook do Supabase cair,
 * este registro continua funcionando.
 *
 * Estrutura esperada na planilha:
 *   Aba "Pedidos": timestamp_recebido | plataforma | order_id | produto | sku |
 *                  quantidade | unidades_reais | valor_unit | total | status | data_pedido
 *   Aba "Erros":   timestamp | plataforma | erro | payload_raw
 */

// ─── Configuração ──────────────────────────────────────────────────────────────

const SHEET_ID = ""; // ← cole aqui o ID da planilha (da URL: /spreadsheets/d/<ID>/edit)
const ORDERS_SHEET = "Pedidos";
const ERRORS_SHEET  = "Erros";

// Secrets para validação de assinatura (opcionais — deixe "" para pular validação)
const ML_WEBHOOK_SECRET   = ""; // Mercado Livre
const TIKTOK_APP_SECRET   = ""; // TikTok Shop
const SHOPEE_PARTNER_KEY  = ""; // Shopee
const SHOPEE_PARTNER_ID   = ""; // Shopee

// ─── Entry point ──────────────────────────────────────────────────────────────

function doPost(e) {
  try {
    const ss       = SpreadsheetApp.openById(SHEET_ID);
    const body     = e.postData?.contents ?? "{}";
    const platform = (e.parameter?.platform ?? "").toLowerCase();

    if (!["mercadolivre", "amazon", "tiktok", "shopee"].includes(platform)) {
      logError(ss, platform || "desconhecido", "Platform inválida na query string (?platform=<id>)", body);
      return jsonOk({ ok: false, error: "invalid platform" });
    }

    const parsed = JSON.parse(body);
    const rows   = normalize(platform, parsed, e);

    if (rows.length === 0) {
      // Evento que não é pedido (ex: notificação de item, questão etc) — ignora
      return jsonOk({ ok: true, stored: 0 });
    }

    const sheet = getOrCreateSheet(ss, ORDERS_SHEET, ORDERS_HEADER);
    rows.forEach(row => sheet.appendRow(row));

    return jsonOk({ ok: true, stored: rows.length });

  } catch (err) {
    try {
      const ss = SpreadsheetApp.openById(SHEET_ID);
      logError(ss, "desconhecido", String(err), e.postData?.contents ?? "");
    } catch (_) {}
    return jsonOk({ ok: false, error: String(err) });
  }
}

// Health check via GET
function doGet() {
  return ContentService.createTextOutput(
    JSON.stringify({ ok: true, service: "ecommerce-backup", ts: new Date().toISOString() })
  ).setMimeType(ContentService.MimeType.JSON);
}

// ─── Normalizadores por plataforma ────────────────────────────────────────────

function normalize(platform, payload, e) {
  switch (platform) {
    case "mercadolivre": return normalizeMercadoLivre(payload);
    case "amazon":       return normalizeAmazon(payload);
    case "tiktok":       return normalizeTikTok(payload);
    case "shopee":       return normalizeShopee(payload);
    default:             return [];
  }
}

function row(platform, orderId, product, sku, qty, unitsReal, unitPrice, total, status, orderedAt) {
  return [
    new Date().toISOString(), // timestamp_recebido
    platform,
    orderId,
    product  ?? "",
    sku      ?? "",
    qty      ?? 1,
    unitsReal ?? qty ?? 1,
    unitPrice ?? 0,
    total     ?? 0,
    status    ?? "pending",
    orderedAt ?? new Date().toISOString(),
  ];
}

// Mercado Livre — webhook de notificação (topic: orders_v2)
function normalizeMercadoLivre(payload) {
  if (payload.topic !== "orders_v2") return [];
  // ML envia apenas a notificação; o ID do pedido vem em payload.resource ou payload.id
  return [row(
    "mercadolivre",
    String(payload.resource ?? payload.id ?? ""),
    null, null, 1, 1, 0, 0,
    "notificado",
    payload.sent ? new Date(payload.sent).toISOString() : new Date().toISOString()
  )];
}

// Amazon SP-API — SNS notification
function normalizeAmazon(payload) {
  const msg = payload.Message ? JSON.parse(payload.Message) : payload;
  const orderId = msg?.OrderId ?? msg?.AmazonOrderId ?? String(msg?.NotificationData ?? "");
  if (!orderId) return [];
  return [row(
    "amazon",
    orderId,
    null, null, 1, 1, 0, 0,
    String(msg?.OrderStatus ?? "pending").toLowerCase(),
    msg?.PurchaseDate ?? new Date().toISOString()
  )];
}

// TikTok Shop — order webhook (com line_items quando disponível)
function normalizeTikTok(payload) {
  const data    = payload.data ?? payload;
  const orderId = String(data.order_id ?? payload.order_id ?? "");
  if (!orderId) return [];

  const items = data.line_items ?? [];
  if (!items.length) {
    return [row(
      "tiktok", orderId, null, null, 1, 1, 0,
      Number(data.payment_info?.original_total_product_price ?? 0) / 100000,
      String(data.status ?? "pending").toLowerCase(),
      data.create_time ? new Date(Number(data.create_time) * 1000).toISOString() : new Date().toISOString()
    )];
  }

  return items.map(item => row(
    "tiktok",
    `${orderId}-${item.id ?? item.sku_id}`,
    item.product_name ?? null,
    item.seller_sku   ?? null,
    Number(item.quantity ?? 1),
    Number(item.quantity ?? 1),
    Number(item.sale_price ?? 0) / 100000,
    Number(item.sale_price ?? 0) / 100000 * Number(item.quantity ?? 1),
    String(data.status ?? "pending").toLowerCase(),
    data.create_time ? new Date(Number(data.create_time) * 1000).toISOString() : new Date().toISOString()
  ));
}

// Shopee — push notification
function normalizeShopee(payload) {
  if (payload.code !== 0) return [];
  const data    = payload.data ?? {};
  const orderId = String(data.ordersn ?? "");
  if (!orderId) return [];

  const items = data.item_list ?? [];
  if (!items.length) {
    return [row(
      "shopee", orderId, null, null, 1, 1, 0,
      Number(data.total_amount ?? 0),
      normalizeShopeeStatus(String(data.status ?? "")),
      data.create_time ? new Date(Number(data.create_time) * 1000).toISOString() : new Date().toISOString()
    )];
  }

  return items.map(item => row(
    "shopee",
    `${orderId}-${item.item_id}`,
    item.item_name ?? null,
    item.item_sku  ?? null,
    Number(item.model_quantity_purchased ?? 1),
    Number(item.model_quantity_purchased ?? 1),
    Number(item.model_discounted_price ?? 0),
    Number(item.model_discounted_price ?? 0) * Number(item.model_quantity_purchased ?? 1),
    normalizeShopeeStatus(String(data.status ?? "")),
    data.create_time ? new Date(Number(data.create_time) * 1000).toISOString() : new Date().toISOString()
  ));
}

function normalizeShopeeStatus(s) {
  const map = {
    UNPAID: "pending", READY_TO_SHIP: "pending", PROCESSED: "shipped",
    SHIPPED: "shipped", COMPLETED: "delivered", CANCELLED: "cancelled", IN_CANCEL: "cancelled",
  };
  return map[s.toUpperCase()] ?? "pending";
}

// ─── Utilitários ──────────────────────────────────────────────────────────────

const ORDERS_HEADER = [
  "Recebido em", "Plataforma", "Order ID", "Produto", "SKU",
  "Quantidade", "Unidades Reais", "Valor Unit.", "Total", "Status", "Data Pedido",
];

function getOrCreateSheet(ss, name, header) {
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    sheet.appendRow(header);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, header.length).setFontWeight("bold");
  }
  return sheet;
}

function logError(ss, platform, erro, rawPayload) {
  const sheet = getOrCreateSheet(ss, ERRORS_SHEET, ["Recebido em", "Plataforma", "Erro", "Payload"]);
  sheet.appendRow([new Date().toISOString(), platform, erro, rawPayload.slice(0, 50000)]);
}

function jsonOk(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

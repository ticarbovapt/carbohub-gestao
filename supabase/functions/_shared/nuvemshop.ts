/**
 * Helpers compartilhados da Nuvemshop (Tiendanube) — usados pelo webhook e pelo sync.
 *
 * Mantém UMA fonte de verdade para:
 *  - autenticação (token não expira; guardado em system_tokens id='nuvemshop')
 *  - busca de pedidos na API
 *  - normalização para o formato de ecommerce_orders
 *
 * CRÍTICO: o order_id é montado SEMPRE como `${pedido}-${linha}`. Webhook e sync
 * usam exatamente esta função, então o upsert (platform, order_id) é idempotente
 * — a mesma venda nunca entra duas vezes nem deduz estoque em dobro.
 */

// deno-lint-ignore-file no-explicit-any

export const NUVEMSHOP_API = "https://api.tiendanube.com/v1";
// User-Agent é obrigatório pela Nuvemshop (nome do app + contato).
export const NUVEMSHOP_UA = "CarboHub Integracao (ti@grupocarbo.com.br)";

export interface NuvemshopRow {
  platform: "nuvemshop";
  order_id: string;
  product_sku: string | null;
  product_name: string | null;
  quantity: number;
  units_real: number;
  unit_price: number;
  total: number;
  status: string;
  ordered_at: string;
  sync_source?: string;
  raw: unknown;
}

export interface NuvemshopCreds {
  accessToken: string;
  storeId: string;
  lastSyncedAt: Date;
}

/** Lê o token salvo. Retorna null se a loja ainda não foi conectada. */
export async function getNuvemshopCreds(supabase: any): Promise<NuvemshopCreds | null> {
  const { data, error } = await supabase
    .from("system_tokens")
    .select("access_token, seller_id, last_synced_at")
    .eq("id", "nuvemshop")
    .maybeSingle();

  if (error || !data?.access_token || !data?.seller_id) {
    console.warn("[nuvemshop] Token/loja não encontrados em system_tokens");
    return null;
  }
  return {
    accessToken:  data.access_token,
    storeId:      String(data.seller_id),
    lastSyncedAt: data.last_synced_at
      ? new Date(data.last_synced_at)
      : new Date(Date.now() - 48 * 60 * 60 * 1000),
  };
}

/** Headers padrão. Manda os dois nomes de header de auth por compatibilidade. */
function authHeaders(accessToken: string): HeadersInit {
  return {
    "Authentication": `bearer ${accessToken}`,
    "Authorization":  `bearer ${accessToken}`,
    "User-Agent":     NUVEMSHOP_UA,
    "Content-Type":   "application/json",
  };
}

/**
 * Mapeia o status do pedido da Nuvemshop para o nosso.
 * Considera PAGAMENTO (não só envio), porque o estoque só baixa quando pago.
 *  - cancelado/estornado            → 'cancelled' (não consome / estorna)
 *  - pago (mesmo sem enviar)        → 'shipped'   (consome estoque)
 *  - enviado / entregue             → 'shipped' / 'delivered'
 *  - aguardando pagamento           → 'pending'   (não consome)
 */
export function mapNuvemshopStatus(order: any): string {
  const status   = String(order?.status ?? "").toLowerCase();          // open | closed | cancelled
  const payment  = String(order?.payment_status ?? "").toLowerCase();  // pending | authorized | paid | voided | refunded | abandoned
  const shipping = String(order?.shipping_status ?? "").toLowerCase(); // unpacked | unfulfilled | fulfilled | shipped | delivered

  // Cancelado ou pagamento estornado/anulado → não consome estoque (e estorna se já tinha consumido)
  if (status === "cancelled" || status === "canceled") return "cancelled";
  if (payment === "voided" || payment === "refunded") return "cancelled";

  if (shipping === "delivered") return "delivered";

  // Pago (ainda que não enviado) OU já em transporte → estado que consome estoque
  if (payment === "paid" || shipping === "shipped" || shipping === "fulfilled") return "shipped";

  // Aguardando pagamento
  return "pending";
}

/**
 * Converte um pedido completo da Nuvemshop em N linhas (uma por produto).
 * order_id = `${pedido}-${linha}` → estável entre webhook e sync.
 */
export function mapNuvemshopOrder(order: any, syncSource = "webhook"): NuvemshopRow[] {
  const orderId = String(order?.id ?? "");
  if (!orderId) return [];

  const status    = mapNuvemshopStatus(order);
  const orderedAt = order?.created_at
    ? new Date(order.created_at).toISOString()
    : new Date().toISOString();

  const products: any[] = Array.isArray(order?.products) ? order.products : [];

  // Pedido sem linhas detalhadas — registra ao nível do pedido (sem dedução de estoque).
  if (products.length === 0) {
    return [{
      platform:     "nuvemshop",
      order_id:     orderId,
      product_sku:  null,
      product_name: null,
      quantity:     1,
      units_real:   1,
      unit_price:   Number(order?.total ?? 0),
      total:        Number(order?.total ?? 0),
      status,
      ordered_at:   orderedAt,
      sync_source:  syncSource,
      raw:          order,
    }];
  }

  return products.map((p) => {
    const qty   = Number(p?.quantity ?? 1);
    const price = Number(p?.price ?? 0);
    const lineId = p?.id ?? p?.variant_id ?? p?.product_id ?? "x";
    return {
      platform:     "nuvemshop" as const,
      order_id:     `${orderId}-${lineId}`,
      product_sku:  p?.sku ? String(p.sku) : null,
      product_name: p?.name ? String(p.name) : null,
      quantity:     qty,
      units_real:   qty, // o multiplicador (kit) é aplicado pelo trigger via sku_product_mappings
      unit_price:   price,
      total:        price * qty,
      status,
      ordered_at:   orderedAt,
      sync_source:  syncSource,
      raw:          p,
    };
  });
}

/**
 * Preenche units_real = quantity × units_per_kit consultando o mapeamento de SKU.
 * Assim o dashboard mostra as unidades físicas reais (ex.: kit 100ml = 5).
 * Sem mapeamento, mantém units_real = quantity (fallback 1×).
 */
export async function enrichUnitsReal(supabase: any, rows: NuvemshopRow[]): Promise<NuvemshopRow[]> {
  const skus = [...new Set(rows.map((r) => r.product_sku).filter(Boolean))] as string[];
  if (skus.length === 0) return rows;

  const { data: maps } = await supabase
    .from("sku_product_mappings")
    .select("platform, platform_sku, units_per_kit")
    .in("platform_sku", skus)
    .eq("is_active", true);

  const list = (maps || []) as any[];
  const mult = (platform: string, sku: string): number => {
    const specific = list.find((m) => m.platform_sku === sku && m.platform === platform);
    if (specific) return Number(specific.units_per_kit) || 1;
    const generic = list.find((m) => m.platform_sku === sku && m.platform == null);
    return generic ? (Number(generic.units_per_kit) || 1) : 1;
  };

  return rows.map((r) =>
    r.product_sku ? { ...r, units_real: r.quantity * mult(r.platform, r.product_sku) } : r
  );
}

/** Busca UM pedido pelo id (usado pelo webhook, que recebe só o id). */
export async function fetchNuvemshopOrder(
  accessToken: string, storeId: string, orderId: string | number,
): Promise<any | null> {
  const res = await fetch(`${NUVEMSHOP_API}/${storeId}/orders/${orderId}`, {
    headers: authHeaders(accessToken),
  });
  if (!res.ok) {
    console.error(`[nuvemshop] Falha ao buscar pedido ${orderId}: ${res.status}`);
    return null;
  }
  return res.json();
}

/** Lista pedidos criados a partir de `since` (usado pelo sync; paginado). */
export async function fetchNuvemshopOrdersSince(
  accessToken: string, storeId: string, since: Date,
): Promise<any[]> {
  const out: any[] = [];
  let page = 1;
  const MAX_PAGES = 10; // teto de segurança (até 500 pedidos por sync)

  while (page <= MAX_PAGES) {
    const params = new URLSearchParams({
      created_at_min: since.toISOString(),
      per_page:       "50",
      page:           String(page),
    });
    const res = await fetch(`${NUVEMSHOP_API}/${storeId}/orders?${params}`, {
      headers: authHeaders(accessToken),
    });
    if (!res.ok) {
      console.error(`[nuvemshop] Falha ao listar pedidos (página ${page}): ${res.status}`);
      break;
    }
    const batch = await res.json();
    if (!Array.isArray(batch) || batch.length === 0) break;
    out.push(...batch);
    if (batch.length < 50) break; // última página
    page++;
  }
  return out;
}

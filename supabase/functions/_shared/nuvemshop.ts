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
  /** Número do pedido como a LOJA mostra (#276). Não é o id interno. */
  platform_order_number: string | null;
  product_sku: string | null;
  product_name: string | null;
  quantity: number;
  units_real: number;
  unit_price: number;
  total: number;
  status: string;
  ordered_at: string;
  sync_source?: string;
  /** Nome do comprador. Ver `dadosDoCliente` — é a única cópia deste dado. */
  cliente_nome: string | null;
  /** Telefone CRU. Quem normaliza é o `kanban-n8n`, e só ele. */
  cliente_fone: string | null;
  cliente_email: string | null;
  raw: unknown;
}

/**
 * Contato do comprador, tirado do pedido.
 *
 * ⚠️ Existe porque as linhas de produto guardam `raw: p` — só o item. O pedido
 * inteiro (com o contato) é buscado na API, usado e DESCARTADO na gravação.
 * Enquanto isso valeu, `ecommerce_orders` não tinha um telefone sequer, e a
 * ideia de avisar o cliente no momento do pagamento parecia impossível quando
 * na verdade o dado chegava e era jogado fora.
 *
 * A Nuvemshop espalha o contato por quatro lugares conforme o checkout usado
 * (convidado, cadastrado, com endereço de cobrança separado). Aceitar os quatro
 * custa nada e evita pedido sem telefone por causa da forma de comprar.
 */
function dadosDoCliente(order: any): {
  cliente_nome: string | null; cliente_fone: string | null; cliente_email: string | null;
} {
  const limpo = (v: unknown): string | null => {
    const s = v == null ? "" : String(v).trim();
    return s === "" ? null : s;
  };
  return {
    cliente_nome:
      limpo(order?.contact_name) ?? limpo(order?.customer?.name) ??
      limpo(order?.billing_name) ?? null,
    cliente_fone:
      limpo(order?.contact_phone) ?? limpo(order?.customer?.phone) ??
      limpo(order?.billing_phone) ?? limpo(order?.shipping_address?.phone) ?? null,
    cliente_email:
      limpo(order?.contact_email) ?? limpo(order?.customer?.email) ?? null,
  };
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
 *  - cancelado/estornado            → 'cancelled' (não consome / estorna)
 *  - enviado de fato                → 'shipped'   (Em Transporte; consome)
 *  - entregue                       → 'delivered' (consome)
 *  - pago, ainda "por embalar"      → 'paid'      (consome / reserva; card "A enviar")
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

  // Realmente despachado pelo lojista → "Em Transporte".
  if (shipping === "shipped" || shipping === "fulfilled") return "shipped";

  // Venda confirmada (paga) mas ainda "por embalar": status próprio 'paid'.
  // Já CONSOME estoque (reserva anti-overselling, igual Amazon), mas NÃO conta
  // como "Em Transporte" — aparece no card "A enviar".
  if (payment === "paid") return "paid";

  // Aguardando pagamento → não consome estoque.
  return "pending";
}

/**
 * Converte um pedido completo da Nuvemshop em N linhas (uma por produto).
 * order_id = `${pedido}-${linha}` → estável entre webhook e sync.
 */
export function mapNuvemshopOrder(order: any, syncSource = "webhook"): NuvemshopRow[] {
  const orderId = String(order?.id ?? "");
  if (!orderId) return [];

  // ⚠️ O NÚMERO da loja é outro campo, e é ele que o Bling guarda em
  // `numero_loja` — é o #276 do painel da Nuvemshop. O `id` acima é interno e
  // não aparece em lugar nenhum que o time veja.
  //
  // Sem ele não há como ligar o pedido da plataforma ao pedido do Bling, e a
  // esteira do online não consegue mover o card para "em trânsito"/"entregue",
  // que é justamente o que a plataforma sabe e o Bling não.
  const orderNumber = order?.number != null ? String(order.number) : null;

  const status    = mapNuvemshopStatus(order);
  const orderedAt = order?.created_at
    ? new Date(order.created_at).toISOString()
    : new Date().toISOString();

  const products: any[] = Array.isArray(order?.products) ? order.products : [];

  // Lido UMA vez, do pedido, e copiado para todas as linhas. É o único ponto
  // onde este dado existe antes de virar coluna.
  const cliente = dadosDoCliente(order);

  // Pedido sem linhas detalhadas — registra ao nível do pedido (sem dedução de estoque).
  if (products.length === 0) {
    return [{
      platform:     "nuvemshop",
      order_id:     orderId,
      platform_order_number: orderNumber,
      product_sku:  null,
      product_name: null,
      quantity:     1,
      units_real:   1,
      unit_price:   Number(order?.total ?? 0),
      total:        Number(order?.total ?? 0),
      status,
      ordered_at:   orderedAt,
      sync_source:  syncSource,
      ...cliente,
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
      // ⚠️ Aqui `raw` guarda só a LINHA do produto, não o pedido — então este
      // campo é a ÚNICA cópia do número do pedido nesta linha. Some daqui e
      // não há de onde recuperar sem re-sincronizar.
      platform_order_number: orderNumber,
      product_sku:  p?.sku ? String(p.sku) : null,
      product_name: p?.name ? String(p.name) : null,
      quantity:     qty,
      units_real:   qty, // o multiplicador (kit) é aplicado pelo trigger via sku_product_mappings
      unit_price:   price,
      total:        price * qty,
      status,
      ordered_at:   orderedAt,
      sync_source:  syncSource,
      ...cliente,
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

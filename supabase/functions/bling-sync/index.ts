// bling-sync v3 — Phase 2: stock + vendedores
import { createClient } from "npm:@supabase/supabase-js@2.39.3";

const ALLOWED_ORIGINS = [
  "https://controle.carbohub.com.br",  // app principal de gestão
  "https://carbohub.com.br",
  "https://www.carbohub.com.br",
  "https://admin.carbohub.com.br",
  "https://sales.carbohub.com.br",
  "https://ops.carbohub.com.br",
  "https://financas.carbohub.com.br",  // Carbo Finanças (subdomínio)
  "https://carbohub-fin.vercel.app",   // Carbo Finanças (deploy Vercel)
  "http://localhost:8080",
  "http://localhost:8082",
  "http://localhost:5173",
  "http://localhost:3000",
];

// Aceita a lista fixa OU qualquer subdomínio carbohub.com.br / *.vercel.app
// (cobre previews da Vercel e novos apps sem precisar redeploy a cada domínio).
function isAllowedOrigin(origin: string): boolean {
  if (ALLOWED_ORIGINS.includes(origin)) return true;
  try {
    const { protocol, hostname } = new URL(origin);
    if (protocol !== "https:") return false;
    return hostname.endsWith(".carbohub.com.br") || hostname.endsWith(".vercel.app");
  } catch {
    return false;
  }
}

function getCorsHeaders(req: Request) {
  const origin = req.headers.get("origin") || "";
  const allowedOrigin = isAllowedOrigin(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type, x-region",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}

const BLING_API_BASE = "https://api.bling.com.br/Api/v3";
const BLING_TOKEN_URL = "https://www.bling.com.br/Api/v3/oauth/token";

interface BlingIntegration {
  id: string;
  access_token: string;
  refresh_token: string;
  expires_at: string;
}

// Refresh buffer: refresh proactively if token expires within 5 minutes
const REFRESH_BUFFER_MS = 5 * 60 * 1000;

async function refreshBlingToken(
  supabaseAdmin: ReturnType<typeof createClient>,
  integration: any,
  blingClientId: string,
  blingClientSecret: string
): Promise<{ token: string; error?: string }> {
  console.log("[bling-sync] Refreshing token for integration:", integration.id);
  const basicAuth = btoa(`${blingClientId}:${blingClientSecret}`);
  const refreshResponse = await fetch(BLING_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Authorization": `Basic ${basicAuth}`,
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: integration.refresh_token,
    }),
  });

  const refreshData = await refreshResponse.json();

  if (!refreshResponse.ok || refreshData.error) {
    console.error("[bling-sync] Token refresh FAILED:", JSON.stringify(refreshData));
    // Deactivate integration
    await supabaseAdmin
      .from("bling_integration")
      .update({ is_active: false })
      .eq("id", integration.id);
    return { token: "", error: `Token refresh failed: ${refreshData.error_description || refreshData.error || "unknown"}. Please reconnect to Bling.` };
  }

  const expiresAt = new Date(Date.now() + (refreshData.expires_in || 21600) * 1000);

  await supabaseAdmin
    .from("bling_integration")
    .update({
      access_token: refreshData.access_token,
      refresh_token: refreshData.refresh_token,
      expires_at: expiresAt.toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", integration.id);

  console.log("[bling-sync] Token refreshed successfully, new expiry:", expiresAt.toISOString());
  return { token: refreshData.access_token };
}

async function getValidToken(
  supabaseAdmin: ReturnType<typeof createClient>,
  blingClientId: string,
  blingClientSecret: string,
  forceRefresh = false
): Promise<{ token: string; error?: string }> {
  const { data: integration, error } = await supabaseAdmin
    .from("bling_integration")
    .select("*")
    .eq("is_active", true)
    .single();

  if (error || !integration) {
    return { token: "", error: "No active Bling integration. Please connect first." };
  }

  const expiresAt = new Date(integration.expires_at);
  const now = new Date();
  const isExpired = expiresAt < now;
  const isExpiringSoon = expiresAt.getTime() - now.getTime() < REFRESH_BUFFER_MS;

  // Refresh if: forced, expired, or expiring within 5 minutes
  if (forceRefresh || isExpired || isExpiringSoon) {
    const reason = forceRefresh ? "forced (401 retry)" : isExpired ? "expired" : "expiring soon";
    console.log(`[bling-sync] Token needs refresh: ${reason}. Expires at: ${integration.expires_at}`);
    return refreshBlingToken(supabaseAdmin, integration, blingClientId, blingClientSecret);
  }

  console.log("[bling-sync] Using existing token, expires at:", integration.expires_at);
  return { token: integration.access_token };
}

// ── blingPost: faz POST na API do Bling com retry em 429 ────────────────────
async function blingPost(token: string, endpoint: string, body: unknown, _retries = 0): Promise<any> {
  const MAX_RETRIES = 3;
  const url = `${BLING_API_BASE}${endpoint}`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (response.status === 429) {
    if (_retries >= MAX_RETRIES) throw new Error("Bling API rate limit exceeded");
    const wait = Math.pow(2, _retries) * 1000;
    await new Promise(r => setTimeout(r, wait));
    return blingPost(token, endpoint, body, _retries + 1);
  }

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Bling API error ${response.status}: ${errText}`);
  }

  return response.json();
}

// ── createBlingPedido: cria um pedido de venda no Bling a partir de um carboze_order
// O financeiro converte o pedido em NF no Bling. A NF será vinculada automaticamente
// quando o sync detectar o número do pedido (PED-XXXX) na observação.
//
// dryRun=true: monta o payload e resolve contato/produtos, mas NÃO faz o POST.
//   Retorna { dry_run, payload, warnings, contact_found, items_summary } para
//   pré-visualização no front, sem nenhum efeito colateral.
async function createBlingPedido(
  supabaseAdmin: ReturnType<typeof createClient>,
  token: string,
  orderId: string,
  dryRun = false
): Promise<any> {
  const warnings: string[] = [];

  // 1. Busca o pedido
  const { data: order, error: orderErr } = await supabaseAdmin
    .from("carboze_orders")
    .select("*")
    .eq("id", orderId)
    .single();

  if (orderErr || !order) throw new Error("Pedido não encontrado: " + orderId);

  // 2. Encontrar contato no Bling
  // Prioridade A: pedido veio do Bling — busca contato_id no bling_orders
  let blingContactId: number | null = null;
  let contactSource = "";

  if (order.external_ref?.startsWith("bling-")) {
    const blingOrderId = order.external_ref.replace("bling-", "");
    const { data: blingOrder } = await supabaseAdmin
      .from("bling_orders")
      .select("contato_id")
      .eq("bling_id", Number(blingOrderId))
      .maybeSingle();
    blingContactId = blingOrder?.contato_id || null;
    if (blingContactId) contactSource = "pedido original do Bling";
  }

  // Prioridade B: busca por nome no bling_contacts
  if (!blingContactId) {
    const { data: contacts } = await supabaseAdmin
      .from("bling_contacts")
      .select("bling_id, nome")
      .ilike("nome", `%${order.customer_name}%`)
      .limit(1);
    blingContactId = contacts?.[0]?.bling_id || null;
    if (blingContactId) contactSource = `nome "${contacts?.[0]?.nome}"`;
  }

  if (!blingContactId) {
    const msg =
      `Cliente "${order.customer_name}" não encontrado no Bling. ` +
      `Cadastre o cliente no Bling ou rode "Sincronizar Contatos" antes de tentar novamente.`;
    // Em dry-run não interrompe: registra o aviso para o usuário ver na tela.
    if (!dryRun) throw new Error(msg);
    warnings.push(msg);
  }

  // 3. Montar itens — tenta encontrar o produto no Bling pelo código
  const rawItems: any[] = Array.isArray(order.items) ? order.items : [];
  const blingItems = [];
  const itemsSummary: Array<{ name: string; matched: boolean; codigo: string }> = [];

  for (const item of rawItems) {
    const codigo: string = item.product_code || item.sku_code || "";
    let blingProductId: number | null = null;

    if (codigo) {
      const { data: prod } = await supabaseAdmin
        .from("bling_products")
        .select("bling_id")
        .eq("codigo", codigo)
        .maybeSingle();
      blingProductId = prod?.bling_id || null;
    }

    if (!blingProductId) {
      warnings.push(`Produto "${item.name || codigo}" não casou com o catálogo do Bling — será enviado como descrição livre.`);
    }

    itemsSummary.push({ name: item.name || codigo || "Produto", matched: !!blingProductId, codigo });

    blingItems.push({
      ...(blingProductId
        ? { produto: { id: blingProductId } }
        : { descricao: item.name || "Produto" }
      ),
      quantidade: Number(item.quantity) || 1,
      valor: Number(item.unit_price) || 0,
    });

    // V3: bonus units go as a separate line at R$0 so they appear on the NF
    const bonusQty = Number(item.bonus_quantity) || 0;
    if (bonusQty > 0) {
      blingItems.push({
        ...(blingProductId
          ? { produto: { id: blingProductId } }
          : { descricao: `${item.name || "Produto"} (bonificação)` }
        ),
        quantidade: bonusQty,
        valor: 0,
      });
    }
  }

  if (blingItems.length === 0) {
    const msg = "O pedido não possui itens para enviar ao Bling.";
    if (!dryRun) throw new Error(msg);
    warnings.push(msg);
  }

  // 4. Montar payload do pedido de venda
  const pedidoPayload: Record<string, any> = {
    contato: { id: blingContactId },
    itens: blingItems,
    data: order.sale_date || order.created_at.substring(0, 10),
    // Número do pedido (PED-XXXX / V…) na observação = chave do vínculo automático com a NF.
    // NÃO confundir com numeroPedidoCompra abaixo (que é o PO do cliente).
    // Vendedor vai junto: (a) cruzamento observação-da-NF ↔ pedido+vendedor e
    // (b) fallback de rastreio caso o banco se perca (fica gravado na própria NF).
    observacoes: [
      order.order_number,
      order.vendedor_name ? `Vendedor: ${order.vendedor_name}` : "",
      order.buyer_notes || "",
      order.general_notes || "",
    ].filter(Boolean).join(" — "),
  };

  // Nº do Pedido de Compra do CLIENTE (PO) — campo nativo do Bling, opcional.
  // É o número que o cliente gerou no sistema dele; independente do nosso order_number.
  if (order.po_number) {
    pedidoPayload.numeroPedidoCompra = String(order.po_number);
  }

  // Transporte: frete + endereço de entrega (etiqueta).
  // ATENÇÃO: endereço deve ser conferido no Bling — vem como texto livre do nosso sistema.
  const hasDelivery = order.delivery_address || order.delivery_city || order.delivery_zip;
  if (order.freight_type || hasDelivery) {
    pedidoPayload.transporte = {
      ...(order.freight_type ? { fretePorConta: order.freight_type === "CIF" ? 0 : 1 } : {}),
      ...(order.shipping_cost ? { frete: Number(order.shipping_cost) } : {}),
      ...(hasDelivery
        ? {
            etiqueta: {
              nome: order.customer_name || "",
              endereco: order.delivery_address || "",
              bairro: order.delivery_neighborhood || "",
              municipio: order.delivery_city || "",
              uf: order.delivery_state || "",
              cep: order.delivery_zip ? String(order.delivery_zip).replace(/\D/g, "") : "",
            },
          }
        : {}),
    };
    if (hasDelivery) warnings.push("Endereço de entrega vai como texto livre — confira/corrija no Bling após criar.");
  }

  if (order.discount) {
    pedidoPayload.desconto = { tipo: 1, valor: Number(order.discount) };
  }

  // ── DRY-RUN: devolve a pré-visualização sem enviar nada ──────────────────
  if (dryRun) {
    return {
      dry_run: true,
      order_number: order.order_number,
      customer_name: order.customer_name,
      contact_found: !!blingContactId,
      contact_id: blingContactId,
      contact_source: contactSource,
      items_summary: itemsSummary,
      warnings,
      payload: pedidoPayload,
    };
  }

  // 5. POST /pedidos/vendas no Bling
  console.log(`[bling-sync] Creating Bling pedido for order ${order.order_number} (contact ${blingContactId})`);
  const result = await blingPost(token, "/pedidos/vendas", pedidoPayload);

  // 6. Atualiza external_ref apenas se ainda não veio do Bling
  if (result?.data?.id && !order.external_ref?.startsWith("bling-")) {
    await supabaseAdmin.from("carboze_orders").update({
      external_ref: `bling-${result.data.id}`,
      updated_at: new Date().toISOString(),
    }).eq("id", orderId);
  }

  return result;
}

async function blingFetch(token: string, endpoint: string, page = 1, limit = 100, _retries = 0): Promise<any> {
  const MAX_RETRIES = 5;
  const separator = endpoint.includes("?") ? "&" : "?";
  const url = `${BLING_API_BASE}${endpoint}${separator}pagina=${page}&limite=${limit}`;

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (response.status === 429) {
    if (_retries >= MAX_RETRIES) {
      throw new Error(`Bling API rate limit exceeded after ${MAX_RETRIES} retries for ${endpoint}`);
    }
    const waitMs = Math.min(1000 * Math.pow(2, _retries), 10000);
    console.log(`[bling-sync] Rate limited (429), retry ${_retries + 1}/${MAX_RETRIES} after ${waitMs}ms`);
    await new Promise((resolve) => setTimeout(resolve, waitMs));
    return blingFetch(token, endpoint, page, limit, _retries + 1);
  }

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(`Bling API error ${response.status}: ${JSON.stringify(errorData)}`);
  }

  return response.json();
}

async function syncProducts(
  supabaseAdmin: ReturnType<typeof createClient>,
  token: string,
  logId: string
): Promise<{ synced: number; failed: number }> {
  let page = 1;
  let totalSynced = 0;
  let totalFailed = 0;
  let hasMore = true;

  while (hasMore) {
    const data = await blingFetch(token, "/produtos", page, 100);
    const products = data.data || [];

    if (products.length === 0) {
      hasMore = false;
      break;
    }

    for (const product of products) {
      try {
        await supabaseAdmin.from("bling_products").upsert(
          {
            bling_id: product.id,
            nome: product.nome || "",
            codigo: product.codigo || null,
            preco: product.preco || 0,
            tipo: product.tipo || null,
            situacao: product.situacao || null,
            formato: product.formato || null,
            unidade: product.unidade || null,
            peso_liquido: product.pesoLiquido || null,
            peso_bruto: product.pesoBruto || null,
            gtin: product.gtin || null,
            gtin_embalagem: product.gtinEmbalagem || null,
            raw_data: product,
            synced_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
          { onConflict: "bling_id" }
        );
        totalSynced++;
      } catch (e) {
        console.error("Failed to upsert product:", e);
        totalFailed++;
      }
    }

    // Rate limiting: max 3 req/s
    await new Promise((resolve) => setTimeout(resolve, 350));
    page++;

    if (products.length < 100) hasMore = false;
  }

  // Update log
  await supabaseAdmin
    .from("bling_sync_log")
    .update({ records_synced: totalSynced, records_failed: totalFailed })
    .eq("id", logId);

  return { synced: totalSynced, failed: totalFailed };
}

async function syncVariacoes(
  supabaseAdmin: ReturnType<typeof createClient>,
  token: string,
  logId: string
): Promise<{ synced: number; failed: number }> {
  // Buscar apenas produtos com formato "V" (com variações) na tabela bling_products
  const { data: varProducts, error: varErr } = await supabaseAdmin
    .from("bling_products")
    .select("bling_id, nome")
    .eq("formato", "V");

  if (varErr || !varProducts?.length) {
    console.log("[bling-sync:variacoes] No variable products found or error:", varErr?.message);
    await supabaseAdmin.from("bling_sync_log")
      .update({ records_synced: 0, records_failed: 0 }).eq("id", logId);
    return { synced: 0, failed: 0 };
  }

  console.log(`[bling-sync:variacoes] Syncing variations for ${varProducts.length} variable products`);
  let totalSynced = 0, totalFailed = 0;

  for (const prod of varProducts) {
    try {
      // GET /produtos/{id}/variacoes — returns all variations for this product
      const data = await blingFetch(token, `/produtos/${prod.bling_id}/variacoes`, 1, 100);
      const variacoes: any[] = data.data || [];

      for (const v of variacoes) {
        await supabaseAdmin.from("bling_product_variations").upsert(
          {
            bling_product_id: prod.bling_id,
            bling_variacao_id: v.id,
            nome: v.nome || null,
            codigo: v.codigo || null,
            preco: v.preco != null ? Number(v.preco) : null,
            estoque_atual: v.estoque?.saldoVirtualTotal != null
              ? Number(v.estoque.saldoVirtualTotal) : 0,
            raw_data: v,
            synced_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
          { onConflict: "bling_product_id,bling_variacao_id" }
        );
        totalSynced++;
      }

      // Rate limit: 3 req/s
      await new Promise((resolve) => setTimeout(resolve, 350));
    } catch (e) {
      console.error(`[bling-sync:variacoes] Failed for product ${prod.bling_id}:`, e);
      totalFailed++;
    }
  }

  await supabaseAdmin.from("bling_sync_log")
    .update({ records_synced: totalSynced, records_failed: totalFailed }).eq("id", logId);

  console.log(`[bling-sync:variacoes] Done. Synced: ${totalSynced}, Failed: ${totalFailed}`);
  return { synced: totalSynced, failed: totalFailed };
}

async function syncContacts(
  supabaseAdmin: ReturnType<typeof createClient>,
  token: string,
  logId: string
): Promise<{ synced: number; failed: number }> {
  let page = 1;
  let totalSynced = 0;
  let totalFailed = 0;
  let hasMore = true;

  // Step 1: Sync all contacts (general pass)
  while (hasMore) {
    const data = await blingFetch(token, "/contatos", page, 100);
    const contacts = data.data || [];

    if (contacts.length === 0) {
      hasMore = false;
      break;
    }

    for (const contact of contacts) {
      try {
        await supabaseAdmin.from("bling_contacts").upsert(
          {
            bling_id: contact.id,
            nome: contact.nome || "",
            fantasia: contact.fantasia || null,
            tipo_pessoa: contact.tipoPessoa || null,
            cpf_cnpj: contact.numeroDocumento || null,
            ie: contact.ie || null,
            email: contact.email || null,
            telefone: contact.telefone || null,
            celular: contact.celular || null,
            tipo_contato: "",
            situacao: contact.situacao || null,
            is_supplier: false,
            is_client: false,
            raw_data: contact,
            synced_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
          { onConflict: "bling_id" }
        );
        totalSynced++;
      } catch (e) {
        console.error("Failed to upsert contact:", e);
        totalFailed++;
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 350));
    page++;
    if (contacts.length < 100) hasMore = false;
  }

  // Step 2: Mark suppliers — tipoContato=F (Fornecedor)
  console.log("[bling-sync] Identifying suppliers via tipoContato=F...");
  const supplierIds: number[] = [];
  let sPage = 1, sHasMore = true;
  while (sHasMore) {
    try {
      const data = await blingFetch(token, "/contatos?tipoContato=F", sPage, 100);
      const contacts = data.data || [];
      if (!contacts.length) { sHasMore = false; break; }
      for (const c of contacts) supplierIds.push(Number(c.id));
      sPage++;
      if (contacts.length < 100) sHasMore = false;
      await new Promise((r) => setTimeout(r, 300));
    } catch (e) {
      console.error("[bling-sync] Failed to fetch supplier contacts:", e);
      sHasMore = false;
    }
  }
  if (supplierIds.length > 0) {
    for (let i = 0; i < supplierIds.length; i += 100) {
      const batch = supplierIds.slice(i, i + 100);
      await supabaseAdmin.from("bling_contacts")
        .update({ is_supplier: true, tipo_contato: "Fornecedor", updated_at: new Date().toISOString() })
        .in("bling_id", batch);
    }
    console.log(`[bling-sync] Marked ${supplierIds.length} contacts as suppliers.`);
  }

  // Step 3: Mark clients — tipoContato=C (Cliente)
  console.log("[bling-sync] Identifying clients via tipoContato=C...");
  const clientIds: number[] = [];
  let cPage = 1, cHasMore = true;
  while (cHasMore) {
    try {
      const data = await blingFetch(token, "/contatos?tipoContato=C", cPage, 100);
      const contacts = data.data || [];
      if (!contacts.length) { cHasMore = false; break; }
      for (const c of contacts) clientIds.push(Number(c.id));
      cPage++;
      if (contacts.length < 100) cHasMore = false;
      await new Promise((r) => setTimeout(r, 300));
    } catch (e) {
      console.error("[bling-sync] Failed to fetch client contacts:", e);
      cHasMore = false;
    }
  }
  if (clientIds.length > 0) {
    for (let i = 0; i < clientIds.length; i += 100) {
      const batch = clientIds.slice(i, i + 100);
      await supabaseAdmin.from("bling_contacts")
        .update({ is_client: true, updated_at: new Date().toISOString() })
        .in("bling_id", batch);
    }
    console.log(`[bling-sync] Marked ${clientIds.length} contacts as clients.`);
  }

  await supabaseAdmin
    .from("bling_sync_log")
    .update({ records_synced: totalSynced, records_failed: totalFailed })
    .eq("id", logId);

  return { synced: totalSynced, failed: totalFailed };
}

// ── SKU code / product name → CarboHub linha mapping ───────────────────────
const SKU_TO_LINHA: Record<string, string> = {
  "SKU-CZ100": "carboze_100ml",
  "CZ100": "carboze_100ml",
  "SKU-CZ1L": "carboze_1l",
  "CZ1L": "carboze_1l",
  "SKU-CZSC10": "carboze_sache_10ml",
  "CZSC10": "carboze_sache_10ml",
  "SKU-CP100": "carbopro",
  "CP100": "carbopro",
  "SKU-VAPT70": "carbovapt",
  "VAPT70": "carbovapt",
};

function detectLinhaFromName(name: string): string {
  const n = (name || "").toLowerCase();
  if (n.includes("sach") || (n.includes("10ml") && !n.includes("100ml"))) return "carboze_sache_10ml";
  if (n.includes(" 1l") || n.includes("1 l") || n.includes("1l ")) return "carboze_1l";
  if (n.includes("carbopro") || n.includes("pro ") || n.includes("pro-")) return "carbopro";
  if (n.includes("vapt") || n.includes("servi")) return "carbovapt";
  return "carboze_100ml";
}

// Bling situacao → CarboHub status
function mapBlingStatus(situacaoId: number | null, situacaoValor: string | null): string {
  const valor = (situacaoValor || "").toLowerCase();
  if (situacaoId === 9 || valor.includes("atendido")) return "delivered";
  if (situacaoId === 12 || valor.includes("cancelado")) return "cancelled";
  if (valor.includes("enviado") || valor.includes("expedido") || valor.includes("transporte")) return "shipped";
  if (situacaoId === 17 || valor.includes("verificado") || valor.includes("faturado")) return "invoiced";
  if (situacaoId === 15 || valor.includes("andamento") || valor.includes("confirmado")) return "confirmed";
  return "pending";
}

// ── syncStock: busca saldo de estoque por produto (lotes de 40) ────────────
async function syncStock(
  supabaseAdmin: ReturnType<typeof createClient>,
  token: string,
  logId: string
): Promise<{ synced: number; failed: number }> {
  const { data: products } = await supabaseAdmin.from("bling_products").select("bling_id");
  if (!products?.length) {
    console.log("[bling-sync] No products to sync stock for. Run products sync first.");
    return { synced: 0, failed: 0 };
  }
  const blingIds = products.map((p: any) => p.bling_id);
  const BATCH_SIZE = 40;
  let totalSynced = 0, totalFailed = 0;

  for (let i = 0; i < blingIds.length; i += BATCH_SIZE) {
    const batch = blingIds.slice(i, i + BATCH_SIZE);
    try {
      const data = await blingFetch(token, `/estoques?idsProdutos=${batch.join(",")}`, 1, 100);
      for (const est of (data.data || [])) {
        const produtoId = est.produto?.id;
        if (!produtoId) continue;
        try {
          await supabaseAdmin.from("bling_products").update({
            estoque_atual: Number(est.saldoFisico) || 0,
            estoque_reservado: Number(est.saldoVirtualReservado) || 0,
            estoque_synced_at: new Date().toISOString(),
          }).eq("bling_id", produtoId);
          totalSynced++;
        } catch (e) {
          console.error("[bling-sync] stock update failed for product", produtoId, ":", e);
          totalFailed++;
        }
      }
    } catch (e) {
      console.error("[bling-sync] stock batch fetch failed:", e);
      totalFailed += batch.length;
    }
    await new Promise((r) => setTimeout(r, 350));
  }
  await supabaseAdmin.from("bling_sync_log")
    .update({ records_synced: totalSynced, records_failed: totalFailed }).eq("id", logId);
  return { synced: totalSynced, failed: totalFailed };
}

// Situação da NF-e no Bling v3 (código numérico → rótulo legível)
const NFE_SITUACAO_LABELS: Record<string, string> = {
  "1": "Pendente",
  "2": "Cancelada",
  "3": "Aguardando recibo",
  "4": "Rejeitada",
  "5": "Autorizada",
  "6": "Emitida DANFE",
  "7": "Registrada",
  "8": "Aguardando protocolo",
  "9": "Denegada",
  "10": "Consulta situação",
  "11": "Bloqueada",
};

function nfeSituacaoLabel(situacao: unknown): string | null {
  if (situacao == null) return null;
  // pode vir como número (6), string ("6") ou objeto ({ valor: 6 } / { valor: "Autorizada" })
  const raw = typeof situacao === "object"
    ? (situacao as any).valor ?? (situacao as any).id
    : situacao;
  if (raw == null) return null;
  const key = String(raw);
  // se já vier um texto (não-numérico), mantém
  if (!/^\d+$/.test(key)) return key;
  return NFE_SITUACAO_LABELS[key] || `Situação ${key}`;
}

// Extrai o CNPJ/CPF do contato da NF, tentando os vários nomes de campo do Bling
function extractContatoDoc(contato: any): string | null {
  if (!contato) return null;
  return contato.numeroDocumento || contato.cpfCnpj || contato.cnpj || contato.cpf || null;
}

// Extrai o valor total da NF, tentando os vários nomes de campo do Bling
function extractValorNota(d: any): number | null {
  const v = d?.valorNota ?? d?.valorTotal ?? d?.valor ?? d?.total;
  return v != null ? Number(v) : null;
}

// ── syncNFe: busca notas fiscais emitidas do Bling ─────────────────────────
// Passo 1: lista + upsert básico
// Passo 2: busca detalhe (observação + valor + CNPJ + situação) para NFs sem detalhe
// Passo 3: cruzamento automático por código PED-AAAA-NNNNN na observação
async function syncNFe(
  supabaseAdmin: ReturnType<typeof createClient>,
  token: string,
  logId: string
): Promise<{ synced: number; failed: number }> {
  let page = 1, totalSynced = 0, totalFailed = 0, hasMore = true;

  // ── Passo 1: lista ────────────────────────────────────────────────────────
  while (hasMore) {
    const data = await blingFetch(token, "/nfe", page, 100);
    const nfes = data.data || [];
    if (!nfes.length) { hasMore = false; break; }
    for (const nf of nfes) {
      try {
        const contato = nf.contato || {};
        // IMPORTANTE: a lista do Bling NÃO traz valor_total nem contato_cnpj.
        // Esses dois campos são preenchidos SÓ no Passo 2 (detalhe) e por isso são
        // omitidos aqui — senão o upsert os sobrescreveria com null a cada sync,
        // apagando o que o detalhe já preencheu.
        await supabaseAdmin.from("bling_nfe").upsert({
          bling_id:     nf.id,
          numero:       nf.numero ? String(nf.numero) : null,
          serie:        nf.serie  ? String(nf.serie)  : null,
          chave_acesso: nf.chaveAcesso || null,
          data_emissao: nf.dataEmissao || null,
          contato_nome: contato.nome || null,
          situacao:     nfeSituacaoLabel(nf.situacao),
          xml_url:      nf.xml  || null,
          pdf_url:      nf.pdf  || null,
          raw_data:     nf,
          synced_at:    new Date().toISOString(),
          updated_at:   new Date().toISOString(),
        }, { onConflict: "bling_id" });
        totalSynced++;
      } catch (e) {
        console.error("[bling-sync] NFe upsert error:", e);
        totalFailed++;
      }
    }
    await new Promise((r) => setTimeout(r, 350));
    page++;
    if (nfes.length < 100) hasMore = false;
  }

  // ── Passo 2: enriquecer com detalhe (observação + valor + CNPJ + situação) ─
  // A lista do Bling NÃO traz valor nem CNPJ — só o detalhe (GET /nfe/{id}) traz.
  // Cap: 150 NFs por execução para não estourar o timeout de 150s do edge function.
  // O cron chama sync periodicamente, então o histórico é enriquecido em rodadas.
  const { data: needsDetail } = await supabaseAdmin
    .from("bling_nfe")
    .select("id, bling_id")
    .is("informacoes_adicionais", null)
    .in("match_status", ["pending"])
    .limit(150);

  let enriched = 0;
  for (const nf of (needsDetail || [])) {
    try {
      const detail = await blingFetch(token, `/nfe/${nf.bling_id}`, 1, 1);
      const d = detail.data || {};
      // Bling API v3 usa "informacoesAdicionais" para NF; fallback "observacoes"
      const obs = d.informacoesAdicionais || d.observacoes || null;

      const update: Record<string, any> = {
        informacoes_adicionais: obs,
        // match_status só avança depois do matching (passo 3); se obs for null → no_code
        match_status: obs === null ? "no_code" : "pending",
        raw_data: d,  // detalhe é mais rico que a lista — guarda para uso futuro
        updated_at: new Date().toISOString(),
      };
      // Backfill dos campos que só existem no detalhe
      const valor = extractValorNota(d);
      const cnpj  = extractContatoDoc(d.contato);
      const situ  = nfeSituacaoLabel(d.situacao);
      if (valor != null) update.valor_total  = valor;
      if (cnpj)          update.contato_cnpj  = cnpj;
      if (situ)          update.situacao      = situ;
      if (d.contato?.nome) update.contato_nome = d.contato.nome;
      if (d.chaveAcesso)   update.chave_acesso = d.chaveAcesso;

      await supabaseAdmin.from("bling_nfe").update(update).eq("id", nf.id);
      enriched++;
    } catch (e) {
      console.error(`[bling-sync] NFe detail fetch failed for bling_id ${nf.bling_id}:`, e);
      totalFailed++;
    }
    await new Promise((r) => setTimeout(r, 350));
  }
  console.log(`[bling-sync] NFe detail enrichment: ${enriched} processed`);

  // ── Passo 2b: re-checar NFs "no_code" recentes (N1) ───────────────────────
  // NF emitida SEM o nº do pedido vira "no_code". Se o financeiro adicionar o
  // PED na NF dentro do Bling DEPOIS, a observação no nosso banco fica velha e
  // a NF nunca re-vinculava sozinha. Aqui re-buscamos o detalhe de um lote
  // pequeno e RECENTE (rotativo, mais antigas primeiro) e devolvemos para
  // "pending" quando há observação — o Passo 3 reavalia. Filtro por data + cap
  // mantêm o custo de API baixo (não varre todo o histórico a cada execução).
  const noCodeCutoff = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000)
    .toISOString().split("T")[0];
  const { data: recheckNoCode } = await supabaseAdmin
    .from("bling_nfe")
    .select("id, bling_id")
    .eq("match_status", "no_code")
    .gte("data_emissao", noCodeCutoff)
    .order("updated_at", { ascending: true })
    .limit(30);

  let rechecked = 0;
  for (const nf of (recheckNoCode || [])) {
    try {
      const detail = await blingFetch(token, `/nfe/${nf.bling_id}`, 1, 1);
      const d = detail.data || {};
      const obs = d.informacoesAdicionais || d.observacoes || null;
      await supabaseAdmin.from("bling_nfe").update({
        informacoes_adicionais: obs,
        // volta para "pending" só se há observação para reavaliar; senão segue no_code
        match_status: obs ? "pending" : "no_code",
        updated_at: new Date().toISOString(),
      }).eq("id", nf.id);
      rechecked++;
    } catch (e) {
      console.error(`[bling-sync] no_code recheck failed for bling_id ${nf.bling_id}:`, e);
    }
    await new Promise((r) => setTimeout(r, 350));
  }
  if (rechecked > 0) console.log(`[bling-sync] NFe no_code recheck: ${rechecked} reprocessed`);

  // ── Passo 3: cruzamento automático ────────────────────────────────────────
  const matched = await matchNFesToOrders(supabaseAdmin);
  console.log(`[bling-sync] NFe matching: ${matched.matched} matched, ${matched.invalid} invalid`);

  await supabaseAdmin.from("bling_sync_log")
    .update({ records_synced: totalSynced, records_failed: totalFailed }).eq("id", logId);
  return { synced: totalSynced, failed: totalFailed };
}

// ── matchNFesToOrders: cruzamento por PED-AAAA-NNNNN na observação ──────────
// Lê todas as NFs com status pending (têm informacoes_adicionais mas não foram cruzadas)
// e tenta vincular ao pedido. Também re-tenta invalid_code (caso pedido seja cadastrado
// depois da NF).
async function matchNFesToOrders(
  supabaseAdmin: ReturnType<typeof createClient>
): Promise<{ matched: number; invalid: number }> {
  const { data: nfes } = await supabaseAdmin
    .from("bling_nfe")
    .select("id, bling_id, chave_acesso, numero, informacoes_adicionais")
    .in("match_status", ["pending", "invalid_code"])
    .not("informacoes_adicionais", "is", null);

  let matched = 0, invalid = 0;
  // Regex tolerante (case-insensitive), em qualquer posição da observação:
  //  • V AAAA MM XXXX  (novo formato nativo, ex.: V2026070001)
  //  • PED-AAAA-NNNNN  (formato legado — mantido para casar NFs antigas)
  const PED_REGEX = /(V\d{6}\d{4}|PED-\d{4}-\d{5})/i;

  for (const nf of (nfes || [])) {
    const obs = nf.informacoes_adicionais || "";
    const codeMatch = obs.match(PED_REGEX);

    if (!codeMatch) {
      await supabaseAdmin.from("bling_nfe").update({
        match_status: "no_code",
        match_error: null,
        updated_at: new Date().toISOString(),
      }).eq("id", nf.id);
      continue;
    }

    const orderNumber = codeMatch[0].toUpperCase();
    const { data: order } = await supabaseAdmin
      .from("carboze_orders")
      .select("id, order_number")
      .eq("order_number", orderNumber)
      .maybeSingle();

    if (!order) {
      await supabaseAdmin.from("bling_nfe").update({
        match_status: "invalid_code",
        match_error: `Pedido ${orderNumber} não encontrado no sistema`,
        updated_at: new Date().toISOString(),
      }).eq("id", nf.id);
      invalid++;
      continue;
    }

    // Vínculo encontrado — atualiza bling_nfe
    await supabaseAdmin.from("bling_nfe").update({
      order_id: order.id,
      matched_order_number: order.order_number,
      match_status: "matched",
      match_error: null,
      updated_at: new Date().toISOString(),
    }).eq("id", nf.id);

    // Denormaliza no pedido os campos da NF para acesso rápido
    await supabaseAdmin.from("carboze_orders").update({
      bling_nf_id:   nf.bling_id,
      nf_access_key: nf.chave_acesso || null,
      invoice_number: nf.numero || null,
    }).eq("id", order.id);

    matched++;
  }
  return { matched, invalid };
}

// ── syncVendedores: busca equipe de vendedores do Bling ────────────────────
async function syncVendedores(
  supabaseAdmin: ReturnType<typeof createClient>,
  token: string,
  logId: string
): Promise<{ synced: number; failed: number }> {
  let page = 1, totalSynced = 0, totalFailed = 0, hasMore = true;
  while (hasMore) {
    const data = await blingFetch(token, "/vendedores", page, 100);
    const vendedores = data.data || [];
    if (!vendedores.length) { hasMore = false; break; }
    for (const v of vendedores) {
      try {
        await supabaseAdmin.from("bling_vendedores").upsert({
          bling_id: v.id,
          nome: v.nome || "",
          email: v.email || null,
          comissao_percentual: v.comissao != null ? Number(v.comissao) : null,
          situacao: v.situacao || null,
          raw_data: v,
          synced_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }, { onConflict: "bling_id" });
        totalSynced++;
      } catch (e) {
        console.error("[bling-sync] vendedor upsert failed:", e);
        totalFailed++;
      }
    }
    await new Promise((r) => setTimeout(r, 350));
    page++;
    if (vendedores.length < 100) hasMore = false;
  }
  await supabaseAdmin.from("bling_sync_log")
    .update({ records_synced: totalSynced, records_failed: totalFailed }).eq("id", logId);
  return { synced: totalSynced, failed: totalFailed };
}

// ── syncOrderDetails: busca itens por pedido via endpoint de detalhe ────────
async function syncOrderDetails(
  supabaseAdmin: ReturnType<typeof createClient>,
  token: string,
  logId: string
): Promise<{ synced: number; failed: number }> {
  // Only fetch details for orders that have no items yet
  const { data: orders } = await supabaseAdmin
    .from("bling_orders")
    .select("bling_id")
    .is("items", null);

  if (!orders?.length) {
    console.log("[bling-sync] No orders missing items.");
    await supabaseAdmin.from("bling_sync_log")
      .update({ records_synced: 0, records_failed: 0 }).eq("id", logId);
    return { synced: 0, failed: 0 };
  }

  let totalSynced = 0, totalFailed = 0;
  console.log(`[bling-sync] Fetching details for ${orders.length} orders...`);

  for (const order of orders) {
    try {
      const detail = await blingFetch(token, `/pedidos/vendas/${order.bling_id}`, 1, 1);
      const detailData = detail.data || {};
      const itens = detailData.itens || [];

      await supabaseAdmin.from("bling_orders")
        .update({
          items: itens,
          observacoes: detailData.observacoes || null,
          updated_at: new Date().toISOString(),
        })
        .eq("bling_id", order.bling_id);

      totalSynced++;
    } catch (e) {
      console.error(`[bling-sync] Detail fetch failed for order ${order.bling_id}:`, e);
      totalFailed++;
    }
    // 350ms between requests to stay under 3 req/s Bling rate limit
    await new Promise((r) => setTimeout(r, 350));
  }

  await supabaseAdmin.from("bling_sync_log")
    .update({ records_synced: totalSynced, records_failed: totalFailed }).eq("id", logId);

  console.log(`[bling-sync] Order details done. Synced: ${totalSynced}, Failed: ${totalFailed}`);
  return { synced: totalSynced, failed: totalFailed };
}

// ── Bridge: bling_orders → carboze_orders ──────────────────────────────────
async function bridgeOrdersToCarbohub(
  supabaseAdmin: ReturnType<typeof createClient>,
  logId: string
): Promise<{ synced: number; failed: number }> {
  // Load reference data
  const [{ data: blingOrders }, { data: skus }, { data: licensees }] = await Promise.all([
    supabaseAdmin.from("bling_orders").select("*").order("data", { ascending: false }),
    supabaseAdmin.from("sku").select("id, code, name"),
    supabaseAdmin.from("licensees").select("id, name, trade_name, cnpj"),
  ]);

  if (!blingOrders?.length) {
    console.log("[bling-bridge] No bling_orders to bridge. Run orders sync first.");
    await supabaseAdmin.from("bling_sync_log")
      .update({ records_synced: 0, records_failed: 0 }).eq("id", logId);
    return { synced: 0, failed: 0 };
  }

  const skuMap = new Map((skus || []).map((s: any) => [s.code, s]));
  let totalSynced = 0, totalFailed = 0;

  for (const bo of blingOrders) {
    try {
      const externalRef = `bling-${bo.bling_id}`;
      const items: any[] = Array.isArray(bo.items) ? bo.items : [];

      // Detect primary linha and sku_id from first product item
      let detectedLinha = "carboze_100ml";
      let skuId: string | null = null;
      const carboItems = items.map((item: any) => {
        const codigo: string = item.codigo || item.produto?.codigo || "";
        const nome: string = item.descricao || item.produto?.nome || "";
        const linha = SKU_TO_LINHA[codigo] || detectLinhaFromName(nome);
        if (!skuId) {
          const matched = skuMap.get(codigo);
          if (matched) { skuId = matched.id; detectedLinha = linha; }
          else { detectedLinha = linha; }
        }
        const qty = Number(item.quantidade) || 1;
        const price = Number(item.valor) || 0;
        return {
          name: nome || codigo || "Produto",  // campo correto para OrderItem
          product_code: codigo,               // SKU para referência
          quantity: qty,
          unit_price: price,
          total: qty * price,
        };
      });

      // Fuzzy match licensee by name
      const normalizeStr = (s: string) => (s || "").toLowerCase().trim();
      const contato = normalizeStr(bo.contato_nome);
      const licenseeId = (licensees || []).find(
        (l: any) => normalizeStr(l.name) === contato || normalizeStr(l.trade_name) === contato
      )?.id || null;

      const status = mapBlingStatus(bo.situacao_id, bo.situacao_valor);

      // Check if exists by external_ref
      const { data: existing } = await supabaseAdmin
        .from("carboze_orders")
        .select("id, status, items")
        .eq("external_ref", externalRef)
        .single();

      if (existing) {
        // Update status and items if changed/missing
        const needsUpdate = existing.status !== status || (carboItems.length > 0 && (!existing.items || (existing.items as any[]).length === 0));
        if (needsUpdate) {
          const updatePayload: Record<string, any> = { updated_at: new Date().toISOString() };
          if (existing.status !== status) updatePayload.status = status;
          if (carboItems.length > 0 && (!existing.items || (existing.items as any[]).length === 0)) {
            updatePayload.items = carboItems;
          }
          await supabaseAdmin
            .from("carboze_orders")
            .update(updatePayload)
            .eq("id", existing.id);
        }
      } else {
        const orderDate = bo.data ? new Date(bo.data).toISOString() : new Date().toISOString();
        // Pedidos nascidos no Bling usam namespace próprio (BLING-{nº do Bling}),
        // NÃO consomem a sequência PED reservada para vendas nativas do sistema.
        const blingOrderNumber = `BLING-${bo.numero || bo.bling_id}`;
        const { error: insertErr } = await supabaseAdmin.from("carboze_orders").insert({
          order_number: blingOrderNumber,
          customer_name: bo.contato_nome || "Cliente Bling",
          items: carboItems,
          subtotal: Number(bo.total_produtos) || 0,
          shipping_cost: Number(bo.total_frete) || 0,
          discount: Number(bo.total_desconto) || 0,
          total: Number(bo.total) || 0,
          status,
          licensee_id: licenseeId,
          external_ref: externalRef,
          notes: bo.observacoes || null,
          source_file: "bling_sync",
          created_at: orderDate,
        });
        if (insertErr) throw insertErr;
      }
      totalSynced++;
    } catch (e) {
      console.error("[bling-bridge] Failed for bling_id:", bo.bling_id, e);
      totalFailed++;
    }
  }

  await supabaseAdmin.from("bling_sync_log")
    .update({ records_synced: totalSynced, records_failed: totalFailed }).eq("id", logId);

  console.log(`[bling-bridge] Done. Bridged: ${totalSynced}, Failed: ${totalFailed}`);
  return { synced: totalSynced, failed: totalFailed };
}

// ── runTreatment: valida dados sincronizados antes do bridge ────────────────
async function runTreatment(
  supabaseAdmin: ReturnType<typeof createClient>,
  _token: string,
  logId: string
): Promise<{ synced: number; failed: number }> {
  const runId = crypto.randomUUID();
  let totalOk = 0, totalWarning = 0, totalError = 0, totalSkipped = 0;
  const logs: any[] = [];

  // Load reference data
  const [{ data: blingOrders }, { data: existingOrders }, { data: licensees }, { data: contacts }] = await Promise.all([
    supabaseAdmin.from("bling_orders").select("bling_id, contato_nome, total, items"),
    supabaseAdmin.from("carboze_orders").select("external_ref"),
    supabaseAdmin.from("licensees").select("id, name, trade_name"),
    supabaseAdmin.from("bling_contacts").select("bling_id, is_supplier, is_client"),
  ]);

  const existingRefs = new Set((existingOrders || []).map((o: any) => o.external_ref));
  const normalizeStr = (s: string) => (s || "").toLowerCase().trim();
  const licenseeNames = new Set((licensees || []).flatMap((l: any) => [
    normalizeStr(l.name), normalizeStr(l.trade_name)
  ].filter(Boolean)));

  // Validate orders
  for (const bo of (blingOrders || [])) {
    const externalRef = `bling-${bo.bling_id}`;

    if (existingRefs.has(externalRef)) {
      logs.push({ run_id: runId, entity_type: "order", bling_id: bo.bling_id, status: "skipped",
        issue_type: "duplicate", issue_detail: "Pedido já importado em carboze_orders" });
      totalSkipped++; continue;
    }
    if (Number(bo.total) === 0) {
      logs.push({ run_id: runId, entity_type: "order", bling_id: bo.bling_id, status: "error",
        issue_type: "zero_total", issue_detail: "Pedido com valor total zero" });
      totalError++; continue;
    }

    const items: any[] = Array.isArray(bo.items) ? bo.items : [];
    const hasLicensee = licenseeNames.has(normalizeStr(bo.contato_nome));
    let hasUnknownSku = false;
    if (items.length > 0) {
      hasUnknownSku = items.some((item: any) => {
        const code = item.codigo || item.produto?.codigo || "";
        return !SKU_TO_LINHA[code];
      });
    }

    if (items.length === 0) {
      logs.push({ run_id: runId, entity_type: "order", bling_id: bo.bling_id, status: "warning",
        issue_type: "missing_items", issue_detail: "Pedido sem itens (detalhes não sincronizados ainda)" });
      totalWarning++;
    } else if (!hasLicensee) {
      logs.push({ run_id: runId, entity_type: "order", bling_id: bo.bling_id, status: "warning",
        issue_type: "unknown_licensee", issue_detail: `Cliente "${bo.contato_nome}" não encontrado nos licenciados` });
      totalWarning++;
    } else if (hasUnknownSku) {
      logs.push({ run_id: runId, entity_type: "order", bling_id: bo.bling_id, status: "warning",
        issue_type: "unknown_sku", issue_detail: "Código de produto não mapeado para linha CarboHub" });
      totalWarning++;
    } else {
      logs.push({ run_id: runId, entity_type: "order", bling_id: bo.bling_id, status: "ok",
        issue_type: null, issue_detail: null });
      totalOk++;
    }
  }

  // Validate contacts
  for (const c of (contacts || [])) {
    if (!c.is_supplier && !c.is_client) {
      logs.push({ run_id: runId, entity_type: "contact", bling_id: c.bling_id, status: "warning",
        issue_type: "unclassified", issue_detail: "Contato sem classificação (não é cliente nem fornecedor)" });
      totalWarning++;
    } else {
      logs.push({ run_id: runId, entity_type: "contact", bling_id: c.bling_id, status: "ok",
        issue_type: null, issue_detail: null });
      totalOk++;
    }
  }

  // Insert all logs in batches of 200
  for (let i = 0; i < logs.length; i += 200) {
    await supabaseAdmin.from("bling_treatment_log").insert(logs.slice(i, i + 200));
  }

  const totalRecords = totalOk + totalWarning + totalError + totalSkipped;
  console.log(`[bling-treatment] Done. OK: ${totalOk}, Warnings: ${totalWarning}, Errors: ${totalError}, Skipped: ${totalSkipped}`);

  await supabaseAdmin.from("bling_sync_log")
    .update({ records_synced: totalOk + totalWarning + totalSkipped, records_failed: totalError })
    .eq("id", logId);

  return { synced: totalOk + totalWarning + totalSkipped, failed: totalError };
}

async function syncOrders(
  supabaseAdmin: ReturnType<typeof createClient>,
  token: string,
  logId: string
): Promise<{ synced: number; failed: number }> {
  let page = 1;
  let totalSynced = 0;
  let totalFailed = 0;
  let hasMore = true;

  while (hasMore) {
    const data = await blingFetch(token, "/pedidos/vendas", page, 100);
    const orders = data.data || [];

    if (orders.length === 0) {
      hasMore = false;
      break;
    }

    for (const order of orders) {
      try {
        // Use list data only — skip per-order detail fetch to avoid timeout
        // (109 orders × 350ms delay = ~38s just in delays; detail fetch pushes past edge fn limit)
        const contato = order.contato || {};
        const situacao = order.situacao || {};

        const { error: upsertErr } = await supabaseAdmin.from("bling_orders").upsert(
          {
            bling_id: order.id,
            numero: order.numero?.toString() || null,
            numero_loja: order.numeroLoja || null,
            data: order.data || null,
            data_saida: order.dataSaida || null,
            data_prevista: order.dataPrevista || null,
            total_produtos: Number(order.totalProdutos) || 0,
            total_desconto: Number(order.totalDesconto) || 0,
            total_frete: Number(order.totalFrete) || 0,
            total: Number(order.total) || 0,
            situacao_id: situacao.id || null,
            situacao_valor: situacao.valor || null,
            contato_id: contato.id || null,
            contato_nome: contato.nome || null,
            observacoes: null,
            items: null,
            raw_data: order,
            synced_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
          { onConflict: "bling_id" }
        );
        if (upsertErr) {
          console.error("[bling-sync] upsert error for order", order.id, ":", JSON.stringify(upsertErr));
          throw upsertErr;
        }
        totalSynced++;
      } catch (e) {
        console.error("Failed to upsert order:", e);
        totalFailed++;
      }
    }

    page++;

    if (orders.length < 100) hasMore = false;
  }

  await supabaseAdmin
    .from("bling_sync_log")
    .update({ records_synced: totalSynced, records_failed: totalFailed })
    .eq("id", logId);

  return { synced: totalSynced, failed: totalFailed };
}

// ── FASE 1: Contas a Pagar (Bling → Sistema) ───────────────────────────────
// Espelha /contas/pagar do Bling em purchase_payables (source='bling').
// O dashboard financeiro lê dessa tabela, então passa a refletir o Bling.
function mapContaPagarStatus(situacao: unknown, vencimento: string | null): string {
  // Bling v3 contas/pagar: 1=em aberto, 2=pago/baixado, 3=parcial, 4/5=cancelado
  const s = Number(situacao);
  if (s === 2) return "pago";
  if (s === 4 || s === 5) return "cancelado";
  // Em aberto ou parcial: se já venceu, marca como atrasado
  if (vencimento) {
    const today = new Date().toISOString().split("T")[0];
    if (vencimento < today) return "atrasado";
  }
  return "programado";
}

async function syncContasPagar(
  supabaseAdmin: ReturnType<typeof createClient>,
  token: string,
  logId: string
): Promise<{ synced: number; failed: number }> {
  let page = 1;
  let totalSynced = 0;
  let totalFailed = 0;
  let hasMore = true;

  while (hasMore) {
    const data = await blingFetch(token, "/contas/pagar", page, 100);
    const contas = data.data || [];

    if (contas.length === 0) {
      hasMore = false;
      break;
    }

    for (const conta of contas) {
      try {
        const vencimento: string | null = conta.vencimento || conta.dataVencimento || null;
        const fornecedor = conta.contato?.nome || conta.fornecedor?.nome || conta.contato?.fantasia || "Fornecedor não identificado";
        const valor = Number(conta.valor ?? conta.valorTotal ?? conta.saldo ?? 0);
        const numero = conta.numeroDocumento || conta.numero || String(conta.id);

        await supabaseAdmin.from("purchase_payables").upsert(
          {
            bling_id: conta.id,
            bling_numero: numero ? String(numero) : null,
            source: "bling",
            supplier_name: fornecedor,
            amount: valor,
            due_date: vencimento || new Date().toISOString().split("T")[0],
            status: mapContaPagarStatus(conta.situacao, vencimento),
            notes: conta.historico || conta.observacoes || null,
            bling_raw: conta,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "bling_id" }
        );
        totalSynced++;
      } catch (e) {
        console.error("[bling-sync] Failed to upsert conta a pagar:", e);
        totalFailed++;
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 350));
    page++;
    if (contas.length < 100) hasMore = false;
  }

  await supabaseAdmin
    .from("bling_sync_log")
    .update({ records_synced: totalSynced, records_failed: totalFailed })
    .eq("id", logId);

  return { synced: totalSynced, failed: totalFailed };
}

// ── FASE 1: Pedidos de Compra (Bling → Sistema) ────────────────────────────
// Espelha /pedidos/compras do Bling em purchase_orders (source='bling').
// Alimenta o gráfico "Custo por Fornecedor (Top 8)".
function mapPedidoCompraStatus(situacao: unknown): string {
  // Tenta extrair um rótulo textual; em caso de dúvida, mantém 'gerada'.
  const valor = (typeof situacao === "object" && situacao !== null
    ? (situacao as any).valor ?? (situacao as any).nome
    : situacao);
  const label = String(valor ?? "").toLowerCase();
  if (label.includes("cancel")) return "cancelada";
  if (label.includes("receb")) return "recebida";
  if (label.includes("atend")) return "recebida";
  return "gerada";
}

async function syncPedidosCompra(
  supabaseAdmin: ReturnType<typeof createClient>,
  token: string,
  logId: string
): Promise<{ synced: number; failed: number }> {
  let page = 1;
  let totalSynced = 0;
  let totalFailed = 0;
  let hasMore = true;

  while (hasMore) {
    const data = await blingFetch(token, "/pedidos/compras", page, 100);
    const pedidos = data.data || [];

    if (pedidos.length === 0) {
      hasMore = false;
      break;
    }

    for (const pedido of pedidos) {
      try {
        const fornecedor = pedido.fornecedor?.nome || pedido.contato?.nome || pedido.fornecedor?.fantasia || "Fornecedor não identificado";
        const total = Number(pedido.total ?? pedido.totalProdutos ?? 0);
        const numero = pedido.numero != null ? String(pedido.numero) : String(pedido.id);
        const dataPrev: string | null = pedido.dataPrevista || pedido.data || null;

        await supabaseAdmin.from("purchase_orders").upsert(
          {
            bling_id: pedido.id,
            bling_numero: numero,
            // oc_number é NOT NULL; usamos o número do Bling (o trigger preserva)
            oc_number: `BLING-${numero}`,
            source: "bling",
            supplier_name: fornecedor,
            supplier_document: pedido.fornecedor?.numeroDocumento || pedido.contato?.numeroDocumento || null,
            total_value: total,
            expected_delivery: dataPrev,
            status: mapPedidoCompraStatus(pedido.situacao),
            items: pedido.itens || pedido.items || [],
            bling_raw: pedido,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "bling_id" }
        );
        totalSynced++;
      } catch (e) {
        console.error("[bling-sync] Failed to upsert pedido de compra:", e);
        totalFailed++;
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 350));
    page++;
    if (pedidos.length < 100) hasMore = false;
  }

  await supabaseAdmin
    .from("bling_sync_log")
    .update({ records_synced: totalSynced, records_failed: totalFailed })
    .eq("id", logId);

  return { synced: totalSynced, failed: totalFailed };
}

Deno.serve(async (req: Request): Promise<Response> => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const blingClientId = Deno.env.get("BLING_CLIENT_ID")!;
    const blingClientSecret = Deno.env.get("BLING_CLIENT_SECRET")!;

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // Allow cron bypass: if X-Cron-Secret matches, skip user JWT validation
    const cronSecretHeader = req.headers.get("X-Cron-Secret");
    const expectedCronSecret = Deno.env.get("CRON_SECRET");
    const isCronCall = !!(cronSecretHeader && expectedCronSecret && cronSecretHeader === expectedCronSecret);

    let user: any = null;
    if (!isCronCall) {
      // Verify caller via JWT
      const authHeader = req.headers.get("authorization");
      if (!authHeader) {
        return new Response(
          JSON.stringify({ success: false, error: "Missing authorization" }),
          { status: 401, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }

      const userToken = authHeader.replace("Bearer ", "");
      const { data: { user: u }, error: userError } = await supabaseAdmin.auth.getUser(userToken);
      if (userError || !u) {
        return new Response(
          JSON.stringify({ success: false, error: "Unauthorized" }),
          { status: 401, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }
      user = u;
    } else {
      console.log("[bling-sync] Cron call authenticated via X-Cron-Secret");
    }

    const body = await req.json().catch(() => ({}));
    const entity = body.entity; // "products", "contacts", "orders", "all"

    if (!entity) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing entity. Use: products, contacts, orders, all" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Get valid token (auto-refreshes if expired or expiring soon)
    let { token, error: tokenError } = await getValidToken(
      supabaseAdmin,
      blingClientId,
      blingClientSecret
    );

    if (tokenError || !token) {
      return new Response(
        JSON.stringify({ success: false, error: tokenError || "No valid token" }),
        { status: 401, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // ── Ação pontual: criar pedido no Bling (não é sync em loop) ─────────────
    if (entity === "create_order") {
      const orderId = body.order_id as string | undefined;
      if (!orderId) {
        return new Response(
          JSON.stringify({ success: false, error: "Missing order_id" }),
          { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }
      const dryRun = body.dry_run === true;
      try {
        const result = await createBlingPedido(supabaseAdmin, token, orderId, dryRun);
        return new Response(
          JSON.stringify(dryRun ? { success: true, ...result } : { success: true, data: result?.data || result }),
          { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error("[bling-sync] create_order error:", msg);
        return new Response(
          JSON.stringify({ success: false, error: msg }),
          { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }
    }

    // ── Ação pontual: buscar o link do DANFE/XML de uma NF (sob demanda) ──────
    // A lista do Bling não traz o PDF; o detalhe (GET /nfe/{id}) traz. Busca,
    // salva em bling_nfe (cache) e devolve os links. Aceita bling_nf_id (number).
    if (entity === "nfe_links") {
      const blingNfId = body.bling_nf_id as number | string | undefined;
      if (!blingNfId) {
        return new Response(
          JSON.stringify({ success: false, error: "Missing bling_nf_id" }),
          { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }
      try {
        let detail = await blingFetch(token, `/nfe/${blingNfId}`, 1, 1);
        // retry 401 (token expirado) uma vez
        if (detail?.error) throw new Error(JSON.stringify(detail.error));
        const d = detail.data || {};
        // Tenta vários nomes de campo possíveis para o link do DANFE/XML
        const pdf =
          d.pdf || d.linkPDF || d.linkPdf || d.linkDanfe || d.danfe || d.link || null;
        const xml = d.xml || d.linkXml || d.linkXML || null;

        // Cacheia no banco se achou algo
        if (pdf || xml) {
          await supabaseAdmin.from("bling_nfe").update({
            ...(pdf ? { pdf_url: pdf } : {}),
            ...(xml ? { xml_url: xml } : {}),
            updated_at: new Date().toISOString(),
          }).eq("bling_id", Number(blingNfId));
        }

        return new Response(
          JSON.stringify({ success: true, pdf, xml, situacao: d.situacao ?? null, keys: Object.keys(d) }),
          { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error("[bling-sync] nfe_links error:", msg);
        return new Response(
          JSON.stringify({ success: false, error: msg }),
          { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }
    }

    const results: Record<string, any> = {};

    // Etapas de BUSCA no Bling (chamadas externas, lentas). NÃO inclui treatment/bridge.
    const FETCH_ENTITIES = ["products", "variacoes", "stock", "contacts", "orders", "order_details", "vendedores", "nfe", "contas_pagar", "pedidos_compra"];

    // "all"  = pipeline completo numa só invocação (legado — pode estourar o tempo antes do bridge)
    // "fetch" = apenas busca no Bling (sem treatment/bridge) — usado em pipeline por fases
    // O frontend e o cron rodam fetch → treatment → bridge em invocações SEPARADAS,
    // garantindo que o bridge (DB→DB, rápido) sempre execute com orçamento de tempo próprio.
    const entitiesToSync =
        entity === "all"   ? [...FETCH_ENTITIES, "treatment", "bridge"]
      : entity === "fetch" ? FETCH_ENTITIES
      : [entity];

    // Helper to run a sync function with automatic 401 retry
    async function syncWithRetry(
      entityType: string,
      syncFn: (admin: any, tkn: string, logId: string) => Promise<{ synced: number; failed: number }>,
      logId: string
    ): Promise<{ synced: number; failed: number }> {
      try {
        return await syncFn(supabaseAdmin, token, logId);
      } catch (e) {
        const errMsg = e instanceof Error ? e.message : "";
        // If Bling returned 401, force-refresh token and retry ONCE
        if (errMsg.includes("error 401") || errMsg.includes("API error 401") || errMsg.includes("invalid_token")) {
          console.log(`[bling-sync] Got 401 for ${entityType}, force-refreshing token and retrying...`);
          const refreshed = await getValidToken(supabaseAdmin, blingClientId, blingClientSecret, true);
          if (refreshed.error || !refreshed.token) {
            throw new Error(refreshed.error || "Token refresh failed on 401 retry");
          }
          token = refreshed.token; // Update token for subsequent entities too
          return await syncFn(supabaseAdmin, refreshed.token, logId);
        }
        throw e; // Non-401 error, rethrow
      }
    }

    for (const entityType of entitiesToSync) {
      // Create sync log entry
      const { data: logEntry } = await supabaseAdmin
        .from("bling_sync_log")
        .insert({
          entity_type: entityType,
          status: "running",
          triggered_by: user?.id || null,
        })
        .select("id")
        .single();

      const logId = logEntry?.id || "";

      try {
        let result;
        switch (entityType) {
          case "products":
            result = await syncWithRetry(entityType, syncProducts, logId);
            break;
          case "variacoes":
            result = await syncWithRetry(entityType, syncVariacoes, logId);
            break;
          case "stock":
            result = await syncWithRetry(entityType, syncStock, logId);
            break;
          case "contacts":
            result = await syncWithRetry(entityType, syncContacts, logId);
            break;
          case "orders":
            result = await syncWithRetry(entityType, syncOrders, logId);
            break;
          case "order_details":
            result = await syncWithRetry(entityType, syncOrderDetails, logId);
            break;
          case "treatment":
            result = await syncWithRetry(entityType, runTreatment, logId);
            break;
          case "vendedores":
            result = await syncWithRetry(entityType, syncVendedores, logId);
            break;
          case "nfe":
            result = await syncWithRetry(entityType, syncNFe, logId);
            break;
          case "contas_pagar":
            result = await syncWithRetry(entityType, syncContasPagar, logId);
            break;
          case "pedidos_compra":
            result = await syncWithRetry(entityType, syncPedidosCompra, logId);
            break;
          case "bridge":
            result = await bridgeOrdersToCarbohub(supabaseAdmin, logId);
            break;
          default:
            throw new Error(`Unknown entity: ${entityType}`);
        }

        await supabaseAdmin
          .from("bling_sync_log")
          .update({
            status: "completed",
            records_synced: result.synced,
            records_failed: result.failed,
            finished_at: new Date().toISOString(),
          })
          .eq("id", logId);

        results[entityType] = result;
      } catch (e) {
        const errMsg = e instanceof Error ? e.message : "Unknown error";
        console.error(`[bling-sync] Sync FAILED for ${entityType}:`, errMsg);

        await supabaseAdmin
          .from("bling_sync_log")
          .update({
            status: "failed",
            error_message: errMsg,
            finished_at: new Date().toISOString(),
          })
          .eq("id", logId);

        results[entityType] = { error: errMsg };
      }
    }

    return new Response(
      JSON.stringify({ success: true, data: results }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (error: unknown) {
    console.error("Error in bling-sync:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { "Content-Type": "application/json", ...getCorsHeaders(req) } }
    );
  }
});

import { createClient } from "npm:@supabase/supabase-js@2.39.3";

const ALLOWED_ORIGINS = [
  "https://carbohub.com.br",
  "https://www.carbohub.com.br",
  "http://localhost:8080",
  "http://localhost:5173",
  "http://localhost:3000",
];

function getCorsHeaders(req: Request) {
  const origin = req.headers.get("origin") || "";
  const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
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

async function syncContacts(
  supabaseAdmin: ReturnType<typeof createClient>,
  token: string,
  logId: string,
  contactType?: string
): Promise<{ synced: number; failed: number }> {
  let page = 1;
  let totalSynced = 0;
  let totalFailed = 0;
  let hasMore = true;

  const endpoint = contactType
    ? `/contatos?tipoContato=${contactType}`
    : "/contatos";

  while (hasMore) {
    const data = await blingFetch(token, endpoint, page, 100);
    const contacts = data.data || [];

    if (contacts.length === 0) {
      hasMore = false;
      break;
    }

    for (const contact of contacts) {
      try {
        const tipos = contact.tiposContato || [];
        const isSupplier = tipos.some((t: any) =>
          t.descricao?.toLowerCase().includes("fornecedor")
        );
        const isClient = tipos.some((t: any) =>
          t.descricao?.toLowerCase().includes("cliente")
        );

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
            tipo_contato: (tipos.map((t: any) => t.descricao) || []).join(", "),
            situacao: contact.situacao || null,
            is_supplier: isSupplier,
            is_client: isClient,
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
        return { product_name: nome, sku_code: codigo, quantity: qty, unit_price: price, total: qty * price };
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
        .select("id, status")
        .eq("external_ref", externalRef)
        .single();

      if (existing) {
        // Only update status if changed
        if (existing.status !== status) {
          await supabaseAdmin
            .from("carboze_orders")
            .update({ status, updated_at: new Date().toISOString() })
            .eq("id", existing.id);
        }
      } else {
        const orderDate = bo.data ? new Date(bo.data).toISOString() : new Date().toISOString();
        await supabaseAdmin.from("carboze_orders").insert({
          customer_name: bo.contato_nome || "Cliente Bling",
          items: carboItems,
          subtotal: Number(bo.total_produtos) || 0,
          shipping_cost: Number(bo.total_frete) || 0,
          discount: Number(bo.total_desconto) || 0,
          total: Number(bo.total) || 0,
          status,
          linha: detectedLinha,
          sku_id: skuId,
          licensee_id: licenseeId,
          external_ref: externalRef,
          notes: bo.observacoes || null,
          source_file: "bling_sync",
          rv_flow_type: "standard",
          created_at: orderDate,
        });
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
        // Fetch full order details
        let orderDetail = order;
        try {
          const detail = await blingFetch(token, `/pedidos/vendas/${order.id}`);
          orderDetail = detail.data || order;
          await new Promise((resolve) => setTimeout(resolve, 350));
        } catch (detailErr) {
          console.warn(`[bling-sync] Failed to fetch order detail ${order.id}:`, detailErr);
        }

        const contato = orderDetail.contato || {};
        const totais = orderDetail.totais || orderDetail.total || {};

        const { error: upsertErr } = await supabaseAdmin.from("bling_orders").upsert(
          {
            bling_id: order.id,
            numero: orderDetail.numero?.toString() || null,
            numero_loja: orderDetail.numeroLoja || null,
            data: orderDetail.data || null,
            data_saida: orderDetail.dataSaida || null,
            data_prevista: orderDetail.dataPrevista || null,
            total_produtos: totais.produtos || totais.totalProdutos || 0,
            total_desconto: totais.desconto || totais.totalDesconto || 0,
            total_frete: totais.frete || totais.totalFrete || 0,
            total: totais.total || totais.totalGeral || 0,
            situacao_id: orderDetail.situacao?.id || null,
            situacao_valor: orderDetail.situacao?.valor || null,
            contato_id: contato.id || null,
            contato_nome: contato.nome || null,
            observacoes: orderDetail.observacoes || null,
            items: orderDetail.itens || null,
            raw_data: orderDetail,
            synced_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
          { onConflict: "bling_id" }
        );
        if (upsertErr) throw upsertErr;
        totalSynced++;
      } catch (e) {
        console.error("Failed to upsert order:", e);
        totalFailed++;
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 350));
    page++;

    if (orders.length < 100) hasMore = false;
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

    // Verify caller
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing authorization" }),
        { status: 401, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const userToken = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(userToken);
    if (userError || !user) {
      return new Response(
        JSON.stringify({ success: false, error: "Unauthorized" }),
        { status: 401, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
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

    const results: Record<string, any> = {};

    const entitiesToSync = entity === "all"
      ? ["products", "contacts", "orders", "bridge"]
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
          triggered_by: user.id,
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
          case "contacts":
            result = await syncWithRetry(entityType, syncContacts, logId);
            break;
          case "orders":
            result = await syncWithRetry(entityType, syncOrders, logId);
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

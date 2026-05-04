import { createClient } from "npm:@supabase/supabase-js@2.39.3";

const BLING_API_BASE = "https://api.bling.com.br/Api/v3";
const BLING_TOKEN_URL = "https://www.bling.com.br/Api/v3/oauth/token";
const REFRESH_BUFFER_MS = 5 * 60 * 1000;

const ALLOWED_ORIGINS = [
  "https://controle.carbohub.com.br",  // app principal de gestão
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
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Vary": "Origin",
  };
}

async function refreshBlingToken(
  supabase: ReturnType<typeof createClient>,
  integration: any,
  clientId: string,
  clientSecret: string
): Promise<{ token: string; error?: string }> {
  const basicAuth = btoa(`${clientId}:${clientSecret}`);
  const res = await fetch(BLING_TOKEN_URL, {
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

  const refreshData = await res.json();
  if (!res.ok || refreshData.error) {
    await supabase.from("bling_integration").update({ is_active: false }).eq("id", integration.id);
    return { token: "", error: `Token refresh failed: ${refreshData.error_description || refreshData.error}` };
  }

  const expiresAt = new Date(Date.now() + (refreshData.expires_in || 21600) * 1000);
  await supabase.from("bling_integration").update({
    access_token: refreshData.access_token,
    refresh_token: refreshData.refresh_token,
    expires_at: expiresAt.toISOString(),
    updated_at: new Date().toISOString(),
  }).eq("id", integration.id);

  return { token: refreshData.access_token };
}

async function getValidToken(
  supabase: ReturnType<typeof createClient>,
  clientId: string,
  clientSecret: string
): Promise<{ token: string; error?: string }> {
  const { data: integration, error } = await supabase
    .from("bling_integration")
    .select("*")
    .eq("is_active", true)
    .single();

  if (error || !integration) {
    return { token: "", error: "no_integration" };
  }

  const expiresAt = new Date(integration.expires_at);
  const now = new Date();
  if (expiresAt < now || expiresAt.getTime() - now.getTime() < REFRESH_BUFFER_MS) {
    return refreshBlingToken(supabase, integration, clientId, clientSecret);
  }

  return { token: integration.access_token };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: getCorsHeaders(req) });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json", ...getCorsHeaders(req) },
    });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { "Content-Type": "application/json", ...getCorsHeaders(req) },
    });
  }

  const { lead_id } = body;
  if (!lead_id) {
    return new Response(JSON.stringify({ error: "lead_id required" }), {
      status: 400,
      headers: { "Content-Type": "application/json", ...getCorsHeaders(req) },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  // Fetch lead
  const { data: lead, error: leadError } = await supabase
    .from("crm_leads")
    .select("*")
    .eq("id", lead_id)
    .single();

  if (leadError || !lead) {
    console.error("[crm-bling-bridge] Lead not found:", lead_id, leadError?.message);
    return new Response(JSON.stringify({ error: "Lead not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json", ...getCorsHeaders(req) },
    });
  }

  const clientId = Deno.env.get("BLING_CLIENT_ID") || "";
  const clientSecret = Deno.env.get("BLING_CLIENT_SECRET") || "";

  const { token, error: tokenError } = await getValidToken(supabase, clientId, clientSecret);
  if (!token) {
    // No integration configured — skip gracefully, never block lead advance
    console.log("[crm-bling-bridge] No Bling integration, skipping. Reason:", tokenError);
    return new Response(JSON.stringify({ skipped: true, reason: tokenError }), {
      headers: { "Content-Type": "application/json", ...getCorsHeaders(req) },
    });
  }

  let blingContactId: number | null = null;
  let blingOrderId: number | null = null;
  const errors: string[] = [];

  // 1. Create Bling contact
  try {
    const contactPayload: any = {
      nome: lead.contact_name || lead.company_name || "Lead sem nome",
      tipo: "F",
    };
    if (lead.contact_phone) contactPayload.telefone = lead.contact_phone;
    if (lead.contact_email) contactPayload.email = lead.contact_email;
    if (lead.contact_cpf) contactPayload.cpf = lead.contact_cpf;

    const contactRes = await fetch(`${BLING_API_BASE}/contatos`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(contactPayload),
    });

    const contactData = await contactRes.json();
    if (contactRes.ok && contactData.data?.id) {
      blingContactId = contactData.data.id;
      console.log("[crm-bling-bridge] Bling contact created:", blingContactId);
    } else {
      const msg = `Contact creation failed: ${JSON.stringify(contactData)}`;
      console.error("[crm-bling-bridge]", msg);
      errors.push(msg);
    }
  } catch (err: any) {
    const msg = `Contact exception: ${err.message}`;
    console.error("[crm-bling-bridge]", msg);
    errors.push(msg);
  }

  // 2. Create Bling sale order (only if contact was created)
  if (blingContactId) {
    try {
      const orderPayload: any = {
        contato: { id: blingContactId },
        observacoes: `Lead CRM CarboHub | Funil: ${lead.funnel_type} | Etapa: ${lead.stage}`,
        itens: [],
      };

      if (lead.estimated_revenue && Number(lead.estimated_revenue) > 0) {
        orderPayload.itens.push({
          descricao: "Venda via CRM CarboHub",
          valor: Number(lead.estimated_revenue),
          quantidade: 1,
        });
      }

      const orderRes = await fetch(`${BLING_API_BASE}/pedidos/vendas`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(orderPayload),
      });

      const orderData = await orderRes.json();
      if (orderRes.ok && orderData.data?.id) {
        blingOrderId = orderData.data.id;
        console.log("[crm-bling-bridge] Bling order created:", blingOrderId);
      } else {
        const msg = `Order creation failed: ${JSON.stringify(orderData)}`;
        console.error("[crm-bling-bridge]", msg);
        errors.push(msg);
      }
    } catch (err: any) {
      const msg = `Order exception: ${err.message}`;
      console.error("[crm-bling-bridge]", msg);
      errors.push(msg);
    }
  }

  // 3. Update lead with Bling contact ID
  if (blingContactId) {
    const existingMeta = (lead.source_meta as Record<string, any>) || {};
    await supabase
      .from("crm_leads")
      .update({
        source_meta: { ...existingMeta, bling_contact_id: blingContactId, bling_order_id: blingOrderId },
      })
      .eq("id", lead_id);
  }

  // 4. Log to bling_sync_log
  await supabase.from("bling_sync_log").insert({
    entity_type: "crm_bridge",
    status: errors.length === 0 ? "completed" : "partial",
    synced_count: blingContactId ? 1 : 0,
    failed_count: errors.length,
    error_details: errors.length > 0 ? errors.join("; ") : null,
    meta: { lead_id, bling_contact_id: blingContactId, bling_order_id: blingOrderId },
  }).catch((err: Error) => console.error("[crm-bling-bridge] Log error:", err.message));

  return new Response(
    JSON.stringify({
      ok: true,
      bling_contact_id: blingContactId,
      bling_order_id: blingOrderId,
      errors: errors.length > 0 ? errors : undefined,
    }),
    { headers: { "Content-Type": "application/json", ...getCorsHeaders(req) } }
  );
});

import { createClient } from "npm:@supabase/supabase-js@2.39.3";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const META_VERIFY_TOKEN = Deno.env.get("META_VERIFY_TOKEN") || "";

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);

  // Meta webhook verification (GET)
  if (req.method === "GET") {
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");

    if (mode === "subscribe" && token === META_VERIFY_TOKEN) {
      console.log("[crm-webhook-meta] Webhook verified");
      return new Response(challenge || "", { status: 200 });
    }
    return new Response("Forbidden", { status: 403 });
  }

  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "content-type",
      },
    });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Meta Lead Ads webhook payload
  let payload: any;
  try {
    payload = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Respond 200 immediately — Meta requires fast response
  const responsePromise = new Response(JSON.stringify({ ok: true }), {
    headers: { "Content-Type": "application/json" },
  });

  // Process leads in the background
  processMetaLeads(payload).catch((err) =>
    console.error("[crm-webhook-meta] Processing error:", err)
  );

  return responsePromise;
});

async function processMetaLeads(payload: any) {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const entries = payload.entry || [];
  for (const entry of entries) {
    const changes = entry.changes || [];
    for (const change of changes) {
      if (change.field !== "leadgen") continue;

      const value = change.value || {};
      const leadgenId = value.leadgen_id;
      const formId = value.form_id;
      const fieldData: Array<{ name: string; values: string[] }> = value.field_data || [];

      // Extract fields from Meta Lead form
      const get = (name: string) =>
        fieldData.find((f) => f.name === name)?.values?.[0] || null;

      const contactName = get("full_name") || get("name") || null;
      const contactPhone = get("phone_number") || get("phone") || null;
      const contactEmail = get("email") || null;
      const city = get("city") || null;
      const state = get("state") || null;

      const { data, error } = await supabase
        .from("crm_leads")
        .insert({
          funnel_type: "f1",
          stage: "a_contatar",
          temperature: "morno",
          source: "Meta Ads",
          contact_name: contactName,
          contact_phone: contactPhone,
          contact_email: contactEmail,
          city,
          state,
          source_meta: {
            form_id: formId,
            leadgen_id: leadgenId,
            page_id: entry.id,
          },
        })
        .select("id")
        .single();

      if (error) {
        console.error("[crm-webhook-meta] Insert error:", JSON.stringify(error));
      } else {
        console.log("[crm-webhook-meta] Created lead:", data?.id, "| leadgen:", leadgenId);
      }
    }
  }
}

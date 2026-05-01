import { createClient } from "npm:@supabase/supabase-js@2.39.3";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const WEBHOOK_SECRET = Deno.env.get("CHATWOOT_WEBHOOK_SECRET") || "";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "content-type, x-chatwoot-token",
      },
    });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Validate webhook secret
  if (WEBHOOK_SECRET) {
    const token = req.headers.get("x-chatwoot-token") || "";
    if (token !== WEBHOOK_SECRET) {
      console.warn("[crm-webhook-chatwoot] Invalid token");
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }
  }

  let payload: any;
  try {
    payload = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Only process conversation_created events
  if (payload.event !== "conversation_created") {
    return new Response(JSON.stringify({ ok: true, skipped: true, reason: "event_ignored" }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  const contact = payload.meta?.sender || payload.contact || {};
  const conversation = payload.conversation || {};
  const inbox = payload.inbox || {};

  const contactName = contact.name || contact.display_name || null;
  const contactPhone = contact.phone_number || null;
  const contactEmail = contact.email || null;
  const conversationId = conversation.id || payload.id || null;
  const inboxName = inbox.name || null;

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  const { data, error } = await supabase
    .from("crm_leads")
    .insert({
      funnel_type: "f1",
      stage: "a_contatar",
      temperature: "morno",
      source: "ChatWoot / WhatsApp",
      contact_name: contactName,
      contact_phone: contactPhone,
      contact_email: contactEmail,
      source_meta: {
        chatwoot_conversation_id: conversationId,
        inbox_name: inboxName,
        raw_event: payload.event,
      },
    })
    .select("id")
    .single();

  if (error) {
    console.error("[crm-webhook-chatwoot] Insert error:", JSON.stringify(error));
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  console.log("[crm-webhook-chatwoot] Created lead:", data?.id);
  return new Response(JSON.stringify({ ok: true, lead_id: data?.id }), {
    headers: { "Content-Type": "application/json" },
  });
});

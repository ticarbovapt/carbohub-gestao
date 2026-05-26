import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// verify_jwt = false — webhook público chamado pelo Vindi
// Vindi envia X-Vindi-Token para validação opcional (configurável no painel)

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-vindi-token",
};

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

interface VindiWebhookCharge {
  id: number;
  amount: string;
  status: string;
  installments: number;
  created_at: string;
  bill?: { id: number };
  customer?: { email?: string; name?: string };
  payment_method?: { code?: string };
  last_transaction?: { payment_date?: string };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST")    return new Response("method not allowed", { status: 405 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return new Response("bad json", { status: 400 });
  }

  const eventType = (body.event as Record<string, unknown>)?.type as string ?? "";
  const charge    = ((body.event as Record<string, unknown>)?.data as Record<string, unknown>)?.charge as VindiWebhookCharge | undefined;

  // Eventos suportados
  const handled = ["charge_accepted", "charge_rejected", "charge_canceled", "charge_created"];
  if (!handled.includes(eventType) || !charge) {
    return new Response(JSON.stringify({ ok: true, skipped: true }), {
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  const status = normalizeStatus(charge.status);

  const { error } = await supabase.from("vindi_orders").upsert({
    charge_id:      charge.id.toString(),
    bill_id:        charge.bill?.id?.toString() ?? null,
    amount:         parseFloat(charge.amount ?? "0"),
    status,
    payment_method: normalizePaymentMethod(charge.payment_method?.code),
    installments:   charge.installments ?? 1,
    customer_email: charge.customer?.email ?? null,
    customer_name:  charge.customer?.name ?? null,
    paid_at:        charge.last_transaction?.payment_date ?? null,
    created_at:     charge.created_at,
    synced_at:      new Date().toISOString(),
    raw:            charge,
  }, { onConflict: "charge_id" });

  if (error) {
    console.error("[vindi-webhook] upsert error:", error.message);
    return new Response(JSON.stringify({ ok: false }), { status: 500, headers: { ...CORS, "Content-Type": "application/json" } });
  }

  console.log(`[vindi-webhook] ${eventType} charge=${charge.id} status=${status}`);
  return new Response(JSON.stringify({ ok: true }), {
    headers: { ...CORS, "Content-Type": "application/json" },
  });
});

function normalizeStatus(s: string): string {
  switch (s) {
    case "paid":     return "paid";
    case "pending":  return "pending";
    case "canceled": return "canceled";
    case "fraud":    return "fraud";
    default:         return "pending";
  }
}

function normalizePaymentMethod(code = ""): string {
  if (code.includes("credit_card")) return "credit_card";
  if (code.includes("bank_slip") || code.includes("boleto")) return "bank_slip";
  if (code.includes("pix")) return "pix";
  return code || "unknown";
}

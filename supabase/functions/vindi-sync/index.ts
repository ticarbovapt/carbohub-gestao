import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const VINDI_BASE = "https://app.vindi.com.br/api/v1";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

// ─── Types ────────────────────────────────────────────────────────────────────

interface VindiCharge {
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

interface VindiBillItem {
  product?: { id?: number; name?: string };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function auth(apiKey: string): string {
  return `Basic ${btoa(apiKey + ":")}`;
}

function normalizeStatus(s: string): string {
  switch (s) {
    case "paid":      return "paid";
    case "pending":   return "pending";
    case "canceled":  return "canceled";
    case "fraud":     return "fraud";
    default:          return "pending";
  }
}

function normalizePaymentMethod(code = ""): string {
  if (code.includes("credit_card")) return "credit_card";
  if (code.includes("bank_slip") || code.includes("boleto")) return "bank_slip";
  if (code.includes("pix")) return "pix";
  return code || "unknown";
}

// ─── Main ─────────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  // Busca API Key
  const { data: token } = await supabase
    .from("system_tokens")
    .select("access_token, last_synced_at")
    .eq("id", "vindi")
    .maybeSingle();

  if (!token?.access_token) {
    return json({ error: "Vindi não conectado" }, 401);
  }

  const headers = {
    "Authorization":  auth(token.access_token),
    "Content-Type":   "application/json",
    "Accept":         "application/json",
  };

  // Janela de sync: desde last_synced_at - 5min (overlap) ou -48h como fallback
  const since = token.last_synced_at
    ? new Date(new Date(token.last_synced_at).getTime() - 5 * 60 * 1000)
    : new Date(Date.now() - 48 * 60 * 60 * 1000);

  const sinceStr = since.toISOString().replace("T", " ").slice(0, 19); // Vindi aceita "YYYY-MM-DD HH:MM:SS"

  let page    = 1;
  let synced  = 0;
  let hasMore = true;

  while (hasMore) {
    const url = `${VINDI_BASE}/charges?` + new URLSearchParams({
      "created_at[gte]": sinceStr,
      per_page:          "50",
      page:              String(page),
      sort_by:           "created_at",
      sort_order:        "asc",
    });

    const res = await fetch(url, { headers });
    if (!res.ok) {
      console.error("[vindi-sync] charges fetch failed:", res.status, await res.text());
      break;
    }

    const body = await res.json();
    const charges: VindiCharge[] = body.charges ?? [];

    if (charges.length === 0) { hasMore = false; break; }

    for (const charge of charges) {
      let productId:   string | null = null;
      let productName: string | null = null;

      // Busca os itens da fatura para obter o produto
      if (charge.bill?.id) {
        const billRes = await fetch(`${VINDI_BASE}/bills/${charge.bill.id}`, { headers });
        if (billRes.ok) {
          const billBody = await billRes.json();
          const items: VindiBillItem[] = billBody.bill?.bill_items ?? [];
          const first = items[0];
          if (first?.product) {
            productId   = first.product.id?.toString() ?? null;
            productName = first.product.name ?? null;
          }
        }
      }

      const { error } = await supabase.from("vindi_orders").upsert({
        charge_id:      charge.id.toString(),
        bill_id:        charge.bill?.id?.toString() ?? null,
        product_id:     productId,
        product_name:   productName,
        amount:         parseFloat(charge.amount ?? "0"),
        status:         normalizeStatus(charge.status),
        payment_method: normalizePaymentMethod(charge.payment_method?.code),
        installments:   charge.installments ?? 1,
        customer_email: charge.customer?.email ?? null,
        customer_name:  charge.customer?.name ?? null,
        paid_at:        charge.last_transaction?.payment_date ?? null,
        created_at:     charge.created_at,
        synced_at:      new Date().toISOString(),
        raw:            charge,
      }, { onConflict: "charge_id" });

      if (error) console.error("[vindi-sync] upsert error:", error.message);
      else synced++;
    }

    hasMore = charges.length === 50;
    page++;

    // Rate limit: 10 req/s na API Vindi
    await new Promise(r => setTimeout(r, 120));
  }

  // Atualiza checkpoint
  await supabase.from("system_tokens")
    .update({ last_synced_at: new Date().toISOString() })
    .eq("id", "vindi");

  console.log(`[vindi-sync] done — ${synced} charges upserted`);
  return json({ ok: true, synced });
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

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

function vindiAuth(apiKey: string): string {
  return `Basic ${btoa(apiKey + ":")}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const url    = new URL(req.url);
  const action = url.searchParams.get("action") ?? "status";

  // ── POST /vindi-auth?action=save  →  armazena API Key ──────────────────────
  if (req.method === "POST" && action === "save") {
    let api_key = "";
    try { ({ api_key } = await req.json()); } catch { /* empty body */ }

    if (!api_key?.trim()) {
      return json({ error: "api_key obrigatória" }, 400);
    }

    // Valida a key chamando /merchant
    const test = await fetch(`${VINDI_BASE}/merchant`, {
      headers: { "Authorization": vindiAuth(api_key), "Content-Type": "application/json" },
    });

    if (!test.ok) {
      return json({ error: "API Key inválida ou sem permissão" }, 401);
    }

    await supabase.from("system_tokens").upsert({
      id:           "vindi",
      access_token: api_key.trim(),
      updated_at:   new Date().toISOString(),
    }, { onConflict: "id" });

    return json({ connected: true });
  }

  // ── GET /vindi-auth  →  verifica status de conexão ─────────────────────────
  const { data } = await supabase
    .from("system_tokens")
    .select("access_token, updated_at, last_synced_at")
    .eq("id", "vindi")
    .maybeSingle();

  if (!data?.access_token) {
    return json({ connected: false });
  }

  // Verifica se a key ainda é válida
  const test = await fetch(`${VINDI_BASE}/merchant`, {
    headers: { "Authorization": vindiAuth(data.access_token), "Content-Type": "application/json" },
  });

  return json({
    connected:      test.ok,
    last_synced_at: data.last_synced_at ?? null,
  });
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

/**
 * amazon-auth — Amazon SP-API LWA token manager
 *
 * GET /amazon-auth
 *   → refreshes LWA access_token via AMAZON_REFRESH_TOKEN env var
 *   → saves to system_tokens with id="amazon"
 *   → returns JSON with connection status
 *
 * GET /amazon-auth?action=disconnect
 *   → removes token from system_tokens
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

async function lwaRefresh(): Promise<{ access_token: string; expires_in: number } | null> {
  const clientId     = Deno.env.get("AMAZON_CLIENT_ID");
  const clientSecret = Deno.env.get("AMAZON_CLIENT_SECRET");
  const refreshToken = Deno.env.get("AMAZON_REFRESH_TOKEN");

  if (!clientId || !clientSecret || !refreshToken) {
    console.warn("[amazon-auth] Faltam env vars: AMAZON_CLIENT_ID, AMAZON_CLIENT_SECRET, AMAZON_REFRESH_TOKEN");
    return null;
  }

  const res = await fetch("https://api.amazon.com/auth/o2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type:    "refresh_token",
      client_id:     clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error(`[amazon-auth] LWA refresh falhou (${res.status}): ${err}`);
    return null;
  }

  return res.json();
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
      },
    });
  }

  const url    = new URL(req.url);
  const action = url.searchParams.get("action");

  const corsHeaders = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
  };

  // Disconnect
  if (action === "disconnect") {
    await supabase.from("system_tokens").delete().eq("id", "amazon");
    return new Response(JSON.stringify({ ok: true, connected: false }), { headers: corsHeaders });
  }

  // Check credentials configured
  const clientId = Deno.env.get("AMAZON_CLIENT_ID");
  if (!clientId) {
    return new Response(
      JSON.stringify({ ok: false, connected: false, reason: "no_credentials" }),
      { headers: corsHeaders }
    );
  }

  // Check existing token — reuse if valid
  const { data } = await supabase
    .from("system_tokens")
    .select("access_token, expires_at, seller_id, updated_at")
    .eq("id", "amazon")
    .maybeSingle();

  const expiresAt   = data?.expires_at ? new Date(data.expires_at).getTime() : 0;
  const needsRefresh = !data?.access_token || Date.now() >= expiresAt - 5 * 60 * 1000;

  if (!needsRefresh) {
    return new Response(JSON.stringify({
      ok:         true,
      connected:  true,
      seller_id:  data!.seller_id,
      updated_at: data!.updated_at,
      refreshed:  false,
    }), { headers: corsHeaders });
  }

  // Refresh token
  const tokens = await lwaRefresh();
  if (!tokens) {
    if (data?.access_token) {
      await supabase.from("system_tokens").delete().eq("id", "amazon");
    }
    return new Response(
      JSON.stringify({ ok: false, connected: false, reason: "token_refresh_failed" }),
      { headers: corsHeaders }
    );
  }

  const marketplaceId = Deno.env.get("AMAZON_MARKETPLACE_ID") ?? "A2Q3Y263D00KWC";
  await supabase.from("system_tokens").upsert({
    id:            "amazon",
    access_token:  tokens.access_token,
    refresh_token: Deno.env.get("AMAZON_REFRESH_TOKEN"),
    expires_at:    new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
    seller_id:     data?.seller_id ?? marketplaceId,
    updated_at:    new Date().toISOString(),
  }, { onConflict: "id" });

  const { data: saved } = await supabase
    .from("system_tokens")
    .select("seller_id, updated_at")
    .eq("id", "amazon")
    .maybeSingle();

  console.log("[amazon-auth] Token renovado com sucesso");

  return new Response(JSON.stringify({
    ok:         true,
    connected:  true,
    seller_id:  saved?.seller_id,
    updated_at: saved?.updated_at,
    refreshed:  true,
  }), { headers: corsHeaders });
});

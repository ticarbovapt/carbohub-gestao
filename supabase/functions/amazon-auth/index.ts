/**
 * amazon-auth — Amazon SP-API OAuth callback handler
 *
 * GET /amazon-auth?spapi_oauth_code=...&selling_partner_id=...&state=...
 *   → exchanges spapi_oauth_code for access_token + refresh_token via LWA
 *   → saves to system_tokens table (id='amazon')
 *   → returns HTML success page
 *
 * GET /amazon-auth?generate_auth_url=true
 *   → returns JSON with the Amazon authorization URL
 *
 * GET /amazon-auth  (no code)
 *   → returns JSON with connection status { connected, seller_id? }
 *
 * OPTIONS → CORS preflight
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const LWA_TOKEN_URL   = "https://api.amazon.com/auth/o2/token";
const REDIRECT_URI    = "https://wpkfirmapxevzpxjovjr.supabase.co/functions/v1/amazon-auth";
const APPLICATION_ID  = "amzn1.sp.solution.f89aef60-dc76-4d2b-9ed0-f7230b5c9d37";
const AUTH_URL        = `https://sellercentral.amazon.com.br/apps/authorize/consent?application_id=${APPLICATION_ID}&state=carbohub-amazon-auth&version=beta`;

// ─── Exchange authorization code for tokens ───────────────────────────────────

async function exchangeCode(code: string): Promise<{
  access_token: string;
  refresh_token: string;
  expires_in: number;
}> {
  const clientId     = Deno.env.get("AMAZON_CLIENT_ID")!;
  const clientSecret = Deno.env.get("AMAZON_CLIENT_SECRET")!;

  const res = await fetch(LWA_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type:    "authorization_code",
      code,
      redirect_uri:  REDIRECT_URI,
      client_id:     clientId,
      client_secret: clientSecret,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Amazon LWA token exchange failed (${res.status}): ${err}`);
  }

  return res.json();
}

// ─── Refresh an existing access token ────────────────────────────────────────

async function refreshToken(refreshToken: string): Promise<{
  access_token: string;
  refresh_token: string;
  expires_in: number;
} | null> {
  const clientId     = Deno.env.get("AMAZON_CLIENT_ID")!;
  const clientSecret = Deno.env.get("AMAZON_CLIENT_SECRET")!;

  try {
    const res = await fetch(LWA_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type:    "refresh_token",
        refresh_token: refreshToken,
        client_id:     clientId,
        client_secret: clientSecret,
      }),
    });

    if (!res.ok) {
      console.error("[amazon-auth] Refresh failed:", res.status, await res.text());
      return null;
    }

    return res.json();
  } catch (e) {
    console.error("[amazon-auth] Refresh error:", e);
    return null;
  }
}

// ─── Main handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin":  "*",
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
      },
    });
  }

  const url              = new URL(req.url);
  const oauthCode        = url.searchParams.get("spapi_oauth_code");
  const sellingPartnerId = url.searchParams.get("selling_partner_id");
  const generateAuthUrl  = url.searchParams.get("generate_auth_url");

  // ── Generate authorization URL ──────────────────────────────────────────────
  if (generateAuthUrl === "true") {
    return new Response(JSON.stringify({ ok: true, auth_url: AUTH_URL }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  // ── OAuth callback — exchange code for tokens ───────────────────────────────
  if (oauthCode) {
    try {
      const tokens = await exchangeCode(oauthCode);
      const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

      const { error } = await supabase
        .from("system_tokens")
        .upsert({
          id:            "amazon",
          access_token:  tokens.access_token,
          refresh_token: tokens.refresh_token,
          expires_at:    expiresAt,
          seller_id:     sellingPartnerId ?? null,
          updated_at:    new Date().toISOString(),
        }, { onConflict: "id" });

      if (error) throw new Error(`DB save failed: ${error.message}`);

      console.log(`[amazon-auth] Connected seller_id=${sellingPartnerId}`);

      return new Response(`
<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="utf-8"><title>Amazon — Conectada</title>
<style>body{font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#f5f5f5;}
.card{background:#fff;border-radius:12px;padding:40px;text-align:center;box-shadow:0 4px 24px rgba(0,0,0,.08);max-width:400px;}
h2{color:#FF9900;margin-bottom:8px;}p{color:#555;}</style></head>
<body><div class="card">
  <div style="font-size:48px">✅</div>
  <h2>Amazon conectada com sucesso!</h2>
  <p>Seller ID: <strong>${sellingPartnerId ?? "—"}</strong></p>
  <p>Os pedidos já começarão a aparecer no dashboard assim que chegarem.</p>
  <p style="margin-top:24px;font-size:13px;color:#888">Você pode fechar esta janela.</p>
</div></body></html>
      `, { headers: { "Content-Type": "text/html; charset=utf-8" } });

    } catch (err) {
      console.error("[amazon-auth] OAuth callback error:", err);
      return new Response(JSON.stringify({ ok: false, error: String(err) }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
  }

  // ── Connection status check (no code) ──────────────────────────────────────
  const { data } = await supabase
    .from("system_tokens")
    .select("access_token,refresh_token,expires_at,seller_id,updated_at")
    .eq("id", "amazon")
    .maybeSingle();

  if (!data?.access_token) {
    return new Response(JSON.stringify({ ok: true, connected: false }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  // Refresh if expired (or within 5 min of expiry)
  const expiresAt = data.expires_at ? new Date(data.expires_at).getTime() : 0;
  if (Date.now() >= expiresAt - 5 * 60 * 1000) {
    const refreshed = await refreshToken(data.refresh_token);
    if (!refreshed) {
      // Refresh failed — mark as disconnected
      await supabase.from("system_tokens").delete().eq("id", "amazon");
      return new Response(JSON.stringify({ ok: true, connected: false, reason: "refresh_failed" }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    await supabase.from("system_tokens").upsert({
      id:            "amazon",
      access_token:  refreshed.access_token,
      refresh_token: refreshed.refresh_token,
      expires_at:    new Date(Date.now() + refreshed.expires_in * 1000).toISOString(),
      seller_id:     data.seller_id,
      updated_at:    new Date().toISOString(),
    }, { onConflict: "id" });
  }

  return new Response(JSON.stringify({
    ok:         true,
    connected:  true,
    seller_id:  data.seller_id,
    updated_at: data.updated_at,
  }), { headers: { "Content-Type": "application/json" } });
});

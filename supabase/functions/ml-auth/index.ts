/**
 * ml-auth — Mercado Livre OAuth callback handler
 *
 * GET /ml-auth?code=<authorization_code>
 *   → exchanges code for access_token + refresh_token
 *   → saves to system_tokens table
 *   → returns HTML success page
 *
 * GET /ml-auth  (no code)
 *   → returns JSON with connection status
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const ML_TOKEN_URL = "https://api.mercadolibre.com/oauth/token";
const ML_API_URL   = "https://api.mercadolibre.com";

async function exchangeCode(code: string): Promise<{
  access_token: string;
  refresh_token: string;
  expires_in: number;
  user_id: number;
}> {
  const clientId     = Deno.env.get("ML_CLIENT_ID")!;
  const clientSecret = Deno.env.get("ML_CLIENT_SECRET")!;
  const redirectUri  = Deno.env.get("ML_REDIRECT_URI") ??
    `${Deno.env.get("SUPABASE_URL")}/functions/v1/ml-auth`;

  const res = await fetch(ML_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type:    "authorization_code",
      client_id:     clientId,
      client_secret: clientSecret,
      code,
      redirect_uri:  redirectUri,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`ML token exchange failed (${res.status}): ${err}`);
  }

  return res.json();
}

async function saveTokens(tokens: {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  user_id: number;
}) {
  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

  const { error } = await supabase
    .from("system_tokens")
    .upsert({
      id:            "mercadolivre",
      access_token:  tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_at:    expiresAt,
      seller_id:     String(tokens.user_id),
      updated_at:    new Date().toISOString(),
    }, { onConflict: "id" });

  if (error) throw new Error(`DB save failed: ${error.message}`);
}

Deno.serve(async (req: Request) => {
  const url  = new URL(req.url);
  const code = url.searchParams.get("code");

  // Live connection status check (no code = status probe)
  if (!code) {
    const { data } = await supabase
      .from("system_tokens")
      .select("access_token,refresh_token,expires_at,seller_id,updated_at")
      .eq("id", "mercadolivre")
      .maybeSingle();

    if (!data?.access_token) {
      return new Response(JSON.stringify({ ok: false, connected: false, reason: "no_token" }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // Try to get a valid token (refresh if expired)
    let token = data.access_token;
    const expiresAt = data.expires_at ? new Date(data.expires_at).getTime() : 0;
    if (Date.now() >= expiresAt - 5 * 60 * 1000) {
      try {
        const res = await fetch("https://api.mercadolibre.com/oauth/token", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            grant_type:    "refresh_token",
            client_id:     Deno.env.get("ML_CLIENT_ID")!,
            client_secret: Deno.env.get("ML_CLIENT_SECRET")!,
            refresh_token: data.refresh_token,
          }),
        });
        if (res.ok) {
          const t = await res.json() as { access_token: string; refresh_token: string; expires_in: number };
          token = t.access_token;
          await supabase.from("system_tokens").upsert({
            id:            "mercadolivre",
            access_token:  t.access_token,
            refresh_token: t.refresh_token,
            expires_at:    new Date(Date.now() + t.expires_in * 1000).toISOString(),
            seller_id:     data.seller_id,
            updated_at:    new Date().toISOString(),
          }, { onConflict: "id" });
        } else {
          // Refresh failed — mark as disconnected
          await supabase.from("system_tokens").delete().eq("id", "mercadolivre");
          return new Response(JSON.stringify({ ok: false, connected: false, reason: "refresh_failed" }), {
            headers: { "Content-Type": "application/json" },
          });
        }
      } catch {
        return new Response(JSON.stringify({ ok: false, connected: false, reason: "refresh_error" }), {
          headers: { "Content-Type": "application/json" },
        });
      }
    }

    // Verify token works with a live API call
    const verify = await fetch("https://api.mercadolibre.com/users/me", {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!verify.ok) {
      // Token invalid — clean up so dashboard shows disconnected
      await supabase.from("system_tokens").delete().eq("id", "mercadolivre");
      return new Response(JSON.stringify({ ok: false, connected: false, reason: "token_invalid", status: verify.status }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    const user = await verify.json() as Record<string, unknown>;
    return new Response(JSON.stringify({
      ok:         true,
      connected:  true,
      seller_id:  data.seller_id,
      nickname:   user.nickname ?? null,
      updated_at: data.updated_at,
    }), { headers: { "Content-Type": "application/json" } });
  }

  try {
    const tokens = await exchangeCode(code);
    await saveTokens(tokens);

    console.log(`[ml-auth] Connected seller_id=${tokens.user_id}`);

    return new Response(`
<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="utf-8"><title>Mercado Livre — Conectado</title>
<style>body{font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#f5f5f5;}
.card{background:#fff;border-radius:12px;padding:40px;text-align:center;box-shadow:0 4px 24px rgba(0,0,0,.08);max-width:400px;}
h2{color:#2d6a4f;margin-bottom:8px;}p{color:#555;}</style></head>
<body><div class="card">
  <div style="font-size:48px">✅</div>
  <h2>Mercado Livre conectado!</h2>
  <p>Seller ID: <strong>${tokens.user_id}</strong></p>
  <p>Os pedidos já começarão a aparecer no dashboard assim que chegarem.</p>
  <p style="margin-top:24px;font-size:13px;color:#888">Pode fechar esta aba.</p>
</div></body></html>
    `, { headers: { "Content-Type": "text/html; charset=utf-8" } });

  } catch (err) {
    console.error("[ml-auth] Error:", err);
    return new Response(JSON.stringify({ ok: false, error: String(err) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// bling2-auth — OAuth da SEGUNDA conta Bling
//
// Cópia funcional de `bling-auth`, mas apontando para:
//   • credenciais próprias  → BLING2_CLIENT_ID / BLING2_CLIENT_SECRET
//   • tabela própria        → bling2_integration
//   • callback próprio      → /integracoes/bling2/callback
//
// Por que não reaproveitar `bling-auth` com um parâmetro `conta`: os dois
// tokens têm ciclo de vida independente e o refresh do Bling INVALIDA o
// refresh_token anterior. Uma função só, escrevendo na tabela errada por um
// parâmetro esquecido, derrubaria a conexão da conta que está no ar hoje.
// Função separada não tem como errar de tabela.
// ═══════════════════════════════════════════════════════════════════════════

import { createClient } from "npm:@supabase/supabase-js@2.39.3";

const ALLOWED_ORIGINS = [
  "https://controle.carbohub.com.br",
  "https://carbohub.com.br",
  "https://www.carbohub.com.br",
  "https://admin.carbohub.com.br",
  "https://sales.carbohub.com.br",
  "https://ops.carbohub.com.br",
  "https://financas.carbohub.com.br",
  "https://finance.carbohub.com.br",
  "https://carbohub-fin.vercel.app",
  "http://localhost:8080",
  "http://localhost:8082",
  "http://localhost:5173",
  "http://localhost:3000",
];

function isAllowedOrigin(origin: string): boolean {
  if (ALLOWED_ORIGINS.includes(origin)) return true;
  try {
    const { protocol, hostname } = new URL(origin);
    if (protocol !== "https:") return false;
    return hostname.endsWith(".carbohub.com.br") || hostname.endsWith(".vercel.app");
  } catch {
    return false;
  }
}

function getCorsHeaders(req: Request) {
  const origin = req.headers.get("origin") || "";
  const allowedOrigin = isAllowedOrigin(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type, x-region",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}

const BLING_AUTH_URL = "https://www.bling.com.br/Api/v3/oauth/authorize";
const BLING_TOKEN_URL = "https://www.bling.com.br/Api/v3/oauth/token";

// ⚠️ TEM que estar cadastrada, IDÊNTICA a esta, nas URLs de redirecionamento
// do app da SEGUNDA conta no painel do Bling — senão o Bling recusa com
// redirect_uri_mismatch. É um app diferente do da primeira conta.
const REDIRECT_URI = "https://finance.carbohub.com.br/integracoes/bling2/callback";

Deno.serve(async (req: Request): Promise<Response> => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const clientId = Deno.env.get("BLING2_CLIENT_ID")!;
    const clientSecret = Deno.env.get("BLING2_CLIENT_SECRET")!;

    if (!clientId || !clientSecret) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Credenciais do Bling 2 não configuradas (BLING2_CLIENT_ID / BLING2_CLIENT_SECRET).",
        }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing authorization" }),
        { status: 401, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token);
    if (userError || !user) {
      return new Response(
        JSON.stringify({ success: false, error: "Unauthorized" }),
        { status: 401, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const body = await req.json().catch(() => ({}));
    const action = body.action;

    console.log("[bling2-auth] action:", action, "user:", user.id);

    // ── authorize: devolve a URL para onde mandar o usuário ─────────────────
    if (action === "authorize") {
      const state = crypto.randomUUID();
      const authUrl =
        `${BLING_AUTH_URL}?response_type=code&client_id=${clientId}` +
        `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&state=${state}`;
      return new Response(
        JSON.stringify({ success: true, data: { authUrl, state } }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // ── callback: troca o code pelos tokens ─────────────────────────────────
    if (action === "callback") {
      const code = body.code;
      if (!code) {
        return new Response(
          JSON.stringify({ success: false, error: "Missing authorization code" }),
          { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }

      const basicAuth = btoa(`${clientId}:${clientSecret}`);
      const tokenResponse = await fetch(BLING_TOKEN_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "Authorization": `Basic ${basicAuth}`,
        },
        body: new URLSearchParams({ grant_type: "authorization_code", code }),
      });

      const tokenData = await tokenResponse.json();

      if (!tokenResponse.ok || tokenData.error) {
        console.error("[bling2-auth] Token exchange FAILED:", JSON.stringify(tokenData));
        return new Response(
          JSON.stringify({
            success: false,
            error: tokenData.error_description || tokenData.error || "Token exchange failed",
          }),
          { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }

      // Token do Bling dura 6h.
      const expiresAt = new Date(Date.now() + (tokenData.expires_in || 21600) * 1000);

      // Desativa conexões anteriores DESTA integração — bling_integration não
      // é tocada em momento nenhum.
      await supabaseAdmin
        .from("bling2_integration")
        .update({ is_active: false })
        .eq("is_active", true);

      const { error: insertError } = await supabaseAdmin
        .from("bling2_integration")
        .insert({
          apelido: typeof body.apelido === "string" ? body.apelido.slice(0, 80) : null,
          access_token: tokenData.access_token,
          refresh_token: tokenData.refresh_token,
          token_type: tokenData.token_type || "Bearer",
          expires_at: expiresAt.toISOString(),
          scope: tokenData.scope || "",
          connected_by: user.id,
          is_active: true,
        });

      if (insertError) {
        console.error("[bling2-auth] Failed to store tokens:", insertError);
        return new Response(
          JSON.stringify({ success: false, error: "Failed to store tokens" }),
          { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }

      console.log("[bling2-auth] Conectado. Token expira em:", expiresAt.toISOString());
      return new Response(
        JSON.stringify({ success: true, data: { connected: true, expires_at: expiresAt } }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // ── refresh ─────────────────────────────────────────────────────────────
    if (action === "refresh") {
      const { data: integration } = await supabaseAdmin
        .from("bling2_integration")
        .select("*")
        .eq("is_active", true)
        .order("connected_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!integration) {
        return new Response(
          JSON.stringify({ success: false, error: "Nenhuma conexão ativa no Bling 2" }),
          { status: 404, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }

      const basicAuth = btoa(`${clientId}:${clientSecret}`);
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
        console.error("[bling2-auth] refresh error:", refreshData);
        await supabaseAdmin
          .from("bling2_integration")
          .update({ is_active: false })
          .eq("id", integration.id);

        return new Response(
          JSON.stringify({ success: false, error: "Refresh falhou. Reconecte o Bling 2." }),
          { status: 401, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }

      const expiresAt = new Date(Date.now() + (refreshData.expires_in || 21600) * 1000);

      await supabaseAdmin
        .from("bling2_integration")
        .update({
          access_token: refreshData.access_token,
          refresh_token: refreshData.refresh_token,
          expires_at: expiresAt.toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", integration.id);

      return new Response(
        JSON.stringify({ success: true, data: { refreshed: true, expires_at: expiresAt } }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // ── status ──────────────────────────────────────────────────────────────
    if (action === "status") {
      const { data: integration } = await supabaseAdmin
        .from("bling2_integration")
        .select("id, apelido, expires_at, connected_at, is_active, scope")
        .eq("is_active", true)
        .order("connected_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      const isConnected = !!integration;
      const isExpired = integration ? new Date(integration.expires_at) < new Date() : false;

      return new Response(
        JSON.stringify({
          success: true,
          data: {
            connected: isConnected,
            expired: isExpired,
            needsRefresh: isExpired,
            ...(integration || {}),
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // ── disconnect ──────────────────────────────────────────────────────────
    if (action === "disconnect") {
      await supabaseAdmin
        .from("bling2_integration")
        .update({ is_active: false })
        .eq("is_active", true);

      return new Response(
        JSON.stringify({ success: true, data: { disconnected: true } }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    return new Response(
      JSON.stringify({
        success: false,
        error: "Ação inválida. Use: authorize, callback, refresh, status, disconnect",
      }),
      { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (error: unknown) {
    console.error("[bling2-auth] erro:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { "Content-Type": "application/json", ...getCorsHeaders(req) } }
    );
  }
});

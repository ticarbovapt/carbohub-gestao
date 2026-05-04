import { createClient } from "npm:@supabase/supabase-js@2.39.3";

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
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type, x-region",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}

const BLING_AUTH_URL = "https://www.bling.com.br/Api/v3/oauth/authorize";
const BLING_TOKEN_URL = "https://www.bling.com.br/Api/v3/oauth/token";

// Fallback to env var or hardcoded production URL
const REDIRECT_URI = Deno.env.get("BLING_REDIRECT_URI") || "https://controle.carbohub.com.br/integrations/bling/callback";

Deno.serve(async (req: Request): Promise<Response> => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const blingClientId = Deno.env.get("BLING_CLIENT_ID")!;
    const blingClientSecret = Deno.env.get("BLING_CLIENT_SECRET")!;

    if (!blingClientId || !blingClientSecret) {
      return new Response(
        JSON.stringify({ success: false, error: "Bling credentials not configured" }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // Verify caller is authenticated admin/CEO
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

    // Read body ONCE and reuse — req.json() consumes the stream
    const body = await req.json().catch(() => ({}));
    const action = body.action;

    console.log("[bling-auth] action:", action, "user:", user.id);

    // ACTION: Get authorization URL
    if (action === "authorize") {
      const state = crypto.randomUUID();
      const authUrl = `${BLING_AUTH_URL}?response_type=code&client_id=${blingClientId}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&state=${state}`;
      console.log("[bling-auth] Generated auth URL, redirecting user to Bling");
      return new Response(
        JSON.stringify({ success: true, data: { authUrl, state } }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // ACTION: Exchange authorization code for tokens
    if (action === "callback") {
      const code = body.code;
      if (!code) {
        return new Response(
          JSON.stringify({ success: false, error: "Missing authorization code" }),
          { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }

      console.log("[bling-auth] Exchanging code for token, code length:", code?.length);

      const basicAuth = btoa(`${blingClientId}:${blingClientSecret}`);
      const tokenResponse = await fetch(BLING_TOKEN_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "Authorization": `Basic ${basicAuth}`,
        },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code,
        }),
      });

      const tokenData = await tokenResponse.json();

      if (!tokenResponse.ok || tokenData.error) {
        console.error("[bling-auth] Token exchange FAILED:", JSON.stringify(tokenData));
        return new Response(
          JSON.stringify({ success: false, error: tokenData.error_description || tokenData.error || "Token exchange failed" }),
          { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }

      // Calculate expiration (Bling tokens expire in 6 hours = 21600s)
      const expiresAt = new Date(Date.now() + (tokenData.expires_in || 21600) * 1000);

      // Deactivate existing integrations
      await supabaseAdmin
        .from("bling_integration")
        .update({ is_active: false })
        .eq("is_active", true);

      // Store new tokens
      const { error: insertError } = await supabaseAdmin
        .from("bling_integration")
        .insert({
          access_token: tokenData.access_token,
          refresh_token: tokenData.refresh_token,
          token_type: tokenData.token_type || "Bearer",
          expires_at: expiresAt.toISOString(),
          scope: tokenData.scope || "",
          connected_by: user.id,
          is_active: true,
        });

      if (insertError) {
        console.error("[bling-auth] Failed to store tokens:", insertError);
        return new Response(
          JSON.stringify({ success: false, error: "Failed to store tokens" }),
          { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }

      console.log("[bling-auth] Successfully connected! Token expires at:", expiresAt.toISOString());
      return new Response(
        JSON.stringify({ success: true, data: { connected: true, expires_at: expiresAt } }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // ACTION: Refresh token
    if (action === "refresh") {
      const { data: integration } = await supabaseAdmin
        .from("bling_integration")
        .select("*")
        .eq("is_active", true)
        .single();

      if (!integration) {
        return new Response(
          JSON.stringify({ success: false, error: "No active Bling integration" }),
          { status: 404, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }

      const basicAuth = btoa(`${blingClientId}:${blingClientSecret}`);
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
        console.error("Bling refresh error:", refreshData);
        // Mark integration as inactive
        await supabaseAdmin
          .from("bling_integration")
          .update({ is_active: false })
          .eq("id", integration.id);

        return new Response(
          JSON.stringify({ success: false, error: "Token refresh failed. Please reconnect." }),
          { status: 401, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }

      const expiresAt = new Date(Date.now() + (refreshData.expires_in || 21600) * 1000);

      await supabaseAdmin
        .from("bling_integration")
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

    // ACTION: Check status
    if (action === "status") {
      const { data: integration } = await supabaseAdmin
        .from("bling_integration")
        .select("id, expires_at, connected_at, is_active, scope")
        .eq("is_active", true)
        .single();

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

    // ACTION: Disconnect
    if (action === "disconnect") {
      await supabaseAdmin
        .from("bling_integration")
        .update({ is_active: false })
        .eq("is_active", true);

      return new Response(
        JSON.stringify({ success: true, data: { disconnected: true } }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    return new Response(
      JSON.stringify({ success: false, error: "Invalid action. Use: authorize, callback, refresh, status, disconnect" }),
      { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (error: unknown) {
    console.error("Error in bling-auth:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { "Content-Type": "application/json", ...getCorsHeaders(req) } }
    );
  }
});

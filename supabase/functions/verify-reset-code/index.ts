import { createClient } from "npm:@supabase/supabase-js@2.39.3";

// CORS
const ALLOWED_ORIGINS = [
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
      "authorization, x-client-info, apikey, content-type",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}

/**
 * verify-reset-code
 *
 * Public endpoint. Two modes:
 * 1. action="verify" — checks if code is valid (without consuming it)
 * 2. action="reset" — validates code + sets new password + marks code as used
 */
Deno.serve(async (req: Request): Promise<Response> => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    const { email, code, password, action = "verify" } = await req.json();

    if (!email || !code) {
      return new Response(
        JSON.stringify({ success: false, error: "E-mail e código são obrigatórios" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Find matching active code
    const { data: resetCode, error: findError } = await supabaseAdmin
      .from("password_reset_codes")
      .select("*")
      .eq("email", email.toLowerCase())
      .eq("code", code)
      .eq("used", false)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (findError || !resetCode) {
      return new Response(
        JSON.stringify({ success: false, error: "Código inválido ou já utilizado" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Check expiration
    if (new Date() > new Date(resetCode.expires_at)) {
      return new Response(
        JSON.stringify({ success: false, error: "Código expirado. Solicite um novo código." }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Check max attempts (5)
    if (resetCode.attempts >= 5) {
      // Mark as used (burned)
      await supabaseAdmin
        .from("password_reset_codes")
        .update({ used: true })
        .eq("id", resetCode.id);
      return new Response(
        JSON.stringify({ success: false, error: "Número máximo de tentativas excedido. Solicite um novo código." }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Increment attempts
    await supabaseAdmin
      .from("password_reset_codes")
      .update({ attempts: resetCode.attempts + 1 })
      .eq("id", resetCode.id);

    // MODE: verify only
    if (action === "verify") {
      return new Response(
        JSON.stringify({ success: true, message: "Código válido" }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // MODE: reset password
    if (action === "reset") {
      if (!password || password.length < 8) {
        return new Response(
          JSON.stringify({ success: false, error: "A senha deve ter pelo menos 8 caracteres" }),
          { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }

      // Update password via admin API
      const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(resetCode.user_id, {
        password,
      });

      if (updateError) {
        console.error("Password update error:", updateError);
        return new Response(
          JSON.stringify({ success: false, error: "Erro ao redefinir a senha. Tente novamente." }),
          { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }

      // Mark code as used
      await supabaseAdmin
        .from("password_reset_codes")
        .update({ used: true })
        .eq("id", resetCode.id);

      // Clear password_must_change flag
      await supabaseAdmin
        .from("profiles")
        .update({ password_must_change: false })
        .eq("id", resetCode.user_id);

      return new Response(
        JSON.stringify({ success: true, message: "Senha redefinida com sucesso" }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    return new Response(
      JSON.stringify({ success: false, error: "Ação inválida" }),
      { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (error: unknown) {
    console.error("Error in verify-reset-code:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { "Content-Type": "application/json", ...getCorsHeaders(req) } }
    );
  }
});

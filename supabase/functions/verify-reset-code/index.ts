import { createClient } from "npm:@supabase/supabase-js@2.39.3";
import { Resend } from "https://esm.sh/resend@4.0.0";

// E-mail de confirmação "senha alterada" (antifraude) — identidade Grupo Carbo.
function senhaAlteradaEmail(fullName: string): string {
  const YEAR = new Date().getUTCFullYear();
  const quando = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "long", timeStyle: "short" });
  const P = (h: string) => `<p style="margin:0 0 14px 0; font-family:Arial,Helvetica,sans-serif; font-size:15px; line-height:24px; color:#4B5563;">${h}</p>`;
  return `<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark"><title>Senha alterada — CARBO Hub</title>
<!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]--></head>
<body style="margin:0; padding:0; background-color:#F4F6F5;">
<div style="display:none; max-height:0; overflow:hidden; font-size:1px; color:#F4F6F5;">Confirmação: a senha da sua conta foi alterada.&#8203;&#8203;&#8203;&#8203;&#8203;&#8203;&#8203;&#8203;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#F4F6F5" style="background-color:#F4F6F5;"><tr><td align="center" style="padding:32px 16px;">
  <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="width:560px; max-width:560px; background-color:#FFFFFF; border-radius:14px; overflow:hidden; box-shadow:0 1px 3px rgba(15,64,45,0.08);">
    <tr><td style="height:5px; line-height:5px; font-size:5px; background:linear-gradient(90deg,#3DC559 0%,#2FA84F 45%,#3B7DD8 100%);">&nbsp;</td></tr>
    <tr><td align="center" bgcolor="#FFFFFF" style="background-color:#FFFFFF; padding:34px 40px 26px 40px;">
      <img src="https://www.carbohub.com.br/email/grupo-carbo.png" alt="Grupo Carbo" width="230" height="63" style="display:block; border:0; width:230px; height:63px; max-width:230px;">
    </td></tr>
    <tr><td style="padding:0 40px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="border-top:1px solid #E5E7EB; font-size:0; line-height:0;">&nbsp;</td></tr></table></td></tr>
    <tr><td style="padding:32px 40px 8px 40px; font-family:Arial,Helvetica,sans-serif;">
      <h1 style="margin:0 0 16px 0; font-size:22px; line-height:28px; font-weight:700; color:#1F2937;">Senha alterada</h1>
      ${P(`Olá, <strong style="color:#0F402D;">${fullName}</strong>.`)}
      ${P(`A senha da sua conta no <strong style="color:#0F402D;">CARBO&nbsp;Hub</strong> foi alterada com sucesso em <strong>${quando}</strong>.`)}
      ${P(`<strong style="color:#1F2937;">Não foi você?</strong> Avise o TI imediatamente — sua conta pode estar comprometida.`)}
      ${P(`<span style="color:#6B7280; font-size:13px;">A Carbo nunca pede sua senha por e-mail ou WhatsApp.</span>`)}
    </td></tr>
    <tr><td style="padding:24px 40px 36px 40px; text-align:center; font-family:Arial,Helvetica,sans-serif;">
      <p style="margin:24px 0 0 0; font-size:15px; line-height:22px; font-weight:700; color:#0F402D; text-align:center;">Grupo Carbo</p>
      <p style="margin:4px 0 0 0; font-size:13px; line-height:20px; color:#6B7280; text-align:center;">o ecossistema que conecta operações com crescimento</p>
      <p style="margin:16px 0 0 0; font-size:12px; line-height:18px; color:#9CA3AF; text-align:center;">Este é um e-mail automático de segurança — por favor, não responda.</p>
      <p style="margin:8px 0 0 0; font-size:12px; line-height:18px; color:#9CA3AF; text-align:center;">© ${YEAR} Grupo Carbo. Todos os direitos reservados.</p>
    </td></tr>
  </table>
</td></tr></table></body></html>`;
}

// CORS
const ALLOWED_ORIGINS = [
  "https://controle.carbohub.com.br",
  "https://carbohub.com.br",
  "https://www.carbohub.com.br",
  "https://admin.carbohub.com.br",
  "https://sales.carbohub.com.br",
  "https://ops.carbohub.com.br",
  "http://localhost:8080",
  "http://localhost:8082",
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

      // Confirmação/antifraude: avisa a pessoa que a senha foi alterada.
      // Não bloqueia o fluxo — se o e-mail falhar, o reset já está feito.
      try {
        const resendApiKey = Deno.env.get("RESEND_API_KEY");
        if (resendApiKey && resetCode.email) {
          const { data: prof } = await supabaseAdmin
            .from("profiles")
            .select("full_name")
            .eq("id", resetCode.user_id)
            .single();
          const resend = new Resend(resendApiKey);
          await resend.emails.send({
            from: "Grupo Carbo <noreply@carbohub.com.br>",
            to: [resetCode.email],
            subject: "Sua senha do CARBO Hub foi alterada",
            html: senhaAlteradaEmail(prof?.full_name || "Usuário"),
          });
        }
      } catch (mailErr) {
        console.error("senha_alterada email error:", mailErr);
      }

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

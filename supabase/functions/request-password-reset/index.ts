import { createClient } from "npm:@supabase/supabase-js@2.39.3";
import { Resend } from "https://esm.sh/resend@4.0.0";

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

// E-mail com a identidade do Grupo Carbo (verde #0F402D + lime #8DC63F).
function resetEmailHtml(fullName: string, code: string): string {
  const YEAR = new Date().getUTCFullYear();
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Redefinição de senha · CarboHub</title>
</head>
<body style="margin:0;padding:0;background:#0b141a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0b141a;padding:32px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 10px 40px rgba(0,0,0,.35);">

        <!-- Cabeçalho -->
        <tr>
          <td style="background:#0F402D;padding:32px 40px 28px;text-align:center;">
            <div style="display:inline-block;width:44px;height:44px;border-radius:12px;background:#8DC63F;line-height:44px;text-align:center;margin-bottom:12px;">
              <span style="color:#0F402D;font-size:22px;font-weight:800;">C</span>
            </div>
            <div style="color:#ffffff;font-size:22px;font-weight:800;letter-spacing:.3px;">CARBO Hub</div>
            <div style="color:#8DC63F;font-size:12px;font-weight:600;letter-spacing:2px;text-transform:uppercase;margin-top:4px;">Ecossistema Grupo Carbo</div>
          </td>
        </tr>

        <!-- Corpo -->
        <tr>
          <td style="padding:36px 40px 8px;color:#1f2937;">
            <p style="margin:0 0 6px;font-size:16px;">Olá, <strong>${fullName}</strong> 👋</p>
            <p style="margin:0 0 22px;font-size:15px;line-height:1.6;color:#374151;">
              Recebemos uma solicitação para redefinir a sua senha no CarboHub. Use o código abaixo para continuar:
            </p>

            <!-- Código -->
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
              <tr><td align="center">
                <div style="display:inline-block;background:#f4f9ec;border:2px solid #8DC63F;border-radius:14px;padding:18px 28px;">
                  <div style="font-family:'Courier New',monospace;font-size:34px;font-weight:800;letter-spacing:10px;color:#0F402D;">${code}</div>
                </div>
              </td></tr>
            </table>

            <div style="background:#fef8e7;border-left:4px solid #e0a800;border-radius:8px;padding:12px 16px;margin:24px 0 8px;font-size:13px;color:#7a5b00;">
              <strong>Este código expira em 15 minutos.</strong> Se você não solicitou a redefinição, ignore este e-mail — sua senha continua a mesma.
            </div>

            <p style="margin:16px 0 0;font-size:13px;color:#6b7280;">Por segurança, nunca compartilhe este código com ninguém.</p>
          </td>
        </tr>

        <!-- Rodapé -->
        <tr>
          <td style="padding:28px 40px 32px;">
            <div style="border-top:1px solid #eceff1;padding-top:20px;text-align:center;">
              <div style="font-size:14px;font-weight:700;color:#0F402D;">Grupo Carbo</div>
              <div style="font-size:12px;color:#8a94a0;margin-top:4px;line-height:1.5;">
                CarboHub — o ecossistema que conecta operações com crescimento.<br>
                Este é um e-mail automático, não é necessário responder.
              </div>
              <div style="font-size:11px;color:#b0b8c1;margin-top:14px;">© ${YEAR} Grupo Carbo · Todos os direitos reservados</div>
            </div>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

/**
 * request-password-reset
 *
 * Public endpoint (no auth). Accepts email OR username.
 * Generates a 6-digit code, stores it, and sends via email.
 * Always returns success (no user enumeration).
 */
Deno.serve(async (req: Request): Promise<Response> => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    const { identifier } = await req.json(); // email or username

    if (!identifier) {
      return new Response(
        JSON.stringify({ success: true, message: "Se o e-mail estiver cadastrado, você receberá o código de verificação." }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Resolve identifier to email and user_id
    let email: string | null = null;
    let userId: string | null = null;
    let fullName: string | null = null;

    const isEmail = identifier.includes("@");

    if (isEmail) {
      // Look up user by email
      const { data: users } = await supabaseAdmin.auth.admin.listUsers();
      const user = users?.users?.find((u: { email?: string }) => u.email?.toLowerCase() === identifier.toLowerCase());
      if (user) {
        email = user.email!;
        userId = user.id;
        const { data: profile } = await supabaseAdmin
          .from("profiles")
          .select("full_name")
          .eq("id", user.id)
          .single();
        fullName = profile?.full_name || "Usuário";
      }
    } else {
      // Look up user by username
      const { data: profile } = await supabaseAdmin
        .from("profiles")
        .select("id, full_name")
        .eq("username", identifier.toUpperCase())
        .single();
      if (profile) {
        userId = profile.id;
        fullName = profile.full_name || "Usuário";
        const { data: userData } = await supabaseAdmin.auth.admin.getUserById(profile.id);
        email = userData?.user?.email || null;
      }
    }

    // Always return success to prevent user enumeration
    const successResponse = JSON.stringify({
      success: true,
      message: "Se o e-mail estiver cadastrado, você receberá o código de verificação.",
    });

    if (!email || !userId) {
      return new Response(successResponse, {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // Invalidate previous unused codes for this user
    await supabaseAdmin
      .from("password_reset_codes")
      .update({ used: true })
      .eq("user_id", userId)
      .eq("used", false);

    // Generate 6-digit code
    const { data: code, error: codeError } = await supabaseAdmin.rpc("generate_reset_code");

    if (codeError || !code) {
      console.error("Code generation error:", codeError);
      return new Response(successResponse, {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // Store the code (expires in 15 minutes)
    const { error: insertError } = await supabaseAdmin.from("password_reset_codes").insert({
      user_id: userId,
      email,
      code,
    });

    if (insertError) {
      console.error("Code insert error:", insertError);
      return new Response(successResponse, {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // Send email with code (identidade Grupo Carbo)
    if (resendApiKey) {
      const resend = new Resend(resendApiKey);
      await resend.emails.send({
        from: "CarboHub <noreply@carbohub.com.br>",
        to: [email],
        subject: `${code} é o seu código de acesso · CarboHub`,
        html: resetEmailHtml(fullName || "Usuário", code),
      });
    }

    return new Response(successResponse, {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error: unknown) {
    console.error("Error in request-password-reset:", error);
    // Always return success to prevent enumeration
    return new Response(
      JSON.stringify({ success: true, message: "Se o e-mail estiver cadastrado, você receberá o código de verificação." }),
      { status: 200, headers: { "Content-Type": "application/json", ...getCorsHeaders(req) } }
    );
  }
});

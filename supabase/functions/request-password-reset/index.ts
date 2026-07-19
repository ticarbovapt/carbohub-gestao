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
// HTML à prova de e-mail (tabelas, CSS inline, MSO/Outlook, dark-mode, preheader).
function resetEmailHtml(fullName: string, code: string): string {
  const YEAR = new Date().getUTCFullYear();
  return `<!DOCTYPE html>
<html lang="pt-BR" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <meta name="color-scheme" content="light dark">
  <meta name="supported-color-schemes" content="light dark">
  <title>Seu código de redefinição de senha — CARBO Hub</title>
  <!--[if mso]>
  <noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript>
  <![endif]-->
</head>
<body style="margin:0; padding:0; background-color:#0b141a; -webkit-text-size-adjust:100%; -ms-text-size-adjust:100%;">

  <div style="display:none; font-size:1px; line-height:1px; max-height:0; max-width:0; opacity:0; overflow:hidden; mso-hide:all; font-family:Arial,Helvetica,sans-serif; color:#0b141a;">
    Use este código para redefinir sua senha no CarboHub. Ele expira em 15 minutos.
    &#8203;&#8203;&#8203;&#8203;&#8203;&#8203;&#8203;&#8203;&#8203;&#8203;&#8203;&#8203;&#8203;&#8203;&#8203;&#8203;
  </div>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#0b141a;">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="width:560px; max-width:560px; margin:0 auto;">

          <!-- Cabeçalho / marca -->
          <tr>
            <td align="center" style="padding:8px 8px 24px 8px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td valign="middle" style="padding-right:12px;">
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td align="center" valign="middle" width="44" height="44" style="width:44px; height:44px; background-color:#8DC63F; border-radius:10px; font-family:Arial,Helvetica,sans-serif; font-size:22px; font-weight:bold; color:#0F402D; text-align:center; line-height:44px;">C</td>
                      </tr>
                    </table>
                  </td>
                  <td valign="middle" style="font-family:Arial,Helvetica,sans-serif; text-align:left;">
                    <div style="font-size:20px; font-weight:bold; color:#ffffff; letter-spacing:0.3px;">CARBO&nbsp;Hub</div>
                    <div style="font-size:12px; color:#8DC63F; letter-spacing:0.5px;">Ecossistema Grupo Carbo</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Card -->
          <tr>
            <td style="background-color:#ffffff; border-radius:14px; border-top:4px solid #0F402D;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">

                <tr>
                  <td style="padding:36px 40px 8px 40px; font-family:Arial,Helvetica,sans-serif;">
                    <h1 style="margin:0 0 18px 0; font-size:22px; line-height:1.3; color:#0F402D; font-weight:bold;">Redefinição de senha</h1>
                    <p style="margin:0 0 16px 0; font-size:16px; line-height:1.6; color:#1f2937;">Olá, ${fullName} 👋</p>
                    <p style="margin:0 0 16px 0; font-size:16px; line-height:1.6; color:#1f2937;">
                      Recebemos uma solicitação para redefinir a senha da sua conta no <strong style="color:#0F402D;">CARBO&nbsp;Hub</strong>. Use o código de verificação abaixo para continuar:
                    </p>
                  </td>
                </tr>

                <tr>
                  <td style="padding:8px 40px 8px 40px;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td align="center" style="background-color:#0F402D; border-radius:12px; padding:26px 20px;">
                          <div style="font-family:Arial,Helvetica,sans-serif; font-size:12px; letter-spacing:1.5px; text-transform:uppercase; color:#8DC63F; margin-bottom:10px; font-weight:bold;">Seu código de verificação</div>
                          <div style="font-family:'Courier New',Courier,monospace; font-size:40px; line-height:1.1; letter-spacing:10px; font-weight:bold; color:#ffffff; padding-left:10px;">${code}</div>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>

                <tr>
                  <td style="padding:20px 40px 4px 40px; font-family:Arial,Helvetica,sans-serif;">
                    <p style="margin:0 0 14px 0; font-size:14px; line-height:1.6; color:#6b7280;">
                      Este código expira em <strong style="color:#1f2937;">15 minutos</strong> e <strong style="color:#1f2937;">não deve ser compartilhado</strong> com ninguém — nossa equipe jamais irá solicitá-lo.
                    </p>
                    <p style="margin:0 0 8px 0; font-size:14px; line-height:1.6; color:#6b7280;">
                      Se você não solicitou esta redefinição, pode ignorar este e-mail com segurança. Sua senha atual continuará a mesma.
                    </p>
                  </td>
                </tr>

                <tr><td style="padding:20px 40px 32px 40px;">
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
                    <td style="border-top:1px solid #e5e7eb; font-size:0; line-height:0;">&nbsp;</td>
                  </tr></table>
                </td></tr>

              </table>
            </td>
          </tr>

          <!-- Rodapé -->
          <tr>
            <td style="padding:28px 24px 8px 24px; font-family:Arial,Helvetica,sans-serif; text-align:center;">
              <div style="font-size:15px; font-weight:bold; color:#ffffff; margin-bottom:6px;">Grupo Carbo</div>
              <div style="font-size:13px; line-height:1.6; color:#8DC63F; margin-bottom:16px;">o ecossistema que conecta operações com crescimento</div>
              <div style="font-size:12px; line-height:1.6; color:#6b7280;">Este é um e-mail automático de segurança — por favor, não responda.</div>
              <div style="font-size:12px; line-height:1.6; color:#6b7280; margin-top:10px;">© ${YEAR} Grupo Carbo. Todos os direitos reservados.</div>
            </td>
          </tr>

        </table>
      </td>
    </tr>
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
      // Look up user by email.
      // ATENÇÃO: auth.admin.listUsers() SEM paginação só retorna a 1ª página
      // (50 usuários). Com >50 contas, um usuário fora da 1ª página nunca era
      // encontrado → a função retornava sucesso silencioso sem enviar e-mail.
      // Aqui paginamos até achar (ou esgotar as páginas).
      const target = identifier.toLowerCase();
      const perPage = 1000;
      for (let page = 1; ; page++) {
        const { data: list, error: listErr } = await supabaseAdmin.auth.admin.listUsers({ page, perPage });
        if (listErr) {
          console.error("listUsers error:", listErr);
          break;
        }
        const user = list?.users?.find((u: { email?: string }) => u.email?.toLowerCase() === target);
        if (user) {
          email = user.email!;
          userId = user.id;
          break;
        }
        // Última página? (menos itens que perPage ou lista vazia)
        if (!list || list.users.length < perPage) break;
      }

      if (userId) {
        const { data: profile } = await supabaseAdmin
          .from("profiles")
          .select("full_name")
          .eq("id", userId)
          .single();
        fullName = profile?.full_name || "Usuário";
      } else {
        console.log("request-password-reset: nenhum usuário encontrado para o e-mail informado");
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
        subject: `Seu código CarboHub: ${code}`,
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

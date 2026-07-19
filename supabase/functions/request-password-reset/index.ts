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

// E-mail transacional com a identidade real do Grupo Carbo (logo hospedada em
// carbohub.com.br). Layout CLARO/premium, à prova de e-mail (tabelas, CSS inline,
// MSO/Outlook, dark-mode, preheader). A logo fica sempre sobre fundo branco.
function resetEmailHtml(fullName: string, code: string): string {
  const YEAR = new Date().getUTCFullYear();
  return `<!DOCTYPE html>
<html lang="pt-BR" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<meta name="format-detection" content="telephone=no, date=no, address=no, email=no">
<title>Redefinição de senha — CARBO Hub</title>
<!--[if mso]>
<noscript>
<xml>
<o:OfficeDocumentSettings>
<o:PixelsPerInch>96</o:PixelsPerInch>
</o:OfficeDocumentSettings>
</xml>
</noscript>
<![endif]-->
<style type="text/css">
  body { margin:0 !important; padding:0 !important; width:100% !important; }
  table { border-collapse:collapse; }
  img { -ms-interpolation-mode:bicubic; }
  a { text-decoration:none; }
  @media only screen and (max-width:600px) {
    .container { width:100% !important; max-width:100% !important; }
    .px { padding-left:24px !important; padding-right:24px !important; }
    .code-digits { font-size:32px !important; letter-spacing:8px !important; }
    .logo-img { width:200px !important; height:auto !important; }
  }
  @media (prefers-color-scheme: dark) {
    .page-bg { background-color:#0b1512 !important; }
    .card { background-color:#12211b !important; }
    .t-title { color:#F3F4F6 !important; }
    .t-body { color:#C9D2CD !important; }
    .t-muted { color:#94A3A0 !important; }
    .hairline td { border-color:#26372F !important; }
    .note-box { background-color:#0f1c17 !important; }
    .footer-text { color:#8A9691 !important; }
    .footer-brand { color:#E5E7EB !important; }
    .em-brand { color:#3DC559 !important; }
    .em-strong { color:#F3F4F6 !important; }
  }
  [data-ogsc] .page-bg { background-color:#0b1512 !important; }
  [data-ogsc] .card { background-color:#12211b !important; }
  [data-ogsc] .t-title { color:#F3F4F6 !important; }
  [data-ogsc] .t-body { color:#C9D2CD !important; }
  [data-ogsc] .t-muted { color:#94A3A0 !important; }
  [data-ogsc] .em-brand { color:#3DC559 !important; }
  [data-ogsc] .em-strong { color:#F3F4F6 !important; }
</style>
</head>
<body style="margin:0; padding:0; background-color:#F4F6F5;">

<div style="display:none; max-height:0; overflow:hidden; font-size:1px; line-height:1px; color:#F4F6F5; opacity:0; mso-hide:all;">
  Seu código para redefinir a senha do CARBO Hub. Expira em 15 minutos.
</div>
<div style="display:none; max-height:0; overflow:hidden; mso-hide:all;">&#8203;&#8203;&#8203;&#8203;&#8203;&#8203;&#8203;&#8203;&#8203;&#8203;&#8203;&#8203;&#8203;&#8203;&#8203;</div>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="page-bg" bgcolor="#F4F6F5" style="background-color:#F4F6F5;">
  <tr>
    <td align="center" style="padding:32px 16px;">

      <!--[if mso]>
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" align="center"><tr><td>
      <![endif]-->

      <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" class="container card" style="width:560px; max-width:560px; background-color:#FFFFFF; border-radius:14px; overflow:hidden; box-shadow:0 1px 3px rgba(15,64,45,0.08);">

        <tr>
          <td style="height:5px; line-height:5px; font-size:5px; background-color:#2FA84F; background:linear-gradient(90deg,#3DC559 0%,#2FA84F 45%,#3B7DD8 100%);">&nbsp;</td>
        </tr>

        <tr>
          <td align="center" bgcolor="#FFFFFF" style="background-color:#FFFFFF; padding:34px 40px 26px 40px;">
            <img src="https://www.carbohub.com.br/email/grupo-carbo.png" alt="Grupo Carbo" width="230" height="63" class="logo-img" style="display:block; border:0; outline:none; text-decoration:none; width:230px; height:63px; max-width:230px;">
          </td>
        </tr>

        <tr class="hairline">
          <td class="px" style="padding:0 40px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr><td style="border-top:1px solid #E5E7EB; font-size:0; line-height:0;">&nbsp;</td></tr>
            </table>
          </td>
        </tr>

        <tr>
          <td class="px" style="padding:32px 40px 8px 40px;">
            <h1 class="t-title" style="margin:0 0 6px 0; font-family:Arial,Helvetica,sans-serif; font-size:22px; line-height:28px; font-weight:700; color:#1F2937;">Redefinição de senha</h1>
            <p class="t-body" style="margin:14px 0 0 0; font-family:Arial,Helvetica,sans-serif; font-size:16px; line-height:24px; color:#1F2937;">Olá, ${fullName} 👋</p>
            <p class="t-body" style="margin:12px 0 0 0; font-family:Arial,Helvetica,sans-serif; font-size:15px; line-height:24px; color:#4B5563;">
              Recebemos uma solicitação para redefinir a senha da sua conta no <strong class="em-brand" style="color:#0F402D;">CARBO Hub</strong>. Use o código abaixo para continuar.
            </p>
          </td>
        </tr>

        <tr>
          <td class="px" style="padding:24px 40px 8px 40px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#0F402D" style="background-color:#0F402D; border-radius:12px;">
              <tr>
                <td align="center" style="padding:26px 20px 28px 20px;">
                  <div style="font-family:Arial,Helvetica,sans-serif; font-size:11px; line-height:16px; font-weight:700; letter-spacing:2px; text-transform:uppercase; color:#3DC559;">Seu código de verificação</div>
                  <div class="code-digits" style="margin-top:12px; font-family:'Courier New',Courier,monospace; font-size:38px; line-height:44px; font-weight:700; letter-spacing:12px; color:#FFFFFF; text-indent:12px;">${code}</div>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <tr>
          <td class="px" style="padding:16px 40px 4px 40px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="note-box" bgcolor="#F4F6F5" style="background-color:#F4F6F5; border-radius:10px;">
              <tr>
                <td style="padding:16px 18px;">
                  <p class="t-muted" style="margin:0; font-family:Arial,Helvetica,sans-serif; font-size:13px; line-height:20px; color:#6B7280;">
                    O código <strong class="em-strong" style="color:#1F2937;">expira em 15 minutos</strong>. Não o compartilhe com ninguém — nossa equipe jamais irá solicitá-lo.
                  </p>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <tr>
          <td class="px" style="padding:16px 40px 4px 40px;">
            <p class="t-muted" style="margin:0; font-family:Arial,Helvetica,sans-serif; font-size:13px; line-height:20px; color:#6B7280;">
              Se você não solicitou esta redefinição, ignore este e-mail com segurança — sua senha continuará a mesma.
            </p>
          </td>
        </tr>

        <tr>
          <td class="px" style="padding:24px 40px 0 40px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr><td style="height:2px; line-height:2px; font-size:2px; background-color:#3B7DD8; background:linear-gradient(90deg,#2FA84F 0%,#3B7DD8 100%); border-radius:2px;">&nbsp;</td></tr>
            </table>
          </td>
        </tr>

        <tr>
          <td class="px" align="center" style="padding:24px 40px 36px 40px; text-align:center;">
            <p class="footer-brand" style="margin:0; font-family:Arial,Helvetica,sans-serif; font-size:15px; line-height:22px; font-weight:700; color:#0F402D; text-align:center;">Grupo Carbo</p>
            <p class="footer-text" style="margin:4px 0 0 0; font-family:Arial,Helvetica,sans-serif; font-size:13px; line-height:20px; color:#6B7280; text-align:center;">o ecossistema que conecta operações com crescimento</p>
            <p class="footer-text" style="margin:18px 0 0 0; font-family:Arial,Helvetica,sans-serif; font-size:12px; line-height:18px; color:#9CA3AF; text-align:center;">Este é um e-mail automático de segurança — por favor, não responda.</p>
            <p class="footer-text" style="margin:8px 0 0 0; font-family:Arial,Helvetica,sans-serif; font-size:12px; line-height:18px; color:#9CA3AF; text-align:center;">© ${YEAR} Grupo Carbo. Todos os direitos reservados.</p>
          </td>
        </tr>

      </table>

      <!--[if mso]>
      </td></tr></table>
      <![endif]-->

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

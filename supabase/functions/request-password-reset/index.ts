import { createClient } from "npm:@supabase/supabase-js@2.39.3";
import { Resend } from "https://esm.sh/resend@4.0.0";

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

    // Send email with code
    if (resendApiKey) {
      const resend = new Resend(resendApiKey);

      await resend.emails.send({
        from: "Carbo OPS <noreply@carbohub.com.br>",
        to: [email],
        subject: `${code} — Código de verificação Carbo OPS`,
        html: `
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <style>
              body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #1a1a2e; margin: 0; padding: 0; }
              .container { max-width: 600px; margin: 0 auto; padding: 40px 20px; }
              .header { background: linear-gradient(135deg, #0f4c75 0%, #1a1a2e 100%); padding: 40px; text-align: center; border-radius: 12px 12px 0 0; }
              .header h1 { color: white; margin: 0; font-size: 24px; }
              .content { background: #ffffff; padding: 40px; border: 1px solid #e5e7eb; border-top: none; }
              .code-box { background: #f8fafc; border: 2px solid #0f4c75; border-radius: 12px; padding: 24px; margin: 24px 0; text-align: center; }
              .code { font-family: 'Courier New', monospace; font-size: 36px; font-weight: bold; letter-spacing: 8px; color: #0f4c75; }
              .footer { background: #f8fafc; padding: 24px 40px; text-align: center; font-size: 14px; color: #64748b; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 12px 12px; }
              .warning { background: #fef3c7; border-left: 4px solid #f59e0b; padding: 12px 16px; margin: 16px 0; font-size: 13px; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h1>Redefinição de Senha</h1>
              </div>
              <div class="content">
                <p>Olá, <strong>${fullName}</strong>!</p>
                <p>Recebemos uma solicitação para redefinir sua senha. Use o código abaixo:</p>
                <div class="code-box">
                  <div class="code">${code}</div>
                </div>
                <div class="warning">
                  <strong>Este código expira em 15 minutos.</strong> Se você não solicitou esta redefinição, ignore este e-mail.
                </div>
                <p style="font-size: 14px; color: #64748b;">
                  Não compartilhe este código com ninguém.
                </p>
              </div>
              <div class="footer">
                <p><strong>Carbo OPS</strong></p>
              </div>
            </div>
          </body>
          </html>
        `,
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

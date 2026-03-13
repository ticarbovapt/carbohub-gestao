import { Resend } from "https://esm.sh/resend@4.0.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

// SECURITY FIX: Restrict CORS to known origins
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
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS, PUT, DELETE",
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type, x-region, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}

interface WelcomeEmailRequest {
  email?: string;
  userId?: string;
  fullName: string;
  username: string;
  setPasswordUrl?: string;
  tempPassword?: string; // Legacy — kept for backward compat
  platformUrl: string;
  managerName?: string;
}

Deno.serve(async (req: Request): Promise<Response> => {
  const corsHeaders = getCorsHeaders(req);

  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    // SECURITY FIX: Require authentication
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing authorization header" }),
        { status: 401, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    const token = authHeader.replace("Bearer ", "");

    // Allow service_role key (internal calls from create-team-member)
    const isServiceRole = token === serviceRoleKey;

    if (!isServiceRole) {
      // Verify the caller is a valid authenticated user with manager/admin role
      const { data: { user: callingUser }, error: authError } = await supabaseAdmin.auth.getUser(token);
      if (authError || !callingUser) {
        return new Response(
          JSON.stringify({ success: false, error: "Unauthorized: Invalid session" }),
          { status: 401, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }

      const { data: roleCheck } = await supabaseAdmin.rpc("is_manager_or_admin", {
        _user_id: callingUser.id,
      });

      if (!roleCheck) {
        return new Response(
          JSON.stringify({ success: false, error: "Unauthorized: Insufficient permissions" }),
          { status: 403, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }
    }

    const {
      email: providedEmail,
      userId,
      fullName,
      username,
      setPasswordUrl,
      tempPassword,
      platformUrl,
      managerName
    }: WelcomeEmailRequest = await req.json();

    let email = providedEmail;

    // If no email provided but userId is, look it up from auth.users
    if (!email && userId) {
      const { data: userData, error: userError } = await supabaseAdmin.auth.admin.getUserById(userId);
      if (userError || !userData?.user?.email) {
        return new Response(
          JSON.stringify({ success: false, error: "Não foi possível encontrar o e-mail do usuário" }),
          { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }
      email = userData.user.email;
    }

    // Validate required fields
    if (!email || !fullName || !username || !platformUrl) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing required fields" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // New flow: invite link (no password) — or legacy flow with temp password
    const useNewFlow = !!setPasswordUrl;

    const credentialsSection = useNewFlow
      ? `
        <div class="credentials">
          <div class="credential-item">
            <span class="credential-label">Seu UserID:</span>
            <span class="credential-value">${username}</span>
          </div>
        </div>
        <div class="warning">
          <strong>Importante:</strong> Anote seu UserID acima. Você usará ele ou seu e-mail para fazer login. Clique no botão abaixo para cadastrar sua senha de acesso.
        </div>
        <center>
          <a href="${setPasswordUrl}" class="cta-button">Cadastrar Minha Senha</a>
        </center>
        <p style="font-size: 13px; color: #94a3b8; margin-top: 16px;">
          Este link é válido por 72 horas. Se expirar, solicite ao seu gestor um novo convite.
        </p>
      `
      : `
        <div class="credentials">
          <div class="credential-item">
            <span class="credential-label">Usuário:</span>
            <span class="credential-value">${username}</span>
          </div>
          <div class="credential-item">
            <span class="credential-label">Senha temporária:</span>
            <span class="credential-value">${tempPassword || "—"}</span>
          </div>
        </div>
        <div class="warning">
          <strong>Importante:</strong> Esta é uma senha temporária. Ao acessar pela primeira vez, você será solicitado a criar uma nova senha.
        </div>
        <center>
          <a href="${platformUrl}" class="cta-button">Acessar a Plataforma</a>
        </center>
      `;

    const emailResponse = await resend.emails.send({
      from: "Carbo OPS <noreply@carbohub.com.br>",
      to: [email],
      subject: useNewFlow ? "Seu acesso ao Carbo OPS — Cadastre sua senha" : "Acesso à Plataforma Carbo OPS",
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <style>
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
              line-height: 1.6;
              color: #1a1a2e;
              margin: 0;
              padding: 0;
            }
            .container {
              max-width: 600px;
              margin: 0 auto;
              padding: 40px 20px;
            }
            .header {
              background: linear-gradient(135deg, #0f4c75 0%, #1a1a2e 100%);
              padding: 40px;
              text-align: center;
              border-radius: 12px 12px 0 0;
            }
            .header h1 {
              color: white;
              margin: 0;
              font-size: 28px;
            }
            .content {
              background: #ffffff;
              padding: 40px;
              border: 1px solid #e5e7eb;
              border-top: none;
            }
            .credentials {
              background: #f8fafc;
              border: 1px solid #e5e7eb;
              border-radius: 8px;
              padding: 24px;
              margin: 24px 0;
            }
            .credential-item {
              display: flex;
              margin-bottom: 12px;
            }
            .credential-label {
              font-weight: 600;
              color: #64748b;
              min-width: 120px;
            }
            .credential-value {
              font-family: 'Courier New', monospace;
              color: #0f4c75;
              font-weight: bold;
              font-size: 18px;
            }
            .cta-button {
              display: inline-block;
              background: linear-gradient(135deg, #0f4c75 0%, #1a1a2e 100%);
              color: white !important;
              padding: 14px 32px;
              text-decoration: none;
              border-radius: 8px;
              font-weight: 600;
              margin: 24px 0;
            }
            .footer {
              background: #f8fafc;
              padding: 24px 40px;
              text-align: center;
              font-size: 14px;
              color: #64748b;
              border: 1px solid #e5e7eb;
              border-top: none;
              border-radius: 0 0 12px 12px;
            }
            .warning {
              background: #fef3c7;
              border-left: 4px solid #f59e0b;
              padding: 16px;
              margin: 16px 0;
              font-size: 14px;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Bem-vindo ao Carbo OPS</h1>
            </div>
            <div class="content">
              <p>Olá, <strong>${fullName}</strong>!</p>

              <p>Seu acesso à plataforma Carbo OPS foi criado${managerName ? ` por ${managerName}` : ''}. Agora você faz parte da nossa operação!</p>

              ${credentialsSection}

              <p style="font-size: 14px; color: #64748b; margin-top: 24px;">
                Se você tiver qualquer dúvida, entre em contato com seu gestor direto.
              </p>
            </div>
            <div class="footer">
              <p><strong>Carbo OPS</strong></p>
              <p>Seu acesso está criado. Agora, personalize e comece a mover a operação.</p>
            </div>
          </div>
        </body>
        </html>
      `,
    });

    if (emailResponse.error) {
      console.error("Failed to send welcome email:", emailResponse.error);
      return new Response(
        JSON.stringify({ success: false, error: emailResponse.error.message || "Falha ao enviar e-mail" }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    console.log("Welcome email sent successfully:", emailResponse);

    return new Response(JSON.stringify({ success: true, data: emailResponse }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error: unknown) {
    console.error("Error in send-welcome-email function:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { "Content-Type": "application/json", ...getCorsHeaders(req) } }
    );
  }
});

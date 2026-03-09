import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "https://esm.sh/resend@4.0.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface WelcomeEmailRequest {
  email?: string;
  userId?: string;
  fullName: string;
  username: string;
  tempPassword: string;
  platformUrl: string;
  managerName?: string;
}

const handler = async (req: Request): Promise<Response> => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { 
      email: providedEmail, 
      userId,
      fullName, 
      username, 
      tempPassword, 
      platformUrl,
      managerName 
    }: WelcomeEmailRequest = await req.json();

    let email = providedEmail;

    // If no email provided but userId is, look it up from auth.users
    if (!email && userId) {
      const supabaseAdmin = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
      );
      const { data: userData, error: userError } = await supabaseAdmin.auth.admin.getUserById(userId);
      if (userError || !userData?.user?.email) {
        throw new Error("Não foi possível encontrar o e-mail do usuário");
      }
      email = userData.user.email;
    }

    // Validate required fields
    if (!email || !fullName || !username || !tempPassword || !platformUrl) {
      throw new Error("Missing required fields");
    }

    const emailResponse = await resend.emails.send({
      from: "Carbo OPS <onboarding@resend.dev>",
      to: [email],
      subject: "🚀 Acesso à Plataforma Carbo OPS",
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
              <p>Olá, <strong>${fullName}</strong>! 👋</p>
              
              <p>Seu acesso à plataforma Carbo OPS foi criado${managerName ? ` por ${managerName}` : ''}. Agora você faz parte da nossa operação!</p>
              
              <div class="credentials">
                <div class="credential-item">
                  <span class="credential-label">Usuário:</span>
                  <span class="credential-value">${username}</span>
                </div>
                <div class="credential-item">
                  <span class="credential-label">Senha temporária:</span>
                  <span class="credential-value">${tempPassword}</span>
                </div>
              </div>
              
              <div class="warning">
                ⚠️ <strong>Importante:</strong> Esta é uma senha temporária. Ao acessar pela primeira vez, você será solicitado a criar uma nova senha.
              </div>
              
              <center>
                <a href="${platformUrl}" class="cta-button">Acessar a Plataforma</a>
              </center>
              
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
      throw new Error(emailResponse.error.message || "Falha ao enviar e-mail de boas-vindas");
    }

    console.log("Welcome email sent successfully:", emailResponse);

    return new Response(JSON.stringify({ success: true, data: emailResponse }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders,
      },
    });
  } catch (error: unknown) {
    console.error("Error in send-welcome-email function:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};

serve(handler);

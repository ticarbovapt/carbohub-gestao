import { createClient } from "npm:@supabase/supabase-js@2.39.3";

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
      "authorization, x-client-info, apikey, content-type",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}

interface CreateLicenseeAccessRequest {
  licenseeId: string;
  email: string;
  fullName: string;
  licenseeCode?: string;   // used as display ID in email
  platformUrl: string;
}

Deno.serve(async (req: Request): Promise<Response> => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    const supabaseUrl      = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const resendApiKey     = Deno.env.get("RESEND_API_KEY");

    if (!supabaseUrl || !supabaseServiceKey) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing Supabase configuration" }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing authorization header" }),
        { status: 401, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
    const token = authHeader.replace("Bearer ", "");

    // Verify calling user is manager or admin
    const { data: { user: callingUser }, error: userError } = await supabaseAdmin.auth.getUser(token);
    if (userError || !callingUser) {
      return new Response(
        JSON.stringify({ success: false, error: "Unauthorized" }),
        { status: 401, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const { data: roleCheck } = await supabaseAdmin.rpc("is_manager_or_admin", {
      _user_id: callingUser.id,
    });
    if (!roleCheck) {
      return new Response(
        JSON.stringify({ success: false, error: "Unauthorized: Only managers and admins can create licensee access" }),
        { status: 403, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const { licenseeId, email, fullName, licenseeCode, platformUrl }: CreateLicenseeAccessRequest
      = await req.json();

    if (!licenseeId || !email || !fullName || !platformUrl) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing required fields: licenseeId, email, fullName, platformUrl" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Check if this licensee already has an access account
    const { data: existing } = await supabaseAdmin
      .from("licensee_users")
      .select("id, user_id")
      .eq("licensee_id", licenseeId)
      .maybeSingle();

    if (existing) {
      return new Response(
        JSON.stringify({ success: false, error: "Este licenciado já possui um acesso criado." }),
        { status: 409, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Random internal password - user will never see this, they set their own via invite link
    const internalPassword = crypto.randomUUID() + "!Aa1";

    // Generate invite token (72h passwordless link)
    const { data: inviteToken, error: tokenError } = await supabaseAdmin.rpc("generate_invite_token");
    if (tokenError || !inviteToken) {
      return new Response(
        JSON.stringify({ success: false, error: "Failed to generate invite token" }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Create Supabase Auth user
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: internalPassword,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    });

    if (authError) {
      // If user already exists with that email, try to fetch the existing user
      if (authError.message?.includes("already")) {
        return new Response(
          JSON.stringify({ success: false, error: `Já existe um usuário com o e-mail ${email}. Verifique o cadastro.` }),
          { status: 409, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }
      return new Response(
        JSON.stringify({ success: false, error: `Erro ao criar usuário: ${authError.message}` }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const newUserId = authData.user.id;
    const inviteTokenExpiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString();

    // Update profiles — no username needed (licensees login with email)
    await supabaseAdmin
      .from("profiles")
      .update({
        password_must_change: true,
        invite_token: inviteToken,
        invite_token_expires_at: inviteTokenExpiresAt,
        status: "approved",
        created_by_manager: callingUser.id,
        allowed_interfaces: ["portal_licenciado"],
      })
      .eq("id", newUserId);

    // Link auth user to licensee
    const { error: linkError } = await supabaseAdmin
      .from("licensee_users")
      .insert({
        licensee_id: licenseeId,
        user_id: newUserId,
        is_primary: true,
        can_order: true,
        can_view_financials: false,
      });

    if (linkError) {
      console.error("Error linking licensee_users:", linkError);
      // Rollback: delete the auth user
      await supabaseAdmin.auth.admin.deleteUser(newUserId);
      return new Response(
        JSON.stringify({ success: false, error: "Erro ao vincular acesso ao licenciado" }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const setPasswordUrl = `${platformUrl}/set-password?token=${inviteToken}`;
    const displayId = licenseeCode || email;
    const hasEmail = !!resendApiKey;
    let emailSent = false;

    if (hasEmail) {
      try {
        const emailResponse = await fetch(`${supabaseUrl}/functions/v1/send-welcome-email`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${supabaseServiceKey}`,
          },
          body: JSON.stringify({
            email,
            fullName,
            username: displayId,   // used as "UserID" in the email template
            setPasswordUrl,
            platformUrl,
          }),
        });
        emailSent = emailResponse.ok;
      } catch (e) {
        console.error("Welcome email failed:", e);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          userId: newUserId,
          email,
          setPasswordUrl,
          emailSent,
          emailWarning: !emailSent ? "E-mail não enviado. Compartilhe o link manualmente." : undefined,
        },
      }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (err: unknown) {
    console.error("create-licensee-access error:", err);
    return new Response(
      JSON.stringify({ success: false, error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: { "Content-Type": "application/json", ...getCorsHeaders(req) } }
    );
  }
});

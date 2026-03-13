import { createClient } from "npm:@supabase/supabase-js@2.39.3";

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

const DEPARTMENT_PREFIXES: Record<string, string> = {
  // Novos departamentos organizacionais
  b2b: "B2B",
  command: "COM",
  expansao: "EXP",
  finance: "FIN",
  growth: "GRO",
  ops: "OPS",
  // Legados (mantidos para compatibilidade)
  venda: "VEN",
  preparacao: "PRE",
  expedicao: "EXP",
  operacao: "OPS",
  pos_venda: "POS",
};

interface CreateMemberRequest {
  email: string;
  fullName: string;
  department: string;
  role: string;
  managerName?: string;
  managerUserId?: string;
  funcao?: string;
  escopo?: string;
  allowedInterfaces?: string[];
  platformUrl: string;
}

Deno.serve(async (req: Request): Promise<Response> => {
  const corsHeaders = getCorsHeaders(req);

  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const resendApiKey = Deno.env.get("RESEND_API_KEY");

    if (!supabaseUrl || !supabaseServiceKey) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing Supabase configuration" }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // RESEND_API_KEY is optional - user will be created even without email
    const hasEmailCapability = !!resendApiKey;
    if (!hasEmailCapability) {
      console.warn("RESEND_API_KEY not configured - welcome emails will not be sent");
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

    const { data: { user: callingUser }, error: userError } = await supabaseAdmin.auth.getUser(token);
    if (userError || !callingUser) {
      return new Response(
        JSON.stringify({ success: false, error: "Unauthorized: Invalid user session" }),
        { status: 401, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const { data: roleCheck } = await supabaseAdmin.rpc("is_manager_or_admin", {
      _user_id: callingUser.id,
    });

    if (!roleCheck) {
      return new Response(
        JSON.stringify({ success: false, error: "Unauthorized: Only managers and admins can create team members" }),
        { status: 403, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const {
      email,
      fullName,
      department,
      role,
      managerName,
      managerUserId,
      funcao,
      escopo,
      allowedInterfaces,
      platformUrl,
    }: CreateMemberRequest = await req.json();

    if (!email || !fullName || !department || !role || !platformUrl) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing required fields: email, fullName, department, role, platformUrl" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const deptPrefix = DEPARTMENT_PREFIXES[department];
    if (!deptPrefix) {
      return new Response(
        JSON.stringify({ success: false, error: `Invalid department: ${department}` }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const { data: username, error: usernameError } = await supabaseAdmin.rpc("generate_username", {
      dept_prefix: deptPrefix,
    });

    if (usernameError || !username) {
      console.error("Username generation error:", usernameError);
      return new Response(
        JSON.stringify({ success: false, error: "Failed to generate username" }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Generate a random internal password (user never sees this)
    const internalPassword = crypto.randomUUID() + "!Aa1";

    // Generate invite token for passwordless first-access link
    const { data: inviteToken, error: tokenError } = await supabaseAdmin.rpc("generate_invite_token");

    if (tokenError || !inviteToken) {
      console.error("Invite token generation error:", tokenError);
      return new Response(
        JSON.stringify({ success: false, error: "Failed to generate invite token" }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: internalPassword,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    });

    if (authError) {
      return new Response(
        JSON.stringify({ success: false, error: `Failed to create user: ${authError.message}` }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const newUserId = authData.user.id;

    const inviteTokenExpiresAt = new Date();
    inviteTokenExpiresAt.setHours(inviteTokenExpiresAt.getHours() + 72); // 72h to set password

    const { error: profileError } = await supabaseAdmin
      .from("profiles")
      .update({
        username,
        department,
        password_must_change: true,
        created_by_manager: callingUser.id,
        status: "approved",
        invite_token: inviteToken,
        invite_token_expires_at: inviteTokenExpiresAt.toISOString(),
        manager_user_id: managerUserId || callingUser.id,
        funcao: funcao || null,
        escopo: escopo || null,
        allowed_interfaces: allowedInterfaces || [],
      })
      .eq("id", newUserId);

    if (profileError) {
      console.error("Profile update error:", profileError);
    }

    const { error: roleError } = await supabaseAdmin
      .from("user_roles")
      .update({ role })
      .eq("user_id", newUserId);

    if (roleError) {
      console.error("Role update error:", roleError);
    }

    // Build the invite link
    const setPasswordUrl = `${platformUrl}/set-password?token=${inviteToken}`;

    // Send welcome email (only if RESEND_API_KEY is configured)
    let emailSent = false;
    if (hasEmailCapability) {
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
            username,
            setPasswordUrl,
            platformUrl,
            managerName,
          }),
        });
        const emailResult = await emailResponse.json();
        emailSent = emailResponse.ok;
        if (!emailSent) {
          console.error("Welcome email failed:", emailResult);
        }
      } catch (emailError) {
        console.error("Failed to send welcome email:", emailError);
      }
    }

    const responseData: Record<string, unknown> = {
      userId: newUserId,
      username,
      email,
      emailSent,
      setPasswordUrl,
    };

    // If email was NOT sent, include the invite link so manager can share manually
    if (!emailSent) {
      responseData.emailWarning = "E-mail não enviado. Compartilhe o link de acesso manualmente.";
    }

    return new Response(
      JSON.stringify({ success: true, data: responseData }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (error: unknown) {
    console.error("Error in create-team-member function:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { "Content-Type": "application/json", ...getCorsHeaders(req) } }
    );
  }
});

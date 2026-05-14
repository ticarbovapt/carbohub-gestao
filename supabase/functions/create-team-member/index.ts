import { createClient } from "npm:@supabase/supabase-js@2.39.3";

// SECURITY FIX: Restrict CORS to known origins
const ALLOWED_ORIGINS = [
  "https://controle.carbohub.com.br",
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
  b2b:        "B2B",
  command:    "COM",
  expansao:   "EXP",
  finance:    "FIN",
  growth:     "GRO",
  ops:        "OPS",
  // Legados (mantidos para compatibilidade)
  venda:      "VEN",
  preparacao: "PRE",
  expedicao:  "EXP",
  operacao:   "OPS",
  pos_venda:  "POS",
};

interface CreateMemberRequest {
  fullName: string;
  department: string;
  role: string;
  funcao?: string;
  escopo?: string;
  hierarchyLevel?: number;
  managerUserId?: string;
  allowedInterfaces?: string[];
  platformUrl: string;
}

const DEFAULT_PASSWORD = "Carbo@2026";

Deno.serve(async (req: Request): Promise<Response> => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

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

    const { data: { user: callingUser }, error: userError } = await supabaseAdmin.auth.getUser(token);
    if (userError || !callingUser) {
      return new Response(
        JSON.stringify({ success: false, error: "Unauthorized: Invalid user session" }),
        { status: 401, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Only admins can create team members
    const { data: isAdmin } = await supabaseAdmin.rpc("is_admin", {
      _user_id: callingUser.id,
    });

    if (!isAdmin) {
      return new Response(
        JSON.stringify({ success: false, error: "Unauthorized: Only admins can create team members" }),
        { status: 403, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const body = await req.json();

    // ── Reset-password action ─────────────────────────────────────────────────
    if (body.action === "reset_password") {
      const { userId } = body;
      if (!userId) {
        return new Response(
          JSON.stringify({ success: false, error: "Missing userId" }),
          { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }
      const { error: resetError } = await supabaseAdmin.auth.admin.updateUserById(userId, {
        password: DEFAULT_PASSWORD,
      });
      if (resetError) {
        return new Response(
          JSON.stringify({ success: false, error: resetError.message }),
          { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }
      return new Response(
        JSON.stringify({ success: true, message: `Senha redefinida para ${DEFAULT_PASSWORD}` }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }
    // ─────────────────────────────────────────────────────────────────────────

    const {
      fullName,
      department,
      role,
      funcao,
      escopo,
      hierarchyLevel,
      managerUserId,
      allowedInterfaces,
    } = body as CreateMemberRequest;

    if (!fullName || !department || !role) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing required fields: fullName, department, role" }),
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

    // Generate username (e.g. OPS0001)
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

    // Use internal placeholder email — user sets real email on first login
    const placeholderEmail = `${(username as string).toLowerCase()}@carbo.internal`;

    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: placeholderEmail,
      password: DEFAULT_PASSWORD,
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

    const { error: profileError } = await supabaseAdmin
      .from("profiles")
      .update({
        email:             placeholderEmail,
        username:          username,
        department:        department,
        password_must_change: true,
        created_by_manager: callingUser.id,
        status:            "approved",
        manager_user_id:   managerUserId || callingUser.id,
        funcao:            funcao || null,
        escopo:            escopo || null,
        hierarchy_level:   hierarchyLevel ?? 6,
        allowed_interfaces: allowedInterfaces || ["carbo_ops"],
      })
      .eq("id", newUserId);

    if (profileError) {
      console.error("Profile update error:", profileError);
    }

    // Link org_chart_node to this auth user by exact name match
    await supabaseAdmin
      .from("org_chart_nodes")
      .update({ user_id: newUserId, email: placeholderEmail })
      .eq("full_name", fullName)
      .is("user_id", null);

    // Set user role
    const { error: roleError } = await supabaseAdmin
      .from("user_roles")
      .update({ role })
      .eq("user_id", newUserId);

    if (roleError) {
      console.error("Role update error:", roleError);
    }

    return new Response(
      JSON.stringify({ success: true, data: { userId: newUserId, username } }),
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

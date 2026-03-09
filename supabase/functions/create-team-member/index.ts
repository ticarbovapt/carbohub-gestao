import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

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

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const resendApiKey = Deno.env.get("RESEND_API_KEY");

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error("Missing Supabase configuration");
    }

    if (!resendApiKey) {
      throw new Error("RESEND_API_KEY is not configured");
    }

    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      throw new Error("Missing authorization header");
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
    const token = authHeader.replace("Bearer ", "");

    const { data: { user: callingUser }, error: userError } = await supabaseAdmin.auth.getUser(token);
    if (userError || !callingUser) {
      throw new Error("Unauthorized: Invalid user session");
    }

    const { data: roleCheck } = await supabaseAdmin.rpc("is_manager_or_admin", {
      _user_id: callingUser.id,
    });

    if (!roleCheck) {
      throw new Error("Unauthorized: Only managers and admins can create team members");
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
      throw new Error("Missing required fields: email, fullName, department, role, platformUrl");
    }

    const deptPrefix = DEPARTMENT_PREFIXES[department];
    if (!deptPrefix) {
      throw new Error(`Invalid department: ${department}`);
    }

    const { data: username, error: usernameError } = await supabaseAdmin.rpc("generate_username", {
      dept_prefix: deptPrefix,
    });

    if (usernameError || !username) {
      throw new Error("Failed to generate username");
    }

    const { data: tempPassword, error: passwordError } = await supabaseAdmin.rpc("generate_temp_password");

    if (passwordError || !tempPassword) {
      throw new Error("Failed to generate temporary password");
    }

    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: tempPassword,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    });

    if (authError) {
      throw new Error(`Failed to create user: ${authError.message}`);
    }

    const newUserId = authData.user.id;

    const tempPasswordExpiresAt = new Date();
    tempPasswordExpiresAt.setHours(tempPasswordExpiresAt.getHours() + 24);

    const { error: profileError } = await supabaseAdmin
      .from("profiles")
      .update({
        username,
        department,
        password_must_change: true,
        created_by_manager: callingUser.id,
        status: "approved",
        temp_password_sent_at: new Date().toISOString(),
        temp_password_expires_at: tempPasswordExpiresAt.toISOString(),
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

    // Send welcome email
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
        tempPassword,
        platformUrl,
        managerName,
      }),
    });

    const emailResult = await emailResponse.json();

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          userId: newUserId,
          username,
          email,
          tempPassword,
          emailSent: emailResponse.ok,
        },
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  } catch (error: unknown) {
    console.error("Error in create-team-member function:", error);
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

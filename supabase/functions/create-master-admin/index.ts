import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Generate a secure random temporary password
function generateSecurePassword(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  const specials = "!@#$%&*";
  let password = "Carbo#";
  const array = new Uint8Array(8);
  crypto.getRandomValues(array);
  for (let i = 0; i < 6; i++) {
    password += chars[array[i] % chars.length];
  }
  password += specials[array[6] % specials.length];
  password += array[7] % 10;
  return password;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    // === AUTH: Require JWT + RBAC ===
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabaseClient.auth.getClaims(token);
    
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const callerId = claimsData.claims.sub as string;

    // Check caller is admin + ceo (MasterAdmin)
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const { data: callerRoles } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", callerId);

    const { data: callerCarboRoles } = await supabaseAdmin
      .from("carbo_user_roles")
      .select("role")
      .eq("user_id", callerId);

    const isCallerAdmin = callerRoles?.some((r) => r.role === "admin");
    const isCallerCeo = callerCarboRoles?.some((r) => r.role === "ceo");

    if (!isCallerAdmin || !isCallerCeo) {
      return new Response(JSON.stringify({ error: "Forbidden: requires MasterAdmin privileges" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // === INPUT VALIDATION ===
    const { email, username, full_name, department, role } = await req.json();

    if (!email || typeof email !== "string" || !email.includes("@")) {
      return new Response(JSON.stringify({ error: "Valid email is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!username || typeof username !== "string" || username.length < 3 || username.length > 30) {
      return new Response(JSON.stringify({ error: "Username (3-30 chars) is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const safeName = full_name?.substring(0, 200) || username;
    const safeDept = department || "command";
    const safeRole = role || "MasterAdmin";
    const safeUsername = username.toLowerCase().trim();

    // Generate secure temp password server-side
    const tempPassword = generateSecurePassword();

    // Check if user already exists
    const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers();
    const existingUser = existingUsers?.users?.find(
      (u) => u.email === email.toLowerCase()
    );

    let authUserId: string;

    if (existingUser) {
      authUserId = existingUser.id;
      await supabaseAdmin.auth.admin.updateUserById(authUserId, {
        password: tempPassword,
        email_confirm: true,
      });
    } else {
      const { data: newUser, error: createError } =
        await supabaseAdmin.auth.admin.createUser({
          email: email.toLowerCase(),
          password: tempPassword,
          email_confirm: true,
          user_metadata: { full_name: safeName, username: safeUsername },
        });

      if (createError) {
        throw new Error(`Failed to create auth user: ${createError.message}`);
      }
      authUserId = newUser.user!.id;
    }

    // Upsert profile
    const { error: profileError } = await supabaseAdmin
      .from("profiles")
      .upsert(
        {
          id: authUserId,
          full_name: safeName,
          department: safeDept,
          requested_role: safeRole,
          username: safeUsername,
          password_must_change: true,
          funcao: "controle total",
          status: "approved",
        },
        { onConflict: "id" }
      );

    if (profileError) {
      throw new Error(`Failed to upsert profile: ${profileError.message}`);
    }

    // Ensure admin role (legacy)
    await supabaseAdmin.from("user_roles").upsert(
      { user_id: authUserId, role: "admin" },
      { onConflict: "user_id,role" }
    );

    // Ensure ceo role (carbo)
    await supabaseAdmin.from("carbo_user_roles").upsert(
      {
        user_id: authUserId,
        role: "ceo",
        scope_departments: [],
        scope_macro_flows: [],
      },
      { onConflict: "user_id,role" }
    );

    // Audit log
    await supabaseAdmin.from("governance_audit_log").insert({
      user_id: callerId,
      action_type: "master_admin_created",
      resource_type: "profile",
      resource_id: authUserId,
      details: {
        target_username: safeUsername,
        target_role: safeRole,
        created_by: callerId,
      },
    });

    // NOTE: temp password is NOT returned in the response for security.
    // It should be communicated via a secure external channel.
    // For the initial bootstrap, we log it server-side only.
    console.log(`[BOOTSTRAP] Temp password for ${safeUsername} generated. Deliver securely.`);

    return new Response(
      JSON.stringify({
        success: true,
        user_id: authUserId,
        username: safeUsername,
        message: "Conta criada. Senha temporária gerada — entregue por canal seguro.",
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    console.error("Error creating master admin:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

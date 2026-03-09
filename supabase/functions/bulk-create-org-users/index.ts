import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const REGRA_TO_APP_ROLE: Record<string, string> = {
  admin: "admin",
  gestor: "manager",
  operacional: "operator",
};

interface OrgUser {
  departamento: string;
  funcao: string;
  regra: string;
  nome: string;
  email?: string;
  escopo: string;
  responde_a?: string;
  interfaces_principais: string[];
  login: string;
  senha: string;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");

    if (!supabaseUrl || !supabaseServiceKey || !supabaseAnonKey) {
      throw new Error("Missing Supabase configuration");
    }

    // ── Authentication ────────────────────────────────────────────────────────
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing or invalid authorization header" }),
        { status: 401, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const token = authHeader.replace("Bearer ", "");

    // Validate JWT using the anon client (respects signing keys)
    const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser(token);
    if (authError || !user) {
      return new Response(
        JSON.stringify({ success: false, error: "Unauthorized: invalid token" }),
        { status: 401, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // ── Authorization ─────────────────────────────────────────────────────────
    // Only Admin or CEO can bulk-create/delete users
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    const [{ data: isAdmin }, { data: isCeo }] = await Promise.all([
      supabaseAdmin.rpc("is_admin", { _user_id: user.id }),
      supabaseAdmin.rpc("is_ceo",   { _user_id: user.id }),
    ]);

    if (!isAdmin && !isCeo) {
      return new Response(
        JSON.stringify({ success: false, error: "Forbidden: only Admin or CEO can perform this operation" }),
        { status: 403, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }
    // ─────────────────────────────────────────────────────────────────────────

    const { users, sync, delete_ids }: { users: OrgUser[]; sync?: boolean; delete_ids?: string[] } = await req.json();

    // Handle explicit deletions
    if (delete_ids && delete_ids.length > 0) {
      const deleteResults = [];
      for (const uid of delete_ids) {
        const { error } = await supabaseAdmin.auth.admin.deleteUser(uid);
        deleteResults.push({ id: uid, success: !error, error: error?.message });
      }
      if (!users || users.length === 0) {
        return new Response(JSON.stringify({ success: true, deleted: deleteResults }), {
          status: 200, headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }
    }

    if (!users || !Array.isArray(users) || users.length === 0) {
      throw new Error("No users provided");
    }

    const results: Array<{ nome: string; login: string; success: boolean; action?: string; error?: string }> = [];
    const createdUsers: Record<string, string> = {}; // nome -> user_id

    // If sync mode, delete users not in the new list
    if (sync) {
      const newUsernames = new Set(users.map(u => u.login.toLowerCase()));

      // Get all existing profiles with usernames
      const { data: existingProfiles } = await supabaseAdmin
        .from("profiles")
        .select("id, username, full_name")
        .not("username", "is", null);

      if (existingProfiles) {
        for (const profile of existingProfiles) {
          if (profile.username && !newUsernames.has(profile.username.toLowerCase())) {
            // Delete auth user (cascades to profile)
            const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(profile.id);
            if (deleteError) {
              console.error(`Failed to delete user ${profile.username}: ${deleteError.message}`);
            } else {
              console.log(`Deleted user ${profile.username} (${profile.full_name})`);
            }
          }
        }
      }
    }

    // Create or update users
    for (const u of users) {
      try {
        const dept = u.departamento.toLowerCase();
        const login = u.login.toLowerCase();
        // Use provided password or generate a secure one
        let password = u.senha;
        if (!password) {
          const { data: generatedPwd } = await supabaseAdmin.rpc('generate_temp_password');
          password = generatedPwd || `Carbo#${crypto.randomUUID().slice(0, 8)}`;
        }

        // Generate email if not provided
        const email = u.email || `${login}@carbo.internal`;

        // Check if user already exists by username
        const { data: existingProfile } = await supabaseAdmin
          .from("profiles")
          .select("id, username")
          .ilike("username", login)
          .maybeSingle();

        let userId: string;

        if (existingProfile) {
          // User exists - update password and profile
          userId = existingProfile.id;

          // Update password
          await supabaseAdmin.auth.admin.updateUserById(userId, { password });

          // Update profile
          await supabaseAdmin.from("profiles").update({
            full_name: u.nome,
            username: login,
            department: dept,
            password_must_change: true,
            status: "approved",
            funcao: u.funcao,
            escopo: u.escopo,
            allowed_interfaces: u.interfaces_principais,
            temp_password_sent_at: new Date().toISOString(),
            temp_password_expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          }).eq("id", userId);

          createdUsers[u.nome] = userId;
          results.push({ nome: u.nome, login, success: true, action: "updated" });
        } else {
          // Create new user
          const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
            email,
            password,
            email_confirm: true,
            user_metadata: { full_name: u.nome },
          });

          if (authError) {
            // If email conflict, try finding user by email
            if (authError.message.includes("already been registered")) {
              const { data: listData } = await supabaseAdmin.auth.admin.listUsers();
              const existingByEmail = listData?.users?.find(eu => eu.email === email);
              if (existingByEmail) {
                userId = existingByEmail.id;
                await supabaseAdmin.auth.admin.updateUserById(userId, { password });
                await supabaseAdmin.from("profiles").update({
                  full_name: u.nome,
                  username: login,
                  department: dept,
                  password_must_change: true,
                  status: "approved",
                  funcao: u.funcao,
                  escopo: u.escopo,
                  allowed_interfaces: u.interfaces_principais,
                  temp_password_sent_at: new Date().toISOString(),
                  temp_password_expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
                }).eq("id", userId);
                createdUsers[u.nome] = userId;
                results.push({ nome: u.nome, login, success: true, action: "updated_by_email" });
                continue;
              }
            }
            results.push({ nome: u.nome, login, success: false, error: authError.message });
            continue;
          }

          userId = authData.user.id;
          createdUsers[u.nome] = userId;

          // Update profile
          await supabaseAdmin.from("profiles").update({
            full_name: u.nome,
            username: login,
            department: dept,
            password_must_change: true,
            status: "approved",
            funcao: u.funcao,
            escopo: u.escopo,
            allowed_interfaces: u.interfaces_principais,
                   temp_password_sent_at: new Date().toISOString(),
                   temp_password_expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
                 }).eq("id", userId);

          // Set app_role
          const regra = u.regra.toLowerCase();
          const appRole = REGRA_TO_APP_ROLE[regra] || "operator";
          await supabaseAdmin.from("user_roles").update({ role: appRole }).eq("user_id", userId);

          // Set carbo_role
          let carboRole = "operador";
          if (regra === "admin" && dept === "command") {
            carboRole = "ceo";
          } else if (regra === "admin") {
            carboRole = "gestor_adm";
          } else if (regra === "gestor") {
            if (dept === "finance") carboRole = "gestor_fin";
            else if (dept === "ops" || dept === "expansao") carboRole = "gestor_adm";
            else carboRole = "gestor_adm";
          }

          // Remove old carbo roles then insert
          await supabaseAdmin.from("carbo_user_roles").delete().eq("user_id", userId);
          await supabaseAdmin.from("carbo_user_roles").insert({
            user_id: userId,
            role: carboRole,
            scope_departments: [dept],
          });

          results.push({ nome: u.nome, login, success: true, action: "created" });
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Unknown error";
        results.push({ nome: u.nome, login: u.login, success: false, error: msg });
      }
    }

    // Second pass: resolve manager references
    for (const u of users) {
      if (u.responde_a && createdUsers[u.nome]) {
        // Try exact match first, then partial
        let managerId = createdUsers[u.responde_a];
        if (!managerId) {
          // Try matching by first name
          const managerName = Object.keys(createdUsers).find(name =>
            name.toLowerCase().startsWith(u.responde_a!.toLowerCase()) ||
            u.responde_a!.toLowerCase().startsWith(name.split(" ")[0].toLowerCase())
          );
          if (managerName) managerId = createdUsers[managerName];
        }
        if (managerId) {
          await supabaseAdmin.from("profiles").update({
            manager_user_id: managerId,
          }).eq("id", createdUsers[u.nome]);
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        total: users.length,
        created: results.filter(r => r.action === "created").length,
        updated: results.filter(r => r.action?.startsWith("updated")).length,
        failed: results.filter(r => !r.success).length,
        results,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  } catch (error: unknown) {
    console.error("Error in bulk-create-org-users:", error);
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

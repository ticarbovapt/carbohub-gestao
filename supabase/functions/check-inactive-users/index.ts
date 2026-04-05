import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") ?? "https://carbohub.com.br",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();
  let userId: string | null = null;
  let success = true;
  let errorMessage: string | null = null;

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Verify authentication
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Missing or invalid authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create client with user's auth to verify token
    const authClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await authClient.auth.getClaims(token);
    
    if (claimsError || !claimsData?.claims) {
      return new Response(
        JSON.stringify({ error: "Invalid or expired token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    userId = claimsData.claims.sub as string;

    // Create service client for admin operations
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Verify user is admin or manager
    const { data: userRole, error: roleError } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .in("role", ["admin", "manager"])
      .limit(1)
      .single();

    if (roleError || !userRole) {
      return new Response(
        JSON.stringify({ error: "Unauthorized: Admin or manager role required" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Calculate date 3 days ago
    const threeDaysAgo = new Date();
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

    // Find users who:
    // 1. Were created by a manager
    // 2. Haven't accessed the platform (last_access is null or password_must_change is still true)
    // 3. Were created more than 3 days ago
    // 4. Haven't already been notified (we'll track this)
    const { data: inactiveUsers, error: fetchError } = await supabase
      .from("profiles")
      .select(`
        id,
        full_name,
        username,
        created_by_manager,
        created_at,
        last_access,
        password_must_change,
        temp_password_sent_at
      `)
      .not("created_by_manager", "is", null)
      .eq("password_must_change", true)
      .lt("created_at", threeDaysAgo.toISOString());

    if (fetchError) {
      throw new Error(`Error fetching inactive users: ${fetchError.message}`);
    }

    console.log(`Found ${inactiveUsers?.length || 0} inactive users`);

    if (!inactiveUsers || inactiveUsers.length === 0) {
      // Log audit entry for successful execution with no results
      await supabase.from("audit_logs").insert({
        action_type: "edge_function",
        action_name: "check-inactive-users",
        executed_by: userId,
        details: { inactive_users_found: 0, notifications_sent: 0 },
        ip_address: req.headers.get("x-forwarded-for") || req.headers.get("cf-connecting-ip"),
        user_agent: req.headers.get("user-agent"),
        success: true,
      });

      return new Response(
        JSON.stringify({ message: "No inactive users found", count: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Group inactive users by manager
    const usersByManager: Record<string, typeof inactiveUsers> = {};
    for (const user of inactiveUsers) {
      const managerId = user.created_by_manager;
      if (!usersByManager[managerId]) {
        usersByManager[managerId] = [];
      }
      usersByManager[managerId].push(user);
    }

    // Get manager profiles to send notifications
    const managerIds = Object.keys(usersByManager);
    const { data: managers, error: managersError } = await supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", managerIds);

    if (managersError) {
      throw new Error(`Error fetching managers: ${managersError.message}`);
    }

    const notificationsSent: string[] = [];

    // Create notifications for each manager
    for (const manager of managers || []) {
      const inactiveTeamMembers = usersByManager[manager.id];
      
      for (const member of inactiveTeamMembers) {
        // Check if we already sent a notification for this user in the last 24 hours
        const { data: existingNotification } = await supabase
          .from("notifications")
          .select("id")
          .eq("user_id", manager.id)
          .eq("reference_id", member.id)
          .eq("type", "inactivity_alert")
          .gte("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
          .single();

        if (existingNotification) {
          console.log(`Notification already sent for user ${member.id} to manager ${manager.id}`);
          continue;
        }

        // Create notification
        const daysSinceCreation = Math.floor(
          (Date.now() - new Date(member.created_at).getTime()) / (1000 * 60 * 60 * 24)
        );

        const { error: notificationError } = await supabase
          .from("notifications")
          .insert({
            user_id: manager.id,
            title: "Colaborador não acessou a plataforma",
            body: `${member.full_name || member.username} não realizou o primeiro acesso há ${daysSinceCreation} dias. Considere reenviar o e-mail de boas-vindas.`,
            type: "inactivity_alert",
            reference_id: member.id,
            reference_type: "profile",
          });

        if (notificationError) {
          console.error(`Error creating notification: ${notificationError.message}`);
        } else {
          notificationsSent.push(member.id);
          console.log(`Notification sent for user ${member.id} to manager ${manager.id}`);
        }
      }
    }

    const executionTime = Date.now() - startTime;

    // Log audit entry
    await supabase.from("audit_logs").insert({
      action_type: "edge_function",
      action_name: "check-inactive-users",
      executed_by: userId,
      details: {
        inactive_users_found: inactiveUsers.length,
        notifications_sent: notificationsSent.length,
        execution_time_ms: executionTime,
        managers_notified: managerIds.length,
      },
      ip_address: req.headers.get("x-forwarded-for") || req.headers.get("cf-connecting-ip"),
      user_agent: req.headers.get("user-agent"),
      success: true,
    });

    return new Response(
      JSON.stringify({
        message: "Inactivity check completed",
        inactiveUsersCount: inactiveUsers.length,
        notificationsSent: notificationsSent.length,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    success = false;
    errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("Error in check-inactive-users:", error);

    // Log failed audit entry
    try {
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const supabase = createClient(supabaseUrl, supabaseServiceKey);

      await supabase.from("audit_logs").insert({
        action_type: "edge_function",
        action_name: "check-inactive-users",
        executed_by: userId,
        details: { execution_time_ms: Date.now() - startTime },
        ip_address: req.headers.get("x-forwarded-for") || req.headers.get("cf-connecting-ip"),
        user_agent: req.headers.get("user-agent"),
        success: false,
        error_message: errorMessage,
      });
    } catch (auditError) {
      console.error("Failed to log audit entry:", auditError);
    }

    return new Response(
      JSON.stringify({ error: errorMessage }),
      { 
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      }
    );
  }
});

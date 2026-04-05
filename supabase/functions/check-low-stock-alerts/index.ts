import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.93.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") ?? "https://carbohub.com.br",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface LowStockMachine {
  id: string;
  machine_id: string;
  model: string;
  capacity: number;
  units_since_last_refill: number;
  low_stock_threshold: number;
  has_active_alert: boolean;
  licensee: {
    name: string;
    code: string;
  } | null;
}

interface MachineRow {
  id: string;
  machine_id: string;
  model: string;
  capacity: number;
  units_since_last_refill: number;
  low_stock_threshold: number;
  has_active_alert: boolean;
  licensee: { name: string; code: string } | null;
}

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

    // Get all operational machines with their stock levels
    const { data: machines, error: machinesError } = await supabase
      .from("machines")
      .select(`
        id,
        machine_id,
        model,
        capacity,
        units_since_last_refill,
        low_stock_threshold,
        has_active_alert,
        licensee:licensees(name, code)
      `)
      .eq("status", "operational");

    if (machinesError) {
      throw machinesError;
    }

    // Filter machines with low stock
    const machineData = machines as unknown as MachineRow[];
    const lowStockMachines = machineData.filter((m) => {
      const currentStock = m.capacity - m.units_since_last_refill;
      return currentStock <= m.low_stock_threshold;
    });

    // Get all managers to notify
    const { data: managers, error: managersError } = await supabase
      .from("user_roles")
      .select("user_id")
      .in("role", ["admin", "manager"]);

    if (managersError) {
      throw managersError;
    }

    const notifications: {
      user_id: string;
      type: string;
      title: string;
      body: string;
      reference_type: string;
      reference_id: string;
    }[] = [];

    // Create notifications for each low stock machine
    for (const machine of lowStockMachines) {
      // Skip if alert already exists
      if (machine.has_active_alert) continue;

      const stockPercentage = Math.round(
        ((machine.capacity - machine.units_since_last_refill) / machine.capacity) * 100
      );

      // Update machine to mark as having active alert
      await supabase
        .from("machines")
        .update({
          has_active_alert: true,
          last_alert_at: new Date().toISOString(),
          last_alert_message: `Estoque baixo (${stockPercentage}%)`,
        })
        .eq("id", machine.id);

      // Create notifications for all managers
      for (const manager of managers || []) {
        // Check if notification already exists
        const { data: existing } = await supabase
          .from("notifications")
          .select("id")
          .eq("user_id", manager.user_id)
          .eq("reference_type", "machine_low_stock")
          .eq("reference_id", machine.id)
          .eq("is_read", false)
          .limit(1);

        if (existing && existing.length > 0) continue;

        notifications.push({
          user_id: manager.user_id,
          type: "low_stock_alert",
          title: `⚠️ Estoque baixo: ${machine.machine_id}`,
          body: `A máquina ${machine.model} (${machine.machine_id}) está com ${stockPercentage}% de estoque. ${
            machine.licensee ? `Licenciado: ${machine.licensee.name}` : ""
          }`,
          reference_type: "machine_low_stock",
          reference_id: machine.id,
        });
      }
    }

    // Insert all notifications at once
    if (notifications.length > 0) {
      const { error: notifError } = await supabase
        .from("notifications")
        .insert(notifications);

      if (notifError) {
        console.error("Error creating notifications:", notifError);
      }
    }

    const executionTime = Date.now() - startTime;

    // Log audit entry
    await supabase.from("audit_logs").insert({
      action_type: "edge_function",
      action_name: "check-low-stock-alerts",
      executed_by: userId,
      details: {
        machines_checked: machineData.length,
        low_stock_count: lowStockMachines.length,
        notifications_created: notifications.length,
        execution_time_ms: executionTime,
      },
      ip_address: req.headers.get("x-forwarded-for") || req.headers.get("cf-connecting-ip"),
      user_agent: req.headers.get("user-agent"),
      success: true,
    });

    return new Response(
      JSON.stringify({
        success: true,
        lowStockCount: lowStockMachines.length,
        notificationsCreated: notifications.length,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error: unknown) {
    success = false;
    errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("Error checking low stock alerts:", errorMessage);

    // Log failed audit entry
    try {
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const supabase = createClient(supabaseUrl, supabaseServiceKey);

      await supabase.from("audit_logs").insert({
        action_type: "edge_function",
        action_name: "check-low-stock-alerts",
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
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});

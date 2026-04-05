import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") ?? "https://carbohub.com.br",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface GamificationRequest {
  licenseeId?: string;
  periodYear?: number;
  periodMonth?: number;
  calculateAll?: boolean;
}

// KPI Weights as per specification
const KPI_WEIGHTS = {
  orderVolume: 0.25,        // 25%
  customerRecurrence: 0.30, // 30%
  growth: 0.20,             // 20%
  sla: 0.15,                // 15%
  platformUsage: 0.10,      // 10%
};

function calculateLevel(score: number): "bronze" | "prata" | "ouro" | "diamante" {
  if (score >= 90) return "diamante";
  if (score >= 70) return "ouro";
  if (score >= 50) return "prata";
  return "bronze";
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Validate authorization - only allow calls with valid Authorization header
    // This function should only be called by internal cron jobs or admin users
    const authHeader = req.headers.get("authorization");
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    
    // Check if the request has a valid authorization header
    // Allow calls from cron jobs (using anon key) or service role
    if (!authHeader) {
      console.error("Missing authorization header");
      return new Response(
        JSON.stringify({ error: "Unauthorized - missing authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    const token = authHeader.replace("Bearer ", "");
    
    // Validate the token is either the anon key (from cron) or a valid JWT
    if (token !== supabaseAnonKey) {
      // If not anon key, verify it's a valid JWT from an admin/manager
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const authClient = createClient(supabaseUrl, supabaseAnonKey!, {
        global: { headers: { Authorization: authHeader } }
      });
      
      const { data: claims, error: claimsError } = await authClient.auth.getClaims(token);
      
      if (claimsError || !claims?.claims?.sub) {
        console.error("Invalid JWT token:", claimsError?.message);
        return new Response(
          JSON.stringify({ error: "Unauthorized - invalid token" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      // Verify user is admin or manager
      const { data: userRoles } = await authClient
        .from("user_roles")
        .select("role")
        .eq("user_id", claims.claims.sub);
      
      const isAuthorized = userRoles?.some(r => 
        ["admin", "manager"].includes(r.role)
      );
      
      if (!isAuthorized) {
        console.error("User not authorized to trigger gamification calculation");
        return new Response(
          JSON.stringify({ error: "Forbidden - insufficient permissions" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body: GamificationRequest = await req.json().catch(() => ({}));
    
    const now = new Date();
    const periodYear = body.periodYear || now.getFullYear();
    const periodMonth = body.periodMonth || now.getMonth() + 1;
    
    // Get date range for the period
    const periodStart = new Date(periodYear, periodMonth - 1, 1);
    const periodEnd = new Date(periodYear, periodMonth, 0, 23, 59, 59);
    
    // Previous month for growth calculation
    const prevMonth = periodMonth === 1 ? 12 : periodMonth - 1;
    const prevYear = periodMonth === 1 ? periodYear - 1 : periodYear;
    const prevStart = new Date(prevYear, prevMonth - 1, 1);
    const prevEnd = new Date(prevYear, prevMonth, 0, 23, 59, 59);

    // Determine which licensees to calculate
    let licenseeIds: string[] = [];
    
    if (body.licenseeId) {
      licenseeIds = [body.licenseeId];
    } else if (body.calculateAll) {
      const { data: licensees } = await supabase
        .from("licensees")
        .select("id")
        .eq("status", "active");
      licenseeIds = licensees?.map(l => l.id) || [];
    } else {
      return new Response(
        JSON.stringify({ error: "Provide licenseeId or set calculateAll: true" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const results: Array<{
      licenseeId: string;
      totalScore: number;
      level: string;
      breakdown: Record<string, number>;
    }> = [];

    for (const licenseeId of licenseeIds) {
      // 1. Order Volume Score (25%)
      // Count completed requests in period
      const { data: requests } = await supabase
        .from("licensee_requests")
        .select("id, service_order_id, carboze_order_id, sla_breached, created_at")
        .eq("licensee_id", licenseeId)
        .gte("created_at", periodStart.toISOString())
        .lte("created_at", periodEnd.toISOString());
      
      const totalOrders = requests?.length || 0;
      // Score based on order count (max 100 at 20+ orders/month)
      const orderVolumeScore = Math.min(100, (totalOrders / 20) * 100);

      // 2. Customer Recurrence Score (30%)
      // Get completed CarboZé orders to analyze customer recurrence
      const { data: orders } = await supabase
        .from("carboze_orders")
        .select("customer_email, customer_name, status")
        .eq("licensee_id", licenseeId)
        .in("status", ["delivered", "shipped", "invoiced", "pending"])
        .gte("created_at", periodStart.toISOString())
        .lte("created_at", periodEnd.toISOString());
      
      const uniqueCustomers = new Set(orders?.map(o => o.customer_email || o.customer_name) || []);
      
      // Check which customers are returning (ordered before this period)
      const { data: historicOrders } = await supabase
        .from("carboze_orders")
        .select("customer_email, customer_name")
        .eq("licensee_id", licenseeId)
        .lt("created_at", periodStart.toISOString());
      
      const historicCustomers = new Set(historicOrders?.map(o => o.customer_email || o.customer_name) || []);
      let returningCount = 0;
      uniqueCustomers.forEach(c => {
        if (historicCustomers.has(c)) returningCount++;
      });
      
      const recurrenceRate = uniqueCustomers.size > 0 ? (returningCount / uniqueCustomers.size) * 100 : 0;
      const customerRecurrenceScore = Math.min(100, recurrenceRate);

      // 3. Growth Score (20%)
      // Compare with previous month
      const { data: prevRequests } = await supabase
        .from("licensee_requests")
        .select("id")
        .eq("licensee_id", licenseeId)
        .gte("created_at", prevStart.toISOString())
        .lte("created_at", prevEnd.toISOString());
      
      const prevOrderCount = prevRequests?.length || 0;
      let growthScore = 50; // Neutral baseline
      if (prevOrderCount > 0) {
        const growthRate = ((totalOrders - prevOrderCount) / prevOrderCount) * 100;
        // 10% growth = 100 points, 0% = 50, -10% = 0
        growthScore = Math.max(0, Math.min(100, 50 + growthRate * 5));
      } else if (totalOrders > 0) {
        growthScore = 100; // First orders ever
      }

      // 4. SLA Score (15%)
      // Calculate average SLA performance
      const breachedCount = requests?.filter(r => r.sla_breached).length || 0;
      const slaRate = totalOrders > 0 ? ((totalOrders - breachedCount) / totalOrders) * 100 : 100;
      const slaScore = slaRate;

      // Get average SLA hours from service orders
      const osIds = requests?.map(r => r.service_order_id).filter(Boolean) || [];
      let avgSlaHours = 0;
      if (osIds.length > 0) {
        const { data: stageHistory } = await supabase
          .from("os_stage_history")
          .select("started_at, completed_at")
          .in("service_order_id", osIds)
          .not("completed_at", "is", null);
        
        if (stageHistory && stageHistory.length > 0) {
          const totalHours = stageHistory.reduce((sum, stage) => {
            const start = new Date(stage.started_at || stage.completed_at);
            const end = new Date(stage.completed_at!);
            return sum + (end.getTime() - start.getTime()) / (1000 * 60 * 60);
          }, 0);
          avgSlaHours = totalHours / stageHistory.length;
        }
      }

      // 5. Platform Usage Score (10%)
      // Based on: no rework needed, proper request completion
      const { data: allRequests } = await supabase
        .from("licensee_requests")
        .select("id, status")
        .eq("licensee_id", licenseeId)
        .gte("created_at", periodStart.toISOString())
        .lte("created_at", periodEnd.toISOString());
      
      const cancelledRequests = allRequests?.filter(r => r.status === "cancelled").length || 0;
      const reworkCount = cancelledRequests; // Simplified: cancelled = rework/issue
      const platformUsageScore = totalOrders > 0 
        ? Math.max(0, 100 - (reworkCount / totalOrders) * 100)
        : 100;

      // Calculate weighted total
      const totalScore = Math.round(
        orderVolumeScore * KPI_WEIGHTS.orderVolume +
        customerRecurrenceScore * KPI_WEIGHTS.customerRecurrence +
        growthScore * KPI_WEIGHTS.growth +
        slaScore * KPI_WEIGHTS.sla +
        platformUsageScore * KPI_WEIGHTS.platformUsage
      );

      const level = calculateLevel(totalScore);

      // Upsert gamification record
      const { error: upsertError } = await supabase
        .from("licensee_gamification")
        .upsert({
          licensee_id: licenseeId,
          period_year: periodYear,
          period_month: periodMonth,
          total_score: totalScore,
          level,
          order_volume_score: Math.round(orderVolumeScore),
          customer_recurrence_score: Math.round(customerRecurrenceScore),
          growth_score: Math.round(growthScore),
          sla_score: Math.round(slaScore),
          platform_usage_score: Math.round(platformUsageScore),
          total_orders: totalOrders,
          unique_customers: uniqueCustomers.size,
          returning_customers: returningCount,
          previous_month_orders: prevOrderCount,
          avg_sla_hours: Math.round(avgSlaHours * 10) / 10,
          rework_count: reworkCount,
          calculated_at: new Date().toISOString(),
        }, {
          onConflict: "licensee_id,period_year,period_month",
        });

      if (upsertError) {
        console.error("Error upserting gamification:", upsertError);
      }

      // Update licensee current score if this is current month
      if (periodYear === now.getFullYear() && periodMonth === now.getMonth() + 1) {
        await supabase
          .from("licensees")
          .update({
            current_score: totalScore,
            current_level: level,
          })
          .eq("id", licenseeId);
      }

      results.push({
        licenseeId,
        totalScore,
        level,
        breakdown: {
          orderVolume: Math.round(orderVolumeScore),
          customerRecurrence: Math.round(customerRecurrenceScore),
          growth: Math.round(growthScore),
          sla: Math.round(slaScore),
          platformUsage: Math.round(platformUsageScore),
        },
      });
    }

    console.log(`Calculated gamification for ${results.length} licensees`);

    return new Response(
      JSON.stringify({
        success: true,
        period: { year: periodYear, month: periodMonth },
        results,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Gamification calculation error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

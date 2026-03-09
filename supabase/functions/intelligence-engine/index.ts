import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    // Gather data for analysis
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const [osRes, licenseeRes, machineRes, ordersRes] = await Promise.all([
      supabase.from("service_orders").select("id, status, stage_sla_deadline, current_department, created_at, title").neq("status", "completed").neq("status", "cancelled"),
      supabase.from("licensees").select("id, name, status, total_revenue, performance_score, total_machines"),
      supabase.from("machines").select("id, machine_id, status, has_active_alert, units_since_last_refill, capacity, low_stock_threshold, location_state"),
      supabase.from("carboze_orders").select("id, total, status, licensee_id, created_at").gte("created_at", thirtyDaysAgo.toISOString()),
    ]);

    const os = osRes.data || [];
    const licensees = licenseeRes.data || [];
    const machines = machineRes.data || [];
    const orders = ordersRes.data || [];

    // Build context for AI
    const slaBreaches = os.filter(o => o.stage_sla_deadline && new Date(o.stage_sla_deadline) < now);
    const slaNearBreach = os.filter(o => {
      if (!o.stage_sla_deadline) return false;
      const h = (new Date(o.stage_sla_deadline).getTime() - now.getTime()) / 3_600_000;
      return h > 0 && h <= 12;
    });
    const lowStockMachines = machines.filter(m => {
      const threshold = m.low_stock_threshold || 20;
      const remaining = (m.capacity || 100) - (m.units_since_last_refill || 0);
      return remaining <= threshold;
    });
    const totalRevenue = orders.reduce((s, o) => s + (Number(o.total) || 0), 0);

    // Revenue concentration
    const revenueByLicensee: Record<string, number> = {};
    orders.forEach(o => {
      if (o.licensee_id) revenueByLicensee[o.licensee_id] = (revenueByLicensee[o.licensee_id] || 0) + (Number(o.total) || 0);
    });
    const topLicenseeRevenue = Math.max(...Object.values(revenueByLicensee), 0);
    const concentrationRatio = totalRevenue > 0 ? topLicenseeRevenue / totalRevenue : 0;

    const context = JSON.stringify({
      total_os_ativas: os.length,
      sla_breaches: slaBreaches.length,
      sla_near_breach: slaNearBreach.length,
      sla_breach_details: slaBreaches.slice(0, 5).map(o => ({ id: o.id, title: o.title, dept: o.current_department })),
      total_licensees: licensees.length,
      active_licensees: licensees.filter(l => l.status === "active").length,
      low_performance: licensees.filter(l => (l.performance_score || 0) < 30).map(l => ({ id: l.id, name: l.name, score: l.performance_score })),
      machines_total: machines.length,
      low_stock_machines: lowStockMachines.length,
      low_stock_details: lowStockMachines.slice(0, 5).map(m => ({ id: m.id, machine_id: m.machine_id, state: m.location_state })),
      revenue_30d: totalRevenue,
      revenue_concentration_ratio: concentrationRatio,
      orders_30d: orders.length,
    });

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          {
            role: "system",
            content: `Você é um analista de inteligência operacional da plataforma Carbo Core. 
Analise os dados e gere insights acionáveis. Retorne usando a tool generate_insights.
Classificação de severity: "critical" para riscos imediatos, "warning" para atenção, "stable" para positivos.
Tipos: sla_risk, revenue_anomaly, revenue_concentration, licensee_performance, stock_rupture, operational_risk.
Gere entre 3 e 8 insights. Seja direto e prescritivo nas recomendações.`,
          },
          { role: "user", content: `Dados operacionais atuais:\n${context}` },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "generate_insights",
              description: "Generate operational intelligence insights",
              parameters: {
                type: "object",
                properties: {
                  insights: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        type: { type: "string", enum: ["sla_risk", "revenue_anomaly", "revenue_concentration", "licensee_performance", "stock_rupture", "operational_risk"] },
                        severity: { type: "string", enum: ["critical", "warning", "stable"] },
                        message: { type: "string" },
                        recommendation: { type: "string" },
                        entity_type: { type: "string" },
                        entity_id: { type: "string" },
                      },
                      required: ["type", "severity", "message", "recommendation"],
                    },
                  },
                },
                required: ["insights"],
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "generate_insights" } },
      }),
    });

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      console.error("AI error:", aiResponse.status, errText);
      if (aiResponse.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded" }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiResponse.status === 402) {
        return new Response(JSON.stringify({ error: "Payment required" }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error("AI gateway error");
    }

    const aiData = await aiResponse.json();
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
    
    let insights: any[] = [];
    if (toolCall?.function?.arguments) {
      const parsed = JSON.parse(toolCall.function.arguments);
      insights = parsed.insights || [];
    }

    // Save insights to DB
    if (insights.length > 0) {
      // Mark old non-dismissed insights as dismissed
      await supabase
        .from("ai_insights")
        .update({ is_dismissed: true, dismissed_at: now.toISOString() })
        .eq("is_dismissed", false);

      const rows = insights.map((i: any) => ({
        type: i.type,
        severity: i.severity,
        message: i.message,
        recommendation: i.recommendation,
        entity_type: i.entity_type || null,
        entity_id: i.entity_id || null,
        metadata: { source: "intelligence_engine", context_snapshot: { os: os.length, machines: machines.length } },
      }));

      const { error: insertErr } = await supabase.from("ai_insights").insert(rows);
      if (insertErr) console.error("Insert error:", insertErr);
    }

    return new Response(
      JSON.stringify({ ok: true, insights_count: insights.length, insights }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Intelligence engine error:", err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

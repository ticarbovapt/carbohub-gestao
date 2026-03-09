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

    const now = new Date();
    const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

    // Gather historical data
    const [osRes, ordersRes, productsRes] = await Promise.all([
      supabase.from("service_orders").select("id, status, created_at, current_department, metadata").gte("created_at", ninetyDaysAgo.toISOString()),
      supabase.from("carboze_orders").select("id, product_code, total, status, created_at, licensee_id").gte("created_at", ninetyDaysAgo.toISOString()),
      supabase.from("mrp_products").select("product_code, name, category").eq("is_active", true),
    ]);

    const os = osRes.data || [];
    const orders = ordersRes.data || [];
    const products = productsRes.data || [];

    // Aggregate by week
    const weeklyOS: Record<string, number> = {};
    const weeklyRevenue: Record<string, number> = {};
    const productVolume: Record<string, number> = {};

    os.forEach(o => {
      const week = o.created_at.substring(0, 10);
      weeklyOS[week] = (weeklyOS[week] || 0) + 1;
    });

    orders.forEach(o => {
      const week = o.created_at.substring(0, 10);
      weeklyRevenue[week] = (weeklyRevenue[week] || 0) + (Number(o.total) || 0);
      productVolume[o.product_code] = (productVolume[o.product_code] || 0) + 1;
    });

    const context = JSON.stringify({
      period: "90 days",
      total_os: os.length,
      total_orders: orders.length,
      total_revenue: orders.reduce((s, o) => s + (Number(o.total) || 0), 0),
      weekly_os_sample: Object.entries(weeklyOS).sort().slice(-12),
      weekly_revenue_sample: Object.entries(weeklyRevenue).sort().slice(-12),
      product_volume: Object.entries(productVolume).sort((a, b) => b[1] - a[1]).slice(0, 10),
      products: products.slice(0, 20).map(p => ({ code: p.product_code, name: p.name, category: p.category })),
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
            content: `Você é um analista de forecast da Carbo Core. Analise dados históricos e gere previsões para 7, 30 e 90 dias.
Use a tool generate_forecasts para retornar as previsões. Inclua:
- Previsão global de volume OP e receita
- Previsão por produto (top 5)
- Risco: critical se tendência de queda >20%, warning se estável com riscos, stable se crescimento.
Seja quantitativo e pragmático.`,
          },
          { role: "user", content: `Dados históricos (90 dias):\n${context}` },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "generate_forecasts",
              description: "Generate business forecasts",
              parameters: {
                type: "object",
                properties: {
                  forecasts: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        entity: { type: "string" },
                        product_code: { type: "string" },
                        period_days: { type: "number", enum: [7, 30, 90] },
                        projected_volume: { type: "number" },
                        projected_revenue: { type: "number" },
                        risk_level: { type: "string", enum: ["critical", "warning", "stable"] },
                        confidence: { type: "number" },
                      },
                      required: ["entity", "period_days", "projected_volume", "projected_revenue", "risk_level", "confidence"],
                    },
                  },
                },
                required: ["forecasts"],
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "generate_forecasts" } },
      }),
    });

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      console.error("AI error:", aiResponse.status, errText);
      if (aiResponse.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded" }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      if (aiResponse.status === 402) {
        return new Response(JSON.stringify({ error: "Payment required" }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      throw new Error("AI gateway error");
    }

    const aiData = await aiResponse.json();
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];

    let forecasts: any[] = [];
    if (toolCall?.function?.arguments) {
      const parsed = JSON.parse(toolCall.function.arguments);
      forecasts = parsed.forecasts || [];
    }

    // Save to DB
    if (forecasts.length > 0) {
      const rows = forecasts.map((f: any) => ({
        entity: f.entity,
        product_code: f.product_code || null,
        period_days: f.period_days,
        projected_volume: f.projected_volume,
        projected_revenue: f.projected_revenue,
        risk_level: f.risk_level,
        confidence: f.confidence,
        details: { source: "forecast_engine" },
        generated_at: now.toISOString(),
      }));

      const { error: insertErr } = await supabase.from("forecast_snapshots").insert(rows);
      if (insertErr) console.error("Insert error:", insertErr);
    }

    return new Response(
      JSON.stringify({ ok: true, forecasts_count: forecasts.length, forecasts }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Forecast engine error:", err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

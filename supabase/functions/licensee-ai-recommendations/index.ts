import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") ?? "https://carbohub.com.br",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface RecommendationRequest {
  licenseeId: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { licenseeId }: RecommendationRequest = await req.json();

    if (!licenseeId) {
      return new Response(
        JSON.stringify({ error: "licenseeId is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch licensee data
    const { data: licensee } = await supabase
      .from("licensees")
      .select("*")
      .eq("id", licenseeId)
      .single();

    // Fetch recent requests (last 90 days)
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
    const { data: requests } = await supabase
      .from("licensee_requests")
      .select(`
        *,
        service:service_catalog(name, operation_type, credit_cost)
      `)
      .eq("licensee_id", licenseeId)
      .gte("created_at", ninetyDaysAgo)
      .order("created_at", { ascending: false });

    // Fetch wallet info
    const { data: wallet } = await supabase
      .from("licensee_wallets")
      .select("*")
      .eq("licensee_id", licenseeId)
      .single();

    // Fetch subscription
    const { data: subscription } = await supabase
      .from("licensee_subscriptions")
      .select(`
        *,
        plan:subscription_plans(*)
      `)
      .eq("licensee_id", licenseeId)
      .single();

    // Fetch machines for this licensee
    const { data: machines } = await supabase
      .from("machines")
      .select("*")
      .eq("licensee_id", licenseeId);

    // Analyze patterns
    const vaptRequests = requests?.filter(r => r.operation_type === "carbo_vapt") || [];
    const zeRequests = requests?.filter(r => r.operation_type === "carbo_ze") || [];
    
    const lastVapt = vaptRequests[0];
    const lastZe = zeRequests[0];
    
    const daysSinceLastVapt = lastVapt 
      ? Math.floor((Date.now() - new Date(lastVapt.created_at).getTime()) / (24 * 60 * 60 * 1000))
      : null;
    const daysSinceLastZe = lastZe
      ? Math.floor((Date.now() - new Date(lastZe.created_at).getTime()) / (24 * 60 * 60 * 1000))
      : null;

    // Calculate average intervals
    const getAverageInterval = (reqs: typeof requests) => {
      if (!reqs || reqs.length < 2) return null;
      const intervals: number[] = [];
      for (let i = 0; i < reqs.length - 1; i++) {
        const diff = new Date(reqs[i].created_at).getTime() - new Date(reqs[i + 1].created_at).getTime();
        intervals.push(diff / (24 * 60 * 60 * 1000));
      }
      return Math.round(intervals.reduce((a, b) => a + b, 0) / intervals.length);
    };

    const avgVaptInterval = getAverageInterval(vaptRequests);
    const avgZeInterval = getAverageInterval(zeRequests);

    // Machines with low stock
    const lowStockMachines = machines?.filter(m => 
      m.has_active_alert || 
      (m.capacity && m.units_since_last_refill && (m.capacity - m.units_since_last_refill) <= (m.low_stock_threshold || 20))
    ) || [];

    // Build context for AI
    const context = {
      licensee: {
        name: licensee?.name,
        totalMachines: licensee?.total_machines || machines?.length || 0,
      },
      requests: {
        totalLast90Days: requests?.length || 0,
        vaptCount: vaptRequests.length,
        zeCount: zeRequests.length,
        daysSinceLastVapt,
        daysSinceLastZe,
        avgVaptIntervalDays: avgVaptInterval,
        avgZeIntervalDays: avgZeInterval,
      },
      wallet: {
        balance: wallet?.balance || 0,
        isLow: (wallet?.balance || 0) < 50,
      },
      subscription: {
        planName: subscription?.plan?.name,
        vaptUsed: subscription?.vapt_used || 0,
        zeUsed: subscription?.ze_used || 0,
        maxVapt: subscription?.plan?.max_vapt_operations,
        maxZe: subscription?.plan?.max_ze_orders,
      },
      machines: {
        total: machines?.length || 0,
        withLowStock: lowStockMachines.length,
        lowStockIds: lowStockMachines.map(m => m.machine_id),
      },
    };

    // If no AI key, generate rule-based recommendations
    if (!lovableApiKey) {
      const recommendations = generateRuleBasedRecommendations(context);
      return new Response(
        JSON.stringify({ recommendations, source: "rules" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Call Lovable AI for intelligent recommendations
    const systemPrompt = `Você é o assistente de operações da plataforma CARBO OPS. Seu papel é ajudar licenciados a otimizar suas operações de descarbonização (CarboVAPT) e gestão de insumos (CarboZé).

Você deve:
- Sugerir operações baseadas no histórico
- Alertar sobre padrões de consumo
- Recomendar momentos ideais para novas solicitações
- Sempre explicar o motivo das sugestões
- Ser conciso e objetivo
- Nunca impor, apenas sugerir

Responda SEMPRE em português brasileiro.`;

    const userPrompt = `Analise os dados deste licenciado e gere de 2 a 4 recomendações personalizadas:

${JSON.stringify(context, null, 2)}

Gere recomendações no formato JSON:
{
  "recommendations": [
    {
      "type": "vapt" | "ze" | "credits" | "general",
      "priority": "high" | "medium" | "low",
      "title": "Título curto da recomendação",
      "description": "Explicação do motivo e ação sugerida",
      "actionLabel": "Texto do botão de ação (opcional)"
    }
  ]
}`;

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${lovableApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.7,
        max_tokens: 1000,
      }),
    });

    if (!aiResponse.ok) {
      if (aiResponse.status === 429) {
        const recommendations = generateRuleBasedRecommendations(context);
        return new Response(
          JSON.stringify({ recommendations, source: "rules", rateLimited: true }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      throw new Error(`AI API error: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    const content = aiData.choices?.[0]?.message?.content;

    if (!content) {
      const recommendations = generateRuleBasedRecommendations(context);
      return new Response(
        JSON.stringify({ recommendations, source: "rules" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Parse AI response
    try {
      // Extract JSON from the response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return new Response(
          JSON.stringify({ recommendations: parsed.recommendations, source: "ai" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    } catch (parseError) {
      console.error("Failed to parse AI response:", parseError);
    }

    // Fallback to rules
    const recommendations = generateRuleBasedRecommendations(context);
    return new Response(
      JSON.stringify({ recommendations, source: "rules" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Recommendation error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

interface Recommendation {
  type: "vapt" | "ze" | "credits" | "general";
  priority: "high" | "medium" | "low";
  title: string;
  description: string;
  actionLabel?: string;
}

function generateRuleBasedRecommendations(context: {
  requests: {
    daysSinceLastVapt: number | null;
    daysSinceLastZe: number | null;
    avgVaptIntervalDays: number | null;
    avgZeIntervalDays: number | null;
    vaptCount: number;
    zeCount: number;
  };
  wallet: { balance: number; isLow: boolean };
  machines: { withLowStock: number; lowStockIds: string[] };
  subscription: { vaptUsed: number; maxVapt: number | null | undefined };
}): Recommendation[] {
  const recommendations: Recommendation[] = [];

  // Low credits warning
  if (context.wallet.isLow) {
    recommendations.push({
      type: "credits",
      priority: "high",
      title: "Saldo de créditos baixo",
      description: `Seu saldo está em ${context.wallet.balance} créditos. Recomendamos adquirir mais para não interromper suas operações.`,
      actionLabel: "Comprar créditos",
    });
  }

  // VAPT recommendation based on history
  if (context.requests.avgVaptIntervalDays && context.requests.daysSinceLastVapt) {
    if (context.requests.daysSinceLastVapt >= context.requests.avgVaptIntervalDays * 0.9) {
      recommendations.push({
        type: "vapt",
        priority: "medium",
        title: "Hora de agendar descarbonização",
        description: `Baseado no seu histórico (média de ${context.requests.avgVaptIntervalDays} dias), está na hora de solicitar uma nova operação CarboVAPT.`,
        actionLabel: "Solicitar CarboVAPT",
      });
    }
  } else if (context.requests.vaptCount === 0) {
    recommendations.push({
      type: "vapt",
      priority: "low",
      title: "Experimente o CarboVAPT",
      description: "Você ainda não realizou nenhuma operação de descarbonização. Agende sua primeira operação e otimize sua frota!",
      actionLabel: "Conhecer CarboVAPT",
    });
  }

  // CarboZé recommendation
  if (context.machines.withLowStock > 0) {
    recommendations.push({
      type: "ze",
      priority: "high",
      title: `${context.machines.withLowStock} máquina(s) com estoque baixo`,
      description: `Recomendamos solicitar reposição de insumos para: ${context.machines.lowStockIds.slice(0, 3).join(", ")}${context.machines.lowStockIds.length > 3 ? "..." : ""}`,
      actionLabel: "Pedir insumos",
    });
  } else if (context.requests.avgZeIntervalDays && context.requests.daysSinceLastZe) {
    if (context.requests.daysSinceLastZe >= context.requests.avgZeIntervalDays * 0.85) {
      recommendations.push({
        type: "ze",
        priority: "medium",
        title: "Reposição de insumos",
        description: `Seu intervalo médio de pedidos é ${context.requests.avgZeIntervalDays} dias. Considere fazer um novo pedido em breve.`,
        actionLabel: "Pedir CarboZé",
      });
    }
  }

  // Plan usage alert
  if (context.subscription.maxVapt && context.subscription.vaptUsed >= context.subscription.maxVapt * 0.8) {
    recommendations.push({
      type: "general",
      priority: "medium",
      title: "Uso do plano chegando ao limite",
      description: `Você já usou ${context.subscription.vaptUsed} de ${context.subscription.maxVapt} operações VAPT do seu plano. Considere um upgrade.`,
      actionLabel: "Ver planos",
    });
  }

  return recommendations.slice(0, 4);
}

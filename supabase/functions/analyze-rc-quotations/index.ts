import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { rc_id } = await req.json();
    if (!rc_id) throw new Error("rc_id is required");

    // Fetch quotations
    const { data: quotations, error: qErr } = await supabase
      .from("rc_quotations")
      .select("*")
      .eq("rc_id", rc_id)
      .order("preco", { ascending: true });
    if (qErr) throw qErr;
    if (!quotations || quotations.length < 3) throw new Error("Mínimo de 3 cotações necessárias");

    // Weights
    const PESO_PRECO = 0.4;
    const PESO_PRAZO = 0.3;
    const PESO_CONDICAO = 0.2;
    const PESO_HISTORICO = 0.1;

    // Normalize and score
    const precos = quotations.map((q: any) => q.preco);
    const prazos = quotations.map((q: any) => q.prazo_entrega_dias);
    const minPreco = Math.min(...precos);
    const maxPreco = Math.max(...precos);
    const minPrazo = Math.min(...prazos);
    const maxPrazo = Math.max(...prazos);

    const ranking = quotations.map((q: any) => {
      // Price score: lower is better (0-10)
      const precoScore = maxPreco === minPreco ? 10 : ((maxPreco - q.preco) / (maxPreco - minPreco)) * 10;
      // Deadline score: lower is better (0-10)
      const prazoScore = maxPrazo === minPrazo ? 10 : ((maxPrazo - q.prazo_entrega_dias) / (maxPrazo - minPrazo)) * 10;
      // Payment condition score: simple heuristic
      const condicaoScore = q.condicao_pagamento ? 
        (q.condicao_pagamento.toLowerCase().includes("vista") ? 5 : 
         q.condicao_pagamento.includes("30") ? 7 : 
         q.condicao_pagamento.includes("60") ? 8 : 
         q.condicao_pagamento.includes("90") ? 9 : 6) : 5;
      // Historic score: baseline
      const historicoScore = 7;

      const totalScore = 
        precoScore * PESO_PRECO + 
        prazoScore * PESO_PRAZO + 
        condicaoScore * PESO_CONDICAO + 
        historicoScore * PESO_HISTORICO;

      return {
        fornecedor_nome: q.fornecedor_nome,
        fornecedor_id: q.fornecedor_id,
        score: Math.round(totalScore * 10) / 10,
        preco_score: Math.round(precoScore * 10) / 10,
        prazo_score: Math.round(prazoScore * 10) / 10,
        condicao_score: Math.round(condicaoScore * 10) / 10,
        historico_score: historicoScore,
        preco: q.preco,
        prazo: q.prazo_entrega_dias,
      };
    }).sort((a: any, b: any) => b.score - a.score);

    const winner = ranking[0];
    const justificativa = `O fornecedor "${winner.fornecedor_nome}" obteve a maior pontuação (${winner.score}/10) na análise multicritério. Preço: R$ ${winner.preco.toFixed(2)} (score ${winner.preco_score}), Prazo: ${winner.prazo} dias (score ${winner.prazo_score}), Condição de pagamento: score ${winner.condicao_score}. Critérios ponderados: Preço 40%, Prazo 30%, Condição 20%, Histórico 10%.`;

    // Save analysis
    const { error: insertErr } = await supabase.from("rc_analysis").insert({
      rc_id,
      fornecedor_recomendado_id: winner.fornecedor_id || null,
      fornecedor_recomendado_nome: winner.fornecedor_nome,
      score: winner.score,
      ranking,
      justificativa,
      criterios: { preco: PESO_PRECO, prazo: PESO_PRAZO, condicao: PESO_CONDICAO, historico: PESO_HISTORICO },
    });
    if (insertErr) throw insertErr;

    // Update RC status
    await supabase.from("rc_requests").update({ status: "em_analise_ia" }).eq("id", rc_id);

    return new Response(JSON.stringify({ success: true, winner: winner.fornecedor_nome, score: winner.score, ranking }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

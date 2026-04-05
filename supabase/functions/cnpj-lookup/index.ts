import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") ?? "https://carbohub.com.br",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Auth check
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get CNPJ from query params
    const url = new URL(req.url);
    const cnpj = url.searchParams.get("cnpj")?.replace(/\D/g, "");

    if (!cnpj || cnpj.length !== 14) {
      return new Response(JSON.stringify({ error: "CNPJ inválido. Deve conter 14 dígitos." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Use BrasilAPI (free, no API key needed)
    const apiRes = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`);

    if (!apiRes.ok) {
      const status = apiRes.status;
      if (status === 404) {
        return new Response(JSON.stringify({ error: "CNPJ não encontrado" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ error: "Erro ao consultar CNPJ" }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const raw = await apiRes.json();

    // Normalize response
    const result = {
      cnpj: raw.cnpj,
      legal_name: raw.razao_social || null,
      trade_name: raw.nome_fantasia || null,
      status: raw.descricao_situacao_cadastral || null,
      address: {
        street: raw.logradouro || "",
        number: raw.numero || "",
        complement: raw.complemento || "",
        neighborhood: raw.bairro || "",
        district: raw.bairro || "",
        city: raw.municipio || "",
        state: raw.uf || "",
        zip: raw.cep || "",
      },
      phones: [raw.ddd_telefone_1, raw.ddd_telefone_2].filter(Boolean),
      emails: [raw.email].filter(Boolean),
      raw,
    };

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("CNPJ lookup error:", error);
    return new Response(JSON.stringify({ error: "Erro interno" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

import { createClient } from "npm:@supabase/supabase-js@2";

const ALLOWED_ORIGINS = [
  "https://controle.carbohub.com.br",
  "https://carbohub.com.br",
  "http://localhost:5173",
  "http://localhost:8080",
];

function getCorsHeaders(req: Request) {
  const origin = req.headers.get("Origin") ?? "";
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  };
}

async function fetchBrasilApi(cnpj: string) {
  const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`, {
    signal: AbortSignal.timeout(8000),
  });
  if (res.status === 404) throw Object.assign(new Error("NOT_FOUND"), { code: "NOT_FOUND" });
  if (!res.ok) throw new Error(`BrasilAPI ${res.status}`);
  return res.json();
}

async function fetchReceitaWs(cnpj: string) {
  const res = await fetch(`https://receitaws.com.br/v1/cnpj/${cnpj}`, {
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`ReceitaWS ${res.status}`);
  const json = await res.json();
  if (json.status === "ERROR") throw Object.assign(new Error("NOT_FOUND"), { code: "NOT_FOUND" });
  // Normalize ReceitaWS format to BrasilAPI format
  return {
    cnpj,
    razao_social: json.nome || "",
    nome_fantasia: json.fantasia || "",
    descricao_situacao_cadastral: json.situacao || "",
    logradouro: json.logradouro || "",
    numero: json.numero || "",
    complemento: json.complemento || "",
    bairro: json.bairro || "",
    municipio: json.municipio || "",
    uf: json.uf || "",
    cep: (json.cep || "").replace(/\D/g, ""),
    ddd_telefone_1: json.telefone || "",
    ddd_telefone_2: "",
    email: json.email || "",
    cnae_fiscal: json.atividade_principal?.[0]?.code || "",
    cnae_fiscal_descricao: json.atividade_principal?.[0]?.text || "",
    _source: "receitaws",
  };
}

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

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

    // Try BrasilAPI first, fallback to ReceitaWS
    let raw: Record<string, unknown>;
    let source = "brasilapi";
    try {
      raw = await fetchBrasilApi(cnpj);
    } catch (e: unknown) {
      const err = e as { code?: string; message?: string };
      if (err.code === "NOT_FOUND") {
        return new Response(
          JSON.stringify({ error: "CNPJ não encontrado na Receita Federal. Verifique o número ou preencha os dados manualmente." }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      // BrasilAPI failed for another reason — try ReceitaWS
      try {
        raw = await fetchReceitaWs(cnpj);
        source = "receitaws";
      } catch (e2: unknown) {
        const err2 = e2 as { code?: string; message?: string };
        if (err2.code === "NOT_FOUND") {
          return new Response(
            JSON.stringify({ error: "CNPJ não encontrado na Receita Federal. Verifique o número ou preencha os dados manualmente." }),
            { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        return new Response(
          JSON.stringify({ error: "Serviço de consulta de CNPJ indisponível no momento. Preencha os dados manualmente." }),
          { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Normalize response
    const result = {
      cnpj: raw.cnpj as string,
      legal_name: (raw.razao_social as string) || null,
      trade_name: (raw.nome_fantasia as string) || null,
      status: (raw.descricao_situacao_cadastral as string) || null,
      address: {
        street: (raw.logradouro as string) || "",
        number: (raw.numero as string) || "",
        complement: (raw.complemento as string) || "",
        neighborhood: (raw.bairro as string) || "",
        district: (raw.bairro as string) || "",
        city: (raw.municipio as string) || "",
        state: (raw.uf as string) || "",
        zip: (raw.cep as string) || "",
      },
      phones: ([raw.ddd_telefone_1, raw.ddd_telefone_2] as string[]).filter(Boolean),
      emails: ([raw.email] as string[]).filter(Boolean),
      _source: source,
      raw,
    };

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("CNPJ lookup error:", error);
    return new Response(JSON.stringify({ error: "Erro interno no servidor" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

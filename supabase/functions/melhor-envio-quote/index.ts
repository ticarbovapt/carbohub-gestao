/**
 * CarboHub — Edge Function: melhor-envio-quote
 * Proxy para a API do Melhor Envio (cálculo de frete)
 *
 * Env vars necessárias (Supabase → Project Settings → Edge Functions → Secrets):
 *   MELHOR_ENVIO_TOKEN  — Bearer token OAuth2 do Melhor Envio
 *   MELHOR_ENVIO_ENV    — "sandbox" (padrão) ou "production"
 *
 * Como obter o token:
 *   1. Criar conta em https://app.melhorenvio.com.br (ou sandbox: https://app-sandbox.melhorenvio.com.br)
 *   2. Ir em Integrações → Área do Desenvolvedor → Criar Aplicativo
 *   3. Gerar token OAuth2 e copiar para MELHOR_ENVIO_TOKEN
 */

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin":
    Deno.env.get("ALLOWED_ORIGIN") ?? "https://carbohub.com.br",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// ── Tipos ──────────────────────────────────────────────────────────────────

interface FreightProduct {
  id: string;
  width: number;   // cm
  height: number;  // cm
  length: number;  // cm
  weight: number;  // kg
  insurance_value: number; // BRL
  quantity: number;
}

interface QuoteRequest {
  to_cep: string;                // destino (só dígitos)
  products: FreightProduct[];
  from_cep?: string;             // padrão: 07100010 (Guarulhos)
}

// ── Handler ────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // 1. Autenticar usuário CarboHub
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return json({ error: "Unauthorized" }, 401);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return json({ error: "Unauthorized" }, 401);
    }

    // 2. Ler payload
    const body: QuoteRequest = await req.json();

    const toCep = body.to_cep?.replace(/\D/g, "");
    if (!toCep || toCep.length !== 8) {
      return json({ error: "CEP de destino inválido. Informe 8 dígitos." }, 400);
    }

    if (!body.products || body.products.length === 0) {
      return json({ error: "Informe ao menos 1 produto." }, 400);
    }

    // 3. Configurar Melhor Envio
    const melhorEnvioToken = Deno.env.get("MELHOR_ENVIO_TOKEN");
    const melhorEnvioEnv   = Deno.env.get("MELHOR_ENVIO_ENV") ?? "sandbox";

    if (!melhorEnvioToken) {
      // Token não configurado → retorna dados simulados para demonstração
      return json(mockResponse(toCep), 200);
    }

    const baseUrl = melhorEnvioEnv === "production"
      ? "https://melhorenvio.com.br"
      : "https://sandbox.melhorenvio.com.br";

    const fromCep = (body.from_cep ?? "07100010").replace(/\D/g, "");

    // 4. Chamar API Melhor Envio
    const payload = {
      from: { postal_code: fromCep },
      to:   { postal_code: toCep },
      products: body.products.map((p, i) => ({
        id:              String(i + 1),
        width:           Math.ceil(p.width),
        height:          Math.ceil(p.height),
        length:          Math.ceil(p.length),
        weight:          p.weight,
        insurance_value: p.insurance_value,
        quantity:        p.quantity,
      })),
      options: {
        receipt:   false,
        own_hand:  false,
      },
    };

    const apiRes = await fetch(`${baseUrl}/api/v2/me/shipment/calculate`, {
      method: "POST",
      headers: {
        "Accept":        "application/json",
        "Content-Type":  "application/json",
        "Authorization": `Bearer ${melhorEnvioToken}`,
        "User-Agent":    "CarboHub (ti@grupocarbo.com.br)",
      },
      body: JSON.stringify(payload),
    });

    if (!apiRes.ok) {
      const errText = await apiRes.text();
      console.error("Melhor Envio API error:", apiRes.status, errText);
      return json(
        { error: `Erro na API Melhor Envio: ${apiRes.status}`, detail: errText },
        502
      );
    }

    const carriers = await apiRes.json();

    // 5. Normalizar resposta
    const normalized = Array.isArray(carriers)
      ? carriers
          .filter((c: any) => !c.error)
          .map((c: any) => ({
            id:            c.id,
            name:          c.name,
            company:       c.company?.name ?? c.name,
            price:         Number(c.price ?? 0),
            custom_price:  Number(c.custom_price ?? c.price ?? 0),
            discount:      Number(c.discount ?? 0),
            currency:      c.currency ?? "BRL",
            delivery_min:  c.delivery_range?.min ?? c.delivery_time ?? null,
            delivery_max:  c.delivery_range?.max ?? c.delivery_time ?? null,
            logo:          c.company?.picture ?? null,
          }))
          .sort((a: any, b: any) => a.price - b.price)
      : [];

    return json({ carriers: normalized, env: melhorEnvioEnv }, 200);

  } catch (err) {
    console.error("melhor-envio-quote error:", err);
    return json({ error: "Erro interno do servidor." }, 500);
  }
});

// ── Helpers ────────────────────────────────────────────────────────────────

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/** Dados mock para quando o token ainda não foi configurado (demonstração) */
function mockResponse(toCep: string) {
  return {
    carriers: [
      { id: 1, name: "PAC",          company: "Correios",    price: 18.50, custom_price: 18.50, discount: 0, currency: "BRL", delivery_min: 5, delivery_max: 8,  logo: null },
      { id: 2, name: "SEDEX",        company: "Correios",    price: 36.20, custom_price: 36.20, discount: 0, currency: "BRL", delivery_min: 1, delivery_max: 3,  logo: null },
      { id: 3, name: ".Package",     company: "Jadlog",      price: 22.00, custom_price: 22.00, discount: 0, currency: "BRL", delivery_min: 3, delivery_max: 5,  logo: null },
      { id: 4, name: "Expresso",     company: "Total Express", price: 28.90, custom_price: 28.90, discount: 0, currency: "BRL", delivery_min: 2, delivery_max: 4, logo: null },
    ],
    env: "mock",
    note: `Token Melhor Envio não configurado. Configure MELHOR_ENVIO_TOKEN nos Secrets da Edge Function. CEP destino: ${toCep}`,
  };
}

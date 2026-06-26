/**
 * CarboHub — Edge Function: superfrete-quote
 * Proxy para a API do SuperFrete (cálculo de frete).
 *
 * Secrets (Supabase → Edge Functions → Secrets):
 *   SUPERFRETE_TOKEN      — Bearer token (sandbox OU produção)
 *   SUPERFRETE_ENV        — "production" (api.superfrete.com) ou "sandbox" (sandbox.superfrete.com). Padrão: production
 *   SUPERFRETE_USER_AGENT — "CarboHub (email@dominio.com)" — obrigatório p/ SuperFrete. Padrão: CarboHub (ti@grupocarbo.com.br)
 */

import { createClient } from "npm:@supabase/supabase-js@2";

const ALLOWED_ORIGINS = [
  "https://controle.carbohub.com.br",
  "https://carbohub.com.br",
  "https://www.carbohub.com.br",
  "https://admin.carbohub.com.br",
  "https://sales.carbohub.com.br",
  "https://ops.carbohub.com.br",
  "https://finance.carbohub.com.br",
  "https://financas.carbohub.com.br",
  "https://carbohub-fin.vercel.app",
  "http://localhost:8080",
  "http://localhost:8082",
  "http://localhost:5173",
  "http://localhost:3000",
];

function isAllowedOrigin(origin: string): boolean {
  if (ALLOWED_ORIGINS.includes(origin)) return true;
  try {
    const { protocol, hostname } = new URL(origin);
    if (protocol !== "https:") return false;
    return hostname.endsWith(".carbohub.com.br") || hostname.endsWith(".vercel.app");
  } catch {
    return false;
  }
}

function getCorsHeaders(req: Request) {
  const origin = req.headers.get("origin") || "";
  const allowedOrigin = isAllowedOrigin(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Vary": "Origin",
  };
}

interface FreightProduct {
  id: string;
  width: number;
  height: number;
  length: number;
  weight: number;
  insurance_value: number;
  quantity: number;
}

interface QuoteRequest {
  to_cep: string;
  from_cep?: string;
  products: FreightProduct[];
}

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    // 1. Autenticar usuário CarboHub
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Unauthorized" }, 401);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return json({ error: "Unauthorized" }, 401);

    // 2. Payload
    const body: QuoteRequest = await req.json();
    const toCep = body.to_cep?.replace(/\D/g, "");
    if (!toCep || toCep.length !== 8) return json({ error: "CEP de destino inválido. Informe 8 dígitos." }, 400);
    if (!body.products || body.products.length === 0) return json({ error: "Informe ao menos 1 produto." }, 400);

    const fromCep = (body.from_cep ?? "59054795").replace(/\D/g, "");
    if (fromCep.length !== 8) return json({ error: "CEP de origem inválido." }, 400);

    // 3. SuperFrete
    const token = Deno.env.get("SUPERFRETE_TOKEN");
    const env = Deno.env.get("SUPERFRETE_ENV") ?? "production";
    const userAgent = Deno.env.get("SUPERFRETE_USER_AGENT") ?? "CarboHub (ti@grupocarbo.com.br)";

    if (!token) {
      return json(mockResponse(toCep), 200);
    }

    const baseUrl = env === "sandbox" ? "https://sandbox.superfrete.com" : "https://api.superfrete.com";

    // SuperFrete usa um único "package" (consolida os volumes). Somamos peso e
    // pegamos as maiores dimensões para um pacote agregado.
    const totalWeight = body.products.reduce((s, p) => s + (p.weight || 0) * (p.quantity || 1), 0);
    const maxH = Math.max(...body.products.map((p) => Math.ceil(p.height || 1)), 1);
    const maxW = Math.max(...body.products.map((p) => Math.ceil(p.width || 1)), 1);
    const maxL = Math.max(...body.products.map((p) => Math.ceil(p.length || 1)), 1);
    const insurance = body.products.reduce((s, p) => s + (p.insurance_value || 0) * (p.quantity || 1), 0);

    const payload = {
      from: { postal_code: fromCep },
      to: { postal_code: toCep },
      options: {
        own_hand: false,
        receipt: false,
        insurance_value: insurance,
        use_insurance_value: insurance > 0,
      },
      package: {
        height: maxH,
        width: maxW,
        length: maxL,
        weight: Number(totalWeight.toFixed(3)) || 0.3,
      },
    };

    const apiRes = await fetch(`${baseUrl}/api/v0/calculator`, {
      method: "POST",
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`,
        "User-Agent": userAgent,
      },
      body: JSON.stringify(payload),
    });

    if (!apiRes.ok) {
      const errText = await apiRes.text();
      console.error("SuperFrete API error:", apiRes.status, errText);
      return json({ error: `Erro na API SuperFrete: ${apiRes.status}`, detail: errText }, 502);
    }

    const data = await apiRes.json();

    // SuperFrete retorna um array de serviços (alguns com .error quando indisponível)
    const list = Array.isArray(data) ? data : (data?.services ?? []);

    // Log de diagnóstico: o que o SuperFrete devolveu (aparece nos Logs da function).
    console.log("[superfrete-quote] servicos:", JSON.stringify(
      list.map((c: any) => ({ id: c.id, name: c.name, company: c.company?.name, price: c.price, error: c.error })),
    ));
    const carriers = list
      .filter((c: any) => !c.error && c.price != null)
      .map((c: any) => ({
        id: c.id,
        name: c.name,
        company: c.company?.name ?? c.name,
        price: Number(c.price ?? 0),
        custom_price: Number(c.custom_price ?? c.price ?? 0),
        discount: Number(c.discount ?? 0),
        currency: c.currency ?? "R$",
        delivery_min: c.delivery_range?.min ?? c.delivery_time ?? null,
        delivery_max: c.delivery_range?.max ?? c.delivery_time ?? null,
        logo: c.company?.picture ?? null,
      }))
      .sort((a: any, b: any) => a.price - b.price);

    // Serviços que voltaram com erro (ex.: Correios abaixo da dimensão mínima) —
    // expostos para a UI mostrar o motivo em vez de simplesmente sumir.
    const unavailable = list
      .filter((c: any) => c.error)
      .map((c: any) => ({
        company: c.company?.name ?? c.name ?? "—",
        name: c.name ?? "",
        error: typeof c.error === "string" ? c.error : (c.error?.message ?? "indisponível para este pacote/destino"),
      }));

    return json({ carriers, unavailable, env }, 200);
  } catch (err) {
    console.error("superfrete-quote error:", err);
    return json({ error: "Erro interno do servidor." }, 500);
  }
});

function mockResponse(toCep: string) {
  return {
    carriers: [
      { id: 1, name: "PAC", company: "Correios", price: 18.5, custom_price: 18.5, discount: 0, currency: "R$", delivery_min: 5, delivery_max: 8, logo: null },
      { id: 2, name: "SEDEX", company: "Correios", price: 36.2, custom_price: 36.2, discount: 0, currency: "R$", delivery_min: 1, delivery_max: 3, logo: null },
      { id: 17, name: ".Package", company: "Jadlog", price: 22.0, custom_price: 22.0, discount: 0, currency: "R$", delivery_min: 3, delivery_max: 5, logo: null },
    ],
    unavailable: [],
    env: "mock",
    note: `Token SuperFrete não configurado. Configure SUPERFRETE_TOKEN nos Secrets. CEP destino: ${toCep}`,
  };
}

import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// ─────────────────────────────────────────────────────────────────────────────
// Cotação de frete via Melhor Envio (edge function melhor-envio-quote).
// Retorna transportadoras reais (preço + prazo). Se a function/token não estiver
// configurada, ela mesma responde com dados simulados (env: "mock").
// ─────────────────────────────────────────────────────────────────────────────

export interface FreightProduct {
  id: string;
  width: number;   // cm
  height: number;  // cm
  length: number;  // cm
  weight: number;  // kg
  insurance_value: number; // BRL
  quantity: number;
}

export interface FreightCarrier {
  id: number | string;
  name: string;
  company: string;
  price: number;
  custom_price: number;
  discount: number;
  currency: string;
  delivery_min: number | null;
  delivery_max: number | null;
  logo: string | null;
}

export interface FreightQuoteResult {
  carriers: FreightCarrier[];
  env: "sandbox" | "production" | "mock";
  note?: string;
}

// Matriz Carbo em Natal/RN (Lagoa Nova) — origem padrão das expedições.
export const ORIGIN_CEP = "59054795";
export const ORIGIN_LABEL = "Natal / RN (matriz)";

// Origens pré-cadastradas (selecionáveis na calculadora). "Outro CEP" é manual.
export const FREIGHT_ORIGINS: { id: string; label: string; cep: string }[] = [
  { id: "rn", label: "Natal / RN (matriz)", cep: "59054795" },
  { id: "sp", label: "CD SP LogHouse (Guarulhos)", cep: "07100010" },
];

const cepZone = (cep: string) => {
  const d = (cep || "").replace(/\D/g, "");
  return d ? parseInt(d[0], 10) : 0;
};

// Estimativa LOCAL (sem API/token): peso real vs peso cúbico ((A*L*C)/6000) e um
// fator de DISTÂNCIA aproximado pela diferença de região do CEP origem→destino.
// Aproximação para quando o Melhor Envio/SuperFrete não está ligado.
export function localEstimate(peso: number, alt: number, larg: number, comp: number, fromCep: string, toCep: string): FreightCarrier[] {
  const cubico = (alt * larg * comp) / 6000;
  const taxavel = Math.max(peso, cubico, 0.3);
  const dist = Math.min(Math.abs(cepZone(fromCep) - cepZone(toCep)), 9);
  const distanceFactor = 1 + dist * 0.14; // mesma região ≈ 1.0; ponta a ponta ≈ +126%
  const base = 18, perKg = 2.4;
  const v = (m: number) => Math.round((base + perKg * taxavel) * distanceFactor * m * 100) / 100;
  return [
    { id: "est-rod", company: "Transportadora", name: "Rodoviário", price: v(0.85), custom_price: v(0.85), discount: 0, currency: "BRL", delivery_min: 4, delivery_max: 8, logo: null },
    { id: "est-pac", company: "Correios", name: "PAC", price: v(1.0), custom_price: v(1.0), discount: 0, currency: "BRL", delivery_min: 5, delivery_max: 9, logo: null },
    { id: "est-sedex", company: "Correios", name: "SEDEX", price: v(1.5), custom_price: v(1.5), discount: 0, currency: "BRL", delivery_min: 1, delivery_max: 3, logo: null },
  ].sort((a, b) => a.price - b.price);
}

function mockFreightResult(): FreightQuoteResult {
  return {
    env: "mock",
    note: "Cotação simulada (edge function/token indisponível).",
    carriers: [
      { id: 3, name: "Econômico", company: "Total Express", price: 15.8, custom_price: 15.8, discount: 0, currency: "BRL", delivery_min: 7, delivery_max: 12, logo: null },
      { id: 1, name: "PAC", company: "Correios", price: 18.5, custom_price: 18.5, discount: 0, currency: "BRL", delivery_min: 5, delivery_max: 8, logo: null },
      { id: 2, name: "SEDEX", company: "Correios", price: 34.2, custom_price: 34.2, discount: 0, currency: "BRL", delivery_min: 1, delivery_max: 3, logo: null },
      { id: 4, name: "Rodoviário", company: "Jamef", price: 42.0, custom_price: 42.0, discount: 0, currency: "BRL", delivery_min: 3, delivery_max: 6, logo: null },
    ],
  };
}

export function useCalculateFreight() {
  return useMutation({
    mutationFn: async (payload: { to_cep: string; from_cep?: string; products: FreightProduct[] }): Promise<FreightQuoteResult> => {
      try {
        const { data, error } = await supabase.functions.invoke("melhor-envio-quote", {
          body: { to_cep: payload.to_cep, from_cep: payload.from_cep, products: payload.products },
        });
        if (error) return mockFreightResult();
        if (data?.error) throw new Error(data.error);
        return data as FreightQuoteResult;
      } catch {
        return mockFreightResult();
      }
    },
  });
}

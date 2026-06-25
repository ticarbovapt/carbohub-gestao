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

export const ORIGIN_CEP = "07100010";
export const ORIGIN_LABEL = "Guarulhos / SP";

// Estimativa LOCAL (sem API/token): peso real vs peso cúbico ((A*L*C)/6000) e
// fator por região do CEP. Aproximação para quando o Melhor Envio não está ligado.
export function localEstimate(peso: number, alt: number, larg: number, comp: number, cep: string): FreightCarrier[] {
  const cubico = (alt * larg * comp) / 6000;
  const taxavel = Math.max(peso, cubico, 0.3);
  const cepNum = parseInt((cep || "").replace(/\D/g, "").slice(0, 5) || "0", 10);
  const regiao =
    cepNum >= 1000 && cepNum <= 19999 ? 1.0 :   // SP
    cepNum >= 20000 && cepNum <= 28999 ? 1.15 : // RJ
    cepNum >= 29000 && cepNum <= 29999 ? 1.2 :  // ES
    cepNum >= 30000 && cepNum <= 39999 ? 1.2 :  // MG
    cepNum >= 40000 && cepNum <= 65999 ? 1.6 :  // BA/NE
    cepNum >= 66000 && cepNum <= 69999 ? 1.9 :  // Norte
    cepNum >= 80000 && cepNum <= 99999 ? 1.35 : // Sul
    1.5;
  const base = 18, perKg = 2.4;
  const v = (m: number) => Math.round((base + perKg * taxavel) * regiao * m * 100) / 100;
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
    mutationFn: async (payload: { to_cep: string; products: FreightProduct[] }): Promise<FreightQuoteResult> => {
      try {
        const { data, error } = await supabase.functions.invoke("melhor-envio-quote", {
          body: { to_cep: payload.to_cep, products: payload.products },
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

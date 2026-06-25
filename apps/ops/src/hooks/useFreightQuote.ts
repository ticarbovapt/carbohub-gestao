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

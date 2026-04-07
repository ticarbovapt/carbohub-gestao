import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

// ── Types ──────────────────────────────────────────────────────────────────

export interface FreightProduct {
  id: string;
  width: number;
  height: number;
  length: number;
  weight: number;
  insurance_value: number;
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

export interface FreightQuoteRecord {
  id: string;
  from_cep: string;
  to_cep: string;
  to_city: string | null;
  to_state: string | null;
  product_ref: string | null;
  quantity: number | null;
  weight_kg: number | null;
  dimensions_cm: Record<string, number> | null;
  insurance_value: number | null;
  carriers: FreightCarrier[];
  selected_carrier: string | null;
  selected_price: number | null;
  selected_days: number | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
}

// ── Constants ──────────────────────────────────────────────────────────────

export const ORIGIN_CEP   = "07100010";
export const ORIGIN_LABEL = "Guarulhos / SP";

// ── Mock fallback (quando Edge Function não está deployed) ────────────────
function mockFreightResult(): FreightQuoteResult {
  return {
    env: "mock",
    note: "Edge Function não configurada — dados simulados para demonstração. Siga os passos de deploy para ativar cotações reais.",
    carriers: [
      { id: 3, name: "Econômico", company: "Total Express",  price: 15.80, custom_price: 15.80, discount: 0, currency: "BRL", delivery_min: 7,  delivery_max: 12, logo: null },
      { id: 1, name: "PAC",       company: "Correios",       price: 18.50, custom_price: 18.50, discount: 0, currency: "BRL", delivery_min: 5,  delivery_max: 8,  logo: null },
      { id: 2, name: "SEDEX",     company: "Correios",       price: 34.20, custom_price: 34.20, discount: 0, currency: "BRL", delivery_min: 1,  delivery_max: 3,  logo: null },
      { id: 4, name: "Rodoviário",company: "Jamef",          price: 42.00, custom_price: 42.00, discount: 0, currency: "BRL", delivery_min: 3,  delivery_max: 6,  logo: null },
    ],
  };
}

// ── Mutations ──────────────────────────────────────────────────────────────

export function useCalculateFreight() {
  return useMutation({
    mutationFn: async (payload: {
      to_cep: string;
      products: FreightProduct[];
    }): Promise<FreightQuoteResult> => {
      try {
        const { data, error } = await supabase.functions.invoke("melhor-envio-quote", {
          body: { to_cep: payload.to_cep, products: payload.products },
        });
        // Se a função não está deployed, error.message contém "Failed to send a request"
        if (error) {
          console.warn("[FreightQuote] Edge Function indisponível, usando mock:", error.message);
          return mockFreightResult();
        }
        if (data?.error) throw new Error(data.error);
        return data as FreightQuoteResult;
      } catch (err) {
        // Qualquer falha de rede → retorna mock em vez de travar a UI
        console.warn("[FreightQuote] Fallback para mock:", err);
        return mockFreightResult();
      }
    },
    onError: (err: Error) => {
      toast.error(`Erro ao calcular frete: ${err.message}`);
    },
  });
}

export function useSaveFreightQuote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (record: {
      to_cep: string;
      to_city?: string;
      to_state?: string;
      product_ref?: string;
      quantity?: number;
      weight_kg?: number;
      dimensions_cm?: Record<string, number>;
      insurance_value?: number;
      carriers: FreightCarrier[];
      selected_carrier?: string;
      selected_price?: number;
      selected_days?: number;
      notes?: string;
    }) => {
      const { data, error } = await supabase
        .from("freight_quotes")
        .insert({
          from_cep:         ORIGIN_CEP,
          to_cep:           record.to_cep.replace(/\D/g, ""),
          to_city:          record.to_city ?? null,
          to_state:         record.to_state ?? null,
          product_ref:      record.product_ref ?? null,
          quantity:         record.quantity ?? 1,
          weight_kg:        record.weight_kg ?? null,
          dimensions_cm:    record.dimensions_cm ?? null,
          insurance_value:  record.insurance_value ?? 0,
          carriers:         record.carriers,
          selected_carrier: record.selected_carrier ?? null,
          selected_price:   record.selected_price ?? null,
          selected_days:    record.selected_days ?? null,
          notes:            record.notes ?? null,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["freight-quotes-history"] });
      toast.success("Cotação salva!");
    },
    onError: (err: Error) => {
      toast.error(`Erro ao salvar cotação: ${err.message}`);
    },
  });
}

// ── Queries ────────────────────────────────────────────────────────────────

export function useFreightQuotesHistory(limit = 50) {
  return useQuery({
    queryKey: ["freight-quotes-history", limit],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("freight_quotes")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data ?? []) as FreightQuoteRecord[];
    },
  });
}

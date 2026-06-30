import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// ─────────────────────────────────────────────────────────────────────────────
// Pós-venda (Sales) — SOMENTE LEITURA. O vendedor acompanha a jornada dos
// SEUS pedidos manuais (carboze_orders sem external_ref, vendedor_id = ele).
// Quem controla a etapa é o time de operações no Carbo Ops.
// ─────────────────────────────────────────────────────────────────────────────

const db = supabase as unknown as { from: (t: string) => any };

export type FulfillmentStage =
  | "nova_venda" | "separacao_pendente" | "separando" | "separado"
  | "em_transporte" | "entregue" | "cancelado";

export const POSVENDA_STAGES: { key: FulfillmentStage; label: string; color: string }[] = [
  { key: "nova_venda",          label: "Nova Venda",            color: "#9333ea" },
  { key: "separacao_pendente",  label: "Aguardando Separação",  color: "#f59e0b" },
  { key: "separando",           label: "Em Separação",          color: "#3b82f6" },
  { key: "separado",            label: "Separado",              color: "#8b5cf6" },
  { key: "em_transporte",       label: "Em Transporte",         color: "#06b6d4" },
  { key: "entregue",            label: "Entregue",              color: "#10b981" },
  { key: "cancelado",           label: "Cancelado",             color: "#ef4444" },
];

export interface PosVendaItem { name?: string; quantity?: number; unit_price?: number; total?: number; }

export interface PosVendaOrder {
  id: string;
  order_number: string;
  customer_name: string;
  customer_email: string | null;
  customer_phone: string | null;
  delivery_address: string | null;
  delivery_city: string | null;
  delivery_state: string | null;
  delivery_zip: string | null;
  subtotal: number;
  shipping_cost: number;
  discount: number;
  total: number;
  notes: string | null;
  items: PosVendaItem[];
  created_at: string;
  fulfillment_stage: FulfillmentStage;
  linha: string | null;
}

/** Meus pedidos (do vendedor logado), somente leitura. */
export function useMyPosVenda() {
  return useQuery({
    queryKey: ["crm", "pos-venda"],
    queryFn: async (): Promise<PosVendaOrder[]> => {
      const { data: u } = await supabase.auth.getUser();
      const uid = u?.user?.id;
      let q = db
        .from("carboze_orders")
        .select(
          "id, order_number, customer_name, customer_email, customer_phone, delivery_address, " +
          "delivery_city, delivery_state, delivery_zip, subtotal, shipping_cost, discount, total, " +
          "notes, items, created_at, fulfillment_stage, linha"
        )
        .is("external_ref", null)
        .order("created_at", { ascending: false })
        .limit(500);
      if (uid) q = q.eq("vendedor_id", uid);
      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as PosVendaOrder[];
    },
    refetchInterval: 60_000,
  });
}

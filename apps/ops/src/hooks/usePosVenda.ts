import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

// ─────────────────────────────────────────────────────────────────────────────
// Pós-venda: jornada das VENDAS MANUAIS (carboze_orders sem external_ref — as
// criadas no Carbo Sales/Ops). Pedidos de Bling/e-commerce têm fluxo próprio e
// não entram aqui. O Ops controla a etapa; o Sales só visualiza.
// ─────────────────────────────────────────────────────────────────────────────

const db = supabase as unknown as { from: (t: string) => any };

export type FulfillmentStage =
  | "nova_venda" | "separacao_pendente" | "criar_op" | "separando" | "separado"
  | "em_transporte" | "entregue" | "cancelado";

export const POSVENDA_STAGES: { key: FulfillmentStage; label: string; color: string }[] = [
  { key: "nova_venda",          label: "Nova Venda",              color: "#9333ea" },
  { key: "separacao_pendente",  label: "Pedido Recebido",         color: "#f59e0b" },
  { key: "criar_op",            label: "Criar Ordem de Produção", color: "#ec4899" },
  { key: "separando",           label: "Em Separação",            color: "#3b82f6" },
  { key: "separado",            label: "Separado",                color: "#8b5cf6" },
  { key: "em_transporte",       label: "Em Transporte",           color: "#06b6d4" },
  { key: "entregue",            label: "Entregue",                color: "#10b981" },
  { key: "cancelado",           label: "Cancelado",               color: "#ef4444" },
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
  vendedor_name: string | null;
  vendedor_id: string | null;
  vendedor_avatar: string | null;
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

const SELECT_COLS =
  "id, order_number, customer_name, customer_email, customer_phone, delivery_address, delivery_city, " +
  "delivery_state, delivery_zip, vendedor_name, vendedor_id, subtotal, shipping_cost, discount, total, " +
  "notes, items, created_at, fulfillment_stage, linha";

/** Todas as vendas manuais (visão de operações). */
export function usePosVendaOrders() {
  return useQuery({
    queryKey: ["ops", "pos-venda"],
    queryFn: async (): Promise<PosVendaOrder[]> => {
      const { data, error } = await db
        .from("carboze_orders")
        .select(SELECT_COLS)
        .is("external_ref", null)
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      const list = (data || []) as PosVendaOrder[];

      // Enriquece com a foto do vendedor (profiles.avatar_url).
      const ids = [...new Set(list.map((o) => o.vendedor_id).filter(Boolean))] as string[];
      if (ids.length) {
        const { data: profs } = await db.from("profiles").select("id, avatar_url").in("id", ids);
        const map = new Map((profs || []).map((p: any) => [p.id, p.avatar_url]));
        for (const o of list) o.vendedor_avatar = (o.vendedor_id && map.get(o.vendedor_id)) || null;
      }
      return list;
    },
    refetchInterval: 60_000,
  });
}

export function useUpdateFulfillmentStage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, stage }: { id: string; stage: FulfillmentStage }) => {
      const { error } = await db
        .from("carboze_orders")
        .update({ fulfillment_stage: stage, updated_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ops", "pos-venda"] });
      toast.success("Etapa atualizada.");
    },
    onError: (e: Error) => toast.error("Erro ao atualizar etapa: " + e.message),
  });
}

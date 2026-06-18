import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// ─────────────────────────────────────────────────────────────────────────────
// Recebimento (purchase_receivings) — conferir uma OC: registra o que chegou,
// marca divergência e move o status da OC (recebida / parcialmente_recebida).
// Obs: itens são texto livre (sem product_id), então NÃO há baixa automática em
// warehouse_stock — entrada de estoque fica para quando item↔produto for ligado.
// RLS aberto a autenticado (migration do Ops).
// ─────────────────────────────────────────────────────────────────────────────

const db = supabase as unknown as {
  from: (t: string) => any;
  auth: { getUser: () => Promise<{ data: { user: { id: string } | null } }> };
};

export type ReceivingStatus = "pendente" | "conferido_ok" | "conferido_divergencia";
export const RECV_STATUS_LABELS: Record<ReceivingStatus, string> = {
  pendente: "Pendente", conferido_ok: "Conferido OK", conferido_divergencia: "Com Divergência",
};
export const RECV_STATUS_VARIANT: Record<ReceivingStatus, "secondary" | "warning" | "success" | "destructive" | "info"> = {
  pendente: "secondary", conferido_ok: "success", conferido_divergencia: "warning",
};

export interface ReceivingItem { descricao: string; qtd_pedida: number; qtd_recebida: number; }

export interface ReceivingRow {
  id: string;
  oc_number: string;
  supplier_name: string;
  received_at: string; // YYYY-MM-DD
  status: ReceivingStatus;
  has_divergence: boolean;
  itens_count: number;
}

export function usePurchaseReceivings() {
  return useQuery({
    queryKey: ["ops", "purchase-receivings"],
    queryFn: async (): Promise<ReceivingRow[]> => {
      const res = await db
        .from("purchase_receivings")
        .select("id, received_at, status, has_divergence, items_received, purchase_orders(oc_number, supplier_name)")
        .order("received_at", { ascending: false });
      if (res.error) throw res.error;
      return (res.data ?? []).map((r: Record<string, unknown>) => {
        const oc = (r.purchase_orders as Record<string, unknown>) ?? {};
        return {
          id: r.id as string,
          oc_number: (oc.oc_number as string) ?? "—",
          supplier_name: (oc.supplier_name as string) ?? "—",
          received_at: String(r.received_at ?? "").slice(0, 10),
          status: ((r.status as string) ?? "pendente") as ReceivingStatus,
          has_divergence: Boolean(r.has_divergence),
          itens_count: Array.isArray(r.items_received) ? r.items_received.length : 0,
        };
      });
    },
  });
}

export interface RegisterReceivingInput {
  purchaseOrderId: string;
  items: ReceivingItem[];
  divergenceNotes: string;
}

export function useRegisterReceiving() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: RegisterReceivingInput) => {
      if (!p.purchaseOrderId) throw new Error("Selecione a Ordem de Compra.");
      if (p.items.length === 0) throw new Error("OC sem itens para conferir.");

      const hasDivergence = p.items.some((i) => Number(i.qtd_recebida) !== Number(i.qtd_pedida));
      const tudoRecebido = p.items.every((i) => Number(i.qtd_recebida) >= Number(i.qtd_pedida));
      const { data: auth } = await db.auth.getUser();

      const recv = await db.from("purchase_receivings").insert({
        purchase_order_id: p.purchaseOrderId,
        received_by: auth?.user?.id ?? null,
        items_received: p.items.map((i) => ({ descricao: i.descricao, qtd_pedida: i.qtd_pedida, qtd_recebida: i.qtd_recebida })),
        status: hasDivergence ? "conferido_divergencia" : "conferido_ok",
        has_divergence: hasDivergence,
        divergence_notes: p.divergenceNotes.trim() || null,
        stock_updated: false,
      });
      if (recv.error) throw recv.error;

      const oc = await db.from("purchase_orders")
        .update({ status: tudoRecebido ? "recebida" : "parcialmente_recebida" })
        .eq("id", p.purchaseOrderId);
      if (oc.error) throw oc.error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ops", "purchase-receivings"] });
      qc.invalidateQueries({ queryKey: ["ops", "purchase-orders"] });
    },
  });
}

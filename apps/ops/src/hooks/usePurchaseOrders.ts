import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// ─────────────────────────────────────────────────────────────────────────────
// Ordens de Compra (purchase_orders) — ler + gerar a partir de uma requisição
// aprovada (purchase_requests). oc_number é gerado por trigger no banco.
// ─────────────────────────────────────────────────────────────────────────────

const db = supabase as unknown as {
  from: (t: string) => any;
  auth: { getUser: () => Promise<{ data: { user: { id: string } | null } }> };
};

export type OcStatus = "gerada" | "enviada_fornecedor" | "parcialmente_recebida" | "recebida" | "cancelada";
export const OC_STATUS_LABELS: Record<OcStatus, string> = {
  gerada: "Gerada", enviada_fornecedor: "Enviada ao Fornecedor",
  parcialmente_recebida: "Parc. Recebida", recebida: "Recebida", cancelada: "Cancelada",
};
export const OC_STATUS_VARIANT: Record<OcStatus, "secondary" | "warning" | "success" | "destructive" | "info"> = {
  gerada: "info", enviada_fornecedor: "warning", parcialmente_recebida: "warning", recebida: "success", cancelada: "destructive",
};

export interface OcItem { descricao: string; quantidade: number; unidade: string; valor_unitario: number; }

export interface OcRow {
  id: string;
  oc_number: string;
  supplier_name: string;
  itens_count: number;
  total_value: number;
  status: OcStatus;
  items: OcItem[];
}

export function usePurchaseOrders() {
  return useQuery({
    queryKey: ["ops", "purchase-orders"],
    queryFn: async (): Promise<OcRow[]> => {
      const res = await db
        .from("purchase_orders")
        .select("id, oc_number, supplier_name, items, total_value, status")
        .order("created_at", { ascending: false });
      if (res.error) throw res.error;
      return (res.data ?? []).map((r: Record<string, unknown>) => ({
        id: r.id as string,
        oc_number: (r.oc_number as string) ?? "—",
        supplier_name: (r.supplier_name as string) ?? "—",
        itens_count: Array.isArray(r.items) ? r.items.length : 0,
        total_value: Number(r.total_value) || 0,
        status: ((r.status as string) ?? "gerada") as OcStatus,
        items: Array.isArray(r.items) ? (r.items as OcItem[]) : [],
      }));
    },
  });
}

export function useGenerateOc() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (requestId: string) => {
      const reqRes = await db
        .from("purchase_requests")
        .select("id, status, items, estimated_value, suggested_supplier, service_order_id")
        .eq("id", requestId)
        .single();
      if (reqRes.error) throw reqRes.error;
      const req = reqRes.data as Record<string, unknown>;
      if (req.status !== "aprovada") throw new Error("Só é possível gerar OC de requisição aprovada.");

      const { data: auth } = await db.auth.getUser();
      const res = await db.from("purchase_orders").insert({
        purchase_request_id: requestId,
        service_order_id: req.service_order_id ?? null,
        supplier_name: (req.suggested_supplier as string) || "A definir",
        items: req.items ?? [],
        total_value: Number(req.estimated_value) || 0,
        status: "gerada",
        generated_by: auth?.user?.id ?? null,
      });
      if (res.error) throw res.error;

      // Fecha o ciclo: a requisição vira "Convertida em OC".
      await db.from("purchase_requests").update({ status: "convertida" }).eq("id", requestId);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ops", "purchase-orders"] });
      qc.invalidateQueries({ queryKey: ["ops", "purchase-requests"] });
    },
  });
}

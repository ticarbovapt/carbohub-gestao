import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

// ─────────────────────────────────────────────────────────────────────────────
// Vendas e Orçamentos do Carbo Sales — FONTE ÚNICA: carboze_orders.
// Espelha a query da VendasPage do Controle: janela por created_at (±1 mês) e
// refino client-side pela data efetiva (sale_date ?? created_at) dentro do
// período. Orçamento = status 'quote'; pedido = demais status.
// ─────────────────────────────────────────────────────────────────────────────
const db = supabase as unknown as {
  from: (t: string) => any;
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: any; error: any }>;
};

export interface VendaItem { name: string; quantity: number; unit_price: number; total: number; }

export interface CarbozeVendaRow {
  id: string;
  order_number: string;
  created_at: string;
  sale_date: string | null;
  customer_name: string;
  customer_doc: string | null;
  customer_ie: string | null;
  customer_email: string | null;
  customer_phone: string | null;
  delivery_address: string | null;
  delivery_city: string | null;
  delivery_state: string | null;
  delivery_zip: string | null;
  billing_address: Record<string, unknown> | null;
  notes: string | null;
  items: VendaItem[];
  total: number;
  status: string;                 // quote | pending | confirmed | invoiced | shipped | delivered | cancelled
  vendedor_id: string | null;
  vendedor_name: string | null;
  invoice_number: string | null;
  bling_nf_id: number | null;
}

interface Params {
  month: Date;
  customFrom?: string;
  customTo?: string;
  vendedorFilter?: string;        // "__all__" | profile id
  isGestor: boolean;
  userId?: string;
}

/** Lê carboze_orders no período. RLS já limita o colaborador ao próprio escopo;
 *  o filtro por vendedor só é aplicado para gestor. */
export function useCarbozeVendas({ month, customFrom, customTo, vendedorFilter, isGestor, userId }: Params) {
  const hasCustom = !!(customFrom || customTo);
  return useQuery({
    queryKey: ["carboze_vendas", month.toISOString().slice(0, 7), customFrom, customTo, vendedorFilter, isGestor, userId],
    enabled: !!userId,
    queryFn: async (): Promise<CarbozeVendaRow[]> => {
      let rangeStart: string, rangeEnd: string, qStart: string, qEnd: string;
      if (hasCustom) {
        rangeStart = customFrom || "2000-01-01";
        rangeEnd = customTo || "2099-12-31";
        qStart = rangeStart + "T00:00:00.000Z";
        qEnd = rangeEnd + "T23:59:59.999Z";
      } else {
        const yr = month.getFullYear(), mo = month.getMonth() + 1;
        const lastDay = new Date(yr, mo, 0).getDate();
        rangeStart = `${yr}-${String(mo).padStart(2, "0")}-01`;
        rangeEnd = `${yr}-${String(mo).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
        qStart = new Date(yr, mo - 2, 1).toISOString();
        qEnd = new Date(yr, mo + 1, 0, 23, 59, 59).toISOString();
      }

      let query = db
        .from("carboze_orders")
        .select("*")
        .neq("excluir_metricas", true)
        .gte("created_at", qStart)
        .lte("created_at", qEnd)
        .order("created_at", { ascending: false });

      if (!isGestor) {
        query = query.eq("vendedor_id", userId);
      } else if (vendedorFilter && vendedorFilter !== "__all__") {
        query = query.eq("vendedor_id", vendedorFilter);
      }

      const { data, error } = await query;
      if (error) throw error;

      return ((data ?? []) as any[])
        .filter((row) => {
          const eff = (row.sale_date as string | null) ?? (row.created_at as string).substring(0, 10);
          return eff >= rangeStart && eff <= rangeEnd;
        })
        .map((row): CarbozeVendaRow => ({
          id: row.id,
          order_number: row.order_number,
          created_at: row.created_at,
          sale_date: row.sale_date ?? null,
          customer_name: row.customer_name ?? "—",
          customer_doc: row.cnpj ?? null,
          customer_ie: row.customer_ie ?? null,
          customer_email: row.customer_email ?? null,
          customer_phone: row.customer_phone ?? null,
          delivery_address: row.delivery_address ?? null,
          delivery_city: row.delivery_city ?? null,
          delivery_state: row.delivery_state ?? null,
          delivery_zip: row.delivery_zip ?? null,
          billing_address: (row.billing_address ?? null) as Record<string, unknown> | null,
          notes: row.notes ?? null,
          items: Array.isArray(row.items) ? (row.items as VendaItem[]) : [],
          total: Number(row.total || 0),
          status: row.status,
          vendedor_id: row.vendedor_id ?? null,
          vendedor_name: row.vendedor_name ?? null,
          invoice_number: row.invoice_number ?? null,
          bling_nf_id: row.bling_nf_id ?? null,
        }));
    },
  });
}

/** Converte orçamento (status 'quote') em pedido ('pending'). Idempotente. */
export function useConvertQuote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data: u } = await supabase.auth.getUser();
      const { data, error } = await db
        .from("carboze_orders")
        .update({ status: "pending", confirmed_at: new Date().toISOString() })
        .eq("id", id)
        .eq("status", "quote")
        .select("id")
        .single();
      if (error) throw error;
      if (!data) throw new Error("Orçamento não encontrado ou já convertido.");
      try {
        await db.from("order_status_history").insert({
          order_id: id, status: "pending",
          notes: "Orçamento aprovado e convertido em venda", changed_by: u?.user?.id ?? null,
        });
      } catch { /* ignore */ }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["carboze_vendas"] }),
  });
}

/** Exclui uma venda (só gestor — validado no banco). Grava log auditável
 *  (carboze_order_deletions) antes de apagar e libera o número da venda. */
export function useDeleteVenda() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason?: string }) => {
      const { error } = await db.rpc("carboze_order_delete", { p_id: id, p_reason: reason ?? null });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["carboze_vendas"] });
      toast.success("Venda excluída.");
    },
    onError: (e: Error) => toast.error("Erro ao excluir venda: " + e.message),
  });
}

/** Atribui vendedor (perfil) a vários pedidos de uma vez — grava vendedor_id/name. */
export function useBulkAssignVendedor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ orderIds, vendedorId, vendedorName }: { orderIds: string[]; vendedorId: string; vendedorName: string }) => {
      const { error } = await db
        .from("carboze_orders")
        .update({ vendedor_id: vendedorId, vendedor_name: vendedorName, updated_at: new Date().toISOString() })
        .in("id", orderIds);
      if (error) throw error;
    },
    onSuccess: (_d, { orderIds }) => {
      qc.invalidateQueries({ queryKey: ["carboze_vendas"] });
      toast.success(`${orderIds.length} pedido(s) atribuído(s) com sucesso!`);
    },
    onError: (e: Error) => toast.error("Erro ao atribuir vendedor: " + e.message),
  });
}

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { OrderItem } from "@/hooks/useCarbozeOrders";

export interface FaturamentoOrder {
  id: string;
  order_number: string;
  created_at: string;
  sale_date: string | null;
  customer_name: string;
  delivery_address: string | null;
  delivery_city: string | null;
  delivery_state: string | null;
  delivery_zip: string | null;
  items: OrderItem[];
  subtotal: number;
  shipping_cost: number;
  discount: number;
  total: number;
  status: string;
  vendedor_name: string | null;
  external_ref: string | null;
  // Fiscal / PO
  ie: string | null;
  po_number: string | null;
  po_date: string | null;
  billing_address: string | null;
  billing_city: string | null;
  billing_state: string | null;
  billing_zip: string | null;
  billing_contact_name: string | null;
  billing_contact_email: string | null;
  payment_terms: string | null;
  freight_type: "CIF" | "FOB" | null;
  buyer_notes: string | null;
  general_notes: string | null;
  // NF linkage
  bling_nf_id: number | null;
  nf_access_key: string | null;
  invoice_number: string | null;
}

export interface FaturamentoParams {
  month: Date;
  search?: string;
  showAll?: boolean;
}

export function useFaturamento({ month, search = "", showAll = false }: FaturamentoParams) {
  const monthKey = `${month.getFullYear()}-${month.getMonth() + 1}`;
  // Sanitiza o termo para não quebrar a sintaxe do filtro .or do PostgREST
  const term = search.trim().replace(/[,()]/g, " ").trim();

  return useQuery({
    queryKey: ["faturamento", monthKey, term, showAll],
    queryFn: async () => {
      let query = supabase
        .from("carboze_orders")
        .select("*")
        .in("status", ["pending", "confirmed", "invoiced", "shipped", "delivered"])
        .order("created_at", { ascending: false });

      if (!showAll) {
        query = query.is("bling_nf_id", null);
      }

      if (term) {
        // Busca global: ignora o mês e vasculha o banco inteiro (limitado para segurança)
        query = query
          .or(`customer_name.ilike.%${term}%,order_number.ilike.%${term}%`)
          .limit(300);
      } else {
        // Sem busca: limita ao mês selecionado (filtro no servidor)
        const yr = month.getFullYear();
        const mo = month.getMonth();
        const start = new Date(yr, mo, 1).toISOString();
        const end = new Date(yr, mo + 1, 0, 23, 59, 59).toISOString();
        query = query.gte("created_at", start).lte("created_at", end);
      }

      const { data, error } = await query;
      if (error) throw error;

      return (data || []).map(row => ({
        ...row,
        items: Array.isArray(row.items) ? (row.items as unknown as OrderItem[]) : [],
      })) as FaturamentoOrder[];
    },
    refetchInterval: 60_000,
  });
}

export function useCreateBlingPedido() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (orderId: string) => {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error("Não autenticado");

      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/bling-sync`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ entity: "create_order", order_id: orderId }),
        }
      );

      const json = await res.json().catch(() => ({ error: res.statusText }));
      if (!res.ok) throw new Error(json.error || "Erro ao criar pedido no Bling");
      return json;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["faturamento"] });
      queryClient.invalidateQueries({ queryKey: ["vendas"] });
      const num = data?.data?.numero || data?.data?.id || "";
      toast.success(
        `Pedido criado no Bling${num ? ` (nº ${num})` : ""}! Confira o endereço de entrega e gere a NF-e no Bling.`,
        { duration: 6000 }
      );
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });
}

export interface BlingPreview {
  dry_run: true;
  order_number: string;
  customer_name: string;
  contact_found: boolean;
  contact_id: number | null;
  contact_source: string;
  items_summary: Array<{ name: string; matched: boolean; codigo: string }>;
  warnings: string[];
  payload: Record<string, any>;
}

export function usePreviewBlingPedido() {
  return useMutation({
    mutationFn: async (orderId: string): Promise<BlingPreview> => {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error("Não autenticado");

      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/bling-sync`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ entity: "create_order", order_id: orderId, dry_run: true }),
        }
      );
      const json = await res.json().catch(() => ({ error: res.statusText }));
      if (!res.ok) throw new Error(json.error || "Erro ao gerar pré-visualização");
      return json as BlingPreview;
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });
}

export function useBulkAssignVendedor() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      orderIds,
      vendedorId,
      vendedorName,
      saleDate,
    }: {
      orderIds: string[];
      vendedorId: string;
      vendedorName: string;
      saleDate?: string;
    }) => {
      const payload: Record<string, any> = {
        vendedor_id: vendedorId,
        vendedor_name: vendedorName,
        updated_at: new Date().toISOString(),
      };
      if (saleDate) payload.sale_date = saleDate;

      const { error } = await supabase
        .from("carboze_orders")
        .update(payload)
        .in("id", orderIds);

      if (error) throw error;
    },
    onSuccess: (_, { orderIds }) => {
      queryClient.invalidateQueries({ queryKey: ["vendas"] });
      queryClient.invalidateQueries({ queryKey: ["faturamento"] });
      toast.success(`${orderIds.length} pedido(s) atribuído(s) com sucesso!`);
    },
    onError: (err: Error) => {
      toast.error("Erro ao atribuir vendedor: " + err.message);
    },
  });
}

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { PDVProduct } from "./usePDVProducts";

// ── Types ──────────────────────────────────────────────────────────────
export type PaymentType = "cash" | "card" | "pix" | "transfer";

export const PAYMENT_LABELS: Record<PaymentType, string> = {
  cash:     "Dinheiro",
  card:     "Cartão",
  pix:      "PIX",
  transfer: "Transferência",
};

export interface PDVSaleItem {
  product_id: string;
  product_name: string;
  qty: number;
  unit_price: number;
  subtotal: number;
}

export interface PDVSale {
  id: string;
  pdv_id: string;
  seller_id: string | null;
  rv_vendedor_name: string | null;
  items: PDVSaleItem[];
  subtotal: number;
  discount: number;
  total: number;
  payment_type: PaymentType;
  customer_name: string | null;
  customer_phone: string | null;
  notes: string | null;
  commission_amount: number;
  is_voided: boolean;
  voided_reason: string | null;
  voided_at: string | null;
  created_at: string;
  created_by: string | null;
  // joined
  pdv_sellers?: { name: string } | null;
}

export interface CreateSalePayload {
  pdv_id: string;
  seller_id?: string | null;
  rv_vendedor_name?: string | null;
  items: PDVSaleItem[];
  discount?: number;
  payment_type: PaymentType;
  customer_name?: string | null;
  customer_phone?: string | null;
  notes?: string | null;
  commission_rate?: number; // % do vendedor
}

export interface PDVSalesStats {
  today_count: number;
  today_revenue: number;
  month_count: number;
  month_revenue: number;
  avg_ticket: number;
}

// ── Hooks ──────────────────────────────────────────────────────────────

/** Lista vendas de um PDV (RLS: vendedor vê apenas as suas) */
export function usePDVSales(pdvId: string | undefined, limit = 50) {
  return useQuery({
    queryKey: ["pdv-sales", pdvId],
    queryFn: async (): Promise<PDVSale[]> => {
      if (!pdvId) return [];
      const { data, error } = await (supabase as any)
        .from("pdv_sales")
        .select("*, pdv_sellers(name)")
        .eq("pdv_id", pdvId)
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!pdvId,
  });
}

/** Estatísticas de vendas do PDV */
export function usePDVSalesStats(pdvId: string | undefined): {
  data: PDVSalesStats;
  isLoading: boolean;
} {
  const { data: sales = [], isLoading } = usePDVSales(pdvId, 1000);

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  const activeSales = sales.filter(s => !s.is_voided);

  const todaySales  = activeSales.filter(s => s.created_at >= todayStart);
  const monthSales  = activeSales.filter(s => s.created_at >= monthStart);

  const sum = (arr: PDVSale[]) => arr.reduce((acc, s) => acc + Number(s.total), 0);

  const todayRevenue = sum(todaySales);
  const monthRevenue = sum(monthSales);
  const avgTicket    = activeSales.length > 0 ? sum(activeSales) / activeSales.length : 0;

  return {
    data: {
      today_count:   todaySales.length,
      today_revenue: todayRevenue,
      month_count:   monthSales.length,
      month_revenue: monthRevenue,
      avg_ticket:    avgTicket,
    },
    isLoading,
  };
}

/** Ranking de todos os PDVs (admin only) */
export function usePDVNetworkRanking(period: "day" | "week" | "month" | "all" = "month") {
  return useQuery({
    queryKey: ["pdv-network-ranking", period],
    queryFn: async () => {
      const now = new Date();
      let fromDate: string | null = null;
      if (period === "day") {
        fromDate = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
      } else if (period === "week") {
        const d = new Date(now); d.setDate(d.getDate() - 7);
        fromDate = d.toISOString();
      } else if (period === "month") {
        fromDate = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      }

      let query = (supabase as any)
        .from("pdv_sales")
        .select("pdv_id, total, pdvs(name, address_city, address_state)")
        .eq("is_voided", false);

      if (fromDate) query = query.gte("created_at", fromDate);
      const { data, error } = await query;
      if (error) throw error;

      const map: Record<string, { pdv_id: string; name: string; city: string; state: string; qty: number; revenue: number }> = {};
      (data ?? []).forEach((row: any) => {
        const pid = row.pdv_id;
        if (!map[pid]) {
          map[pid] = {
            pdv_id: pid,
            name: row.pdvs?.name ?? "PDV",
            city: row.pdvs?.address_city ?? "",
            state: row.pdvs?.address_state ?? "",
            qty: 0,
            revenue: 0,
          };
        }
        map[pid].qty++;
        map[pid].revenue += Number(row.total) || 0;
      });

      return Object.values(map).sort((a, b) => b.revenue - a.revenue);
    },
    refetchInterval: 120_000,
  });
}

/** Registra uma venda POS + decrementa estoque de cada produto */
export function useCreatePDVSale() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: CreateSalePayload) => {
      const { data: auth } = await supabase.auth.getUser();
      const pdvId = payload.pdv_id;

      const subtotal = payload.items.reduce((acc, i) => acc + i.subtotal, 0);
      const discount = payload.discount ?? 0;
      const total    = Math.max(0, subtotal - discount);
      const commissionAmount = total * ((payload.commission_rate ?? 0) / 100);

      // 1. Inserir venda
      const { data: sale, error: saleErr } = await (supabase as any)
        .from("pdv_sales")
        .insert({
          pdv_id:           pdvId,
          seller_id:        payload.seller_id ?? null,
          rv_vendedor_name: payload.rv_vendedor_name ?? null,
          items:            payload.items,
          subtotal,
          discount,
          total,
          payment_type:     payload.payment_type,
          customer_name:    payload.customer_name ?? null,
          customer_phone:   payload.customer_phone ?? null,
          notes:            payload.notes ?? null,
          commission_amount: commissionAmount,
          created_by:       auth.user?.id,
        })
        .select()
        .single();
      if (saleErr) throw saleErr;

      // 2. Decrementar estoque de cada produto e registrar movimentos
      for (const item of payload.items) {
        const { data: stockRow } = await (supabase as any)
          .from("pdv_product_stock")
          .select("qty_current")
          .eq("pdv_id", pdvId)
          .eq("product_id", item.product_id)
          .maybeSingle();

        const qtyBefore = stockRow?.qty_current ?? 0;
        const qtyAfter  = Math.max(0, qtyBefore - item.qty);

        await (supabase as any)
          .from("pdv_product_stock")
          .upsert(
            { pdv_id: pdvId, product_id: item.product_id, qty_current: qtyAfter },
            { onConflict: "pdv_id,product_id" }
          );

        await (supabase as any)
          .from("pdv_stock_movements")
          .insert({
            pdv_id:     pdvId,
            product_id: item.product_id,
            tipo:       "venda",
            qty:        -item.qty,
            qty_before: qtyBefore,
            qty_after:  qtyAfter,
            sale_id:    (sale as any).id,
            notes:      `Venda ${(sale as any).id.slice(0, 8)}`,
            created_by: auth.user?.id,
          });
      }

      return sale;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["pdv-sales", vars.pdv_id] });
      qc.invalidateQueries({ queryKey: ["pdv-product-stock", vars.pdv_id] });
      qc.invalidateQueries({ queryKey: ["pdv-stock-movements", vars.pdv_id] });
      qc.invalidateQueries({ queryKey: ["pdv-seller-ranking", vars.pdv_id] });
      qc.invalidateQueries({ queryKey: ["pdv-network-ranking"] });
      toast.success("Venda registrada com sucesso!");
    },
    onError: (e: Error) => toast.error("Erro ao registrar venda: " + e.message),
  });
}

/** Anula uma venda + estorna estoque */
export function useVoidPDVSale() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      saleId,
      pdvId,
      reason,
      items,
    }: {
      saleId: string;
      pdvId: string;
      reason: string;
      items: PDVSaleItem[];
    }) => {
      const { data: auth } = await supabase.auth.getUser();

      // Marcar como anulada
      const { error } = await (supabase as any)
        .from("pdv_sales")
        .update({
          is_voided:    true,
          voided_reason: reason,
          voided_at:    new Date().toISOString(),
          voided_by:    auth.user?.id,
        })
        .eq("id", saleId);
      if (error) throw error;

      // Estornar estoque
      for (const item of items) {
        const { data: stockRow } = await (supabase as any)
          .from("pdv_product_stock")
          .select("qty_current")
          .eq("pdv_id", pdvId)
          .eq("product_id", item.product_id)
          .maybeSingle();

        const qtyBefore = stockRow?.qty_current ?? 0;
        const qtyAfter  = qtyBefore + item.qty;

        await (supabase as any)
          .from("pdv_product_stock")
          .upsert(
            { pdv_id: pdvId, product_id: item.product_id, qty_current: qtyAfter },
            { onConflict: "pdv_id,product_id" }
          );

        await (supabase as any)
          .from("pdv_stock_movements")
          .insert({
            pdv_id:     pdvId,
            product_id: item.product_id,
            tipo:       "ajuste",
            qty:        item.qty,
            qty_before: qtyBefore,
            qty_after:  qtyAfter,
            sale_id:    saleId,
            notes:      `Estorno venda anulada: ${reason}`,
            created_by: auth.user?.id,
          });
      }
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["pdv-sales", vars.pdvId] });
      qc.invalidateQueries({ queryKey: ["pdv-product-stock", vars.pdvId] });
      qc.invalidateQueries({ queryKey: ["pdv-stock-movements", vars.pdvId] });
      toast.success("Venda anulada e estoque estornado");
    },
    onError: (e: Error) => toast.error("Erro ao anular venda: " + e.message),
  });
}

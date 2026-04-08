import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

// ── Types ──────────────────────────────────────────────────────────────
export interface PDVProduct {
  id: string;
  sku_code: string;
  name: string;
  short_name: string | null;
  description: string | null;
  price_default: number;
  unit: string;
  image_url: string | null;
  is_active: boolean;
  sort_order: number;
  created_at: string;
}

export interface PDVProductStock {
  id: string;
  pdv_id: string;
  product_id: string;
  qty_current: number;
  qty_min_threshold: number;
  qty_max_capacity: number;
  has_alert: boolean;
  last_updated: string;
  // joined
  product?: PDVProduct;
}

export interface PDVStockMovement {
  id: string;
  pdv_id: string;
  product_id: string;
  tipo: "venda" | "reposicao" | "ajuste" | "perda" | "entrada";
  qty: number;
  qty_before: number | null;
  qty_after: number | null;
  sale_id: string | null;
  notes: string | null;
  created_at: string;
  created_by: string | null;
  // joined
  product?: { name: string; short_name: string | null };
}

export const MOVEMENT_LABELS: Record<PDVStockMovement["tipo"], string> = {
  venda:     "Venda",
  reposicao: "Reposição",
  ajuste:    "Ajuste",
  perda:     "Perda",
  entrada:   "Entrada",
};

// ── Hooks ──────────────────────────────────────────────────────────────

/** Lista todos os produtos ativos do catálogo PDV */
export function usePDVProducts() {
  return useQuery({
    queryKey: ["pdv-products"],
    queryFn: async (): Promise<PDVProduct[]> => {
      const { data, error } = await (supabase as any)
        .from("pdv_products")
        .select("*")
        .eq("is_active", true)
        .order("sort_order");
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 5 * 60_000,
  });
}

/** Estoque de cada produto em um PDV específico */
export function usePDVProductStock(pdvId: string | undefined) {
  return useQuery({
    queryKey: ["pdv-product-stock", pdvId],
    queryFn: async (): Promise<PDVProductStock[]> => {
      if (!pdvId) return [];
      const { data, error } = await (supabase as any)
        .from("pdv_product_stock")
        .select("*, product:pdv_products(*)")
        .eq("pdv_id", pdvId)
        .order("product(sort_order)");
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!pdvId,
  });
}

/** Inicializa estoque 0 para todos os produtos em um PDV */
export function useInitPDVProductStock() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (pdvId: string) => {
      const { data: products } = await (supabase as any)
        .from("pdv_products")
        .select("id")
        .eq("is_active", true);

      if (!products?.length) return;

      const rows = products.map((p: { id: string }) => ({
        pdv_id: pdvId,
        product_id: p.id,
        qty_current: 0,
        qty_min_threshold: 5,
        qty_max_capacity: 100,
      }));

      const { error } = await (supabase as any)
        .from("pdv_product_stock")
        .upsert(rows, { onConflict: "pdv_id,product_id" });
      if (error) throw error;
    },
    onSuccess: (_, pdvId) => {
      qc.invalidateQueries({ queryKey: ["pdv-product-stock", pdvId] });
    },
  });
}

/** Ajuste/reposição de estoque */
export function useAdjustPDVStock() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      pdvId,
      productId,
      tipo,
      qty,
      notes,
    }: {
      pdvId: string;
      productId: string;
      tipo: PDVStockMovement["tipo"];
      qty: number; // sempre positivo — o tipo define se é entrada ou saída
      notes?: string;
    }) => {
      const { data: auth } = await supabase.auth.getUser();

      // Busca estoque atual
      const { data: stockRow } = await (supabase as any)
        .from("pdv_product_stock")
        .select("qty_current, qty_min_threshold, qty_max_capacity")
        .eq("pdv_id", pdvId)
        .eq("product_id", productId)
        .maybeSingle();

      const qtyBefore = stockRow?.qty_current ?? 0;
      const delta = tipo === "venda" || tipo === "perda" ? -Math.abs(qty) : Math.abs(qty);
      const qtyAfter = Math.max(0, qtyBefore + delta);

      // Atualiza estoque
      await (supabase as any)
        .from("pdv_product_stock")
        .upsert(
          { pdv_id: pdvId, product_id: productId, qty_current: qtyAfter },
          { onConflict: "pdv_id,product_id" }
        );

      // Insere movimento
      await (supabase as any)
        .from("pdv_stock_movements")
        .insert({
          pdv_id: pdvId,
          product_id: productId,
          tipo,
          qty: delta,
          qty_before: qtyBefore,
          qty_after: qtyAfter,
          notes: notes || null,
          created_by: auth.user?.id,
        });
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["pdv-product-stock", vars.pdvId] });
      qc.invalidateQueries({ queryKey: ["pdv-stock-movements", vars.pdvId] });
      toast.success("Estoque atualizado");
    },
    onError: (e: Error) => toast.error("Erro ao ajustar estoque: " + e.message),
  });
}

/** Histórico de movimentações de estoque do PDV */
export function usePDVStockMovements(pdvId: string | undefined, limit = 50) {
  return useQuery({
    queryKey: ["pdv-stock-movements", pdvId],
    queryFn: async (): Promise<PDVStockMovement[]> => {
      if (!pdvId) return [];
      const { data, error } = await (supabase as any)
        .from("pdv_stock_movements")
        .select("*, product:pdv_products(name, short_name)")
        .eq("pdv_id", pdvId)
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!pdvId,
  });
}

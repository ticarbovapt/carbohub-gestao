import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

// ── Types ──────────────────────────────────────────────────────────────
export interface LicenseeProductStock {
  id: string;
  licensee_id: string;
  product_id: string;
  qty_current: number;
  qty_min_threshold: number;
  qty_max_capacity: number;
  has_alert: boolean;
  last_updated: string;
  // joined
  product?: { id: string; name: string; short_name: string | null; sku_code: string; sort_order: number };
}

export interface LicenseeStockMovement {
  id: string;
  licensee_id: string;
  product_id: string;
  tipo: "entrada" | "reposicao" | "ajuste" | "perda" | "venda";
  qty: number;
  qty_before: number | null;
  qty_after: number | null;
  notes: string | null;
  created_at: string;
  created_by: string | null;
  product?: { name: string; short_name: string | null };
}

export interface ProductionOrder {
  id: string;
  licensee_id: string | null;
  product_id: string;
  qty_requested: number;
  status: "pending" | "approved" | "in_production" | "shipped" | "delivered" | "cancelled";
  notes: string | null;
  created_at: string;
  product?: { name: string };
}

export const LICENSEE_MOVEMENT_LABELS: Record<LicenseeStockMovement["tipo"], string> = {
  entrada:   "Entrada",
  reposicao: "Reposição",
  ajuste:    "Ajuste",
  perda:     "Perda",
  venda:     "Venda",
};

// ── Hooks ──────────────────────────────────────────────────────────────

/** Estoque de produtos de um licenciado */
export function useLicenseeProductStock(licenseeId: string | undefined) {
  return useQuery({
    queryKey: ["licensee-product-stock", licenseeId],
    queryFn: async (): Promise<LicenseeProductStock[]> => {
      if (!licenseeId) return [];
      const { data, error } = await (supabase as any)
        .from("licensee_product_stock")
        .select("*, product:pdv_products(id, name, short_name, sku_code, sort_order)")
        .eq("licensee_id", licenseeId)
        .order("product(sort_order)");
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!licenseeId,
  });
}

/** Histórico de movimentações de um licenciado */
export function useLicenseeStockMovements(licenseeId: string | undefined, limit = 30) {
  return useQuery({
    queryKey: ["licensee-stock-movements", licenseeId],
    queryFn: async (): Promise<LicenseeStockMovement[]> => {
      if (!licenseeId) return [];
      const { data, error } = await (supabase as any)
        .from("licensee_stock_movements")
        .select("*, product:pdv_products(name, short_name)")
        .eq("licensee_id", licenseeId)
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!licenseeId,
  });
}

/** Ajuste de estoque de um licenciado */
export function useAdjustLicenseeStock() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      licenseeId,
      productId,
      tipo,
      qty,
      notes,
    }: {
      licenseeId: string;
      productId: string;
      tipo: LicenseeStockMovement["tipo"];
      qty: number;
      notes?: string;
    }) => {
      const { data: auth } = await supabase.auth.getUser();

      const { data: stockRow } = await (supabase as any)
        .from("licensee_product_stock")
        .select("qty_current, qty_min_threshold")
        .eq("licensee_id", licenseeId)
        .eq("product_id", productId)
        .maybeSingle();

      const qtyBefore = stockRow?.qty_current ?? 0;
      const delta = tipo === "venda" || tipo === "perda" ? -Math.abs(qty) : Math.abs(qty);
      const qtyAfter = Math.max(0, qtyBefore + delta);

      await (supabase as any)
        .from("licensee_product_stock")
        .upsert(
          { licensee_id: licenseeId, product_id: productId, qty_current: qtyAfter },
          { onConflict: "licensee_id,product_id" }
        );

      await (supabase as any)
        .from("licensee_stock_movements")
        .insert({
          licensee_id: licenseeId,
          product_id: productId,
          tipo,
          qty: delta,
          qty_before: qtyBefore,
          qty_after: qtyAfter,
          notes: notes || null,
          created_by: auth.user?.id,
        });

      return { qtyAfter, qtyMinThreshold: stockRow?.qty_min_threshold ?? 5 };
    },
    onSuccess: (result, vars) => {
      qc.invalidateQueries({ queryKey: ["licensee-product-stock", vars.licenseeId] });
      qc.invalidateQueries({ queryKey: ["licensee-stock-movements", vars.licenseeId] });
      toast.success("Estoque atualizado");

      if (result.qtyAfter <= result.qtyMinThreshold) {
        toast.warning("Estoque abaixo do mínimo — considere solicitar reposição.", {
          duration: 6000,
          action: { label: "OK", onClick: () => {} },
        });
      }
    },
    onError: (e: Error) => toast.error("Erro ao ajustar estoque: " + e.message),
  });
}

/** Inicializa estoque 0 para todos os produtos em um licenciado */
export function useInitLicenseeProductStock() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (licenseeId: string) => {
      const { data: products } = await (supabase as any)
        .from("pdv_products")
        .select("id")
        .eq("is_active", true);

      if (!products?.length) return;

      const rows = products.map((p: { id: string }) => ({
        licensee_id: licenseeId,
        product_id: p.id,
        qty_current: 0,
        qty_min_threshold: 5,
        qty_max_capacity: 100,
      }));

      const { error } = await (supabase as any)
        .from("licensee_product_stock")
        .upsert(rows, { onConflict: "licensee_id,product_id" });
      if (error) throw error;
    },
    onSuccess: (_, licenseeId) => {
      qc.invalidateQueries({ queryKey: ["licensee-product-stock", licenseeId] });
    },
  });
}

/** Cria ordem de produção */
export function useCreateProductionOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      licenseeId,
      productId,
      qtyRequested,
      notes,
    }: {
      licenseeId: string | null;
      productId: string;
      qtyRequested: number;
      notes?: string;
    }) => {
      const { data: auth } = await supabase.auth.getUser();
      const { data, error } = await (supabase as any)
        .from("production_orders")
        .insert({
          licensee_id: licenseeId,
          product_id: productId,
          qty_requested: qtyRequested,
          notes: notes || null,
          created_by: auth.user?.id,
        })
        .select()
        .single();
      if (error) throw error;
      return data as ProductionOrder;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["production-orders"] });
      toast.success("Solicitação de reposição enviada!");
    },
    onError: (e: Error) => toast.error("Erro ao solicitar reposição: " + e.message),
  });
}

/** Estoque de todos os licenciados Mood1 (admin only) */
export function useAdminLicenseeAllStock() {
  return useQuery({
    queryKey: ["admin-licensee-all-stock"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("licensee_product_stock")
        .select("*, licensee:licensees(name, address_city, address_state, licensee_mode), product:pdv_products(name, sort_order)")
        .order("product(sort_order)");
      if (error) throw error;
      return (data ?? [])
        .filter((row: any) => row.licensee?.licensee_mode === "mood1" || !row.licensee?.licensee_mode)
        .map((row: any) => ({
          licensee_id:       row.licensee_id,
          licensee_name:     row.licensee?.name ?? "Licenciado",
          licensee_city:     row.licensee?.address_city ?? "",
          licensee_state:    row.licensee?.address_state ?? "",
          product_id:        row.product_id,
          product_name:      row.product?.name ?? "Produto",
          sort_order:        row.product?.sort_order ?? 0,
          qty_current:       Number(row.qty_current) || 0,
          qty_min_threshold: Number(row.qty_min_threshold) || 0,
          qty_max_capacity:  Number(row.qty_max_capacity) || 0,
          has_alert:         !!row.has_alert,
        }));
    },
    staleTime: 30_000,
  });
}

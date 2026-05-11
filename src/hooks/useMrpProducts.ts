import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface MrpProduct {
  id: string;
  product_code: string;
  name: string;
  category: string | null;
  packaging_size_ml: number | null;
  packaging_size_g: number | null;
  package_qty: number | null;
  min_order_qty: number | null;
  safety_stock_qty: number;
  dimensions_cm: Record<string, number> | null;
  weight_kg: number | null;
  notes: string | null;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  current_stock_qty: number;
  stock_updated_at: string | null;
  stock_unit: string;
}

export interface WarehouseStock {
  warehouse_id: string;
  warehouse_name: string;
  quantity: number;
}

export function useMrpProducts() {
  return useQuery({
    queryKey: ["mrp-products"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("mrp_products")
        .select("*")
        .order("product_code");
      if (error) throw error;
      return data as MrpProduct[];
    },
  });
}

export function useWarehouseStockByProduct() {
  return useQuery({
    queryKey: ["warehouse-stock-all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("warehouse_stock")
        .select("product_id, quantity, warehouse:warehouses(id, name)")
        .order("product_id");
      if (error) throw error;

      // Group by product_id
      const map: Record<string, WarehouseStock[]> = {};
      for (const row of data || []) {
        const pid = row.product_id;
        if (!map[pid]) map[pid] = [];
        const wh = row.warehouse as any;
        map[pid].push({
          warehouse_id: wh?.id || "",
          warehouse_name: wh?.name || "Desconhecido",
          quantity: row.quantity || 0,
        });
      }
      return map;
    },
  });
}

export function useCreateMrpProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (product: Omit<MrpProduct, "id" | "created_at" | "updated_at" | "created_by">) => {
      const { data: user } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from("mrp_products")
        .insert({ ...product, created_by: user.user?.id })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["mrp-products"] }); toast.success("Produto criado!"); },
    onError: (e: Error) => toast.error("Erro: " + e.message),
  });
}

export function useUpdateMrpProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...data }: Partial<MrpProduct> & { id: string }) => {
      const { data: updated, error } = await supabase
        .from("mrp_products")
        .update(data)
        .eq("id", id)
        .select();
      if (error) throw error;
      if (!updated || updated.length === 0) throw new Error("Produto não encontrado ou sem permissão para editar.");
      return updated[0];
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["mrp-products"] });
      qc.invalidateQueries({ queryKey: ["warehouse-stock-all"] });
      toast.success("Produto atualizado. Sistema verificará necessidade de OP automática.");
    },
    onError: (e: Error) => toast.error("Erro: " + e.message),
  });
}

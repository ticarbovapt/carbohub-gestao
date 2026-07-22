import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface SkuWarehousePolicy {
  id: string;
  sku_id: string;
  warehouse_id: string;
  safety_stock_qty: number;
  min_coverage_days: number;
  is_active: boolean;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  // Joined
  sku?: { id: string; code: string; name: string; packaging_ml: number | null };
  warehouse?: { id: string; code: string; name: string };
}

export interface InsumoRequirement {
  id: string;
  sku_id: string;
  warehouse_id: string;
  product_id: string;
  required_qty: number;
  current_stock_qty: number;
  deficit: number;
  last_calculated_at: string;
  // Joined
  sku?: { code: string; name: string };
  warehouse?: { code: string; name: string };
  product?: { product_code: string; name: string };
}

export function useSkuWarehousePolicies() {
  return useQuery({
    queryKey: ["sku-warehouse-policies"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sku_warehouse_policy")
        .select(`
          *,
          sku:sku(id, code, name, packaging_ml),
          warehouse:warehouses(id, code, name)
        `)
        .eq("is_active", true)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data as SkuWarehousePolicy[];
    },
  });
}

export function useUpsertSkuWarehousePolicy() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      sku_id: string;
      warehouse_id: string;
      safety_stock_qty: number;
      min_coverage_days?: number;
    }) => {
      const { data: user } = await supabase.auth.getUser();

      const { data: result, error } = await supabase
        .from("sku_warehouse_policy")
        .upsert(
          {
            sku_id: data.sku_id,
            warehouse_id: data.warehouse_id,
            safety_stock_qty: data.safety_stock_qty,
            min_coverage_days: data.min_coverage_days || 30,
            is_active: true,
            updated_by: user.user?.id,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "sku_id,warehouse_id" }
        )
        .select()
        .single();

      if (error) throw error;
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sku-warehouse-policies"] });
      queryClient.invalidateQueries({ queryKey: ["insumo-requirements"] });
      toast.success("Estoque mínimo atualizado!");
    },
    onError: (error: Error) => {
      toast.error("Erro ao atualizar: " + error.message);
    },
  });
}

export function useInsumoRequirements() {
  return useQuery({
    queryKey: ["insumo-requirements"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("insumo_requirement")
        .select(`
          *,
          sku:sku(code, name),
          warehouse:warehouses(code, name),
          product:mrp_products(product_code, name)
        `)
        .gt("deficit", 0)
        .order("deficit", { ascending: false });

      if (error) throw error;
      return data as InsumoRequirement[];
    },
  });
}

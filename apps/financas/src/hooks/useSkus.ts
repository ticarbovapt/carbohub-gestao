import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

// ============================================================
// Types
// ============================================================

export interface Sku {
  id: string;
  code: string;
  name: string;
  description: string | null;
  category: string;
  unit: string;
  packaging_ml: number | null;
  is_active: boolean;
  safety_stock_qty: number;
  target_coverage_days: number;
  created_at: string;
  updated_at: string;
}

export interface SkuBomItem {
  product_id: string;
  quantity_per_unit: number;
  unit: string;
  is_critical: boolean;
  name: string;
}

export interface SkuBom {
  id: string;
  sku_id: string;
  version: number;
  is_active: boolean;
  items: SkuBomItem[];
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export type SkuInsert = Omit<Sku, "id" | "created_at" | "updated_at">;

// ============================================================
// Queries
// ============================================================

export function useSkus() {
  return useQuery({
    queryKey: ["skus"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("sku")
        .select("*")
        .order("code");
      if (error) throw error;
      return data as Sku[];
    },
  });
}

export function useSkuBoms(skuId: string | undefined) {
  return useQuery({
    queryKey: ["sku-boms", skuId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("sku_bom")
        .select("*")
        .eq("sku_id", skuId)
        .order("version", { ascending: false });
      if (error) throw error;
      return data as SkuBom[];
    },
    enabled: !!skuId,
  });
}

/** Returns a map of sku_id → active BOM version number */
export function useActiveSkuBoms() {
  return useQuery({
    queryKey: ["sku-boms-active"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("sku_bom")
        .select("sku_id, version")
        .eq("is_active", true);
      if (error) throw error;
      const map: Record<string, number> = {};
      for (const row of data || []) {
        map[row.sku_id] = row.version;
      }
      return map;
    },
  });
}

// ============================================================
// Mutations
// ============================================================

export function useCreateSku() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (sku: Partial<SkuInsert>) => {
      const { data, error } = await (supabase as any)
        .from("sku")
        .insert(sku)
        .select()
        .single();
      if (error) throw error;
      return data as Sku;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["skus"] });
      toast.success("SKU criado com sucesso!");
    },
    onError: (e: Error) => toast.error("Erro ao criar SKU: " + e.message),
  });
}

export function useUpdateSku() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Sku> & { id: string }) => {
      const { data, error } = await (supabase as any)
        .from("sku")
        .update(updates)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data as Sku;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["skus"] });
      toast.success("SKU atualizado!");
    },
    onError: (e: Error) => toast.error("Erro ao atualizar: " + e.message),
  });
}

export function useDeleteSku() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any)
        .from("sku")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["skus"] });
      qc.invalidateQueries({ queryKey: ["sku-boms-active"] });
      toast.success("SKU removido!");
    },
    onError: (e: Error) => toast.error("Erro ao remover: " + e.message),
  });
}

export function useUpdateSkuBom() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, items, skuId }: { id: string; items: SkuBomItem[]; skuId: string }) => {
      const { error } = await (supabase as any)
        .from("sku_bom")
        .update({ items })
        .eq("id", id);
      if (error) throw error;
      return skuId;
    },
    onSuccess: (skuId) => {
      qc.invalidateQueries({ queryKey: ["sku-boms", skuId] });
      toast.success("BOM atualizada!");
    },
    onError: (e: Error) => toast.error("Erro ao salvar BOM: " + e.message),
  });
}

export function useCreateSkuBom() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      skuId,
      items,
      newVersion,
    }: {
      skuId: string;
      items: SkuBomItem[];
      newVersion: number;
    }) => {
      // Deactivate all existing BOMs for this SKU
      await (supabase as any)
        .from("sku_bom")
        .update({ is_active: false })
        .eq("sku_id", skuId);

      // Get current user
      const { data: user } = await supabase.auth.getUser();

      // Insert new active version
      const { data, error } = await (supabase as any)
        .from("sku_bom")
        .insert({
          sku_id: skuId,
          version: newVersion,
          is_active: true,
          items,
          created_by: user.user?.id,
        })
        .select()
        .single();
      if (error) throw error;
      return { bom: data as SkuBom, skuId };
    },
    onSuccess: ({ skuId }) => {
      qc.invalidateQueries({ queryKey: ["sku-boms", skuId] });
      qc.invalidateQueries({ queryKey: ["sku-boms-active"] });
      toast.success("Nova versão da BOM criada!");
    },
    onError: (e: Error) => toast.error("Erro ao criar versão: " + e.message),
  });
}

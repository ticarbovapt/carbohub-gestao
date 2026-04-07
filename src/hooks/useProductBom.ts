import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

// ── Types ──────────────────────────────────────────────────────────────────

export interface MrpBomItem {
  id: string;
  product_id: string;          // Produto Final
  insumo_id: string;           // Insumo/embalagem consumido
  quantity_per_unit: number;
  unit: string;
  is_critical: boolean;
  notes: string | null;
  created_at: string;
  // Dados do insumo (join)
  insumo?: {
    id: string;
    name: string;
    product_code: string;
    stock_unit: string;
    category: string | null;
  };
}

export interface MrpBomInsert {
  product_id: string;
  insumo_id: string;
  quantity_per_unit: number;
  unit: string;
  is_critical: boolean;
  notes?: string | null;
}

// ── Queries ────────────────────────────────────────────────────────────────

export function useProductBom(productId: string | null | undefined) {
  return useQuery({
    queryKey: ["mrp-bom", productId],
    queryFn: async (): Promise<MrpBomItem[]> => {
      const { data, error } = await (supabase as any)
        .from("mrp_bom")
        .select(`
          *,
          insumo:insumo_id (
            id, name, product_code, stock_unit, category
          )
        `)
        .eq("product_id", productId)
        .order("is_critical", { ascending: false })
        .order("created_at");

      if (error) throw error;
      return (data ?? []) as MrpBomItem[];
    },
    enabled: !!productId,
  });
}

// ── Mutations ──────────────────────────────────────────────────────────────

export function useUpsertBomItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (item: MrpBomInsert) => {
      const { data: user } = await supabase.auth.getUser();
      const { data, error } = await (supabase as any)
        .from("mrp_bom")
        .upsert(
          { ...item, created_by: user.user?.id },
          { onConflict: "product_id,insumo_id" }
        )
        .select()
        .single();
      if (error) throw error;
      return data as MrpBomItem;
    },
    onSuccess: (_, variables) => {
      qc.invalidateQueries({ queryKey: ["mrp-bom", variables.product_id] });
      toast.success("Item da BOM salvo!");
    },
    onError: (e: Error) => toast.error("Erro ao salvar item: " + e.message),
  });
}

export function useDeleteBomItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, productId }: { id: string; productId: string }) => {
      const { error } = await (supabase as any)
        .from("mrp_bom")
        .delete()
        .eq("id", id);
      if (error) throw error;
      return productId;
    },
    onSuccess: (productId) => {
      qc.invalidateQueries({ queryKey: ["mrp-bom", productId] });
      toast.success("Item removido da BOM.");
    },
    onError: (e: Error) => toast.error("Erro ao remover: " + e.message),
  });
}

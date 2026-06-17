import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// ─────────────────────────────────────────────────────────────────────────────
// Criar/editar/excluir SKU (tabela sku).
//  RLS: sku aberto a autenticado (migration do catálogo).
// ─────────────────────────────────────────────────────────────────────────────

const db = supabase as unknown as { from: (t: string) => any };

export interface SkuInput {
  code: string;
  name: string;
  description?: string;
  category: string;
  unit: string;
  packaging_ml?: number | null;
  safety_stock_qty: number;
  target_coverage_days: number;
  is_active: boolean;
}

export function useSkuMutations() {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ["ops", "skus"] });

  const payload = (p: SkuInput) => ({
    code: p.code.trim(),
    name: p.name.trim(),
    description: p.description?.trim() || null,
    category: p.category,
    unit: p.unit || "un",
    packaging_ml: p.packaging_ml == null || Number.isNaN(p.packaging_ml) ? null : p.packaging_ml,
    safety_stock_qty: p.safety_stock_qty,
    target_coverage_days: p.target_coverage_days,
    is_active: p.is_active,
  });

  const create = useMutation({
    mutationFn: async (p: SkuInput) => {
      if (!p.code.trim() || !p.name.trim()) throw new Error("Código e nome são obrigatórios.");
      const res = await db.from("sku").insert(payload(p));
      if (res.error) throw res.error;
    },
    onSuccess: invalidate,
  });

  const update = useMutation({
    mutationFn: async ({ id, ...p }: SkuInput & { id: string }) => {
      if (!p.code.trim() || !p.name.trim()) throw new Error("Código e nome são obrigatórios.");
      const res = await db.from("sku").update({ ...payload(p), updated_at: new Date().toISOString() }).eq("id", id);
      if (res.error) throw res.error;
    },
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const res = await db.from("sku").delete().eq("id", id);
      if (res.error) throw res.error;
    },
    onSuccess: invalidate,
  });

  return { create, update, remove };
}

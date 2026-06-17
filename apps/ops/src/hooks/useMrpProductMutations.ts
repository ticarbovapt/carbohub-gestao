import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// ─────────────────────────────────────────────────────────────────────────────
// Criar/editar produto do catálogo MRP (mrp_products).
//  RLS: mrp_products aberto a autenticado (migration do catálogo).
// ─────────────────────────────────────────────────────────────────────────────

const db = supabase as unknown as {
  from: (t: string) => any;
  auth: { getUser: () => Promise<{ data: { user: { id: string } | null } }> };
};

export interface MrpProductInput {
  name: string;
  product_code: string;
  category: string;
  stock_unit: string;
  safety_stock_qty: number;
  notes?: string;
}

export function useMrpProductMutations() {
  const qc = useQueryClient();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["ops", "mrp-products"] });
    qc.invalidateQueries({ queryKey: ["ops", "stock"] });
  };

  const create = useMutation({
    mutationFn: async (p: MrpProductInput) => {
      if (!p.name.trim() || !p.product_code.trim()) throw new Error("Nome e código são obrigatórios.");
      const { data: auth } = await db.auth.getUser();
      const res = await db.from("mrp_products").insert({
        name: p.name.trim(),
        product_code: p.product_code.trim(),
        category: p.category,
        stock_unit: p.stock_unit,
        safety_stock_qty: p.safety_stock_qty,
        notes: p.notes?.trim() || null,
        is_active: true,
        created_by: auth?.user?.id ?? null,
      });
      if (res.error) throw res.error;
    },
    onSuccess: invalidate,
  });

  const update = useMutation({
    mutationFn: async ({ id, ...p }: MrpProductInput & { id: string }) => {
      if (!p.name.trim() || !p.product_code.trim()) throw new Error("Nome e código são obrigatórios.");
      const res = await db.from("mrp_products").update({
        name: p.name.trim(),
        product_code: p.product_code.trim(),
        category: p.category,
        stock_unit: p.stock_unit,
        safety_stock_qty: p.safety_stock_qty,
        notes: p.notes?.trim() || null,
        updated_at: new Date().toISOString(),
      }).eq("id", id);
      if (res.error) throw res.error;
    },
    onSuccess: invalidate,
  });

  return { create, update };
}

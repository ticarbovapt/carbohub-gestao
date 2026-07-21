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
  unit_cost: number;
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
        unit_cost: p.unit_cost,
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
        unit_cost: p.unit_cost,
        notes: p.notes?.trim() || null,
        updated_at: new Date().toISOString(),
      }).eq("id", id);
      if (res.error) throw res.error;
    },
    onSuccess: invalidate,
  });

  // Exclui um produto do catálogo — só se não tiver movimentação:
  //  • sem estoque (soma warehouse_stock = 0)
  //  • não é insumo de nenhuma BOM
  //  • não é usado em nenhuma OP (production_orders)
  // Se tiver vínculo, oriente a DESATIVAR (preserva histórico).
  const remove = useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      // Falha na consulta NÃO pode liberar a exclusão (senão erro de RLS/rede
      // vira "sem vínculo" e apaga produto com estoque/BOM/OP).
      const st = await db.from("warehouse_stock").select("quantity").eq("product_id", id);
      if (st.error) throw st.error;
      const total = (st.data ?? []).reduce((s: number, r: any) => s + (Number(r.quantity) || 0), 0);
      if (total > 0) throw new Error(`"${name}" tem ${total} em estoque. Zere o estoque ou desative em vez de excluir.`);

      const asInsumo = await db.from("mrp_bom").select("id").eq("insumo_id", id).limit(1);
      if (asInsumo.error) throw asInsumo.error;
      if (asInsumo.data?.length) throw new Error(`"${name}" é insumo de uma BOM. Remova da BOM ou desative.`);

      const inOp = await db.from("production_orders").select("id").eq("product_id", id).limit(1);
      if (inOp.error) throw inOp.error;
      if (inOp.data?.length) throw new Error(`"${name}" está vinculado a uma OP. Não é possível excluir — desative.`);

      // Apaga a própria BOM do produto (mrp_bom.product_id) e o produto.
      await db.from("mrp_bom").delete().eq("product_id", id);
      const res = await db.from("mrp_products").delete().eq("id", id);
      if (res.error) throw res.error;
    },
    onSuccess: invalidate,
  });

  // Desativa (some do catálogo ativo, mantém histórico).
  const deactivate = useMutation({
    mutationFn: async (id: string) => {
      const res = await db.from("mrp_products").update({ is_active: false, updated_at: new Date().toISOString() }).eq("id", id);
      if (res.error) throw res.error;
    },
    onSuccess: invalidate,
  });

  return { create, update, remove, deactivate };
}

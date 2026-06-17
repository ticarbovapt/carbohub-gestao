import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// ─────────────────────────────────────────────────────────────────────────────
// Estoque mínimo por produto × hub (Carbo Ops) — grava em ops_stock_min.
//  RLS: ops_stock_min aberto a autenticado (restringe a gestor depois).
// ─────────────────────────────────────────────────────────────────────────────

const db = supabase as unknown as {
  from: (t: string) => any;
  auth: { getUser: () => Promise<{ data: { user: { id: string } | null } }> };
};

export interface SetMinArgs {
  productId: string;
  warehouseCode: string; // HUB-RN | HUB-SP | HUB-SP-VENDAS
  minQty: number;
}

export function useSetStockMin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ productId, warehouseCode, minQty }: SetMinArgs) => {
      if (!Number.isFinite(minQty) || minQty < 0) throw new Error("Mínimo inválido.");
      const wh = await db.from("warehouses").select("id").eq("code", warehouseCode).maybeSingle();
      if (wh.error) throw wh.error;
      if (!wh.data?.id) throw new Error(`Centro de distribuição não encontrado (${warehouseCode}).`);

      const { data: auth } = await db.auth.getUser();
      const up = await db.from("ops_stock_min").upsert(
        {
          product_id: productId,
          warehouse_id: wh.data.id,
          min_qty: minQty,
          updated_by: auth?.user?.id ?? null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "product_id,warehouse_id" },
      );
      if (up.error) throw up.error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ops", "stock"] }),
  });
}

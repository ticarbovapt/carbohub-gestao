import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// ─────────────────────────────────────────────────────────────────────────────
// Escrita de estoque por hub (Carbo Ops).
//  • Fonte de verdade = warehouse_stock (upsert na chave warehouse_id+product_id).
//  • Auditoria = stock_movements (ledger por produto; origem 'ajuste', delta).
//  • Após gravar, invalida o cache de leitura → a tela reflete o saldo real.
//  RLS: warehouse_stock/stock_movements exigem gestor/CEO/admin.
// ─────────────────────────────────────────────────────────────────────────────

const db = supabase as unknown as {
  from: (t: string) => any;
  auth: { getUser: () => Promise<{ data: { user: { id: string } | null } }> };
};

// id do hub (UI) → código do warehouse (banco)
const HUB_TO_CODE: Record<string, string> = {
  rn: "HUB-RN",
  sp: "HUB-SP",
  spv: "HUB-SP-VENDAS",
  bling: "CD-BLING",
};

export interface SetStockArgs {
  productId: string;
  hubId: string;
  /** quantidade absoluta que o hub deve passar a ter */
  newQty: number;
  /** quantidade atual exibida (para calcular o delta do movimento) */
  currentQty: number;
  /** motivo/observação do ajuste (opcional) */
  motivo?: string;
}

export function useSetStockQty() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ productId, hubId, newQty, currentQty, motivo }: SetStockArgs) => {
      if (!Number.isFinite(newQty) || newQty < 0) throw new Error("Quantidade inválida.");
      const code = HUB_TO_CODE[hubId];
      if (!code) throw new Error("Hub inválido para edição de estoque.");

      // Resolve o warehouse pelo código.
      const wh = await db.from("warehouses").select("id").eq("code", code).maybeSingle();
      if (wh.error) throw wh.error;
      if (!wh.data?.id) throw new Error(`Centro de distribuição não encontrado (${code}).`);
      const warehouseId = wh.data.id as string;

      // Saldo real (upsert idempotente na chave única warehouse_id+product_id).
      const up = await db
        .from("warehouse_stock")
        .upsert(
          { warehouse_id: warehouseId, product_id: productId, quantity: newQty, updated_at: new Date().toISOString() },
          { onConflict: "warehouse_id,product_id" },
        );
      if (up.error) throw up.error;

      // Auditoria: só registra movimento se houve variação.
      const delta = newQty - currentQty;
      if (delta !== 0) {
        const { data: auth } = await db.auth.getUser();
        const mov = await db.from("stock_movements").insert({
          product_id: productId,
          tipo: delta > 0 ? "entrada" : "saida",
          quantidade: Math.abs(delta),
          origem: "ajuste",
          observacoes: motivo ? `[${code}] ${motivo}` : `[${code}] ajuste manual de saldo`,
          created_by: auth?.user?.id ?? null,
        });
        if (mov.error) throw mov.error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ops", "stock"] });
      qc.invalidateQueries({ queryKey: ["ops", "mrp-products"] });
    },
  });
}

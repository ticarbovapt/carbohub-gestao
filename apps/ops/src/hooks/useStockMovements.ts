import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// ─────────────────────────────────────────────────────────────────────────────
// Movimentações de estoque (Carbo Ops) — LEITURA do banco compartilhado.
//  • stock_movements = ledger append-only (entrada/saída). Tem warehouse_id →
//    cada hub mostra só as suas (telas independentes).
//  • created_by → nome de quem fez (profiles.full_name).
//  RLS: stock_movements liberado por SELECT a autenticado (migration do estoque).
// ─────────────────────────────────────────────────────────────────────────────

const db = supabase as unknown as { from: (t: string) => any };

export interface StockMovement {
  id: string;
  data: string;            // created_at ISO
  produto: string;
  product_code: string;
  tipo: "entrada" | "saida";
  qtd: number;
  unidade: string;
  origem: string;          // PC | OP | ajuste
  observacoes: string | null;
  warehouseCode: string | null;
  por: string | null;      // nome de quem fez
}

export function useStockMovements(limit = 300) {
  return useQuery({
    queryKey: ["ops", "stock-movements", limit],
    queryFn: async (): Promise<StockMovement[]> => {
      const [movs, products, warehouses, profiles] = await Promise.all([
        db
          .from("stock_movements")
          .select("id, product_id, warehouse_id, tipo, quantidade, origem, observacoes, created_at, created_by")
          .order("created_at", { ascending: false })
          .limit(limit),
        db.from("mrp_products").select("id, name, product_code, stock_unit"),
        db.from("warehouses").select("id, code"),
        db.from("profiles").select("id, full_name"),
      ]);
      if (movs.error) throw movs.error;
      if (products.error) throw products.error;
      if (warehouses.error) throw warehouses.error;
      // profiles pode ser barrado por RLS — nome cai pra "—" se faltar.

      const prodById = new Map<string, { name: string; code: string; unit: string }>();
      for (const p of products.data ?? []) prodById.set(p.id, { name: p.name ?? "", code: p.product_code ?? "", unit: p.stock_unit ?? "un" });
      const codeById = new Map<string, string>();
      for (const w of warehouses.data ?? []) codeById.set(w.id, w.code);
      const nameById = new Map<string, string>();
      for (const p of profiles.data ?? []) nameById.set(p.id, p.full_name ?? "");

      return (movs.data ?? []).map((m: Record<string, unknown>) => {
        const p = prodById.get(m.product_id as string);
        return {
          id: m.id as string,
          data: m.created_at as string,
          produto: p?.name ?? "—",
          product_code: p?.code ?? "",
          tipo: (m.tipo as "entrada" | "saida") ?? "entrada",
          qtd: Number(m.quantidade) || 0,
          unidade: p?.unit ?? "un",
          origem: (m.origem as string) ?? "",
          observacoes: (m.observacoes as string) ?? null,
          warehouseCode: m.warehouse_id ? codeById.get(m.warehouse_id as string) ?? null : null,
          por: m.created_by ? nameById.get(m.created_by as string) || null : null,
        };
      });
    },
  });
}

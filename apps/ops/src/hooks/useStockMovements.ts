import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// ─────────────────────────────────────────────────────────────────────────────
// Movimentações de estoque (Carbo Ops) — LEITURA do banco compartilhado.
//  • stock_movements é o ledger append-only (entrada/saída por produto; global,
//    não por hub). origem: 'PC' | 'OP' | 'ajuste'. Cruza product_id → nome.
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
}

export function useStockMovements(limit = 200) {
  return useQuery({
    queryKey: ["ops", "stock-movements", limit],
    queryFn: async (): Promise<StockMovement[]> => {
      const [movs, products] = await Promise.all([
        db
          .from("stock_movements")
          .select("id, product_id, tipo, quantidade, origem, observacoes, created_at")
          .order("created_at", { ascending: false })
          .limit(limit),
        db.from("mrp_products").select("id, name, product_code, stock_unit"),
      ]);
      if (movs.error) throw movs.error;
      if (products.error) throw products.error;

      const prodById = new Map<string, { name: string; code: string; unit: string }>();
      for (const p of products.data ?? []) {
        prodById.set(p.id, { name: p.name ?? "", code: p.product_code ?? "", unit: p.stock_unit ?? "un" });
      }

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
        };
      });
    },
  });
}

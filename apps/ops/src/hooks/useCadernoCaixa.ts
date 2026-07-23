import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// ─────────────────────────────────────────────────────────────────────────────
// Caderno de Caixa do Estoque (Carbo Ops) — tendência diária de movimentações.
//  • Chama o RPC ops_stock_movement_trend (SUM por dia, sem o teto de 300 linhas
//    da lista de movimentações), escopado por hub + período.
//  • Três séries: entrada de insumo, produção de produto final, saída de produto
//    final. Ver a migration 20260723060000_ops_caderno_trend.sql.
// ─────────────────────────────────────────────────────────────────────────────

const db = supabase as unknown as { rpc: (fn: string, args: Record<string, unknown>) => any };

export interface TrendPoint {
  dia: string;         // ISO date (YYYY-MM-DD)
  label: string;       // dd/mm para o eixo X
  insumoIn: number;    // entrada de insumos (proxy de volume — mistura unidades)
  finalProd: number;   // produto final produzido (un)
  finalOut: number;    // produto final saído (un)
}

export interface CadernoTrend {
  points: TrendPoint[];
  totals: { insumoIn: number; finalProd: number; finalOut: number };
}

const dm = (iso: string) => { const [, m, d] = iso.split("-"); return `${d}/${m}`; };

export function useCadernoTrend(warehouseCode: string, fromISO: string, toISO: string) {
  return useQuery({
    queryKey: ["ops", "caderno-trend", warehouseCode, fromISO, toISO],
    enabled: !!warehouseCode,
    queryFn: async (): Promise<CadernoTrend> => {
      const { data, error } = await db.rpc("ops_stock_movement_trend", {
        p_warehouse_code: warehouseCode,
        p_from: fromISO,
        p_to: toISO,
      });
      if (error) throw error;

      const points: TrendPoint[] = (data ?? []).map((r: Record<string, unknown>) => ({
        dia: r.dia as string,
        label: dm(r.dia as string),
        insumoIn: Number(r.insumo_in) || 0,
        finalProd: Number(r.final_prod) || 0,
        finalOut: Number(r.final_out) || 0,
      }));

      const totals = points.reduce(
        (acc, p) => ({
          insumoIn: acc.insumoIn + p.insumoIn,
          finalProd: acc.finalProd + p.finalProd,
          finalOut: acc.finalOut + p.finalOut,
        }),
        { insumoIn: 0, finalProd: 0, finalOut: 0 },
      );

      return { points, totals };
    },
  });
}

// "Produto final" segue a convenção do app (ProdutosMrp.HAS_BOM_CATEGORIES).
export const FINAL_CATEGORIES = new Set(["Produto Final", "Semi-acabado"]);
export const isFinalCategory = (category?: string | null) =>
  !!category && FINAL_CATEGORIES.has(category);

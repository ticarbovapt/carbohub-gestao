import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// ─────────────────────────────────────────────────────────────────────────────
// Contagem de movimentações por hub + período — DIRETO no banco (head count).
// Os KPIs de Suprimentos (entradas/saídas/total) contavam sobre a lista já
// truncada em 300 linhas mais recentes: em períodos longos o número saía menor
// que a realidade (C10). Aqui o COUNT é feito no Postgres, escopado por
// warehouse_id + faixa de created_at — sem cap.
// ─────────────────────────────────────────────────────────────────────────────

const db = supabase as unknown as {
  from: (t: string) => any;
};

export interface StockMovementStats { entradas: number; saidas: number; movimentacoes: number; }

export function useStockMovementStats(warehouseCode: string, fromISO: string, toISO: string) {
  return useQuery({
    queryKey: ["ops", "stock-movement-stats", warehouseCode, fromISO, toISO],
    enabled: !!warehouseCode,
    queryFn: async (): Promise<StockMovementStats> => {
      const wh = await db.from("warehouses").select("id").eq("code", warehouseCode).maybeSingle();
      const whId = wh.data?.id;
      if (!whId) return { entradas: 0, saidas: 0, movimentacoes: 0 };

      const countFor = async (tipo?: "entrada" | "saida") => {
        let q = db
          .from("stock_movements")
          .select("id", { count: "exact", head: true })
          .eq("warehouse_id", whId)
          .gte("created_at", fromISO)
          .lte("created_at", toISO);
        if (tipo) q = q.eq("tipo", tipo);
        const r = await q;
        return Number(r.count) || 0;
      };

      const [entradas, saidas, movimentacoes] = await Promise.all([
        countFor("entrada"), countFor("saida"), countFor(),
      ]);
      return { entradas, saidas, movimentacoes };
    },
  });
}

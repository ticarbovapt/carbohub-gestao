import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { subDays, format, startOfDay } from "date-fns";

export interface DailyMovement {
  date: string;
  saidas: number;
}

export interface Product30dStats {
  giroMedio: number; // un/dia
  totalSaidas30: number;
  coberturaDias: number | null;
  dataRuptura: Date | null;
  dailyData: DailyMovement[];
  tendenciaPct: number | null; // % vs média
}

export function useProductMovements30d(productIds: string[]) {
  return useQuery({
    queryKey: ["product-movements-30d", productIds.sort().join(",")],
    enabled: productIds.length > 0,
    queryFn: async () => {
      const since = format(subDays(new Date(), 30), "yyyy-MM-dd");

      const { data, error } = await supabase
        .from("stock_movements")
        .select("product_id, tipo, quantidade, created_at")
        .in("product_id", productIds)
        .eq("tipo", "saida")
        .gte("created_at", since)
        .order("created_at", { ascending: true });

      if (error) throw error;

      const result: Record<string, Product30dStats> = {};

      for (const pid of productIds) {
        const movements = (data || []).filter((m: any) => m.product_id === pid);
        const totalSaidas30 = movements.reduce((s: number, m: any) => s + Number(m.quantidade), 0);
        const giroMedio = totalSaidas30 / 30;

        // Group by day
        const byDay: Record<string, number> = {};
        for (let i = 29; i >= 0; i--) {
          const d = format(subDays(new Date(), i), "yyyy-MM-dd");
          byDay[d] = 0;
        }
        for (const m of movements) {
          const d = format(startOfDay(new Date(m.created_at)), "yyyy-MM-dd");
          if (byDay[d] !== undefined) {
            byDay[d] += Number((m as any).quantidade);
          }
        }
        const dailyData: DailyMovement[] = Object.entries(byDay).map(([date, saidas]) => ({ date, saidas }));

        // Trend: last 7 days vs full 30 avg
        const last7 = dailyData.slice(-7);
        const avg7 = last7.reduce((s, d) => s + d.saidas, 0) / 7;
        const tendenciaPct = giroMedio > 0 ? Math.round(((avg7 - giroMedio) / giroMedio) * 100) : null;

        result[pid] = {
          giroMedio,
          totalSaidas30,
          coberturaDias: null, // will be computed with current stock in the component
          dataRuptura: null,
          dailyData,
          tendenciaPct,
        };
      }

      return result;
    },
    staleTime: 60_000,
  });
}

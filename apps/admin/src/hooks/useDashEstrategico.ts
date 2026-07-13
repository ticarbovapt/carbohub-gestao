// ─────────────────────────────────────────────────────────────────────────────
// Dashboard ESPELHADO (Fase 1 / KPI-level) — Estratégico (Cockpit).
//
// Espelha o essencial de src/pages/dashboards/DashboardEstrategico.tsx +
// src/components/dashboard/CeoDashboard.tsx. Fase 1 = só KPIs + 1 gráfico;
// TerritorialMap / IntelligenceHub / StockRuptureAlert ficam de fora.
//
// Fontes (schema public):
//   service_orders        → status ("active"/"draft"), sla_deadline (atrasada)
//   licensees             → status ("active")
//   machines              → status ("operational")
//   carboze_orders_secure → total, created_at  (view; fallback: carboze_orders)
// ─────────────────────────────────────────────────────────────────────────────
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface EstrategicoData {
  activeOS: number;
  overdueOS: number;
  activeLicensees: number;
  activeMachines: number;
  monthlyRevenue: number;
  revenueMonthly: { key: string; receita: number; vendas: number }[];
}

interface OrderRow { total: number | null; created_at: string | null; }

// Wrapper "solto" pro query-builder — as tabelas não estão nos tipos gerados do Admin.
type LooseQuery = {
  select: (c: string, o?: { count: "exact"; head: true }) => LooseQuery;
  eq: (c: string, v: unknown) => LooseQuery;
  in: (c: string, v: unknown[]) => LooseQuery;
  lt: (c: string, v: unknown) => LooseQuery;
  then: (
    onfulfilled: (r: { count: number | null; error: { message: string } | null }) => void,
  ) => Promise<void>;
};
const table = (name: string) =>
  (supabase.from(name as never) as unknown as LooseQuery).select("id", { count: "exact", head: true });

async function runCount(q: LooseQuery): Promise<number> {
  const { count, error } = await (q as unknown as Promise<{ count: number | null; error: { message: string } | null }>);
  if (error) throw new Error(error.message);
  return count ?? 0;
}

export function useDashEstrategico(months = 12) {
  return useQuery({
    queryKey: ["dash-estrategico-overview", months],
    queryFn: async (): Promise<EstrategicoData> => {
      const now = new Date();
      const nowIso = now.toISOString();
      const curMonthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      const chartFrom = new Date(now.getFullYear(), now.getMonth() - (months - 1), 1).toISOString();

      // ── Contagens (KPIs) ──────────────────────────────────────────────────
      const [activeOS, overdueOS, activeLicensees, activeMachines] = await Promise.all([
        runCount(table("service_orders").in("status", ["active", "draft"])),
        runCount(table("service_orders").eq("status", "active").lt("sla_deadline", nowIso)),
        runCount(table("licensees").eq("status", "active")),
        runCount(table("machines").eq("status", "operational")),
      ]);

      // ── Receita por mês (view secure; fallback carboze_orders) ────────────
      const fetchRevenue = async (table: string) =>
        await supabase
          .from(table as never)
          .select("total, created_at")
          .gte("created_at", chartFrom)
          .order("created_at", { ascending: true });

      let rev = await fetchRevenue("carboze_orders_secure");
      if (rev.error) rev = await fetchRevenue("carboze_orders");
      const orders = (rev.error ? [] : (rev.data ?? [])) as OrderRow[];

      const monthMap: Record<string, { receita: number; vendas: number }> = {};
      let monthlyRevenue = 0;
      for (const o of orders) {
        if (!o.created_at) continue;
        const key = o.created_at.slice(0, 7);
        (monthMap[key] ??= { receita: 0, vendas: 0 }).receita += Number(o.total ?? 0);
        monthMap[key].vendas++;
        if (o.created_at >= curMonthStart) monthlyRevenue += Number(o.total ?? 0);
      }
      const revenueMonthly = Object.entries(monthMap)
        .sort(([a], [b]) => a.localeCompare(b))
        .slice(-months)
        .map(([key, v]) => ({ key, ...v }));

      return { activeOS, overdueOS, activeLicensees, activeMachines, monthlyRevenue, revenueMonthly };
    },
  });
}

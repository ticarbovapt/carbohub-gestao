// ─────────────────────────────────────────────────────────────────────────────
// Dashboard ESPELHADO (Fase 1 / KPI-level) — Produção.
//
// Espelha o essencial de src/pages/dashboards/DashboardProducao.tsx +
// src/hooks/useDashboardStats.ts / useDashboardCharts.ts do controle.
//
// Fontes (schema public):
//   os_checklists  → id, is_completed, created_at, completed_at
//   service_orders → id, status ("active" = OP ativa)
// Taxa de conclusão, pendentes e tempo médio olham os checklists dos últimos 7d.
// ─────────────────────────────────────────────────────────────────────────────
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface ChecklistRow {
  is_completed: boolean | null;
  created_at: string | null;
  completed_at: string | null;
}

export interface ProducaoData {
  completionRate: number;        // %
  completedChecklists: number;
  pendingChecklists: number;
  activeOS: number;
  avgCompletionMin: number | null;
  trend: { label: string; completed: number; pending: number }[];
}

const dayKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const dayLabel = (d: Date) =>
  `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;

export function useDashProducao(days = 7) {
  return useQuery({
    queryKey: ["dash-producao-overview", days],
    queryFn: async (): Promise<ProducaoData> => {
      const now = new Date();
      const from = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (days - 1));

      const [clRes, osRes] = await Promise.all([
        supabase
          .from("os_checklists" as never)
          .select("is_completed, created_at, completed_at")
          .gte("created_at", from.toISOString()),
        supabase
          .from("service_orders" as never)
          .select("id, status")
          .eq("status", "active"),
      ]);
      if (clRes.error) throw new Error(clRes.error.message);
      if (osRes.error) throw new Error(osRes.error.message);

      const checklists = (clRes.data ?? []) as ChecklistRow[];
      const activeOS = ((osRes.data ?? []) as unknown[]).length;

      const total = checklists.length;
      const completedChecklists = checklists.filter((c) => c.is_completed).length;
      const pendingChecklists = total - completedChecklists;
      const completionRate = total > 0
        ? Math.round((completedChecklists / total) * 1000) / 10
        : 0;

      const withTime = checklists.filter((c) => c.is_completed && c.completed_at && c.created_at);
      let avgCompletionMin: number | null = null;
      if (withTime.length > 0) {
        const totalMs = withTime.reduce((acc, c) => {
          return acc + (new Date(c.completed_at!).getTime() - new Date(c.created_at!).getTime());
        }, 0);
        avgCompletionMin = Math.round(totalMs / withTime.length / 1000 / 60);
      }

      // Trend dos últimos N dias — agrupa client-side por dia de criação.
      const buckets = new Map<string, { completed: number; pending: number }>();
      for (let i = days - 1; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
        buckets.set(dayKey(d), { completed: 0, pending: 0 });
      }
      for (const c of checklists) {
        if (!c.created_at) continue;
        const key = c.created_at.slice(0, 10);
        const b = buckets.get(key);
        if (!b) continue;
        if (c.is_completed) b.completed++;
        else b.pending++;
      }
      const trend = Array.from(buckets.entries()).map(([key, v]) => ({
        label: dayLabel(new Date(key + "T12:00:00")),
        ...v,
      }));

      return {
        completionRate,
        completedChecklists,
        pendingChecklists,
        activeOS,
        avgCompletionMin,
        trend,
      };
    },
  });
}

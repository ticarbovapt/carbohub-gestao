import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// ─────────────────────────────────────────────────────────────────────────────
// Metas de vendedores (Carbo Sales) — somente LEITURA (config fica no Admin).
//  • Tudo resolvido no BANCO via crm_metas_board (uma RPC só):
//      - Meta = crm_metas_resolvidas (sales_targets > sales_target_defaults).
//      - Realizado = carboze_orders (mesma base do crm_vendas_agregado).
//  • SEGURANÇA: os valores em R$ só vêm para GESTOR. Para os demais o % (mensal,
//    semanal e do time) vem calculado do servidor e os R$ voltam null — nada de
//    valor sensível chega ao navegador (nem pelo devtools).
// ─────────────────────────────────────────────────────────────────────────────
const db = supabase as unknown as {
  from: (t: string) => any;
  rpc: (fn: string, args?: unknown) => Promise<{ data: any; error: any }>;
};

export type MetaSource = "mes" | "padrao" | "none";

export interface MetaVendedor {
  vendedor_id: string;
  full_name: string | null;
  avatar_url: string | null;
  department: string | null;
  secondary_department: string | null;
  target_amount: number;   // 0 quando escondido (não-gestor)
  target_qty: number;
  source: MetaSource;
  actual_amount: number;   // 0 quando escondido
  actual_qty: number;
  pct_amount: number;      // sempre (do servidor)
  pct_week: number | null; // sempre (do servidor); null = sem meta semanal
  prev_amount: number;     // 0 quando escondido
  week_amount: number;     // 0 quando escondido
  // Agregados do time (repetidos em cada linha): team_pct sempre; R$ só gestor.
  team_target: number;
  team_actual: number;
  team_pct: number;
}

const iso = (d: Date) => d.toISOString();
const num = (v: unknown): number => (v == null ? 0 : Number(v) || 0);

// Semanas comerciais (sextas) de um mês — a meta semanal é a mensal ÷ nº semanas.
function countCommercialWeeks(year: number, monthIdx: number): number {
  const lastDay = new Date(year, monthIdx + 1, 0).getDate();
  let fridays = 0;
  for (let d = 1; d <= lastDay; d++) if (new Date(year, monthIdx, d).getDay() === 5) fridays++;
  return Math.max(1, fridays);
}

export function useMetasVendedores(month: Date, weekStart: Date) {
  const ano = month.getFullYear();
  const mes = month.getMonth() + 1;
  const monthStart = new Date(ano, month.getMonth(), 1);
  const monthEnd = new Date(ano, month.getMonth() + 1, 1);
  const prevStart = new Date(ano, month.getMonth() - 1, 1);
  const weekFrom = new Date(weekStart); weekFrom.setHours(0, 0, 0, 0);
  const weekTo = new Date(weekFrom); weekTo.setDate(weekTo.getDate() + 7);
  const semanas = countCommercialWeeks(weekStart.getFullYear(), weekStart.getMonth());

  return useQuery({
    queryKey: ["crm_metas", ano, mes, iso(weekFrom)],
    queryFn: async (): Promise<MetaVendedor[]> => {
      const { data, error } = await db.rpc("crm_metas_board", {
        p_ano: ano,
        p_mes: mes,
        p_month_from: iso(monthStart),
        p_month_to: iso(monthEnd),
        p_prev_from: iso(prevStart),
        p_prev_to: iso(monthStart),
        p_week_from: iso(weekFrom),
        p_week_to: iso(weekTo),
        p_semanas: semanas,
      });
      if (error) throw error;

      type Row = {
        vendedor_id: string; full_name: string | null; avatar_url: string | null;
        department: string | null; secondary_department: string | null;
        target_amount: number | null; actual_amount: number | null; prev_amount: number | null;
        week_amount: number | null; actual_qty: number | null;
        pct_amount: number | null; pct_week: number | null;
        team_target: number | null; team_actual: number | null; team_pct: number | null;
      };
      return ((data ?? []) as Row[]).map((r) => ({
        vendedor_id: r.vendedor_id,
        full_name: r.full_name,
        avatar_url: r.avatar_url,
        department: r.department,
        secondary_department: r.secondary_department,
        target_amount: num(r.target_amount),
        target_qty: 0,
        source: "none" as MetaSource,
        actual_amount: num(r.actual_amount),
        actual_qty: num(r.actual_qty),
        pct_amount: num(r.pct_amount),
        pct_week: r.pct_week == null ? null : Number(r.pct_week),
        prev_amount: num(r.prev_amount),
        week_amount: num(r.week_amount),
        team_target: num(r.team_target),
        team_actual: num(r.team_actual),
        team_pct: num(r.team_pct),
      }));
    },
  });
}

/** Metas RESOLVIDAS de um ano inteiro (por vendedor/mês) — para a linha de meta do
 *  Dashboard. Já aplica exceção do mês > degrau de padrão vigente. */
export function useMetasAno(ano: number) {
  return useQuery({
    queryKey: ["crm_metas_ano", ano],
    queryFn: async (): Promise<{ vendedor_id: string; mes: number; target_amount: number }[]> => {
      const { data, error } = await db.rpc("crm_metas_resolvidas_ano", { p_ano: ano });
      if (error) throw error;
      return ((data ?? []) as { vendedor_id: string; mes: number; target_amount: number }[])
        .map((r) => ({ vendedor_id: r.vendedor_id, mes: Number(r.mes), target_amount: Number(r.target_amount) || 0 }));
    },
  });
}

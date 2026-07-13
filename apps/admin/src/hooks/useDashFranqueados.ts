// ─────────────────────────────────────────────────────────────────────────────
// Dashboard ESPELHADO — Franqueados (Portal de Licenciados, multitenant).
//
// Lê o GERAL (rede toda de descarbonização) dos RPCs do schema `licenciados`.
// get_global_kpis / get_global_revenue_monthly são security-definer e liberam o
// agregado quando licenciados.is_admin() é verdadeiro — que, para um usuário
// interno da Carbo, exige `portal_licenciado` em public.profiles.allowed_interfaces.
// Sem a flag, os RPCs retornam vazio (a página degrada com aviso, não quebra).
//
// Nada é escrito; nada é copiado do controle legado.
// ─────────────────────────────────────────────────────────────────────────────
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const licenciadosDb = (supabase as unknown as { schema: (s: string) => {
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
} }).schema("licenciados");

// ── Tipos (espelham licenciados/src/types) ────────────────────────────────────
export interface FranqueadosKpis {
  total_lojas: number;
  active_lojas: number;
  total_services: number;
  total_revenue: number;
}
export interface FranqueadosRevenueMonth {
  month_start: string;
  revenue: number;
  services: number;
}

// ── hooks ─────────────────────────────────────────────────────────────────────

/** KPIs consolidados da rede de franqueados (mês corrente). */
export function useFranqueadosKpis() {
  return useQuery({
    queryKey: ["dash-franqueados-kpis"],
    queryFn: async (): Promise<FranqueadosKpis | null> => {
      const { data, error } = await licenciadosDb.rpc("get_global_kpis");
      if (error) throw new Error(error.message);
      const rows = (data ?? []) as FranqueadosKpis[];
      return (Array.isArray(rows) ? rows[0] : (rows as unknown as FranqueadosKpis)) ?? null;
    },
  });
}

/** Receita por mês da rede (últimos N meses), com meses vazios preenchidos com 0. */
export function useFranqueadosRevenueMonthly(months = 12) {
  return useQuery({
    queryKey: ["dash-franqueados-revenue", months],
    queryFn: async (): Promise<FranqueadosRevenueMonth[]> => {
      const { data, error } = await licenciadosDb.rpc("get_global_revenue_monthly", { p_months: months });
      if (error) throw new Error(error.message);
      const rows = (data ?? []) as FranqueadosRevenueMonth[];
      const byMonth = new Map(rows.map((r) => [r.month_start.slice(0, 7), r]));
      const out: FranqueadosRevenueMonth[] = [];
      const now = new Date();
      for (let i = months - 1; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        out.push(byMonth.get(key) ?? { month_start: `${key}-01`, revenue: 0, services: 0 });
      }
      return out;
    },
  });
}

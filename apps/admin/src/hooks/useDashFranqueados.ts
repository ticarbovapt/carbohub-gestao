// ─────────────────────────────────────────────────────────────────────────────
// Dashboard ESPELHADO — Licenciados (Portal de Licenciados, multitenant).
//
// Lê o GERAL (rede toda de descarbonização) dos RPCs do schema `licenciados`.
// Os RPCs são security-definer e liberam o agregado quando licenciados.is_admin()
// é verdadeiro — que, para um usuário interno da Carbo, exige `portal_licenciado`
// em public.profiles.allowed_interfaces. Sem a flag, retornam vazio (a página
// degrada com aviso, não quebra).
//
// Todos os agregados abaixo respeitam o filtro de período da tela (from/to).
// Nada é escrito; nada é copiado do controle legado.
// ─────────────────────────────────────────────────────────────────────────────
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const licenciadosDb = (supabase as unknown as { schema: (s: string) => {
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
  from: (t: string) => any;
} }).schema("licenciados");

/** Período da tela (datas YYYY-MM-DD do PeriodPicker) → timestamps do RPC. */
export interface DateRange { from: string; to: string }

function toTs(range: DateRange) {
  return {
    p_from: new Date(`${range.from}T00:00:00`).toISOString(),
    p_to: new Date(`${range.to}T23:59:59`).toISOString(),
  };
}

// ── Tipos ─────────────────────────────────────────────────────────────────────
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

/** KPIs consolidados da rede (lojas, ativas, serviços e receita no período). */
export function useFranqueadosKpis(range: DateRange) {
  return useQuery({
    queryKey: ["dash-franqueados-kpis", range.from, range.to],
    queryFn: async (): Promise<FranqueadosKpis | null> => {
      const { data, error } = await licenciadosDb.rpc("get_global_kpis", toTs(range));
      if (error) throw new Error(error.message);
      const rows = (data ?? []) as FranqueadosKpis[];
      return (Array.isArray(rows) ? rows[0] : (rows as unknown as FranqueadosKpis)) ?? null;
    },
  });
}

export interface FranqueadoRankingRow {
  loja_id: string;
  name: string;
  city: string | null;
  state: string | null;
  active: boolean;
  services: number;
  revenue: number;
}

/** Top licenciados por serviços/receita no período. */
export function useFranqueadosRanking(range: DateRange) {
  return useQuery({
    queryKey: ["dash-franqueados-ranking", range.from, range.to],
    queryFn: async (): Promise<FranqueadoRankingRow[]> => {
      const { data, error } = await licenciadosDb.rpc("get_global_licensee_ranking", toTs(range));
      if (error) throw new Error(error.message);
      return ((data ?? []) as any[]).map((r) => ({
        loja_id: r.loja_id, name: r.name, city: r.city, state: r.state,
        active: r.active, services: Number(r.services || 0), revenue: Number(r.revenue || 0),
      }));
    },
  });
}

export interface PorteBreakdownRow { porte: string; total: number; }

/** Distribuição de serviços por porte de veículo no período. */
export function useFranqueadosPorte(range: DateRange) {
  return useQuery({
    queryKey: ["dash-franqueados-porte", range.from, range.to],
    queryFn: async (): Promise<PorteBreakdownRow[]> => {
      const { data, error } = await licenciadosDb.rpc("admin_get_porte_breakdown", toTs(range));
      if (error) throw new Error(error.message);
      return ((data ?? []) as any[]).map((r) => ({ porte: String(r.porte ?? "—"), total: Number(r.total || 0) }));
    },
  });
}

/** Ticket médio da rede no período (demais KPIs do RPC não são exibidos). */
export function useTicketMedio(range: DateRange) {
  return useQuery({
    queryKey: ["dash-franqueados-ticket", range.from, range.to],
    queryFn: async (): Promise<number> => {
      const { data, error } = await licenciadosDb.rpc("admin_get_licensees_kpis", toTs(range));
      if (error) throw new Error(error.message);
      const rows = (data ?? []) as any[];
      const r = Array.isArray(rows) ? rows[0] : (rows as any);
      return Number(r?.avg_ticket || 0);
    },
  });
}

export interface DayPoint { day: string; total_services: number; revenue: number; }

/** Série diária de serviços e receita no período. */
export function useLicenseesTimeseries(range: DateRange) {
  return useQuery({
    queryKey: ["dash-franqueados-timeseries", range.from, range.to],
    queryFn: async (): Promise<DayPoint[]> => {
      const { data, error } = await licenciadosDb.rpc("admin_get_licensees_timeseries", toTs(range));
      if (error) throw new Error(error.message);
      return ((data ?? []) as any[]).map((r) => ({
        day: r.day,
        total_services: Number(r.total_services || 0),
        revenue: Number(r.revenue || 0),
      }));
    },
  });
}

export interface RecentServiceRow {
  service_id: string;
  loja_name: string;
  city: string | null;
  state: string | null;
  porte: string | null;
  fuel_type: string | null;
  total_value: number;
  performed_at: string;
}

/** Últimos serviços concluídos da rede. Requer o RPC get_global_recent_services
 *  (migration 20260720120000 no carbohub-licenciados); sem ela, retorna []. */
export function useFranqueadosRecentServices(limit = 10) {
  return useQuery({
    queryKey: ["dash-franqueados-recent", limit],
    queryFn: async (): Promise<RecentServiceRow[]> => {
      const { data, error } = await licenciadosDb.rpc("get_global_recent_services", { p_limit: limit });
      if (error) return []; // RPC ainda não aplicado → degrada sem quebrar a tela
      return ((data ?? []) as any[]).map((r) => ({
        service_id: r.service_id, loja_name: r.loja_name, city: r.city, state: r.state,
        porte: r.porte, fuel_type: r.fuel_type, total_value: Number(r.total_value || 0), performed_at: r.performed_at,
      }));
    },
  });
}

/** Receita por mês da rede (últimos N meses), com meses vazios preenchidos com 0.
 *  Visão histórica fixa — independe do filtro de período da tela. */
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

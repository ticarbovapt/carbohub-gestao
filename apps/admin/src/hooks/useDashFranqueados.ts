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

// Janela padrão dos rankings/breakdowns: últimos 12 meses (o default dos RPCs é
// só o mês corrente, que viria vazio fora do mês da última venda).
function last12Range(): { from: string; to: string } {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth() - 11, 1).toISOString();
  return { from, to: now.toISOString() };
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

/** Top licenciados por serviços/receita (últimos 12 meses). */
export function useFranqueadosRanking() {
  return useQuery({
    queryKey: ["dash-franqueados-ranking"],
    queryFn: async (): Promise<FranqueadoRankingRow[]> => {
      const { from, to } = last12Range();
      const { data, error } = await licenciadosDb.rpc("get_global_licensee_ranking", { p_from: from, p_to: to });
      if (error) throw new Error(error.message);
      return ((data ?? []) as any[]).map((r) => ({
        loja_id: r.loja_id, name: r.name, city: r.city, state: r.state,
        active: r.active, services: Number(r.services || 0), revenue: Number(r.revenue || 0),
      }));
    },
  });
}

export interface PorteBreakdownRow { porte: string; total: number; }

/** Distribuição de serviços por porte de veículo (últimos 12 meses). */
export function useFranqueadosPorte() {
  return useQuery({
    queryKey: ["dash-franqueados-porte"],
    queryFn: async (): Promise<PorteBreakdownRow[]> => {
      const { from, to } = last12Range();
      const { data, error } = await licenciadosDb.rpc("admin_get_porte_breakdown", { p_from: from, p_to: to });
      if (error) throw new Error(error.message);
      return ((data ?? []) as any[]).map((r) => ({ porte: String(r.porte ?? "—"), total: Number(r.total || 0) }));
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

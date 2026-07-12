import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const rpc = supabase as unknown as { rpc: (fn: string, args?: any) => any };

// Hooks do Dashboard financeiro — cada um chama uma função SQL agregadora
// (retorna já somado). p_source: 'all' | 'interno' | 'bling'.

export interface AgingRow { bucket: string; qtd: number; total: number }
export function useFinAging(source: string) {
  return useQuery({
    queryKey: ["fin-aging", source],
    queryFn: async (): Promise<AgingRow[]> => {
      const { data, error } = await rpc.rpc("fin_payables_aging", { p_source: source });
      if (error) throw error;
      return (data ?? []) as AgingRow[];
    },
  });
}

export interface ForecastRow { semana: string; total: number; qtd: number }
export function useFinForecast(source: string, weeks = 8) {
  return useQuery({
    queryKey: ["fin-forecast", source, weeks],
    queryFn: async (): Promise<ForecastRow[]> => {
      const { data, error } = await rpc.rpc("fin_payables_forecast", { p_source: source, p_weeks: weeks });
      if (error) throw error;
      return (data ?? []) as ForecastRow[];
    },
  });
}

export interface StatusRow { status_efetivo: string; qtd: number; total: number }
export function useFinStatusSummary(source: string, from?: string, to?: string) {
  return useQuery({
    queryKey: ["fin-status", source, from, to],
    queryFn: async (): Promise<StatusRow[]> => {
      const { data, error } = await rpc.rpc("fin_payables_status_summary", { p_source: source, p_from: from ?? null, p_to: to ?? null });
      if (error) throw error;
      return (data ?? []) as StatusRow[];
    },
  });
}

export interface MonthlyRow { mes: string; pago: number; aberto: number }
export function useFinMonthly(source: string, from?: string, to?: string) {
  return useQuery({
    queryKey: ["fin-monthly", source, from, to],
    queryFn: async (): Promise<MonthlyRow[]> => {
      const { data, error } = await rpc.rpc("fin_payables_monthly", { p_source: source, p_from: from ?? null, p_to: to ?? null });
      if (error) throw error;
      return (data ?? []) as MonthlyRow[];
    },
  });
}

export interface SupplierRow { supplier_name: string; total: number; qtd: number }
export function useFinTopSuppliers(source: string, from?: string, to?: string, limit = 10) {
  return useQuery({
    queryKey: ["fin-suppliers", source, from, to, limit],
    queryFn: async (): Promise<SupplierRow[]> => {
      const { data, error } = await rpc.rpc("fin_payables_top_suppliers", { p_source: source, p_from: from ?? null, p_to: to ?? null, p_limit: limit });
      if (error) throw error;
      return (data ?? []) as SupplierRow[];
    },
  });
}

export interface OnTimeRow { pagos: number; no_prazo: number; atrasados: number; pct_no_prazo: number | null }
export function useFinOnTime(source: string, from?: string, to?: string) {
  return useQuery({
    queryKey: ["fin-ontime", source, from, to],
    queryFn: async (): Promise<OnTimeRow | null> => {
      const { data, error } = await rpc.rpc("fin_payables_on_time", { p_source: source, p_from: from ?? null, p_to: to ?? null });
      if (error) throw error;
      return ((data ?? [])[0] ?? null) as OnTimeRow | null;
    },
  });
}

export interface CycleRow { etapa: string; ordem: number; media_dias: number; p50_dias: number; n: number }
export function useFinCycleTimes() {
  return useQuery({
    queryKey: ["fin-cycle"],
    queryFn: async (): Promise<CycleRow[]> => {
      const { data, error } = await rpc.rpc("fin_purchase_cycle_times", {});
      if (error) throw error;
      return (data ?? []) as CycleRow[];
    },
  });
}

export interface ThreeWayRow { total: number; ok: number; divergentes: number; pct_ok: number | null }
export function useFin3Way() {
  return useQuery({
    queryKey: ["fin-3way"],
    queryFn: async (): Promise<ThreeWayRow | null> => {
      const { data, error } = await rpc.rpc("fin_3way_summary", {});
      if (error) throw error;
      return ((data ?? [])[0] ?? null) as ThreeWayRow | null;
    },
  });
}

export interface SavingsRow { total_estimado: number; total_escolhido: number; economia: number; n: number }
export function useFinSavings() {
  return useQuery({
    queryKey: ["fin-savings"],
    queryFn: async (): Promise<SavingsRow | null> => {
      const { data, error } = await rpc.rpc("fin_quote_savings", {});
      if (error) throw error;
      return ((data ?? [])[0] ?? null) as SavingsRow | null;
    },
  });
}

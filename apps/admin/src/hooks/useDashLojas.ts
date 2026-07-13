// ─────────────────────────────────────────────────────────────────────────────
// Dashboard ESPELHADO — Lojas (Portal de Vendas / Produtos, multitenant).
//
// Lê o GERAL (rede toda) dos RPCs admin do schema `produtos`. Esses RPCs são
// security-definer e liberam o agregado quando produtos.is_admin() é verdadeiro —
// que, para um usuário interno da Carbo, exige `portal_pdv` em
// public.profiles.allowed_interfaces (ponte carbo-admin). Sem a flag, os RPCs
// retornam vazio (a página degrada com um aviso, não quebra).
//
// O período vem de um PeriodRange {from,to} (seletor 7d/15d/mês/personalizado).
// Nada é escrito; nada é copiado do controle legado.
// ─────────────────────────────────────────────────────────────────────────────
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { previousRange, type PeriodRange } from "@/components/ui/PeriodPicker";

// Cliente apontado para o schema `produtos` (o client padrão é `public`).
// Cast solto: os tipos gerados do Admin só conhecem `public`.
const produtosDb = (supabase as unknown as { schema: (s: string) => {
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
} }).schema("produtos");

// ── Tipos (espelham produtos/src/shared/types/database.ts) ────────────────────
export interface LojasGlobalKpis {
  total_postos: number;
  active_postos: number;
  total_sales: number;
  total_revenue: number;
  total_units: number;
  total_frentistas: number;
  low_stock_products: number;
}
export interface LojasTimeseriesRow {
  day: string; variant: string; total_qty: number; total_amount: number;
}

async function rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await produtosDb.rpc(fn, args);
  if (error) throw new Error(error.message);
  return (data ?? []) as T;
}

// ── hooks ─────────────────────────────────────────────────────────────────────

/** KPIs do período selecionado (rede toda). */
export function useLojasKpis(range: PeriodRange) {
  return useQuery({
    queryKey: ["dash-lojas-kpis", range.from, range.to],
    queryFn: async (): Promise<LojasGlobalKpis | null> =>
      ((await rpc<LojasGlobalKpis[]>("admin_get_global_kpis", { p_from: range.from, p_to: range.to }))[0] ?? null),
  });
}

/** KPIs do período imediatamente anterior (mesma duração) — para o Δ% comparativo. */
export function useLojasKpisPrev(range: PeriodRange) {
  const prev = previousRange(range);
  return useQuery({
    queryKey: ["dash-lojas-kpis-prev", prev.from, prev.to],
    queryFn: async (): Promise<LojasGlobalKpis | null> =>
      ((await rpc<LojasGlobalKpis[]>("admin_get_global_kpis", { p_from: prev.from, p_to: prev.to }))[0] ?? null),
  });
}

/** Série de vendas por dia (rede toda) — p_posto_id=null agrega todos os postos. */
export function useLojasTimeseries(range: PeriodRange) {
  return useQuery({
    queryKey: ["dash-lojas-timeseries", range.from, range.to],
    queryFn: () =>
      rpc<LojasTimeseriesRow[]>("get_scoped_sales_timeseries", { p_posto_id: null, p_from: range.from, p_to: range.to }),
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Dashboard ESPELHADO — Lojas (Portal de Vendas / Produtos, multitenant).
//
// Lê o GERAL (rede toda) dos RPCs admin do schema `produtos`. Esses RPCs são
// security-definer e liberam o agregado quando produtos.is_admin() é verdadeiro —
// que, para um usuário interno da Carbo, exige `portal_pdv` em
// public.profiles.allowed_interfaces (ponte carbo-admin). Sem a flag, os RPCs
// retornam vazio (a página degrada com um aviso, não quebra).
//
// Nada é escrito; nada é copiado do controle legado. Só chamamos os mesmos
// RPCs agregados que o próprio Portal de Vendas usa.
// ─────────────────────────────────────────────────────────────────────────────
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

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

// ── helpers de período (YYYY-MM-DD, igual ao portal de origem) ────────────────
function period(days: number) {
  const to = new Date();
  const from = new Date();
  from.setDate(to.getDate() - days);
  return { p_from: from.toISOString().slice(0, 10), p_to: to.toISOString().slice(0, 10) };
}
function periodPrev(days: number) {
  const to = new Date();
  to.setDate(to.getDate() - days);
  const from = new Date(to);
  from.setDate(from.getDate() - days);
  return { p_from: from.toISOString().slice(0, 10), p_to: to.toISOString().slice(0, 10) };
}

async function rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await produtosDb.rpc(fn, args);
  if (error) throw new Error(error.message);
  return (data ?? []) as T;
}

// ── hooks ─────────────────────────────────────────────────────────────────────

/** KPIs do período atual (rede toda). */
export function useLojasKpis(days = 30) {
  return useQuery({
    queryKey: ["dash-lojas-kpis", days],
    queryFn: async (): Promise<LojasGlobalKpis | null> =>
      ((await rpc<LojasGlobalKpis[]>("admin_get_global_kpis", period(days)))[0] ?? null),
  });
}

/** KPIs do período imediatamente anterior — para o Δ% comparativo. */
export function useLojasKpisPrev(days = 30) {
  return useQuery({
    queryKey: ["dash-lojas-kpis-prev", days],
    queryFn: async (): Promise<LojasGlobalKpis | null> =>
      ((await rpc<LojasGlobalKpis[]>("admin_get_global_kpis", periodPrev(days)))[0] ?? null),
  });
}

/** Série de vendas por dia (rede toda) — p_posto_id=null agrega todos os postos. */
export function useLojasTimeseries(days = 30) {
  return useQuery({
    queryKey: ["dash-lojas-timeseries", days],
    queryFn: () =>
      rpc<LojasTimeseriesRow[]>("get_scoped_sales_timeseries", { p_posto_id: null, ...period(days) }),
  });
}

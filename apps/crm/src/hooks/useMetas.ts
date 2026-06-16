import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// ─────────────────────────────────────────────────────────────────────────────
// Metas de vendedores (Carbo Sales) — somente LEITURA (config fica no Ops).
//  • Vendedores = profiles com is_vendedor = true (via crm_list_vendedores).
//  • Meta = RESOLVIDA no banco (crm_metas_resolvidas): exceção do mês > degrau de
//    meta padrão vigente > 0.
//  • Realizado = RPC crm_vendas_agregado (status 'pedido').
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
  target_amount: number;
  target_qty: number;
  source: MetaSource;
  actual_amount: number;
  actual_qty: number;
  pct_amount: number;
  prev_amount: number;
  week_amount: number;
}

const iso = (d: Date) => d.toISOString();
type Agg = { vendedor_id: string; total: number; qtd: number };
const aggMap = (rows: Agg[] | null) => {
  const m = new Map<string, { total: number; qtd: number }>();
  for (const r of rows ?? []) m.set(r.vendedor_id, { total: Number(r.total) || 0, qtd: Number(r.qtd) || 0 });
  return m;
};

export function useMetasVendedores(month: Date, weekStart: Date) {
  const ano = month.getFullYear();
  const mes = month.getMonth() + 1;
  const monthStart = new Date(ano, month.getMonth(), 1);
  const monthEnd = new Date(ano, month.getMonth() + 1, 1);
  const prevStart = new Date(ano, month.getMonth() - 1, 1);
  const weekFrom = new Date(weekStart); weekFrom.setHours(0, 0, 0, 0);
  const weekTo = new Date(weekFrom); weekTo.setDate(weekTo.getDate() + 7);

  return useQuery({
    queryKey: ["crm_metas", ano, mes, iso(weekFrom)],
    queryFn: async (): Promise<MetaVendedor[]> => {
      const [vendsRes, metasRes, monthRes, prevRes, weekRes] = await Promise.all([
        db.rpc("crm_vendedores_ranking", {}),
        db.rpc("crm_metas_resolvidas", { p_ano: ano, p_mes: mes }),
        db.rpc("crm_vendas_agregado", { p_from: iso(monthStart), p_to: iso(monthEnd) }),
        db.rpc("crm_vendas_agregado", { p_from: iso(prevStart), p_to: iso(monthStart) }),
        db.rpc("crm_vendas_agregado", { p_from: iso(weekFrom), p_to: iso(weekTo) }),
      ]);
      if (vendsRes.error) throw vendsRes.error;
      if (metasRes.error) throw metasRes.error;

      const metaMap = new Map<string, { target_amount: number; source: MetaSource }>();
      for (const r of (metasRes.data ?? []) as { vendedor_id: string; target_amount: number; source: MetaSource }[]) {
        metaMap.set(r.vendedor_id, { target_amount: Number(r.target_amount) || 0, source: r.source });
      }
      const monthAgg = aggMap(monthRes.data);
      const prevAgg = aggMap(prevRes.data);
      const weekAgg = aggMap(weekRes.data);

      // Ranking: TODOS os vendedores (mesmo sem venda/meta) — quadro de competição.
      type Prof = { id: string; full_name: string | null; avatar_url: string | null; department: string | null; secondary_department: string | null };
      return ((vendsRes.data ?? []) as Prof[]).map((p) => {
        const meta = metaMap.get(p.id) ?? { target_amount: 0, source: "none" as MetaSource };
        const act = monthAgg.get(p.id) ?? { total: 0, qtd: 0 };
        return {
          vendedor_id: p.id,
          full_name: p.full_name,
          avatar_url: p.avatar_url,
          department: p.department,
          secondary_department: p.secondary_department,
          target_amount: meta.target_amount,
          target_qty: 0,
          source: meta.source,
          actual_amount: act.total,
          actual_qty: act.qtd,
          pct_amount: meta.target_amount > 0 ? (act.total / meta.target_amount) * 100 : 0,
          prev_amount: (prevAgg.get(p.id)?.total) ?? 0,
          week_amount: (weekAgg.get(p.id)?.total) ?? 0,
        };
      });
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

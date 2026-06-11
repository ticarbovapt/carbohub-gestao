import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// ─────────────────────────────────────────────────────────────────────────────
// Metas de vendedores (Carbo Sales).
//  • Vendedores = profiles com is_vendedor = true.
//  • Meta = crm_vendedor_metas (por vendedor/mês).
//  • Realizado = RPC crm_vendas_agregado (status 'pedido') no mês, no mês anterior
//    e na semana selecionada.
// ─────────────────────────────────────────────────────────────────────────────
const db = supabase as unknown as {
  from: (t: string) => any;
  rpc: (fn: string, args: unknown) => Promise<{ data: any; error: any }>;
};

export interface MetaVendedor {
  vendedor_id: string;
  full_name: string | null;
  avatar_url: string | null;
  department: string | null;
  secondary_department: string | null;
  target_amount: number;
  target_qty: number;
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
        db.from("profiles").select("id, full_name, avatar_url, department, secondary_department").eq("is_vendedor", true),
        db.from("crm_vendedor_metas").select("vendedor_id, target_amount, target_qty").eq("ano", ano).eq("mes", mes),
        db.rpc("crm_vendas_agregado", { p_from: iso(monthStart), p_to: iso(monthEnd) }),
        db.rpc("crm_vendas_agregado", { p_from: iso(prevStart), p_to: iso(monthStart) }),
        db.rpc("crm_vendas_agregado", { p_from: iso(weekFrom), p_to: iso(weekTo) }),
      ]);
      if (vendsRes.error) throw vendsRes.error;

      const metaMap = new Map<string, { target_amount: number; target_qty: number }>();
      for (const r of (metasRes.data ?? []) as { vendedor_id: string; target_amount: number; target_qty: number }[]) {
        metaMap.set(r.vendedor_id, { target_amount: Number(r.target_amount) || 0, target_qty: Number(r.target_qty) || 0 });
      }
      const monthAgg = aggMap(monthRes.data);
      const prevAgg = aggMap(prevRes.data);
      const weekAgg = aggMap(weekRes.data);

      type Prof = { id: string; full_name: string | null; avatar_url: string | null; department: string | null; secondary_department: string | null };
      return ((vendsRes.data ?? []) as Prof[]).map((p) => {
        const meta = metaMap.get(p.id) ?? { target_amount: 0, target_qty: 0 };
        const act = monthAgg.get(p.id) ?? { total: 0, qtd: 0 };
        return {
          vendedor_id: p.id,
          full_name: p.full_name,
          avatar_url: p.avatar_url,
          department: p.department,
          secondary_department: p.secondary_department,
          target_amount: meta.target_amount,
          target_qty: meta.target_qty,
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

/** Upsert da meta de um vendedor no mês (gestor). */
export function useUpsertMeta() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: { vendedor_id: string; ano: number; mes: number; target_amount: number; target_qty: number }) => {
      const { error } = await db
        .from("crm_vendedor_metas")
        .upsert({ ...p }, { onConflict: "vendedor_id,ano,mes" });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["crm_metas"] }),
  });
}

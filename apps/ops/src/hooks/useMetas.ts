import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// ─────────────────────────────────────────────────────────────────────────────
// Metas de vendedores (Carbo Sales/Ops).
//  • Vendedores = profiles com is_vendedor = true (via crm_list_vendedores).
//  • Meta = RESOLVIDA no banco (crm_metas_resolvidas): exceção do mês > degrau de
//    meta padrão vigente > 0. Ver migration 20260611000011.
//  • Realizado = RPC crm_comissao_agregado — MESMA base do comissionamento
//    (faturado: bling_nf_id NOT NULL, por data efetiva coalesce(sale_date,...)).
//    Antes usava crm_vendas_agregado (toda venda por created_at) e divergia do
//    Admin/comissão; agora Meta.realizado == base da comissão.
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
// crm_comissao_agregado recebe DATE e usa intervalo FECHADO (>= p_from AND <= p_to);
// então passamos a data local YYYY-MM-DD com o fim INCLUSIVO (último dia da janela).
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
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
  const monthEndIncl = new Date(ano, month.getMonth() + 1, 0);   // último dia do mês
  const prevStart = new Date(ano, month.getMonth() - 1, 1);
  const prevEndIncl = new Date(ano, month.getMonth(), 0);        // último dia do mês anterior
  const weekFrom = new Date(weekStart); weekFrom.setHours(0, 0, 0, 0);
  const weekEndIncl = new Date(weekFrom); weekEndIncl.setDate(weekEndIncl.getDate() + 6); // sex→qui (7 dias)

  return useQuery({
    queryKey: ["crm_metas", ano, mes, iso(weekFrom)],
    queryFn: async (): Promise<MetaVendedor[]> => {
      const [vendsRes, metasRes, monthRes, prevRes, weekRes] = await Promise.all([
        db.rpc("crm_list_vendedores", {}),
        db.rpc("crm_metas_resolvidas", { p_ano: ano, p_mes: mes }),
        db.rpc("crm_comissao_agregado", { p_from: ymd(monthStart), p_to: ymd(monthEndIncl) }),
        db.rpc("crm_comissao_agregado", { p_from: ymd(prevStart), p_to: ymd(prevEndIncl) }),
        db.rpc("crm_comissao_agregado", { p_from: ymd(weekFrom), p_to: ymd(weekEndIncl) }),
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

      // Só quem tem a flag de vendedor entra no quadro de metas (avulsos ficam de fora).
      type Prof = { id: string; full_name: string | null; avatar_url: string | null; department: string | null; secondary_department: string | null; is_vendedor: boolean };
      return ((vendsRes.data ?? []) as Prof[]).filter((p) => p.is_vendedor).map((p) => {
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

const firstOfMonthISO = (month: Date) => `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, "0")}-01`;

/** IDs de vendedores que têm um degrau de meta padrão começando EXATAMENTE no mês
 *  (para mostrar o "Remover meta padrão a partir deste mês"). */
export function useMetaDefaultsStartingAt(month: Date) {
  const dia = firstOfMonthISO(month);
  return useQuery({
    queryKey: ["crm_meta_default_at", dia],
    queryFn: async (): Promise<Set<string>> => {
      const { data, error } = await db
        .from("crm_vendedor_meta_default")
        .select("vendedor_id")
        .eq("valido_a_partir", dia);
      if (error) throw error;
      return new Set((data ?? []).map((r: { vendedor_id: string }) => r.vendedor_id));
    },
  });
}

/** Define a META PADRÃO a partir do mês (degrau). Não afeta meses anteriores. */
export function useSetMetaDefault() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: { vendedor_id: string; month: Date; target_amount: number }) => {
      const { error } = await db
        .from("crm_vendedor_meta_default")
        .upsert({ vendedor_id: p.vendedor_id, valido_a_partir: firstOfMonthISO(p.month), target_amount: p.target_amount },
                { onConflict: "vendedor_id,valido_a_partir" });
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["crm_metas"] }); qc.invalidateQueries({ queryKey: ["crm_meta_default_at"] }); },
  });
}

/** Remove o degrau de meta padrão que começa neste mês (meses caem no degrau anterior). */
export function useRemoveMetaDefault() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: { vendedor_id: string; month: Date }) => {
      const { error } = await db
        .from("crm_vendedor_meta_default")
        .delete()
        .eq("vendedor_id", p.vendedor_id)
        .eq("valido_a_partir", firstOfMonthISO(p.month));
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["crm_metas"] }); qc.invalidateQueries({ queryKey: ["crm_meta_default_at"] }); },
  });
}

/** Define a EXCEÇÃO de um mês específico. */
export function useSetMetaMes() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: { vendedor_id: string; ano: number; mes: number; target_amount: number }) => {
      const { error } = await db
        .from("crm_vendedor_metas")
        .upsert({ vendedor_id: p.vendedor_id, ano: p.ano, mes: p.mes, target_amount: p.target_amount, target_qty: 0 },
                { onConflict: "vendedor_id,ano,mes" });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["crm_metas"] }),
  });
}

/** Remove a exceção do mês (volta a valer a meta padrão vigente). */
export function useRemoveMetaMes() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: { vendedor_id: string; ano: number; mes: number }) => {
      const { error } = await db
        .from("crm_vendedor_metas")
        .delete()
        .eq("vendedor_id", p.vendedor_id).eq("ano", p.ano).eq("mes", p.mes);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["crm_metas"] }),
  });
}

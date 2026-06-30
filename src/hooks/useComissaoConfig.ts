import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

// ── Vendedor: tem comissão? ──────────────────────────────────────────────────
export function useVendedorComissao() {
  return useQuery({
    queryKey: ["vendedor-comissao"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("vendedor_comissao")
        .select("vendedor_id, tem_comissao");
      if (error) throw error;
      const map: Record<string, boolean> = {};
      for (const r of (data ?? []) as { vendedor_id: string; tem_comissao: boolean }[]) {
        map[r.vendedor_id] = r.tem_comissao;
      }
      return map;
    },
  });
}

export function useToggleVendedorComissao() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ vendedorId, tem, updatedBy }: { vendedorId: string; tem: boolean; updatedBy?: string }) => {
      const { error } = await (supabase as any)
        .from("vendedor_comissao")
        .upsert({ vendedor_id: vendedorId, tem_comissao: tem, updated_by: updatedBy ?? null, updated_at: new Date().toISOString() },
          { onConflict: "vendedor_id" });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["vendedor-comissao"] }),
    onError: (e: Error) => toast.error("Erro ao atualizar comissão: " + e.message),
  });
}

// ── Faixas de progressão de comissão ─────────────────────────────────────────
export interface ComissaoFaixa {
  id: string;
  ordem: number;
  min_pct: number;
  max_pct: number | null;
  taxa: number;
  ativo: boolean;
}

export function useComissaoFaixas() {
  return useQuery({
    queryKey: ["comissao-faixas"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("comissao_faixas")
        .select("id, ordem, min_pct, max_pct, taxa, ativo")
        .order("ordem", { ascending: true });
      if (error) throw error;
      return (data ?? []) as ComissaoFaixa[];
    },
  });
}

export function useUpsertComissaoFaixa() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (f: Partial<ComissaoFaixa>) => {
      const { error } = await (supabase as any).from("comissao_faixas").upsert(f);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["comissao-faixas"] }),
    onError: (e: Error) => toast.error("Erro ao salvar faixa: " + e.message),
  });
}

export function useDeleteComissaoFaixa() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from("comissao_faixas").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["comissao-faixas"] }),
    onError: (e: Error) => toast.error("Erro ao remover faixa: " + e.message),
  });
}

// ── Bonificação PAP (descarbonização) ────────────────────────────────────────
export interface BonificacaoPap {
  id: string;
  descricao: string;
  percentual: number;
  ativo: boolean;
}

export function useBonificacaoPap() {
  return useQuery({
    queryKey: ["bonificacao-pap"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("bonificacao_pap")
        .select("id, descricao, percentual, ativo")
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as BonificacaoPap | null;
    },
  });
}

export function useUpsertBonificacaoPap() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, percentual, ativo, updatedBy }: { id?: string; percentual: number; ativo?: boolean; updatedBy?: string }) => {
      const payload: Record<string, unknown> = {
        percentual, ativo: ativo ?? true, updated_by: updatedBy ?? null, updated_at: new Date().toISOString(),
        descricao: "PAP indicador — Descarbonização",
      };
      if (id) payload.id = id;
      const { error } = await (supabase as any).from("bonificacao_pap").upsert(payload);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["bonificacao-pap"] }),
    onError: (e: Error) => toast.error("Erro ao salvar bonificação: " + e.message),
  });
}

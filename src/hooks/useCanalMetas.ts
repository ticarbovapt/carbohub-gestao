import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export type CanalMeta = { ano: number; mes: number; canal: "consumo" | "revenda" | "online"; valor: number };

/** Lê as metas mensais por canal de um ano. Retorna mapa canal → (mes → valor). */
export function useCanalMetas(ano: number) {
  return useQuery({
    queryKey: ["canal-metas", ano],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("canal_metas")
        .select("ano, mes, canal, valor")
        .eq("ano", ano);
      if (error) throw error;
      const map: Record<string, Record<number, number>> = { consumo: {}, revenda: {}, online: {} };
      for (const r of (data ?? []) as CanalMeta[]) {
        if (!map[r.canal]) map[r.canal] = {};
        map[r.canal][r.mes] = Number(r.valor);
      }
      return map;
    },
  });
}

/** Upsert de uma meta (gestão define mês a mês). */
export function useUpsertCanalMeta() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ ano, mes, canal, valor, updatedBy }: {
      ano: number; mes: number; canal: string; valor: number; updatedBy?: string;
    }) => {
      const { error } = await (supabase as any)
        .from("canal_metas")
        .upsert(
          { ano, mes, canal, valor, updated_by: updatedBy ?? null, updated_at: new Date().toISOString() },
          { onConflict: "ano,mes,canal" },
        );
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ["canal-metas", vars.ano] });
    },
    onError: (e: Error) => toast.error("Erro ao salvar meta: " + e.message),
  });
}

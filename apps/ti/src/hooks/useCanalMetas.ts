import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// Metas mensais por canal (canal_metas). Portado do controle, sem legado de auth.
export type CanalKey = "consumo" | "revenda" | "online";
export type CanalMetasMap = Record<CanalKey, Record<number, number>>;

const db = supabase as unknown as {
  from: (t: string) => any;
};

/** Lê as metas mensais por canal de um ano → mapa canal → (mes → valor). */
export function useCanalMetas(ano: number) {
  return useQuery({
    queryKey: ["canal-metas", ano],
    queryFn: async (): Promise<CanalMetasMap> => {
      const { data, error } = await db.from("canal_metas").select("ano, mes, canal, valor").eq("ano", ano);
      if (error) throw error;
      const map: CanalMetasMap = { consumo: {}, revenda: {}, online: {} };
      for (const r of (data ?? []) as { canal: CanalKey; mes: number; valor: number }[]) {
        (map[r.canal] ??= {})[r.mes] = Number(r.valor);
      }
      return map;
    },
  });
}

/** Upsert de uma meta (gestão define mês a mês). */
export function useUpsertCanalMeta() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: { ano: number; mes: number; canal: string; valor: number; updatedBy?: string }) => {
      const { error } = await db.from("canal_metas").upsert(
        { ano: p.ano, mes: p.mes, canal: p.canal, valor: p.valor, updated_by: p.updatedBy ?? null, updated_at: new Date().toISOString() },
        { onConflict: "ano,mes,canal" },
      );
      if (error) throw error;
    },
    onSuccess: (_d, vars) => qc.invalidateQueries({ queryKey: ["canal-metas", vars.ano] }),
  });
}

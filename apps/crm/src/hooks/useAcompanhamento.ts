import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

// Tabelas/RPCs do Carbo Sales não estão nos tipos gerados → cliente sem tipo.
const db = supabase as unknown as {
  from: (t: string) => any;
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: any; error: any }>;
};

/**
 * A trilha de movimentação começou em 06/07/2026 (o registro passou a existir
 * nessa data). Antes disso "movimentados" é sempre zero — não porque a equipe
 * parou, mas porque não havia registro. A tela avisa em vez de deixar o gestor
 * concluir sozinho.
 */
export const TRILHA_INICIO = "2026-07-06";

/**
 * Dias com trilha comprovadamente incompleta. Em 26/07, ao limpar as duplicatas
 * geradas na virada do registro para o banco, um DELETE com filtro errado levou
 * junto ~30 movimentos legítimos destes dois dias. Ver
 * docs/CRM-FUNIS-OUTBOUND-INBOUND.md §3-B.
 */
export const DIAS_SUBCONTADOS = ["2026-07-24", "2026-07-25"];

export interface SerieDia {
  dia: string;
  criados: number;
  ganhos: number;
  perdidos: number;
  movimentados: number;
  receita: number;
}

export interface Acompanhamento {
  periodo: { desde: string; ate: string };
  serie: SerieDia[];
  hoje: {
    criados: number; ganhos: number; perdidos: number; movimentados: number;
    abertos: number; parados: number; esquecidos: number;
  };
  por_pessoa: { dono: string; abertos: number; parados: number; esquecidos: number; pior_dias: number }[];
  por_etapa: { funnel_type: string; stage: string; prazo_dias: number; leads: number; parados: number; dias_medio: number }[];
  motivos: { funnel_type: string; motivo: string; n: number }[];
  lista_esquecidos: {
    id: string; nome: string; funnel_type: string; stage: string;
    dono: string | null; dias_parado: number; prazo_dias: number;
  }[];
}

export function useAcompanhamento(desde: string, ate: string) {
  return useQuery({
    queryKey: ["crm-acompanhamento", desde, ate],
    queryFn: async (): Promise<Acompanhamento> => {
      const { data, error } = await db.rpc("crm_acompanhamento", { p_desde: desde, p_ate: ate });
      if (error) throw error;
      return data as Acompanhamento;
    },
  });
}

export interface StageSla {
  funnel_type: string;
  stage: string;
  prazo_dias: number;
}

export function useStageSlas() {
  return useQuery({
    queryKey: ["crm-stage-sla"],
    queryFn: async (): Promise<StageSla[]> => {
      const { data, error } = await db
        .from("crm_stage_sla").select("funnel_type, stage, prazo_dias")
        .order("funnel_type").order("stage");
      if (error) throw error;
      return (data ?? []) as StageSla[];
    },
  });
}

export function useSaveStageSla() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (sla: StageSla) => {
      const { data, error } = await db
        .from("crm_stage_sla")
        .upsert(
          { ...sla, updated_at: new Date().toISOString() },
          { onConflict: "funnel_type,stage" },
        )
        .select("stage");
      if (error) throw error;
      // A RLS de escrita exige gestor e pode barrar SEM erro (0 linhas). Sem
      // esta checagem o usuário veria "salvo" e o valor voltaria ao recarregar.
      if (!data || (data as unknown[]).length === 0) {
        throw new Error("Sem permissão para alterar prazos (só a gestão).");
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["crm-stage-sla"] });
      qc.invalidateQueries({ queryKey: ["crm-acompanhamento"] });
      toast.success("Prazo atualizado");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

/** Arquiva o lead. Some das telas, permanece nos indicadores históricos. */
export function useArquivarLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, motivo }: { id: string; motivo?: string }) => {
      const { error } = await db.rpc("crm_sales_lead_arquivar", {
        p_lead: id, p_motivo: motivo ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["crm-leads"] });
      qc.invalidateQueries({ queryKey: ["crm-acompanhamento"] });
      toast.success("Lead arquivado");
    },
    // Erro do Supabase NÃO é instanceof Error — é objeto com message/details/hint.
    onError: (e: unknown) => {
      const err = e as { message?: string; details?: string; hint?: string } | null;
      toast.error([err?.message, err?.details, err?.hint].filter(Boolean).join(" · ")
        || "Não foi possível arquivar.");
    },
  });
}

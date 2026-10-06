import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { CRMLead } from "@/types/crm";

const db = supabase as unknown as {
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: any; error: any }>;
};

export interface LeadDetalhe {
  lead: CRMLead;
  arquivado: boolean;
  atividades: unknown[];
  orcamentos: { order_id: string; order_number: string | null; total: number; status: string; created_at: string }[];
}

/**
 * Um lead por id, direto do banco.
 *
 * Existe porque o board só tem em mãos os leads do funil aberto: um link
 * apontando para um card de OUTRO funil, ou para um card ARQUIVADO (que a RLS
 * esconde de propósito), não encontraria nada na lista carregada.
 *
 * A RPC enxerga arquivado e é guardada por dono-ou-gestor.
 */
export function useLeadPorId(id: string | null) {
  return useQuery({
    queryKey: ["crm-lead-detalhe", id],
    enabled: !!id,
    retry: false,          // "sem permissão" não melhora tentando de novo
    queryFn: async (): Promise<LeadDetalhe> => {
      const { data, error } = await db.rpc("crm_lead_detalhe", { p_lead: id });
      if (error) throw error;
      return data as LeadDetalhe;
    },
  });
}

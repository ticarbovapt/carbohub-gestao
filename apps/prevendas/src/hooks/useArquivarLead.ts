import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

// RPCs do Carbo Sales não estão nos tipos gerados → cliente sem tipo.
const db = supabase as unknown as {
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: any; error: any }>;
};

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

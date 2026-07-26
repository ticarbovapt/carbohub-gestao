import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const db = supabase as unknown as {
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: any; error: any }>;
};

// Erro do Supabase NÃO é instanceof Error — é objeto com message/details/hint.
const msgDoErro = (e: unknown, padrao: string) => {
  const err = e as { message?: string; details?: string; hint?: string } | null;
  return [err?.message, err?.details, err?.hint].filter(Boolean).join(" · ") || padrao;
};

/**
 * Repassa o lead do Outbound ao closer: cria um card no Inbound com toda a
 * timeline junto e move o card do SDR para "Passado ao Closer".
 *
 * Idempotente no banco — repassar de novo devolve o card que já existe.
 */
export function useRepassarLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, nota }: { id: string; nota?: string }) => {
      const { data, error } = await db.rpc("crm_sales_lead_repassar", {
        p_lead: id, p_nota: nota ?? null,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["crm-leads"] });
      qc.invalidateQueries({ queryKey: ["crm-stats"] });
      toast.success("Repassado ao closer", {
        description: "O card está na fila do Inbound, com todo o histórico.",
      });
    },
    onError: (e: unknown) => toast.error(msgDoErro(e, "Não foi possível repassar.")),
  });
}

/** Assume um card que está na fila do Inbound (chegou por repasse, sem dono). */
export function usePegarLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.rpc("crm_sales_lead_pegar", { p_lead: id });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["crm-leads"] });
      toast.success("Card assumido");
    },
    onError: (e: unknown) => toast.error(msgDoErro(e, "Não foi possível pegar o card.")),
  });
}

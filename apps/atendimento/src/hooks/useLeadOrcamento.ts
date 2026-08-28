import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const db = supabase as unknown as {
  from: (t: string) => any;
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: any; error: any }>;
};

export interface OrcamentoVigente {
  order_id: string;
  order_number: string | null;
  total: number;
  status: string;
  created_at: string;
}

/**
 * Orçamento vigente do lead — o mais recente que AINDA é orçamento.
 *
 * O filtro por `status = 'quote'` mora na RPC de propósito: o modo `?edit=` do
 * /vender não valida status, e reabrir um pedido já convertido e salvar o
 * rebaixaria de volta para orçamento.
 */
export function useOrcamentoVigente(leadId: string | null) {
  return useQuery({
    queryKey: ["crm-lead-orcamento", leadId],
    enabled: !!leadId,
    queryFn: async (): Promise<OrcamentoVigente | null> => {
      const { data, error } = await db.rpc("crm_lead_orcamento_vigente", { p_lead: leadId });
      if (error) throw error;
      const linhas = (data ?? []) as OrcamentoVigente[];
      return linhas[0] ?? null;
    },
  });
}

/** Todos os orçamentos já gerados a partir do lead (histórico de versões). */
export function useOrcamentosDoLead(leadId: string | null) {
  return useQuery({
    queryKey: ["crm-lead-orcamentos", leadId],
    enabled: !!leadId,
    queryFn: async () => {
      const { data, error } = await db
        .from("crm_lead_orders")
        .select("order_id, created_at, carboze_orders(order_number, total, status)")
        .eq("lead_id", leadId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as {
        order_id: string; created_at: string;
        carboze_orders: { order_number: string | null; total: number; status: string } | null;
      }[];
    },
  });
}

/** Amarra um pedido recém-criado ao lead que o originou. */
export function useVincularOrcamento() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ leadId, orderId }: { leadId: string; orderId: string }) => {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await db.from("crm_lead_orders").insert({
        lead_id: leadId, order_id: orderId, created_by: user?.id,
      });
      // 23505 = já existe vínculo para este pedido. Não é erro para o usuário:
      // significa que o elo já foi feito, que é o resultado desejado.
      if (error && (error as { code?: string }).code !== "23505") throw error;
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ["crm-lead-orcamento", v.leadId] });
      qc.invalidateQueries({ queryKey: ["crm-lead-orcamentos", v.leadId] });
    },
    // Falhar o vínculo NÃO pode derrubar a venda: o pedido já existe e é o que
    // importa. Avisa e segue — o elo pode ser refeito depois.
    onError: (e: unknown) => {
      const err = e as { message?: string } | null;
      console.error("[crm] falha ao vincular orçamento ao lead", e);
      toast.warning("Venda salva, mas não consegui ligá-la ao card do CRM.", {
        description: err?.message,
      });
    },
  });
}

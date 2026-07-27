import { useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const db = supabase as unknown as {
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: any; error: any }>;
};

export interface LeadAtividade {
  id: string;
  activity_type: string;
  subject: string | null;
  body: string | null;
  status: string | null;
  due_at: string | null;
  done_at: string | null;
  stage_from: string | null;
  stage_to: string | null;
  created_by: string | null;
  created_by_name: string | null;
  created_at: string;
  pinned: boolean;
  meta: Record<string, unknown> | null;
}

export interface LeadDetalhe {
  lead: Record<string, any>;
  arquivado: boolean;
  atividades: LeadAtividade[];
  orcamentos: {
    order_id: string; order_number: string | null;
    total: number; status: string; created_at: string;
  }[];
}

/**
 * O card inteiro por id — lead, timeline e orçamentos.
 *
 * Vem por RPC e não por select direto porque precisa alcançar o ARQUIVADO, que
 * a policy de SELECT esconde de propósito. Sair da operação não é deixar de
 * existir: quem audita precisa chegar.
 */
export function useLeadDetalhe(id: string | null) {
  const qc = useQueryClient();

  const q = useQuery({
    queryKey: ["crm-lead-detalhe", id],
    enabled: !!id,
    retry: false,
    queryFn: async (): Promise<LeadDetalhe> => {
      const { data, error } = await db.rpc("crm_lead_detalhe", { p_lead: id });
      if (error) throw error;
      return data as LeadDetalhe;
    },
  });

  // Espelho ao vivo: o gestor abre o card e vê o vendedor mexendo em tempo
  // real, sem F5. Escuta as duas tabelas porque mover o card e comentar são
  // eventos diferentes, e os dois mudam o que está na tela.
  useEffect(() => {
    if (!id) return;
    const ch = supabase
      .channel(`crm-lead-${id}`)
      .on("postgres_changes",
        { event: "*", schema: "public", table: "crm_sales_lead_activities", filter: `lead_id=eq.${id}` },
        () => qc.invalidateQueries({ queryKey: ["crm-lead-detalhe", id] }))
      .on("postgres_changes",
        { event: "*", schema: "public", table: "crm_sales_leads", filter: `id=eq.${id}` },
        () => qc.invalidateQueries({ queryKey: ["crm-lead-detalhe", id] }))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [id, qc]);

  return q;
}

/** Comenta no card sem sair do Admin. Vira nota comum na timeline do CRM. */
export function useComentarLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, texto }: { id: string; texto: string }) => {
      const { error } = await db.rpc("crm_lead_comentar", { p_lead: id, p_texto: texto });
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ["crm-lead-detalhe", v.id] });
      toast.success("Comentário registrado");
    },
    // Erro do Supabase NÃO é instanceof Error — é objeto com message/details/hint.
    onError: (e: unknown) => {
      const err = e as { message?: string; details?: string; hint?: string } | null;
      toast.error([err?.message, err?.details, err?.hint].filter(Boolean).join(" · ")
        || "Não foi possível comentar.");
    },
  });
}

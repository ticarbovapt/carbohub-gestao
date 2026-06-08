import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { CRMLead, FunnelType } from "@/types/crm";
import { useAuth } from "@/contexts/AuthContext";

export function useCRMLeads(funnelType: FunnelType, assignedFilter?: string) {
  const { user, scope } = useAuth();
  const ownOnly = scope === "proprio" && !!user?.id;

  return useQuery({
    queryKey: ["crm-leads", funnelType, ownOnly ? user?.id : "all", assignedFilter],
    queryFn: async () => {
      let query = supabase
        .from("crm_leads")
        .select("*")
        .eq("funnel_type", funnelType)
        .order("created_at", { ascending: false });

      if (ownOnly) {
        query = query.or(`created_by.eq.${user!.id},assigned_to.eq.${user!.id}`);
      } else if (assignedFilter) {
        query = query.eq("assigned_to", assignedFilter);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as CRMLead[];
    },
  });
}

export function useCreateCRMLead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (lead: Partial<CRMLead> & { funnel_type: FunnelType }) => {
      const { data: { user } } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from("crm_leads")
        .insert({ ...lead, stage: lead.stage || "a_contatar", created_by: user?.id })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["crm-leads", variables.funnel_type] });
      toast.success("Lead criado!");
    },
    onError: (error: Error) => toast.error("Erro ao criar lead: " + error.message),
  });
}

export function useUpdateCRMLead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...data }: { id: string } & Partial<CRMLead>) => {
      const { data: result, error } = await supabase
        .from("crm_leads").update(data).eq("id", id).select().single();
      if (error) throw error;
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["crm-leads"] });
      toast.success("Lead atualizado!");
    },
    onError: (error: Error) => toast.error("Erro: " + error.message),
  });
}

export function useAdvanceLeadStage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id, newStage, funnelType, currentStage,
    }: { id: string; newStage: string; funnelType: FunnelType; currentStage?: string }) => {
      const updates: Record<string, unknown> = { stage: newStage };

      if (newStage === "tentativa_1") updates.contact_attempts = 1;
      if (newStage === "tentativa_2") updates.contact_attempts = 2;
      if (["contatado", "tentativa_1", "tentativa_2"].includes(newStage)) {
        updates.last_contact_at = new Date().toISOString();
      }
      if (["em_negociacao", "proposta", "proposta_tecnica"].includes(newStage)) {
        updates.temperature = "quente";
      } else if (["qualificado", "apresentacao", "diagnostico", "poc", "visita_agendada"].includes(newStage)) {
        updates.temperature = "morno";
      }
      if (["convertido", "parceiro", "fechamento"].includes(newStage)) {
        updates.won_at = new Date().toISOString();
      }

      const { data, error } = await supabase
        .from("crm_leads").update(updates).eq("id", id).select().single();
      if (error) throw error;

      // Record stage-change activity
      const { data: { user } } = await supabase.auth.getUser();
      if (user?.id) {
        const { data: profile } = await supabase
          .from("profiles").select("full_name, username").eq("id", user.id).single();
        await supabase.from("crm_lead_activities").insert({
          lead_id: id,
          activity_type: "stage_change",
          subject: `${currentStage || "?"} → ${newStage}`,
          status: "done",
          done_at: new Date().toISOString(),
          stage_from: currentStage || null,
          stage_to: newStage,
          created_by: user.id,
          created_by_name: profile?.full_name || profile?.username || null,
        });
      }

      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["crm-leads", variables.funnelType] });
      queryClient.invalidateQueries({ queryKey: ["crm-lead", variables.id] });
      toast.success("Etapa avançada!");
    },
    onError: (error: Error) => toast.error("Erro: " + error.message),
  });
}

export function useMarkLeadLost() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id, reason, funnelType, currentStage,
    }: { id: string; reason: string; funnelType: FunnelType; currentStage?: string }) => {
      const lostStage = funnelType === "f2" ? "descartado" : "sem_interesse";
      const { data, error } = await supabase
        .from("crm_leads")
        .update({ stage: lostStage, lost_reason: reason, lost_at: new Date().toISOString() })
        .eq("id", id).select().single();
      if (error) throw error;

      const { data: { user } } = await supabase.auth.getUser();
      if (user?.id) {
        const { data: profile } = await supabase
          .from("profiles").select("full_name, username").eq("id", user.id).single();
        await supabase.from("crm_lead_activities").insert({
          lead_id: id,
          activity_type: "stage_change",
          subject: `Perdido: ${reason}`,
          status: "done",
          done_at: new Date().toISOString(),
          stage_from: currentStage || null,
          stage_to: lostStage,
          created_by: user.id,
          created_by_name: profile?.full_name || profile?.username || null,
          meta: { lost_reason: reason },
        });
      }

      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["crm-leads", variables.funnelType] });
      toast.success("Lead marcado como perdido");
    },
    onError: (error: Error) => toast.error("Erro: " + error.message),
  });
}

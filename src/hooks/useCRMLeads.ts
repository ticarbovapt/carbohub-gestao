import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { CRMLead, FunnelType } from "@/types/crm";

// ===== QUERIES =====

export function useCRMLeads(funnelType: FunnelType, stageFilter?: string) {
  return useQuery({
    queryKey: ["crm-leads", funnelType, stageFilter],
    queryFn: async () => {
      let query = supabase
        .from("crm_leads")
        .select("*")
        .eq("funnel_type", funnelType)
        .order("created_at", { ascending: false });

      if (stageFilter && stageFilter !== "all") {
        query = query.eq("stage", stageFilter);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as CRMLead[];
    },
  });
}

export function useCRMLeadDetail(leadId: string | undefined) {
  return useQuery({
    queryKey: ["crm-lead", leadId],
    queryFn: async () => {
      if (!leadId) return null;
      const { data, error } = await supabase
        .from("crm_leads")
        .select("*")
        .eq("id", leadId)
        .single();
      if (error) throw error;
      return data as CRMLead;
    },
    enabled: !!leadId,
  });
}

export function useCRMStats(funnelType: FunnelType) {
  return useQuery({
    queryKey: ["crm-stats", funnelType],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("crm_leads")
        .select("stage, temperature, estimated_revenue, contact_attempts, updated_at")
        .eq("funnel_type", funnelType);

      if (error) throw error;
      const leads = data || [];

      const now = Date.now();
      const staleThreshold = 3 * 24 * 60 * 60 * 1000; // 3 days

      return {
        total: leads.length,
        byStage: leads.reduce((acc, l) => {
          acc[l.stage] = (acc[l.stage] || 0) + 1;
          return acc;
        }, {} as Record<string, number>),
        hot: leads.filter((l) => l.temperature === "quente").length,
        warm: leads.filter((l) => l.temperature === "morno").length,
        cold: leads.filter((l) => l.temperature === "frio").length,
        stale: leads.filter((l) => now - new Date(l.updated_at).getTime() > staleThreshold).length,
        totalRevenue: leads.reduce((sum, l) => sum + Number(l.estimated_revenue || 0), 0),
        avgAttempts: leads.length > 0
          ? Math.round(leads.reduce((sum, l) => sum + (l.contact_attempts || 0), 0) / leads.length * 10) / 10
          : 0,
      };
    },
  });
}

export function useCRMAllStats() {
  return useQuery({
    queryKey: ["crm-all-stats"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("crm_leads")
        .select("funnel_type, stage, temperature, updated_at");

      if (error) throw error;
      const leads = data || [];
      const now = Date.now();
      const day3 = 3 * 24 * 60 * 60 * 1000;

      return {
        total: leads.length,
        byFunnel: leads.reduce((acc, l) => {
          acc[l.funnel_type] = (acc[l.funnel_type] || 0) + 1;
          return acc;
        }, {} as Record<string, number>),
        stale: leads.filter((l) => now - new Date(l.updated_at).getTime() > day3).length,
        hot: leads.filter((l) => l.temperature === "quente").length,
      };
    },
  });
}

// ===== MUTATIONS =====

export function useCreateCRMLead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (lead: Partial<CRMLead> & { funnel_type: FunnelType }) => {
      const { data: user } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from("crm_leads")
        .insert({
          ...lead,
          stage: lead.stage || "a_contatar",
          created_by: user.user?.id,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["crm-leads", variables.funnel_type] });
      queryClient.invalidateQueries({ queryKey: ["crm-stats"] });
      queryClient.invalidateQueries({ queryKey: ["crm-all-stats"] });
      toast.success("Lead criado com sucesso!");
    },
    onError: (error: Error) => {
      toast.error("Erro ao criar lead: " + error.message);
    },
  });
}

export function useUpdateCRMLead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...data }: { id: string } & Partial<CRMLead>) => {
      const { data: result, error } = await supabase
        .from("crm_leads")
        .update(data)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["crm-leads"] });
      queryClient.invalidateQueries({ queryKey: ["crm-stats"] });
      queryClient.invalidateQueries({ queryKey: ["crm-all-stats"] });
      toast.success("Lead atualizado!");
    },
    onError: (error: Error) => {
      toast.error("Erro: " + error.message);
    },
  });
}

export function useAdvanceLeadStage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, newStage, funnelType }: { id: string; newStage: string; funnelType: FunnelType }) => {
      const updates: Record<string, unknown> = { stage: newStage };

      // Auto-set contact attempts on contact stages
      if (newStage === "tentativa_1") updates.contact_attempts = 1;
      if (newStage === "tentativa_2") updates.contact_attempts = 2;
      if (["contatado", "tentativa_1", "tentativa_2"].includes(newStage)) {
        updates.last_contact_at = new Date().toISOString();
      }
      // Set temperature based on stage progression
      if (["em_negociacao", "proposta", "proposta_tecnica"].includes(newStage)) {
        updates.temperature = "quente";
      } else if (["qualificado", "apresentacao", "diagnostico", "poc", "visita_agendada"].includes(newStage)) {
        updates.temperature = "morno";
      }

      const { data, error } = await supabase
        .from("crm_leads")
        .update(updates)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["crm-leads", variables.funnelType] });
      queryClient.invalidateQueries({ queryKey: ["crm-stats"] });
      queryClient.invalidateQueries({ queryKey: ["crm-all-stats"] });
      toast.success("Lead avançado!");
    },
    onError: (error: Error) => {
      toast.error("Erro: " + error.message);
    },
  });
}

export function useMarkLeadLost() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, reason, funnelType }: { id: string; reason: string; funnelType: FunnelType }) => {
      const lostStage = funnelType === "f2" ? "descartado" : "sem_interesse";
      const { data, error } = await supabase
        .from("crm_leads")
        .update({ stage: lostStage, lost_reason: reason })
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["crm-leads", variables.funnelType] });
      queryClient.invalidateQueries({ queryKey: ["crm-stats"] });
      queryClient.invalidateQueries({ queryKey: ["crm-all-stats"] });
      toast.success("Lead marcado como perdido");
    },
    onError: (error: Error) => {
      toast.error("Erro: " + error.message);
    },
  });
}

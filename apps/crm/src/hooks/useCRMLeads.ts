import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { CRMLead, FunnelType } from "@/types/crm";
import { useAuth } from "@/contexts/AuthContext";

// Leads do Carbo Sales = tabelas PRÓPRIAS (crm_sales_leads / crm_sales_lead_activities),
// isoladas do Controle. Tabelas novas não estão nos tipos gerados → cliente sem tipo.
const db = supabase as unknown as { from: (t: string) => any };

export function useCRMLeads(funnelType: FunnelType, assignedFilter?: string) {
  const { user, scope } = useAuth();
  const ownOnly = scope === "proprio" && !!user?.id;

  return useQuery({
    queryKey: ["crm-leads", funnelType, ownOnly ? user?.id : "all", assignedFilter],
    queryFn: async () => {
      let query = db
        .from("crm_sales_leads")
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

// Todos os leads (sem filtro de funil) — usado na visão "Todos" das Pipelines.
export function useAllCRMLeads() {
  const { user, scope } = useAuth();
  const ownOnly = scope === "proprio" && !!user?.id;

  return useQuery({
    queryKey: ["crm-leads", "all-funnels", ownOnly ? user?.id : "all"],
    queryFn: async () => {
      let query = db
        .from("crm_sales_leads")
        .select("*")
        .order("created_at", { ascending: false });
      if (ownOnly) query = query.or(`created_by.eq.${user!.id},assigned_to.eq.${user!.id}`);
      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as CRMLead[];
    },
  });
}

export function useCRMStats(funnelType: FunnelType) {
  return useQuery({
    queryKey: ["crm-stats", funnelType],
    queryFn: async () => {
      const { data, error } = await db
        .from("crm_sales_leads")
        .select("stage, temperature, estimated_revenue, contact_attempts, updated_at")
        .eq("funnel_type", funnelType);
      if (error) throw error;
      const leads = data || [];
      const now = Date.now();
      const staleThreshold = 3 * 24 * 60 * 60 * 1000;
      return {
        total: leads.length,
        byStage: leads.reduce((acc, l) => { acc[l.stage] = (acc[l.stage] || 0) + 1; return acc; }, {} as Record<string, number>),
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
      const { data, error } = await db
        .from("crm_sales_leads")
        .select("funnel_type, stage, temperature, updated_at");
      if (error) throw error;
      const leads = data || [];
      const now = Date.now();
      const day3 = 3 * 24 * 60 * 60 * 1000;
      return {
        total: leads.length,
        byFunnel: leads.reduce((acc, l) => { acc[l.funnel_type] = (acc[l.funnel_type] || 0) + 1; return acc; }, {} as Record<string, number>),
        stale: leads.filter((l) => now - new Date(l.updated_at).getTime() > day3).length,
        hot: leads.filter((l) => l.temperature === "quente").length,
      };
    },
  });
}

export function useCreateCRMLead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (lead: Partial<CRMLead> & { funnel_type: FunnelType }) => {
      const { data: { user } } = await supabase.auth.getUser();
      const { data, error } = await db
        .from("crm_sales_leads")
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
      const { data: result, error } = await db
        .from("crm_sales_leads").update(data).eq("id", id).select().single();
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

      const { data, error } = await db
        .from("crm_sales_leads").update(updates).eq("id", id).select().single();
      if (error) throw error;

      // Record stage-change activity
      const { data: { user } } = await supabase.auth.getUser();
      if (user?.id) {
        const { data: profile } = await supabase
          .from("profiles").select("full_name, username").eq("id", user.id).single();
        await db.from("crm_sales_lead_activities").insert({
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
      const { data, error } = await db
        .from("crm_sales_leads")
        .update({ stage: lostStage, lost_reason: reason, lost_at: new Date().toISOString() })
        .eq("id", id).select().single();
      if (error) throw error;

      const { data: { user } } = await supabase.auth.getUser();
      if (user?.id) {
        const { data: profile } = await supabase
          .from("profiles").select("full_name, username").eq("id", user.id).single();
        await db.from("crm_sales_lead_activities").insert({
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

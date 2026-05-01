// CRM Lead Activities — queries and mutations
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { CRMActivity, ActivityType } from "@/types/crm";

// ─────────────────────────────────────────────────────────────────────────────
// Queries
// ─────────────────────────────────────────────────────────────────────────────

export function useCRMActivities(leadId: string | undefined) {
  return useQuery({
    queryKey: ["crm-activities", leadId],
    queryFn: async () => {
      if (!leadId) return [];
      const { data, error } = await supabase
        .from("crm_lead_activities")
        .select("*")
        .eq("lead_id", leadId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as CRMActivity[];
    },
    enabled: !!leadId,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Mutations
// ─────────────────────────────────────────────────────────────────────────────

export interface CreateActivityInput {
  lead_id: string;
  activity_type: ActivityType;
  body: string;
  subject?: string;
  direction?: "inbound" | "outbound";
  due_at?: string | null;
  status?: "pending" | "done" | "cancelled";
}

export function useCreateCRMActivity() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateActivityInput) => {
      const { data: { user } } = await supabase.auth.getUser();

      // Fetch creator name from profiles
      let creatorName: string | null = null;
      if (user?.id) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("full_name, username")
          .eq("id", user.id)
          .single();
        creatorName = profile?.full_name || profile?.username || null;
      }

      const { error } = await supabase.from("crm_lead_activities").insert({
        lead_id: input.lead_id,
        activity_type: input.activity_type,
        subject: input.subject || null,
        body: input.body,
        direction: input.direction || null,
        due_at: input.due_at || null,
        status: input.status || "done",
        done_at: input.status === "done" || !input.status ? new Date().toISOString() : null,
        created_by: user?.id || null,
        created_by_name: creatorName,
      });
      if (error) throw error;

      // Touch lead updated_at so stale detection resets
      await supabase
        .from("crm_leads")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", input.lead_id);
    },
    onSuccess: (_, input) => {
      qc.invalidateQueries({ queryKey: ["crm-activities", input.lead_id] });
      qc.invalidateQueries({ queryKey: ["crm-lead", input.lead_id] });
      qc.invalidateQueries({ queryKey: ["crm-leads"] });
      qc.invalidateQueries({ queryKey: ["crm-stats"] });
      qc.invalidateQueries({ queryKey: ["crm-all-stats"] });
    },
    onError: (e) => toast.error(`Erro ao registrar atividade: ${e.message}`),
  });
}

/** System-generated stage-change activity (called internally when advancing stage) */
export async function recordStageChange(
  leadId: string,
  stageFrom: string,
  stageTo: string,
  userId: string | null,
  creatorName: string | null
) {
  await supabase.from("crm_lead_activities").insert({
    lead_id: leadId,
    activity_type: "stage_change",
    subject: `Etapa: ${stageFrom} → ${stageTo}`,
    body: null,
    status: "done",
    done_at: new Date().toISOString(),
    stage_from: stageFrom,
    stage_to: stageTo,
    created_by: userId,
    created_by_name: creatorName,
  });
}

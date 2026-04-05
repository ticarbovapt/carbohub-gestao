import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export type LeadStatus = "novo" | "qualificado" | "em_negociacao" | "ganho" | "perdido";

export const LEAD_STATUS_LABELS: Record<LeadStatus, string> = {
  novo: "Novo",
  qualificado: "Qualificado",
  em_negociacao: "Em Negociação",
  ganho: "Ganho",
  perdido: "Perdido",
};

export const LEAD_STATUS_COLORS: Record<LeadStatus, "secondary" | "info" | "warning" | "success" | "destructive"> = {
  novo: "secondary",
  qualificado: "info",
  em_negociacao: "warning",
  ganho: "success",
  perdido: "destructive",
};

export interface B2BLead {
  id: string;
  cnpj: string | null;
  legal_name: string | null;
  trade_name: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  business_vertical: string | null;
  business_model: string | null;
  city: string | null;
  state: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  validation_checklist: any[];
  validation_score: number;
  status: LeadStatus;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export function useB2BLeads(statusFilter?: LeadStatus | "all") {
  return useQuery({
    queryKey: ["b2b-leads", statusFilter],
    queryFn: async () => {
      let query = supabase
        .from("b2b_leads")
        .select("*")
        .order("created_at", { ascending: false });

      if (statusFilter && statusFilter !== "all") {
        query = query.eq("status", statusFilter);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as B2BLead[];
    },
  });
}

export function useUpdateLeadStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: LeadStatus }) => {
      const { data, error } = await supabase
        .from("b2b_leads")
        .update({ status, updated_at: new Date().toISOString() })
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["b2b-leads"] });
      toast.success("Status do lead atualizado!");
    },
    onError: (error: Error) => {
      toast.error("Erro: " + error.message);
    },
  });
}

export function useLeadStats() {
  return useQuery({
    queryKey: ["b2b-lead-stats"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("b2b_leads")
        .select("status, validation_score");

      if (error) throw error;

      return {
        total: data.length,
        novo: data.filter((l) => l.status === "novo").length,
        qualificado: data.filter((l) => l.status === "qualificado").length,
        em_negociacao: data.filter((l) => l.status === "em_negociacao").length,
        ganho: data.filter((l) => l.status === "ganho").length,
        perdido: data.filter((l) => l.status === "perdido").length,
        avgScore: data.length > 0
          ? Math.round(data.reduce((sum, l) => sum + (l.validation_score || 0), 0) / data.length)
          : 0,
      };
    },
  });
}

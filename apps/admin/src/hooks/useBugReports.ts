import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export interface BugReport {
  id: string;
  title: string;
  description: string;
  url: string | null;
  reporter_id: string | null;
  reporter_name: string | null;
  reporter_email: string | null;
  department: string | null;
  status: "open" | "resolved";
  admin_notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface SubmitBugReportPayload {
  title: string;
  description: string;
  url: string;
  reporter_id: string;
  reporter_name: string | null;
  reporter_email: string | null;
  department: string | null;
}

export function useMyBugReports(userId: string | undefined) {
  return useQuery({
    queryKey: ["bug_reports", "mine", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bug_reports")
        .select("*")
        .eq("reporter_id", userId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as BugReport[];
    },
  });
}

export function useSubmitBugReport() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (payload: SubmitBugReportPayload) => {
      const { error } = await supabase.from("bug_reports").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bug_reports"] });
      toast({ title: "Bug reportado!", description: "Obrigado. Nossa equipe vai analisar." });
    },
    onError: (err: Error) => {
      toast({ title: "Erro ao reportar bug", description: err.message, variant: "destructive" });
    },
  });
}

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

// Reportes (bugs + sugestões) do novo ecossistema — tabela PRÓPRIA carbo_bug_reports
// (isolada do Controle). Tabela nova não está nos tipos gerados → cliente sem tipo.
const db = supabase as unknown as { from: (t: string) => any };

// Identifica de qual app veio o report (sales | ops | admin | ti).
const APP = "ti";

export type BugKind = "bug" | "sugestao";
// 'in_progress' (em andamento) é usado no app do TI pra organizar a execução.
// Fluxo do TI (6 etapas). Os 4 status originais foram preservados e ganharam o
// significado da etapa — por isso nada precisou ser migrado no banco.
//   open → Entrada · priorizada → Priorizada · in_progress → Em andamento
//   em_teste → Em teste · resolved → Concluída · declined → Recusada
export type BugStatus =
  | "open" | "priorizada" | "in_progress" | "em_teste" | "resolved" | "declined";
export type BugPriority = "baixa" | "media" | "alta" | "critica";

export interface BugReport {
  id: string;
  app: string;
  kind: BugKind;
  title: string;
  description: string;
  url: string | null;
  reporter_id: string | null;
  reporter_name: string | null;
  reporter_email: string | null;
  department: string | null;
  status: BugStatus;
  admin_notes: string | null;
  // Execução (app do TI): quem resolve + prioridade.
  assignee_id: string | null;
  assignee_name: string | null;
  priority: BugPriority;
  created_at: string;
  updated_at: string;
}

export interface SubmitBugReportPayload {
  kind: BugKind;
  title: string;
  description: string;
  url: string;
  reporter_id: string;
  reporter_name: string | null;
  reporter_email: string | null;
  department: string | null;
}

/** Reportes feitos pelo próprio usuário (popover do topo). */
export function useMyBugReports(userId: string | undefined) {
  return useQuery({
    queryKey: ["bug_reports", "mine", userId],
    enabled: !!userId,
    queryFn: async (): Promise<BugReport[]> => {
      const { data, error } = await db
        .from("carbo_bug_reports")
        .select("*")
        .eq("reporter_id", userId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as BugReport[];
    },
  });
}

/** Todos os reportes — mural público (RLS deixa qualquer autenticado ler). */
export function useAllBugReports() {
  return useQuery({
    queryKey: ["bug_reports", "all"],
    queryFn: async (): Promise<BugReport[]> => {
      const { data, error } = await db
        .from("carbo_bug_reports")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as BugReport[];
    },
  });
}

export function useSubmitBugReport() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (payload: SubmitBugReportPayload) => {
      const { error } = await db.from("carbo_bug_reports").insert({ app: APP, ...payload });
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      queryClient.invalidateQueries({ queryKey: ["bug_reports"] });
      toast({
        title: vars.kind === "sugestao" ? "Sugestão enviada!" : "Bug reportado!",
        description: "Obrigado. Nossa equipe vai analisar.",
      });
    },
    onError: (err: Error) => {
      toast({ title: "Erro ao enviar", description: err.message, variant: "destructive" });
    },
  });
}

/** Marca como resolvido (gestor) com nota opcional. */
export function useResolveBugReport() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async ({ id, admin_notes }: { id: string; admin_notes?: string }) => {
      const { error } = await db
        .from("carbo_bug_reports")
        .update({ status: "resolved", admin_notes: admin_notes ?? null, updated_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bug_reports"] });
      toast({ title: "Marcado como resolvido!" });
    },
    onError: (err: Error) => toast({ title: "Erro ao atualizar", description: err.message, variant: "destructive" }),
  });
}

/** Recusa um report (gestor) — sugestão descartada / bug que não será feito. */
export function useDeclineBugReport() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async ({ id, admin_notes }: { id: string; admin_notes?: string }) => {
      const { error } = await db
        .from("carbo_bug_reports")
        .update({ status: "declined", admin_notes: admin_notes ?? null, updated_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bug_reports"] });
      toast({ title: "Report recusado" });
    },
    onError: (err: Error) => toast({ title: "Erro ao atualizar", description: err.message, variant: "destructive" }),
  });
}

/** Reabre um report resolvido/recusado (gestor). */
export function useReopenBugReport() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db
        .from("carbo_bug_reports")
        .update({ status: "open", updated_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bug_reports"] });
      toast({ title: "Report reaberto" });
    },
    onError: (err: Error) => toast({ title: "Erro", description: err.message, variant: "destructive" }),
  });
}

/** Atualiza a EXECUÇÃO de uma demanda no app do TI: status, responsável,
 *  prioridade e/ou nota — tudo num patch só (gestor/TI, via RLS crm_is_gestor). */
export function useUpdateDemanda() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (patch: {
      id: string;
      status?: BugStatus;
      assignee_id?: string | null;
      assignee_name?: string | null;
      priority?: BugPriority;
      admin_notes?: string | null;
    }) => {
      const { id, ...fields } = patch;
      const { error } = await db
        .from("carbo_bug_reports")
        .update({ ...fields, updated_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bug_reports"] });
    },
    onError: (err: Error) => toast({ title: "Erro ao atualizar demanda", description: err.message, variant: "destructive" }),
  });
}

// ── Timeline da demanda (anotações / histórico) ──────────────────────────────
// Mesmo padrão do CRM (crm_sales_lead_activities): tudo numa tabela só.
export type DemandaActivityType = "note" | "status_change" | "assign";

export interface DemandaActivity {
  id: string;
  demanda_id: string;
  activity_type: DemandaActivityType;
  body: string | null;
  status_from: string | null;
  status_to: string | null;
  created_by: string | null;
  created_by_name: string | null;
  created_at: string;
}

/** Atividades de uma demanda (mais recentes primeiro). */
export function useDemandaActivities(demandaId: string | null) {
  return useQuery({
    queryKey: ["demanda_activities", demandaId],
    enabled: !!demandaId,
    queryFn: async (): Promise<DemandaActivity[]> => {
      const { data, error } = await db
        .from("carbo_demanda_activities")
        .select("*")
        .eq("demanda_id", demandaId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as DemandaActivity[];
    },
  });
}

/** Registra uma atividade (anotação, troca de etapa, atribuição). */
export function useAddDemandaActivity() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (a: {
      demanda_id: string;
      activity_type?: DemandaActivityType;
      body?: string | null;
      status_from?: string | null;
      status_to?: string | null;
    }) => {
      const { data: u } = await supabase.auth.getUser();
      let nome: string | null = null;
      if (u?.user?.id) {
        const { data: prof } = await db.from("profiles").select("full_name").eq("id", u.user.id).maybeSingle();
        nome = (prof as { full_name?: string } | null)?.full_name ?? null;
      }
      const { error } = await db.from("carbo_demanda_activities").insert({
        demanda_id: a.demanda_id,
        activity_type: a.activity_type ?? "note",
        body: a.body ?? null,
        status_from: a.status_from ?? null,
        status_to: a.status_to ?? null,
        created_by: u?.user?.id ?? null,
        created_by_name: nome,
      });
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      queryClient.invalidateQueries({ queryKey: ["demanda_activities", vars.demanda_id] });
    },
    onError: (err: Error) => toast({ title: "Erro ao registrar", description: err.message, variant: "destructive" }),
  });
}

/** Assumir a demanda pra si (vira responsável e entra em andamento). */
export function useAssumirDemanda() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data: u } = await supabase.auth.getUser();
      const uid = u?.user?.id;
      if (!uid) throw new Error("Sessão expirada.");
      const { data: prof } = await db.from("profiles").select("full_name").eq("id", uid).maybeSingle();
      const nome = (prof as { full_name?: string } | null)?.full_name ?? null;
      const { error } = await db
        .from("carbo_bug_reports")
        .update({ assignee_id: uid, assignee_name: nome, status: "in_progress", updated_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
      return { nome };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bug_reports"] });
      toast({ title: "Demanda assumida!", description: "Ela foi pra Em andamento com você como responsável." });
    },
    onError: (err: Error) => toast({ title: "Erro ao assumir", description: err.message, variant: "destructive" }),
  });
}

/** Lista de pessoas (para escolher o responsável pela demanda). */
export function useAllProfiles() {
  return useQuery({
    queryKey: ["all_profiles_ti"],
    queryFn: async (): Promise<{ id: string; full_name: string | null }[]> => {
      const { data } = await (supabase as any).rpc("carbo_all_profiles");
      return (data ?? []) as { id: string; full_name: string | null }[];
    },
  });
}

/** Apaga um report (gestor). */
export function useDeleteBugReport() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.from("carbo_bug_reports").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bug_reports"] });
      toast({ title: "Report removido" });
    },
    onError: (err: Error) => toast({ title: "Erro ao remover", description: err.message, variant: "destructive" }),
  });
}

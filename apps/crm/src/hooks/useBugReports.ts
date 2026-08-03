import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

// Reportes (bugs + sugestões) do novo ecossistema — tabela PRÓPRIA carbo_bug_reports
// (isolada do Controle). Tabela nova não está nos tipos gerados → cliente sem tipo.
const db = supabase as unknown as { from: (t: string) => any };

// Identifica de qual app veio o report (sales | ops | admin).
const APP = "sales";

// Os cinco tipos de @carbo/demandas. Antes eram só bug e sugestao — o TI
// recebe muito mais que software (cabo, acesso, dúvida) e tudo isso virava
// "bug", estragando a métrica de qualidade do sistema.
export type BugKind = "bug" | "sugestao" | "infra" | "acesso" | "ajuda";
// Fluxo do TI (ti.carbohub.com.br). Os apps só LEEM esses estados.
export type BugStatus =
  | "open" | "priorizada" | "in_progress" | "aguardando" | "em_teste" | "resolved" | "declined";

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
  /** Quem do TI assumiu (só leitura aqui — quem edita é o app do TI). */
  assignee_name: string | null;
  attachments: { path: string; name: string; size: number }[] | null;
  created_at: string;
  updated_at: string;
}

export interface SubmitBugReportPayload {
  kind: BugKind;
  /** Impacto declarado por quem reporta — o TI usa pra calcular a prioridade. */
  bloqueio?: string | null;
  pessoas_afetadas?: string | null;
  /** Prints anexados (bucket privado bug-attachments). */
  attachments?: { path: string; name: string; size: number }[];
  /** Tela/navegador/viewport capturados sem perguntar nada. */
  client_context?: Record<string, unknown>;
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
        .is("archived_at", null)
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
        .is("archived_at", null)
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
      const { data, error } = await db
        .from("carbo_bug_reports")
        .update({ status: "resolved", admin_notes: admin_notes ?? null })
        .eq("id", id)
        .select("id");
      if (error) throw error;
      if (!data || data.length === 0) {
        throw new Error("Sem permissão para alterar este report (fale com o TI).");
      }
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
      const { data, error } = await db
        .from("carbo_bug_reports")
        .update({ status: "declined", admin_notes: admin_notes ?? null })
        .eq("id", id)
        .select("id");
      if (error) throw error;
      if (!data || data.length === 0) {
        throw new Error("Sem permissão para alterar este report (fale com o TI).");
      }
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
      const { data, error } = await db
        .from("carbo_bug_reports")
        .update({ status: "open" })
        .eq("id", id)
        .select("id");
      if (error) throw error;
      if (!data || data.length === 0) {
        throw new Error("Sem permissão para alterar este report (fale com o TI).");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bug_reports"] });
      toast({ title: "Report reaberto" });
    },
    onError: (err: Error) => toast({ title: "Erro", description: err.message, variant: "destructive" }),
  });
}

/** Arquiva um report — substitui o excluir (o histórico é auditoria). */
export function useDeleteBugReport() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await db
        .from("carbo_bug_reports")
        .update({ archived_at: new Date().toISOString() })
        .eq("id", id)
        .select("id");
      if (error) throw error;
      if (!data || data.length === 0) {
        throw new Error("Sem permissão para arquivar este report (fale com o TI).");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bug_reports"] });
      toast({ title: "Report arquivado" });
    },
    onError: (err: Error) => toast({ title: "Erro ao arquivar", description: err.message, variant: "destructive" }),
  });
}

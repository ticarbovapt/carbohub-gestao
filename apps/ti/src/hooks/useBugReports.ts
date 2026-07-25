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
  | "open" | "priorizada" | "in_progress" | "aguardando" | "em_teste" | "resolved" | "declined";
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
  priority: BugPriority | null;   // null = ainda não triada
  // Impacto declarado por quem reportou (alimenta a prioridade calculada).
  bloqueio: string | null;
  pessoas_afetadas: string | null;
  attachments: { path: string; name: string; size: number }[] | null;
  client_context: Record<string, unknown> | null;
  stage_since: string | null;     // quando entrou na etapa atual
  archived_at: string | null;
  reopen_count: number;
  created_at: string;
  updated_at: string;
}

export interface SubmitBugReportPayload {
  kind: BugKind;
  /** Impacto declarado por quem reporta — alimenta a prioridade calculada. */
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

/** Atualiza a EXECUÇÃO de uma demanda: status, responsável, prioridade, nota.
 *
 *  ⚠️ A RLS pode recusar a linha SEM devolver erro (update que casa 0 linhas
 *  retorna 204). Por isso pedimos `.select("id")` de volta e tratamos "nenhuma
 *  linha afetada" como falha explícita — senão a tela cantava vitória e o card
 *  voltava sozinho no refetch seguinte. */
export function useUpdateDemanda() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (patch: {
      id: string;
      status?: BugStatus;
      assignee_id?: string | null;
      assignee_name?: string | null;
      priority?: BugPriority | null;
      admin_notes?: string | null;
      archived_at?: string | null;
    }) => {
      const { id, ...fields } = patch;
      const { data, error } = await db
        .from("carbo_bug_reports")
        .update({ ...fields, updated_at: new Date().toISOString() })
        .eq("id", id)
        .select("id");
      if (error) throw error;
      if (!data || data.length === 0) {
        throw new Error("Sem permissão para alterar esta demanda (fale com o TI).");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bug_reports"] });
    },
    onError: (err: Error) => toast({ title: "Erro ao atualizar demanda", description: err.message, variant: "destructive" }),
  });
}

/** Arquiva a demanda — substitui o excluir. Chamado não se apaga: sai do quadro
 *  mas o registro e a timeline continuam auditáveis. */
export function useArquivarDemanda() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await db
        .from("carbo_bug_reports")
        .update({ archived_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq("id", id)
        .select("id");
      if (error) throw error;
      if (!data || data.length === 0) throw new Error("Sem permissão para arquivar esta demanda.");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bug_reports"] });
      toast({ title: "Demanda arquivada", description: "Sai do quadro, mas o histórico fica guardado." });
    },
    onError: (err: Error) => toast({ title: "Erro ao arquivar", description: err.message, variant: "destructive" }),
  });
}

/** Cria uma demanda direto pelo TI (pedido que chegou por telefone/pessoalmente). */
export function useCriarDemanda() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (d: {
      title: string; description: string; kind: BugKind; app: string;
      priority?: BugPriority | null;
      reporter_id?: string | null; reporter_name?: string | null; department?: string | null;
      bloqueio?: string | null; pessoas_afetadas?: string | null;
    }) => {
      const { error } = await db.from("carbo_bug_reports").insert({
        title: d.title, description: d.description, kind: d.kind, app: d.app,
        priority: d.priority ?? null, status: "open",
        reporter_id: d.reporter_id ?? null, reporter_name: d.reporter_name ?? null,
        department: d.department ?? null,
        bloqueio: d.bloqueio ?? null, pessoas_afetadas: d.pessoas_afetadas ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bug_reports"] });
      toast({ title: "Demanda criada!" });
    },
    onError: (err: Error) => toast({ title: "Erro ao criar demanda", description: err.message, variant: "destructive" }),
  });
}

// ── Timeline da demanda (anotações / histórico) ──────────────────────────────
// Mesmo padrão do CRM (crm_sales_lead_activities): tudo numa tabela só.
export type DemandaActivityType = "note" | "task" | "status_change" | "assign";

export interface DemandaActivity {
  id: string;
  demanda_id: string;
  activity_type: DemandaActivityType;
  body: string | null;
  status_from: string | null;
  status_to: string | null;
  due_at: string | null;
  status: string | null;      // tarefa: pending | done
  pinned: boolean;
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

/** Contadores de atividade por demanda (uma query só, pro badge do card). */
export function useDemandaCounts() {
  return useQuery({
    queryKey: ["demanda_counts"],
    queryFn: async (): Promise<Record<string, { notes: number; tasksPendentes: number }>> => {
      // Agregado no banco (antes puxava a tabela inteira de atividades, que
      // estoura o teto de linhas do PostgREST e some com os badges).
      const { data, error } = await (supabase as any).rpc("carbo_demanda_counts");
      if (error) throw error;
      const acc: Record<string, { notes: number; tasksPendentes: number }> = {};
      for (const r of (data ?? []) as { demanda_id: string; notes: number; tasks_pendentes: number }[]) {
        acc[r.demanda_id] = { notes: Number(r.notes || 0), tasksPendentes: Number(r.tasks_pendentes || 0) };
      }
      return acc;
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
      due_at?: string | null;
    }) => {
      const { data: u } = await supabase.auth.getUser();
      let nome: string | null = null;
      if (u?.user?.id) {
        const { data: prof } = await db.from("profiles").select("full_name").eq("id", u.user.id).maybeSingle();
        nome = (prof as { full_name?: string } | null)?.full_name ?? null;
      }
      const tipo = a.activity_type ?? "note";
      // status_change agora é gravado por TRIGGER no banco (vale pra qualquer
      // origem, inclusive os murais dos outros apps) — não duplicar aqui.
      if (tipo === "status_change") return;
      const { error } = await db.from("carbo_demanda_activities").insert({
        demanda_id: a.demanda_id,
        activity_type: tipo,
        body: a.body ?? null,
        status_from: a.status_from ?? null,
        status_to: a.status_to ?? null,
        due_at: a.due_at ?? null,
        status: tipo === "task" ? "pending" : null,
        created_by: u?.user?.id ?? null,
        created_by_name: nome,
      });
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      queryClient.invalidateQueries({ queryKey: ["demanda_activities", vars.demanda_id] });
      queryClient.invalidateQueries({ queryKey: ["demanda_counts"] });
    },
    onError: (err: Error) => toast({ title: "Erro ao registrar", description: err.message, variant: "destructive" }),
  });
}

/** Fixa/desafixa um registro no topo da timeline. */
export function useToggleActivityPin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, pinned }: { id: string; pinned: boolean; demanda_id: string }) => {
      const { error } = await db.from("carbo_demanda_activities").update({ pinned }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, vars) =>
      queryClient.invalidateQueries({ queryKey: ["demanda_activities", vars.demanda_id] }),
  });
}

/** Conclui (ou reabre) uma tarefa da timeline. */
export function useToggleActivityTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, done }: { id: string; done: boolean; demanda_id: string }) => {
      const { error } = await db
        .from("carbo_demanda_activities")
        .update({ status: done ? "done" : "pending" })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      queryClient.invalidateQueries({ queryKey: ["demanda_activities", vars.demanda_id] });
      queryClient.invalidateQueries({ queryKey: ["demanda_counts"] });
    },
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
      // Só puxa pra "Em andamento" quem ainda não passou disso — assumir uma
      // demanda que já está em teste não deve fazê-la retroceder.
      const { data: atual } = await db.from("carbo_bug_reports").select("status").eq("id", id).maybeSingle();
      const st = (atual as { status?: string } | null)?.status;
      const avanca = st === "open" || st === "priorizada";
      const { data, error } = await db
        .from("carbo_bug_reports")
        .update({
          assignee_id: uid, assignee_name: nome,
          ...(avanca ? { status: "in_progress" } : {}),
          updated_at: new Date().toISOString(),
        })
        .eq("id", id)
        .select("id");
      if (error) throw error;
      if (!data || data.length === 0) throw new Error("Sem permissão para assumir esta demanda.");
      return { nome };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bug_reports"] });
      toast({ title: "Demanda assumida!", description: "Ela foi pra Em andamento com você como responsável." });
    },
    onError: (err: Error) => toast({ title: "Erro ao assumir", description: err.message, variant: "destructive" }),
  });
}

export interface PessoaTI {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  department: string | null;
  secondary_department: string | null;
}

/** Time de TI — só quem é do setor pode assumir/receber demanda. A RPC já
 *  devolve o departamento, então o filtro é feito aqui (sem migration). */
export function useTimeTI() {
  return useQuery({
    queryKey: ["time_ti"],
    queryFn: async (): Promise<PessoaTI[]> => {
      const { data, error } = await (supabase as any).rpc("carbo_all_profiles");
      if (error) throw error;   // engolir isso fazia a tela dizer "ninguém do TI cadastrado"
      const todos = (data ?? []) as PessoaTI[];
      return todos.filter(
        (p) => p.department === "ti_suporte" || p.secondary_department === "ti_suporte"
            || p.department === "command" || p.secondary_department === "command",
      );
    },
  });
}

/** Diretório completo (só para resolver nome/foto de quem aparece na timeline). */
export function useAllProfiles() {
  return useQuery({
    queryKey: ["all_profiles_ti"],
    queryFn: async (): Promise<PessoaTI[]> => {
      const { data, error } = await (supabase as any).rpc("carbo_all_profiles");
      if (error) throw error;
      return (data ?? []) as PessoaTI[];
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

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

// ─── Types ─────────────────────────────────────────────────────────────────

export type ViagemStatus =
  | "rascunho"
  | "pendente_gestor"
  | "pendente_financeiro"
  | "pendente_ceo"
  | "aprovado"
  | "reprovado"
  | "em_andamento"
  | "concluido"
  | "cancelado";

export type PCStatus = "aberta" | "enviada" | "aprovada" | "reprovada" | "encerrada";

export type MeioTransporte = "aviao" | "onibus" | "carro_proprio" | "carro_empresa" | "outro";

export type DespesaCategoria =
  | "passagem" | "hospedagem" | "alimentacao" | "transporte_local"
  | "combustivel" | "pedagio" | "estacionamento" | "representacao"
  | "material" | "comunicacao" | "outros" | "alimentacao_representacao";

export interface ViagemSolicitacao {
  id: string;
  solicitante_id: string;
  destino: string;
  objetivo: string;
  data_ida: string;
  data_volta: string;
  duracao_dias: number;
  meio_transporte: MeioTransporte;
  necessita_hotel: boolean;
  adiantamento_solicitado: number;
  estimativa_total: number;
  status: ViagemStatus;
  observacoes: string | null;
  created_at: string;
  updated_at: string;
  // joined
  solicitante?: { full_name: string | null; email: string | null };
}

export interface ViagemAprovacao {
  id: string;
  solicitacao_id: string;
  etapa: "gestor" | "financeiro" | "ceo";
  aprovador_id: string | null;
  decisao: "aprovado" | "reprovado" | "pendente";
  comentario: string | null;
  created_at: string;
}

export interface ViagemDespesa {
  id: string;
  solicitacao_id: string;
  categoria: DespesaCategoria;
  descricao: string;
  valor: number;
  data_despesa: string;
  comprovante_url: string | null;
  cliente_identificado: string | null;
  lancado_por: string;
  is_devolucao: boolean;
  created_at: string;
}

export interface ViagemPC {
  id: string;
  solicitacao_id: string;
  total_despesas: number;
  adiantamento_recebido: number;
  saldo: number;
  status: PCStatus;
  aprovado_por: string | null;
  aprovado_em: string | null;
  observacoes: string | null;
  motivo_reprova_categoria: string | null;
  motivo_reprova_detalhe: string | null;
  submetido_em: string | null;
  reprovado_por: string | null;
  reprovado_em: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateViagemInput {
  destino: string;
  objetivo: string;
  data_ida: string;
  data_volta: string;
  meio_transporte: MeioTransporte;
  necessita_hotel?: boolean;
  adiantamento_solicitado?: number;
  estimativa_total?: number;
  observacoes?: string;
}

export interface LancarDespesaInput {
  solicitacao_id: string;
  categoria: DespesaCategoria;
  descricao: string;
  valor: number;
  data_despesa: string;
  comprovante_url?: string;
  cliente_identificado?: string;
  is_devolucao?: boolean;
}

// ─── Hooks — Solicitações ───────────────────────────────────────────────────

/** Lista solicitações — o usuário vê as próprias; gestores/admin veem todas */
export function useViagens(filter?: { status?: ViagemStatus; solicitanteId?: string }) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["viagens", filter],
    queryFn: async () => {
      let q = (supabase as any)
        .from("viagem_solicitacoes")
        .select("*, solicitante:profiles!solicitante_id(full_name, email)")
        .order("created_at", { ascending: false });

      if (filter?.status) q = q.eq("status", filter.status);
      if (filter?.solicitanteId) q = q.eq("solicitante_id", filter.solicitanteId);

      const { data, error } = await q;
      if (error) throw error;
      return data as ViagemSolicitacao[];
    },
    enabled: !!user,
  });
}

/** Detalhe de uma solicitação */
export function useViagem(id: string | null) {
  return useQuery({
    queryKey: ["viagem", id],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("viagem_solicitacoes")
        .select("*, solicitante:profiles!solicitante_id(full_name, email)")
        .eq("id", id)
        .single();
      if (error) throw error;
      return data as ViagemSolicitacao;
    },
    enabled: !!id,
  });
}

/** Criar nova solicitação */
export function useCreateViagem() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (input: CreateViagemInput) => {
      const { data, error } = await (supabase as any)
        .from("viagem_solicitacoes")
        .insert({ ...input, solicitante_id: user!.id, status: "pendente_gestor" })
        .select()
        .single();
      if (error) throw error;
      return data as ViagemSolicitacao;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["viagens"] });
      toast.success("Solicitação de viagem criada!");
    },
    onError: (e: any) => toast.error(e.message || "Erro ao criar solicitação"),
  });
}

/** Atualizar status da solicitação */
export function useUpdateViagemStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: ViagemStatus }) => {
      const { error } = await (supabase as any)
        .from("viagem_solicitacoes")
        .update({ status })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ["viagens"] });
      queryClient.invalidateQueries({ queryKey: ["viagem", id] });
    },
    onError: (e: any) => toast.error(e.message || "Erro ao atualizar status"),
  });
}

/** Lista aprovações de uma solicitação */
export function useViagemAprovacoes(solicitacaoId: string | null) {
  return useQuery({
    queryKey: ["viagem-aprovacoes", solicitacaoId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("viagem_aprovacoes")
        .select("*")
        .eq("solicitacao_id", solicitacaoId)
        .order("created_at");
      if (error) throw error;
      return data as ViagemAprovacao[];
    },
    enabled: !!solicitacaoId,
  });
}

/** Aprovar ou reprovar uma solicitação de viagem */
export function useAprovarViagem() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({
      solicitacaoId,
      etapa,
      decisao,
      comentario,
      proximoStatus,
    }: {
      solicitacaoId: string;
      etapa: "gestor" | "financeiro" | "ceo";
      decisao: "aprovado" | "reprovado";
      comentario?: string;
      proximoStatus: ViagemStatus;
    }) => {
      const { error: approvalError } = await (supabase as any)
        .from("viagem_aprovacoes")
        .upsert({
          solicitacao_id: solicitacaoId,
          etapa,
          aprovador_id: user!.id,
          decisao,
          comentario: comentario || null,
        }, { onConflict: "solicitacao_id,etapa" });
      if (approvalError) throw approvalError;

      const { error: statusError } = await (supabase as any)
        .from("viagem_solicitacoes")
        .update({ status: proximoStatus })
        .eq("id", solicitacaoId);
      if (statusError) throw statusError;
    },
    onSuccess: (_, { solicitacaoId, decisao }) => {
      queryClient.invalidateQueries({ queryKey: ["viagens"] });
      queryClient.invalidateQueries({ queryKey: ["viagem", solicitacaoId] });
      queryClient.invalidateQueries({ queryKey: ["viagem-aprovacoes", solicitacaoId] });
      toast.success(decisao === "aprovado" ? "Solicitação aprovada!" : "Solicitação reprovada.");
    },
    onError: (e: any) => toast.error(e.message || "Erro ao registrar decisão"),
  });
}

// ─── Hooks — Despesas ───────────────────────────────────────────────────────

/** Lista despesas de uma viagem */
export function useViagemDespesas(solicitacaoId: string | null) {
  return useQuery({
    queryKey: ["viagem-despesas", solicitacaoId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("viagem_despesas")
        .select("*")
        .eq("solicitacao_id", solicitacaoId)
        .order("data_despesa");
      if (error) throw error;
      return data as ViagemDespesa[];
    },
    enabled: !!solicitacaoId,
  });
}

/** Lançar despesa — retorna o registro criado para permitir upload de comprovante */
export function useLancarDespesa() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (input: LancarDespesaInput) => {
      const { data, error } = await (supabase as any)
        .from("viagem_despesas")
        .insert({ ...input, lancado_por: user!.id })
        .select()
        .single();
      if (error) throw error;
      return data as ViagemDespesa;
    },
    onSuccess: (_, { solicitacao_id }) => {
      queryClient.invalidateQueries({ queryKey: ["viagem-despesas", solicitacao_id] });
      toast.success("Despesa lançada!");
    },
    onError: (e: any) => toast.error(e.message || "Erro ao lançar despesa"),
  });
}

/** Remover despesa */
export function useDeleteDespesa() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, solicitacaoId }: { id: string; solicitacaoId: string }) => {
      const { error } = await (supabase as any)
        .from("viagem_despesas")
        .delete()
        .eq("id", id);
      if (error) throw error;
      return solicitacaoId;
    },
    onSuccess: (solicitacaoId) => {
      queryClient.invalidateQueries({ queryKey: ["viagem-despesas", solicitacaoId] });
      toast.success("Despesa removida.");
    },
    onError: (e: any) => toast.error(e.message || "Erro ao remover despesa"),
  });
}

// ─── Hooks — Prestação de Contas ────────────────────────────────────────────

/** Busca ou cria automaticamente a PC de uma viagem */
export function usePrestacaoContas(solicitacaoId: string | null) {
  return useQuery({
    queryKey: ["viagem-pc", solicitacaoId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("viagem_prestacao_contas")
        .select("*")
        .eq("solicitacao_id", solicitacaoId)
        .maybeSingle();
      if (error) throw error;
      return data as ViagemPC | null;
    },
    enabled: !!solicitacaoId,
  });
}

/** Cria registro de prestação de contas */
export function useCreatePC() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ solicitacaoId, adiantamento }: { solicitacaoId: string; adiantamento: number }) => {
      const { data, error } = await (supabase as any)
        .from("viagem_prestacao_contas")
        .insert({ solicitacao_id: solicitacaoId, adiantamento_recebido: adiantamento, status: "aberta" })
        .select()
        .single();
      if (error) throw error;
      return data as ViagemPC;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["viagem-pc", data.solicitacao_id] });
    },
    onError: (e: any) => toast.error(e.message || "Erro ao criar prestação de contas"),
  });
}

/** Envia PC para aprovação */
export function useSubmitPC() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ pcId, totalDespesas }: { pcId: string; totalDespesas: number }) => {
      const { error } = await (supabase as any)
        .from("viagem_prestacao_contas")
        .update({ status: "enviada", submetido_em: new Date().toISOString(), total_despesas: totalDespesas })
        .eq("id", pcId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["viagem-pc"] });
      toast.success("Prestação de contas enviada para aprovação!");
    },
    onError: (e: any) => toast.error(e.message || "Erro ao enviar PC"),
  });
}

/** Aprovar PC */
export function useAprovarPC() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (pcId: string) => {
      const { error } = await (supabase as any)
        .from("viagem_prestacao_contas")
        .update({ status: "aprovada", aprovado_por: user!.id, aprovado_em: new Date().toISOString() })
        .eq("id", pcId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["viagem-pc"] });
      toast.success("Prestação de contas aprovada!");
    },
    onError: (e: any) => toast.error(e.message || "Erro ao aprovar PC"),
  });
}

/** Reprovar PC com motivo */
export function useReprovarPC() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({
      pcId,
      categoria,
      detalhe,
    }: {
      pcId: string;
      categoria: string;
      detalhe: string;
    }) => {
      const { error } = await (supabase as any)
        .from("viagem_prestacao_contas")
        .update({
          status: "reprovada",
          motivo_reprova_categoria: categoria,
          motivo_reprova_detalhe: detalhe,
          reprovado_por: user!.id,
          reprovado_em: new Date().toISOString(),
        })
        .eq("id", pcId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["viagem-pc"] });
      toast.success("Prestação de contas reprovada. O colaborador será notificado.");
    },
    onError: (e: any) => toast.error(e.message || "Erro ao reprovar PC"),
  });
}

/** Reabrir PC reprovada para correção */
export function useReopenPC() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (pcId: string) => {
      const { error } = await (supabase as any)
        .from("viagem_prestacao_contas")
        .update({
          status: "aberta",
          motivo_reprova_categoria: null,
          motivo_reprova_detalhe: null,
          reprovado_por: null,
          reprovado_em: null,
        })
        .eq("id", pcId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["viagem-pc"] });
      toast.success("Prestação de contas reaberta para correção.");
    },
    onError: (e: any) => toast.error(e.message || "Erro ao reabrir PC"),
  });
}

// ─── Label helpers ─────────────────────────────────────────────────────────

export const STATUS_LABEL: Record<ViagemStatus, string> = {
  rascunho:             "Rascunho",
  pendente_gestor:      "Ag. Gestor",
  pendente_financeiro:  "Ag. Financeiro",
  pendente_ceo:         "Ag. CEO",
  aprovado:             "Aprovado",
  reprovado:            "Reprovado",
  em_andamento:         "Em Andamento",
  concluido:            "Concluído",
  cancelado:            "Cancelado",
};

export const STATUS_COLOR: Record<ViagemStatus, string> = {
  rascunho:             "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
  pendente_gestor:      "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  pendente_financeiro:  "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
  pendente_ceo:         "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
  aprovado:             "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  reprovado:            "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  em_andamento:         "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  concluido:            "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300",
  cancelado:            "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-400",
};

export const PC_STATUS_LABEL: Record<PCStatus, string> = {
  aberta:   "Em Preenchimento",
  enviada:  "Aguardando Aprovação",
  aprovada: "Aprovada",
  reprovada:"Reprovada",
  encerrada:"Encerrada",
};

export const PC_STATUS_COLOR: Record<PCStatus, string> = {
  aberta:   "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  enviada:  "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  aprovada: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  reprovada:"bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  encerrada:"bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-400",
};

export const MOTIVO_REPROVA_OPTIONS = [
  { value: "falta_comprovante",       label: "Falta de comprovante" },
  { value: "valor_acima_limite",      label: "Valor acima do limite da política" },
  { value: "categoria_incorreta",     label: "Categoria incorreta" },
  { value: "despesa_nao_autorizada",  label: "Despesa não autorizada" },
  { value: "descricao_insuficiente",  label: "Descrição insuficiente" },
  { value: "outros",                  label: "Outros" },
];

export const POLITICA_TIPS: Partial<Record<DespesaCategoria, string>> = {
  hospedagem:               "Limite: R$ 200/noite. Acima disso requer aprovação adicional.",
  alimentacao:              "Limite: R$ 100/dia para refeições pessoais.",
  representacao:            "Requer identificação do cliente/parceiro. Limite: R$ 500 por evento.",
  alimentacao_representacao:"Limite: R$ 150/dia. Obrigatório informar o cliente ou parceiro.",
  combustivel:              "Somente abastecimentos com nota fiscal. Limite: R$ 500 por viagem.",
  passagem:                 "Escolha sempre a opção mais econômica. Compra em cima da hora requer justificativa.",
};

export const TRANSPORTE_LABEL: Record<MeioTransporte, string> = {
  aviao:        "Avião",
  onibus:       "Ônibus",
  carro_proprio:"Carro Próprio",
  carro_empresa:"Carro da Empresa",
  outro:        "Outro",
};

export const CATEGORIA_LABEL: Record<DespesaCategoria, string> = {
  passagem:               "Passagem",
  hospedagem:             "Hospedagem",
  alimentacao:            "Alimentação",
  transporte_local:       "Transporte Local",
  combustivel:            "Combustível",
  pedagio:                "Pedágio",
  estacionamento:         "Estacionamento",
  representacao:          "Representação",
  material:               "Material",
  comunicacao:            "Comunicação",
  outros:                 "Outros",
  alimentacao_representacao: "Alim. Representação",
};

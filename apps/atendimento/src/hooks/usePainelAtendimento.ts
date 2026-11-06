import { useInfiniteQuery, useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// ─────────────────────────────────────────────────────────────────────────────
// Painel do atendimento — a tela do GESTOR (06/11/2026).
//
// ⚠️ A tela NÃO calcula métrica nenhuma: tudo vem agregado do banco
// (`carbo_atendimento_painel`, migração 20261148). O número é o que o gestor
// cobra de alguém, e duas definições de "respondida" (banco e navegador) dariam
// dois números para a mesma cobrança. A tela só divide (taxa = respondidas ÷
// pedem) e formata.
//
// ⚠️ Sem a função no banco (front no ar antes do SQL) a consulta falha com
// PGRST202/42883 e a tela DIZ isso — nunca vira "tudo zerado", que se leria
// como "ninguém escreveu".
// ─────────────────────────────────────────────────────────────────────────────

export type Desfecho = "respondida" | "fechada_sem_resposta" | "perdida" | "aguardando";
export type Tema = "reclamacao" | "pagamento" | "produto" | "confianca" | "entrega" | "uso" | "onde_comprar" | "outros";

export interface PainelKpis {
  pedem: number;
  /** Base da TAXA DE RESPOSTA: as que pedem menos as que ainda esperam (não se decidiram). */
  pedem_encerradas: number;
  /** Base do SLA: encerradas + as que ainda esperam e JÁ passaram da meta. */
  sla_base: number;
  nao_pedem?: number;
  respondidas: number;
  fechadas_sem_resposta: number;
  perdidas: number;
  aguardando: number;
  com_risco: number;
  clientes: number;
  /** Respondidas dentro da meta de 1ª resposta (minutos de horário de atendimento). */
  dentro_meta: number;
  /** TMR: tempo de resposta de TODA rodada que pede (minutos corridos). */
  tmr_mediana: number | null; tmr_p90: number | null; tmr_media: number | null;
  tmr_util_mediana: number | null; tmr_util_p90: number | null;
  /** TMPR: só a 1ª rodada de cada atendimento (minutos corridos e úteis). */
  tmpr_mediana: number | null; tmpr_p90: number | null; tmpr_media: number | null;
  tmpr_util_mediana: number | null; tmpr_util_p90: number | null;
  /** Atendimentos (episódios: mensagens do par sem silêncio > 24 h). */
  atendimentos?: number;
  atendimentos_respondidos?: number;
  /** Resolvidos no 1º contato: 1 rodada, respondida, cliente não voltou em 7 dias. */
  fcr?: number;
  /** Base do FCR: atendimentos respondidos que já têm 7 dias (o de ontem não se julga ainda). */
  fcr_base?: number;
  /** TMA: 1ª mensagem do cliente → última resposta de gente (minutos corridos). */
  tma_mediana?: number | null; tma_p90?: number | null; tma_media?: number | null;
  msgs_por_atendimento?: number | null;
}

export interface PainelConfig {
  hora_inicio: string; hora_fim: string; dias: number[];
  meta_resposta_min: number; meta_sla_pct: number; meta_taxa_resposta_pct: number;
}

export interface PainelNumero { id: string; rotulo: string; funcao: string; cor: string | null; ativo: boolean; exibicao: string | null }

export interface PainelDia {
  dia: string; pedem: number; pedem_encerradas: number; sla_base: number; respondidas: number; perdidas: number; fechadas_sem_resposta: number;
  aguardando: number; dentro_meta: number; tmr_mediana: number | null; tmr_util_mediana: number | null;
  nao_pedem: number; mensagens: number;
}

export type FaixaChave = "ate_5" | "ate_15" | "ate_60" | "ate_4h" | "ate_24h" | "mais_24h" | Exclude<Desfecho, "respondida">;
export interface PainelFaixa { ordem: number; faixa: FaixaChave; n: number }

/** dow: 1 = segunda … 7 = domingo (ISO). hora: 0–23, Brasília. */
export interface PainelCelula {
  dow: number; hora: number; pedem: number; respondidas: number; sem_resposta: number;
  tmr_mediana: number | null; mensagens: number;
}

export interface PainelPorNumero {
  numero_id: string; rotulo: string | null; cor: string | null;
  pedem: number; pedem_encerradas: number; sla_base: number; respondidas: number; perdidas: number; fechadas_sem_resposta: number; aguardando: number;
  dentro_meta: number; tmr_mediana: number | null; tmr_util_mediana: number | null; ultima_resposta_em: string | null;
}

export interface PainelTema { tema: Tema; pedem: number; pedem_encerradas: number; respondidas: number; sem_resposta: number; tmr_mediana: number | null }
export interface PainelEtiqueta { nome: string; cor: string; n: number }

export interface PainelAtendente {
  /** uuid do perfil, ou "nome:<nome>" para mensagem antiga sem id. É o `p_pessoa` do detalhe. */
  chave: string;
  nome: string | null;
  respondidas: number;
  primeiras: number;
  tmr_mediana: number | null; tmr_p90: number | null; tmr_util_mediana: number | null;
  dentro_meta: number;
  mensagens: number; falharam: number; conversas: number; dias_ativos: number;
  resolvidas: number; reabertas: number; resolvidas_maduras: number; reabertas_maduras: number;
  fechadas_sem_resposta: number; notas: number;
  em_atendimento_agora: number;
  ultima_resposta_em: string | null;
  primeira_hora: string | null; ultima_hora: string | null;
}

export interface PainelAtendenteDia { chave: string; dia: string; mensagens: number; conversas: number }

export interface PainelAgora {
  esperando: number; janela_ate_2h: number; janela_ate_6h: number; com_risco: number;
  mais_antiga_min: number | null; perdidas_7d: number; aguardando_cliente: number; em_atendimento: number;
}

export interface PainelFila {
  numero_id: string; wa_id: string; nome: string | null;
  desde: string; ultima_em: string; espera_min: number; janela_ate: string;
  texto: string; tipo: string | null; n_msgs: number; tema: Tema; risco: boolean;
  status: string | null; responsavel_nome: string | null;
}

export interface PainelPerdida {
  numero_id: string; wa_id: string; nome: string | null; desde: string; ultima_em: string;
  texto: string; tipo: string | null; tema: Tema; risco: boolean; n_msgs: number;
}

export interface PainelFechada {
  numero_id: string; wa_id: string; nome: string | null; desde: string; texto: string; tipo: string | null;
  tema: Tema; risco: boolean; fechada_em: string; como: "resolvido" | "aguardando"; por: string | null; por_nome: string | null;
}

export interface PainelAtendimento {
  gerado_em: string;
  periodo: { de: string; ate: string; ant_de: string; ant_ate: string; dias: number };
  config: PainelConfig;
  numeros: PainelNumero[];
  kpis: { atual?: PainelKpis; anterior?: PainelKpis };
  /** Reabertura: use `reabertas_maduras ÷ resolvidas_maduras` (resolvidas há 7+ dias); as recentes ainda podem reabrir. */
  atividade: { mensagens: number; falharam: number; atendentes_ativos: number; resolvidas: number; reabertas: number;
               resolvidas_maduras: number; reabertas_maduras: number };
  diario: PainelDia[];
  /** Faixas pelo tempo em horário de atendimento. */
  faixas: PainelFaixa[];
  /** As mesmas faixas em tempo corrido. */
  faixas_corrido: PainelFaixa[];
  heatmap: PainelCelula[];
  por_numero: PainelPorNumero[];
  temas: PainelTema[];
  etiquetas: PainelEtiqueta[];
  atendentes: PainelAtendente[];
  atendentes_diario: PainelAtendenteDia[];
  agora: PainelAgora;
  fila: PainelFila[];
  perdidas_recentes: PainelPerdida[];
  fechadas_sem_resposta: PainelFechada[];
  /** Desde quando há histórico de quem marcou resolvido (antes disso, só o retrato). */
  historico_desde: string | null;
}

export interface DetalhePessoa {
  respondidas: Array<{
    numero_id: string; wa_id: string; nome: string | null; desde: string; respondido_em: string;
    min_resp: number; min_util: number; dentro_meta: boolean; n_humanos: number; texto: string; tema: Tema; risco: boolean;
  }>;
  fechadas_sem_resposta: Array<{
    numero_id: string; wa_id: string; nome: string | null; desde: string; fechada_em: string;
    como: "resolvido" | "aguardando"; texto: string; tema: Tema; risco: boolean;
  }>;
  reabertas: Array<{ numero_id: string; wa_id: string; nome: string | null; resolvida_em: string; voltou_em: string; texto: string | null }>;
  por_hora: Array<{ hora: number; mensagens: number }>;
}

/** O erro do banco, dito do jeito que a tela precisa (sem função ≠ sem permissão ≠ outro). */
export function lerErroDoPainel(e: unknown): { tipo: "sem_funcao" | "sem_permissao" | "outro"; mensagem: string } {
  const err = e as { code?: string; message?: string } | null;
  const code = err?.code ?? "";
  const msg = err?.message ?? String(e ?? "");
  if (code === "PGRST202" || code === "42883" || /could not find the function/i.test(msg)) {
    return { tipo: "sem_funcao", mensagem: msg };
  }
  if (code === "42501" || /somente gestores/i.test(msg)) return { tipo: "sem_permissao", mensagem: msg };
  return { tipo: "outro", mensagem: msg };
}

/** O endereço da conversa na tela de Conversas (o número primeiro: `?de=` é o wa_id DENTRO de uma caixa). */
export function linkDaConversa(numeroId: string, waId: string): string {
  const p = new URLSearchParams({ numero: numeroId, de: waId });
  return `/conversas?${p.toString()}`;
}

const db = supabase as unknown as { rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }> };

export function usePainelAtendimento(de: string, ate: string, numero: string | null, ativo = true) {
  return useQuery({
    queryKey: ["painel-atendimento", de, ate, numero],
    enabled: ativo && !!de && !!ate,
    // A fila é o trabalho de AGORA: relê de minuto em minuto enquanto a aba
    // está aberta (é uma consulta agregada, barata — e uma por gestor, não por time).
    refetchInterval: 60_000,
    staleTime: 30_000,
    retry: (n, e) => lerErroDoPainel(e).tipo === "outro" && n < 2,
    queryFn: async (): Promise<PainelAtendimento> => {
      const { data, error } = await db.rpc("carbo_atendimento_painel", { p_de: de, p_ate: ate, p_numero: numero });
      if (error) throw error;
      return data as PainelAtendimento;
    },
  });
}

export function useDetalhePessoa(de: string, ate: string, pessoa: string | null, numero: string | null) {
  return useQuery({
    queryKey: ["painel-atendimento-pessoa", de, ate, pessoa, numero],
    enabled: !!pessoa && !!de && !!ate,
    staleTime: 30_000,
    queryFn: async (): Promise<DetalhePessoa> => {
      const { data, error } = await db.rpc("carbo_atendimento_pessoa", {
        p_de: de, p_ate: ate, p_pessoa: pessoa, p_numero: numero,
      });
      if (error) throw error;
      return data as DetalhePessoa;
    },
  });
}

export function useSalvarConfigAtendimento() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (c: PainelConfig) => {
      const { error } = await db.rpc("carbo_atendimento_config_definir", {
        p_hora_inicio: c.hora_inicio, p_hora_fim: c.hora_fim, p_dias: c.dias,
        p_meta_resposta_min: c.meta_resposta_min, p_meta_sla_pct: c.meta_sla_pct,
        p_meta_taxa_resposta_pct: c.meta_taxa_resposta_pct,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["painel-atendimento"] }),
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Aba ASSUNTOS (migração 20261149): o que os clientes falam, medido.
// ⚠️ A classificação é do BANCO (`carbo_wa_assuntos`, cadastro): a tela não
// decide assunto nenhum — só desenha o que veio agregado.
// ─────────────────────────────────────────────────────────────────────────────

export interface AssuntoGrupo {
  codigo: string; rotulo: string; ordem: number; cor: string;
  clientes: number; mensagens: number; clientes_ant: number;
}

export interface AssuntoLinha {
  codigo: string; grupo: string; rotulo: string; ordem: number;
  /** Sozinho, o assunto pede resposta? ("Chegou tudo certo" não pede.) */
  pede: boolean;
  automatico: boolean;
  clientes: number; mensagens: number; clientes_ant: number; mensagens_ant: number;
  /** Clientes cuja ÚLTIMA mensagem do assunto ninguém da equipe respondeu. */
  sem_resposta: number;
  respondidos: number;
  com_risco: number;
  resposta_mediana_min: number | null;
}

export interface AssuntoDestaque {
  numero_id: string; wa_id: string; nome: string | null; ocorrido_em: string;
  texto: string; assuntos: string[]; respondido?: boolean;
}

export interface PainelAssuntos {
  gerado_em: string;
  periodo: { de: string; ate: string; ant_de: string; ant_ate: string; dias: number };
  balde: "dia" | "semana";
  baldes: string[];
  versao: number;
  grupos: AssuntoGrupo[];
  assuntos: AssuntoLinha[];
  serie: { balde: string; codigo: string; clientes: number }[];
  serie_grupo?: { balde: string; grupo: string; clientes: number }[];
  por_numero: { numero_id: string; grupo: string; clientes: number }[];
  totais: {
    mensagens: number; mensagens_ant: number; clientes: number; clientes_ant: number;
    automaticas: number; sem_assunto: number; com_risco: number; pedem: number;
  };
  elogios: AssuntoDestaque[];
  riscos: AssuntoDestaque[];
}

export interface ClienteDoAssunto {
  numero_id: string; wa_id: string; nome: string | null;
  primeira_em: string; ultima_em: string; n: number; risco: boolean;
  mensagens: { em: string; tipo: string; texto: string; assuntos: string[] }[];
  respondido_depois: boolean;
}

export function useAssuntosAtendimento(de: string, ate: string, numero: string | null, ativo = true) {
  return useQuery({
    queryKey: ["painel-atendimento-assuntos", de, ate, numero],
    enabled: ativo && !!de && !!ate,
    // Assunto muda devagar: 5 min basta (e a classificação nova entra de hora em hora).
    refetchInterval: 5 * 60_000,
    staleTime: 60_000,
    retry: (n, e) => lerErroDoPainel(e).tipo === "outro" && n < 2,
    queryFn: async (): Promise<PainelAssuntos> => {
      const { data, error } = await db.rpc("carbo_atendimento_assuntos", { p_de: de, p_ate: ate, p_numero: numero });
      if (error) throw error;
      return data as PainelAssuntos;
    },
  });
}

const POR_PAGINA = 30;

/** Quem falou de um assunto. `filtro` = código | "_nenhum" | "grupo:<código>" | "risco". Paginado. */
export function useClientesDoAssunto(de: string, ate: string, filtro: string | null, numero: string | null) {
  return useInfiniteQuery({
    queryKey: ["painel-atendimento-assunto-clientes", de, ate, filtro, numero],
    enabled: !!filtro && !!de && !!ate,
    staleTime: 60_000,
    initialPageParam: 0,
    queryFn: async ({ pageParam }): Promise<{ total: number; itens: ClienteDoAssunto[] }> => {
      const { data, error } = await db.rpc("carbo_atendimento_assunto_clientes", {
        p_de: de, p_ate: ate, p_filtro: filtro, p_numero: numero, p_limite: POR_PAGINA, p_offset: pageParam,
      });
      if (error) throw error;
      return data as { total: number; itens: ClienteDoAssunto[] };
    },
    getNextPageParam: (ultima, todas) => {
      const lidos = todas.reduce((s, p) => s + p.itens.length, 0);
      return lidos < ultima.total && ultima.itens.length > 0 ? lidos : undefined;
    },
  });
}

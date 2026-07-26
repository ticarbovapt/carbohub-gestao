export type FunnelType = "f1" | "f2" | "f3" | "f4" | "f5" | "f6" | "f7" | "f8" | "f9" | "f10" | "f11" | "f12" | "f13";

export type LeadStage =
  | "a_contatar" | "tentativa_1" | "tentativa_2"
  | "em_negociacao" | "convertido" | "sem_interesse" | "reagendar"
  | "qualificado" | "apresentacao" | "proposta" | "contrato" | "parceiro" | "descartado"
  | "diagnostico" | "poc" | "proposta_tecnica" | "fechamento"
  | "contatado" | "visita_agendada" | "pedido_inicial";

export type Temperature = "frio" | "morno" | "quente";
export type Segment = "A" | "B" | "C" | "D";

export interface CRMLead {
  id: string;
  funnel_type: FunnelType;
  stage: string;
  contact_name: string | null;
  contact_phone: string | null;
  contact_whatsapp: string | null;
  contact_email: string | null;
  contact_cpf: string | null;
  source: string | null;
  cnpj: string | null;
  legal_name: string | null;
  trade_name: string | null;
  ramo: string | null;
  city: string | null;
  state: string | null;
  segment: Segment | null;
  credit_amount: number;
  estimated_revenue: number;
  temperature: Temperature;
  wave: string | null;
  score: number | null;
  fleet_size: number | null;
  probability: number;
  next_steps: string | null;
  assigned_to: string | null;
  assigned_team: string | null;
  territory: string | null;
  lost_reason: string | null;
  won_at: string | null;
  lost_at: string | null;
  last_contact_at: string | null;
  next_follow_up_at: string | null;
  contact_attempts: number;
  notes: string | null;
  // Qualificação — os quatro campos que definem se o lead vale o tempo do
  // closer. Antes viviam soltos em `notes`, e o handoff entregava um parágrafo
  // de texto corrido: o closer tinha que ligar de novo para perguntar o que o
  // SDR já havia perguntado. São colunas, e não custom_fields, porque viram
  // relatório ("quantos SQL sem decisor identificado?") e porque a duplicação
  // da fase 7 precisa copiar campo a campo.
  qual_volume: string | null;
  qual_dor: string | null;
  qual_decisor: string | null;
  qual_prazo: string | null;
  // Vínculo do repasse Outbound → Inbound. Relatório de receita filtra por
  // `origin_lead_id is null` para não contar o mesmo negócio duas vezes.
  origin_lead_id: string | null;
  origin_funnel_type: string | null;
  assigned_to_nome?: string | null;
  tags: string[];
  custom_fields: Record<string, unknown>;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface StageConfig {
  id: string;
  label: string;
  icon: string;
  color: string;
}

export interface FunnelConfig {
  id: FunnelType;
  name: string;
  shortName: string;
  description: string;
  icon: string;
  color: string;
  cycleLabel: string;
  stages: StageConfig[];
}

const STAGES_COMMERCIAL: StageConfig[] = [
  { id: "a_contatar",   label: "A Contatar",    icon: "📋", color: "#94A3B8" },
  { id: "tentativa_1",  label: "Tentativa 1",   icon: "📞", color: "#F59E0B" },
  { id: "tentativa_2",  label: "Tentativa 2",   icon: "📞", color: "#F97316" },
  { id: "em_negociacao",label: "Em Negociação", icon: "🤝", color: "#3B82F6" },
  { id: "convertido",   label: "Convertido",    icon: "✅", color: "#22C55E" },
  { id: "sem_interesse",label: "Sem Interesse", icon: "❌", color: "#EF4444" },
  { id: "reagendar",    label: "Reagendar",     icon: "🔄", color: "#8B5CF6" },
];

const STAGES_LICENSEE: StageConfig[] = [
  { id: "a_contatar",   label: "Novo",         icon: "🔵", color: "#94A3B8" },
  { id: "contatado",    label: "Contatado",    icon: "📞", color: "#F59E0B" },
  { id: "qualificado",  label: "Qualificado",  icon: "🟢", color: "#22C55E" },
  { id: "apresentacao", label: "Apresentação", icon: "📊", color: "#3B82F6" },
  { id: "proposta",     label: "Proposta",     icon: "📄", color: "#8B5CF6" },
  { id: "contrato",     label: "Contrato",     icon: "📝", color: "#06B6D4" },
  { id: "parceiro",     label: "Parceiro",     icon: "🤝", color: "#22C55E" },
  { id: "descartado",   label: "Descartado",   icon: "❌", color: "#EF4444" },
];

const STAGES_ENTERPRISE: StageConfig[] = [
  { id: "a_contatar",     label: "Identificado", icon: "🔍", color: "#94A3B8" },
  { id: "diagnostico",    label: "Diagnóstico",  icon: "🔬", color: "#F59E0B" },
  { id: "poc",            label: "POC",          icon: "🧪", color: "#3B82F6" },
  { id: "proposta_tecnica",label: "Proposta",    icon: "📄", color: "#8B5CF6" },
  { id: "em_negociacao",  label: "Negociação",   icon: "🤝", color: "#06B6D4" },
  { id: "fechamento",     label: "Fechamento",   icon: "✅", color: "#22C55E" },
  { id: "sem_interesse",  label: "Perdido",      icon: "❌", color: "#EF4444" },
];

const STAGES_PDV: StageConfig[] = [
  { id: "a_contatar",    label: "A Contatar",      icon: "📋", color: "#94A3B8" },
  { id: "tentativa_1",   label: "Tentativa 1",     icon: "📞", color: "#F59E0B" },
  { id: "tentativa_2",   label: "Tentativa 2",     icon: "📞", color: "#F97316" },
  { id: "visita_agendada",label: "Visita Agendada",icon: "📍", color: "#3B82F6" },
  { id: "em_negociacao", label: "Negociação",      icon: "🤝", color: "#8B5CF6" },
  { id: "pedido_inicial",label: "Pedido Inicial",  icon: "📦", color: "#06B6D4" },
  { id: "convertido",    label: "PDV Ativo",       icon: "✅", color: "#22C55E" },
  { id: "sem_interesse", label: "Sem Interesse",   icon: "❌", color: "#EF4444" },
];

// ─────────────────────────────────────────────────────────────────────────────
// COMERCIAL EXPANSÃO (f13) — pipeline única que absorve Vendas, Licenciados,
// Frotistas, PDVs, Motores, Estoque Comb. e Subdistribuidor. O que o lead É
// virou SEGMENTO (etiqueta no card), não pipeline separada.
//
// Os ids abaixo foram escolhidos de propósito entre os mais usados nas 9
// pipelines de origem: quanto mais id repetido, menos linha precisa de UPDATE
// de etapa na virada (a_contatar já é a 1ª etapa de 8 delas).
// ─────────────────────────────────────────────────────────────────────────────
const STAGES_EXPANSAO: StageConfig[] = [
  { id: "a_contatar",     label: "A Contatar",           icon: "📋", color: "#94A3B8" },
  { id: "contato",        label: "Em Contato",           icon: "📞", color: "#F59E0B" },
  { id: "qualificado",    label: "Qualificado",          icon: "🎯", color: "#3B82F6" },
  { id: "visita_agendada",label: "Reunião / Visita",     icon: "📍", color: "#8B5CF6" },
  { id: "em_negociacao",  label: "Proposta / Negociação",icon: "🤝", color: "#06B6D4" },
  { id: "convertido",     label: "Ganho",                icon: "✅", color: "#22C55E" },
  { id: "sem_interesse",  label: "Perdido",              icon: "❌", color: "#EF4444" },
];

// Jornada do cliente — pipeline ÚNICA ativa de Vendas (vendedores começam por aqui).
const STAGES_VENDAS: StageConfig[] = [
  { id: "novo",        label: "Novo Lead",        icon: "🆕", color: "#94A3B8" },
  { id: "contato",     label: "Contato Feito",    icon: "📞", color: "#F59E0B" },
  { id: "qualificado", label: "Qualificado",      icon: "🎯", color: "#3B82F6" },
  { id: "proposta",    label: "Proposta Enviada", icon: "📄", color: "#8B5CF6" },
  { id: "negociacao",  label: "Negociação",       icon: "🤝", color: "#06B6D4" },
  { id: "ganho",       label: "Ganho",            icon: "✅", color: "#22C55E" },
  { id: "perdido",     label: "Perdido",          icon: "❌", color: "#EF4444" },
];

// Follow up — reativação da base de clientes que JÁ compraram (recompra).
const STAGES_FOLLOWUP: StageConfig[] = [
  { id: "a_reativar",   label: "A Reativar",     icon: "🔁", color: "#94A3B8" },
  { id: "contato",      label: "Contato Feito",  icon: "📞", color: "#F59E0B" },
  { id: "reengajado",   label: "Reengajado",     icon: "🔥", color: "#3B82F6" },
  { id: "oferta",       label: "Oferta Enviada", icon: "🎁", color: "#8B5CF6" },
  { id: "negociacao",   label: "Negociação",     icon: "🤝", color: "#06B6D4" },
  { id: "recomprou",    label: "Recomprou",      icon: "✅", color: "#22C55E" },
  { id: "sem_interesse",label: "Sem Interesse",  icon: "❌", color: "#EF4444" },
];

// Inbound — closers fechando leads de anúncio ou já qualificados pelo Outbound.
const STAGES_INBOUND: StageConfig[] = [
  { id: "novo",        label: "Lead Recebido",    icon: "📥", color: "#94A3B8" },
  { id: "contato",     label: "Contato Feito",    icon: "📞", color: "#F59E0B" },
  { id: "qualificado", label: "Qualificado",      icon: "🎯", color: "#3B82F6" },
  // ORÇAMENTO separado de PROPOSTA responde metade da dor de "por que parou?"
  // sem campo novo nenhum: card parado em Orçamento = o closer não montou o
  // preço. Card parado em Proposta = o cliente não respondeu. Culpados
  // diferentes, colunas diferentes.
  { id: "orcamento",   label: "Orçamento",        icon: "🧮", color: "#0EA5E9" },
  { id: "proposta",    label: "Proposta Enviada", icon: "📄", color: "#8B5CF6" },
  { id: "negociacao",  label: "Negociação",       icon: "🤝", color: "#06B6D4" },
  // FORMALIZAÇÃO extraído de NEGOCIAÇÃO: "estamos negociando" e "já fechamos,
  // falta papel" têm probabilidade, ação e previsão de receita completamente
  // diferentes. Enquanto moravam juntos, o forecast era ficção.
  //
  // ⚠️ NÃO usar o id `fechamento` para esta coluna: ele está em WON_STAGES e
  // carimba won_at — um card aqui contaria como venda antes de haver pedido.
  { id: "formalizacao",label: "Formalização",     icon: "📝", color: "#14B8A6" },
  { id: "ganho",       label: "Ganho",            icon: "✅", color: "#22C55E" },
  { id: "perdido",     label: "Perdido",          icon: "❌", color: "#EF4444" },
];

// Outbound — SDR fazendo prospecção ativa (Google/Instagram/LinkedIn) e passando
// os qualificados para o Closer (Inbound).
const STAGES_OUTBOUND: StageConfig[] = [
  { id: "prospeccao",  label: "Prospecção",        icon: "🔎", color: "#94A3B8" },
  { id: "cadencia",    label: "Cadência",          icon: "📨", color: "#F59E0B" },
  { id: "conectado",   label: "Conectado",         icon: "📞", color: "#F97316" },
  { id: "qualificado", label: "Qualificado (SQL)", icon: "🎯", color: "#3B82F6" },
  { id: "reuniao",     label: "Reunião Agendada",  icon: "📅", color: "#8B5CF6" },
  // Nutrição É coluna (e não flag) porque muda a FILA DE TRABALHO: o lead sai
  // da rotina diária do SDR e volta numa data. Um "aguardando" que não muda a
  // fila seria flag — ver waiting_on, na fase 9.
  { id: "nutricao",    label: "Nutrição",          icon: "🌱", color: "#14B8A6" },
  { id: "repassado",   label: "Passado ao Closer", icon: "➡️", color: "#22C55E" },
  { id: "descartado",  label: "Descartado",        icon: "❌", color: "#EF4444" },
];

export const FUNNEL_CONFIG: Record<FunnelType, FunnelConfig> = {
  f1: { id: "f1", name: "Vendas",                          shortName: "Vendas",        description: "Jornada do cliente",        icon: "💼", color: "#3BC770", cycleLabel: "1-30 dias",  stages: STAGES_VENDAS },
  f2: { id: "f2", name: "Licenciados CarboVapt",            shortName: "Licenciados",   description: "Licenciamento",             icon: "🏢", color: "#8B5CF6", cycleLabel: "15-60 dias", stages: STAGES_LICENSEE  },
  f3: { id: "f3", name: "Frotistas Diretos",                shortName: "Frotistas",     description: "Clientes com frota",        icon: "🚛", color: "#F59E0B", cycleLabel: "7-30 dias",  stages: STAGES_COMMERCIAL },
  f4: { id: "f4", name: "PDVs CarboZé",                     shortName: "PDVs CarboZé",  description: "Revendas e postos",         icon: "🏪", color: "#3B82F6", cycleLabel: "7-21 dias",  stages: STAGES_PDV       },
  f5: { id: "f5", name: "PDVs CarboPRO",                    shortName: "PDVs CarboPRO", description: "PDVs premium",              icon: "⭐", color: "#06B6D4", cycleLabel: "14-30 dias", stages: STAGES_PDV       },
  f6: { id: "f6", name: "Frotistas via Licenciado",         shortName: "Frotistas Lic.",description: "Frotistas de licenciados",  icon: "🔗", color: "#F97316", cycleLabel: "15-45 dias", stages: STAGES_COMMERCIAL },
  f7: { id: "f7", name: "Empresas com Motores",             shortName: "Motores",       description: "Geradores, compressores",   icon: "⚙️", color: "#EF4444", cycleLabel: "30-90 dias", stages: STAGES_ENTERPRISE },
  f8: { id: "f8", name: "Empresas c/ Estoque Combustível",  shortName: "Estoque Comb.", description: "Alto valor + recorrência",  icon: "⛽", color: "#10B981", cycleLabel: "30-90 dias", stages: STAGES_ENTERPRISE },
  f9: { id: "f9", name: "Subdistribuidores",                shortName: "Subdistribuidor", description: "Revenda em escala",       icon: "🏬", color: "#14B8A6", cycleLabel: "7-21 dias",  stages: STAGES_PDV       },
  f10:{ id: "f10", name: "Follow up",                        shortName: "Follow up",     description: "Recompra da base de clientes", icon: "🔁", color: "#EAB308", cycleLabel: "recorrente", stages: STAGES_FOLLOWUP },
  f11:{ id: "f11", name: "Inbound",                          shortName: "Inbound",       description: "Closers — anúncios e qualificados", icon: "🎯", color: "#3BC770", cycleLabel: "1-15 dias", stages: STAGES_INBOUND },
  f12:{ id: "f12", name: "Outbound",                         shortName: "Outbound",      description: "SDR — prospecção ativa",    icon: "🔎", color: "#6366F1", cycleLabel: "1-30 dias", stages: STAGES_OUTBOUND },
  f13:{ id: "f13", name: "Comercial Expansão",               shortName: "Comercial Expansão", description: "PDVs, frotistas, licenciados e contas com motores/estoque", icon: "🚀", color: "#3BC770", cycleLabel: "7-60 dias", stages: STAGES_EXPANSAO },
};

/**
 * Pipelines que aparecem na tela. As 9 antigas (f1..f9) viraram SEGMENTO dentro
 * da Comercial Expansão, mas continuam definidas em FUNNEL_CONFIG de propósito:
 * links antigos, o histórico da timeline e qualquer lead remanescente ainda
 * resolvem o nome/ícone. Apagá-las deixaria o detalhe do lead em tela branca.
 */
export const FUNIS_VISIVEIS: FunnelType[] = ["f13", "f12", "f11", "f10"];
export const funilVisivel = (id: FunnelType) => FUNIS_VISIVEIS.includes(id);

// ─────────────────────────────────────────────────────────────────────────────
// SEGMENTO — o que o lead É. Substitui as 9 pipelines que viraram uma só:
// o recorte continua existindo, mas como etiqueta filtrável no card.
// Ícones e cores vêm dos funis de origem, de propósito: a identidade visual de
// cada pipeline sobrevive à fusão, que é o que faz a mudança não parecer perda.
// ─────────────────────────────────────────────────────────────────────────────
export type LeadSegment =
  | "venda_direta" | "licenciado" | "frotista" | "pdv_carboze" | "pdv_carbopro"
  | "frotista_lic" | "motores" | "estoque_comb" | "subdistribuidor" | "a_definir";

export interface SegmentConfig { id: LeadSegment; label: string; shortName: string; icon: string; color: string }

export const SEGMENTS: SegmentConfig[] = [
  { id: "pdv_carboze",     label: "PDV CarboZé",             shortName: "PDV CarboZé",     icon: "🏪", color: "#3B82F6" },
  { id: "pdv_carbopro",    label: "PDV CarboPRO",            shortName: "PDV CarboPRO",    icon: "⭐", color: "#06B6D4" },
  { id: "frotista",        label: "Frotista Direto",         shortName: "Frotista",        icon: "🚛", color: "#F59E0B" },
  { id: "frotista_lic",    label: "Frotista via Licenciado", shortName: "Frotista Lic.",   icon: "🔗", color: "#F97316" },
  { id: "licenciado",      label: "Licenciado",              shortName: "Licenciado",      icon: "🏢", color: "#8B5CF6" },
  { id: "motores",         label: "Empresa c/ Motores",      shortName: "Motores",         icon: "⚙️", color: "#EF4444" },
  { id: "estoque_comb",    label: "Estoque de Combustível",  shortName: "Estoque Comb.",   icon: "⛽", color: "#10B981" },
  { id: "subdistribuidor", label: "Subdistribuidor",         shortName: "Subdistribuidor", icon: "🏬", color: "#14B8A6" },
  { id: "venda_direta",    label: "Venda Direta",            shortName: "Venda Direta",    icon: "💼", color: "#3BC770" },
  { id: "a_definir",       label: "A definir",               shortName: "A definir",       icon: "❓", color: "#94A3B8" },
];

export const segmentOf = (id: string | null | undefined): SegmentConfig | null =>
  id ? SEGMENTS.find((s) => s.id === id) ?? null : null;

// ─────────────────────────────────────────────────────────────────────────────
// Rótulos de TODA etapa que já existiu, inclusive as que saíram de cena.
// A timeline (crm_sales_lead_activities) guarda o id da etapa no momento do
// evento. Depois da consolidação, um registro antigo mostraria "visita_agendada
// → em_negociacao" cru. Reescrever o histórico seria falsificar auditoria — o
// certo é ter este dicionário e traduzir na leitura.
// ─────────────────────────────────────────────────────────────────────────────
export const LEGACY_STAGE_LABELS: Record<string, string> = {
  a_contatar: "A Contatar", novo: "Novo Lead", prospeccao: "Prospecção", a_reativar: "A Reativar",
  contato: "Contato Feito", contatado: "Contatado", conectado: "Conectado", cadencia: "Cadência",
  nutricao: "Nutrição", orcamento: "Orçamento", formalizacao: "Formalização",
  tentativa_1: "Tentativa 1", tentativa_2: "Tentativa 2", reagendar: "Reagendar",
  qualificado: "Qualificado", diagnostico: "Diagnóstico", poc: "POC",
  apresentacao: "Apresentação", visita_agendada: "Visita Agendada", reuniao: "Reunião Agendada",
  proposta: "Proposta Enviada", proposta_tecnica: "Proposta Técnica", oferta: "Oferta Enviada",
  negociacao: "Negociação", em_negociacao: "Em Negociação", contrato: "Contrato",
  pedido_inicial: "Pedido Inicial", reengajado: "Reengajado",
  convertido: "Convertido", parceiro: "Parceiro", fechamento: "Fechamento",
  ganho: "Ganho", recomprou: "Recomprou", repassado: "Passado ao Closer",
  perdido: "Perdido", descartado: "Descartado", sem_interesse: "Sem Interesse",
};

/** Rótulo de uma etapa: primeiro no funil atual, senão no dicionário legado. */
export const stageLabelAnywhere = (stageId: string | null | undefined, ft?: FunnelType): string => {
  if (!stageId) return "?";
  if (ft) {
    const found = getStagesForFunnel(ft).find((s) => s.id === stageId);
    if (found) return found.label;
  }
  return LEGACY_STAGE_LABELS[stageId] ?? stageId;
};

// ─────────────────────────────────────────────────────────────────────────────
// ETAPAS TERMINAIS — FONTE ÚNICA.
//
// Estas listas viviam DUPLICADAS em três lugares (useCRMLeads.GANHO,
// StageProgressBar.WIN_IDS e isTerminalStage), e as três discordavam entre si.
// Qualquer coluna nova exigia lembrar dos três. Agora só existe aqui.
//
// A distinção que importa: `repassado` É terminal (encerra o funil do SDR) mas
// NÃO é ganho — repassar ao closer não é vender. Enquanto ele esteve no balde
// de ganhos, o mesmo negócio somava receita duas vezes: uma no card do SDR e
// outra no card do closer.
// ─────────────────────────────────────────────────────────────────────────────

/** Ganho de verdade: o negócio virou receita. Carimba `won_at`. */
export const WON_STAGES = ["convertido", "parceiro", "fechamento", "ganho", "recomprou"] as const;

/** Perda ou descarte: o negócio morreu. Carimba `lost_at` e exige motivo. */
export const LOST_STAGES = ["sem_interesse", "descartado", "perdido"] as const;

/** Repasse do SDR ao closer. Terminal no funil de origem, sem receita nenhuma. */
export const HANDOFF_STAGES = ["repassado"] as const;

export const TERMINAL_STAGES: readonly string[] = [
  ...WON_STAGES, ...LOST_STAGES, ...HANDOFF_STAGES,
];

export const isWonStage     = (s: string | null | undefined) => !!s && (WON_STAGES as readonly string[]).includes(s);
export const isLostStage    = (s: string | null | undefined) => !!s && (LOST_STAGES as readonly string[]).includes(s);
export const isHandoffStage = (s: string | null | undefined) => !!s && (HANDOFF_STAGES as readonly string[]).includes(s);

// ─────────────────────────────────────────────────────────────────────────────
// MOTIVOS DE ENCERRAMENTO — separados por natureza do funil.
//
// A lista única anterior foi escrita para perda de NEGOCIAÇÃO (Preço,
// Concorrente, Já usa produto similar). O SDR descarta por outro motivo
// inteiramente: não é o perfil, não tem frota, não achei o decisor. Ele não
// tinha nenhuma opção verdadeira e caía em "Outro" — e aí o descarte, que é
// justamente a métrica que corrige a lista prospectada, não dizia nada.
// ─────────────────────────────────────────────────────────────────────────────

/** Perda depois de haver negociação — funil do closer. */
export const LOSS_REASONS = [
  "Preço", "Concorrente", "Timing / Momento inadequado", "Não atende telefone",
  "Sem interesse no produto", "Já usa produto similar", "Empresa fechou",
  "Mudou de região", "Outro",
] as const;

/** Descarte na prospecção — funil do SDR. */
export const DISCARD_REASONS = [
  "Fora do perfil (ICP)", "Não tem frota / volume", "Não achei o decisor",
  "Sem canal de contato válido", "Não respondeu à cadência",
  "Já é cliente da base", "É concorrente", "Empresa fechou / inativa",
  "Cadastro duplicado", "Outro",
] as const;

/**
 * Motivos válidos para o funil. O Outbound descarta; o resto perde.
 * Usar sempre isto — nunca `LOSS_REASONS` direto numa tela.
 */
export function getCloseReasons(funnelType: FunnelType): readonly string[] {
  return funnelType === "f12" ? DISCARD_REASONS : LOSS_REASONS;
}

// ─────────────────────────────────────────────────────────────────────────────
// ORIGEM — id em snake_case no banco, rótulo bonito só na tela.
//
// Antes eram TRÊS convenções gravando na mesma coluna ao mesmo tempo:
// `prospeccao_ativa` (default do banco), "Prospecção ativa" (o formulário) e
// "Meta Ads" (o webhook). Um `group by source` já devolvia categoria duplicada
// antes mesmo de existir integração de anúncio de verdade.
//
// Origem é MUTUAMENTE EXCLUSIVA — por isso coluna, e não `tags[]`, que viraria
// relatório impossível.
// ─────────────────────────────────────────────────────────────────────────────
export const SOURCES = [
  { id: "prospeccao_ativa", label: "Prospecção ativa" },
  { id: "indicacao",        label: "Indicação" },
  { id: "evento",           label: "Evento" },
  // Veio de importação da base comercial, não do formulário — descoberto ao
  // medir a coluna antes de normalizar (15 leads). Sem esta entrada eles
  // virariam "outro" e a origem de um lote inteiro se perderia de vista.
  { id: "followup_base",    label: "Follow up (base comercial)" },
  { id: "meta_ads",         label: "Meta Ads" },
  { id: "google_ads",       label: "Google Ads" },
  { id: "tiktok_ads",       label: "TikTok Ads" },
  { id: "ml_ads",           label: "Mercado Livre Ads" },
  { id: "shopee_ads",       label: "Shopee Ads" },
  { id: "linkedin_ads",     label: "LinkedIn Ads" },
  { id: "landing_page",     label: "Landing Page" },
  { id: "whatsapp",         label: "WhatsApp / Chatwoot" },
  { id: "formulario",       label: "Formulário CarboVapt" },
  { id: "google_merchant",  label: "Google Merchant" },
  { id: "organico",         label: "Orgânico" },
  { id: "bling",            label: "Bling" },
  { id: "outro",            label: "Outro" },
] as const;

/** Rótulo da origem. Valor desconhecido volta cru em vez de sumir da tela. */
export const sourceLabel = (id: string | null | undefined): string =>
  id ? (SOURCES.find((s) => s.id === id)?.label ?? id) : "—";

/** @deprecated Use SOURCES. Mantido só para não quebrar import antigo. */
export const SOURCE_OPTIONS = SOURCES.map((s) => s.label);

export function getStagesForFunnel(funnelType: FunnelType): StageConfig[] {
  return FUNNEL_CONFIG[funnelType]?.stages || STAGES_COMMERCIAL;
}

export function getNextStage(funnelType: FunnelType, currentStage: string): string | null {
  const stages = getStagesForFunnel(funnelType);
  const idx = stages.findIndex((s) => s.id === currentStage);
  if (idx === -1 || idx >= stages.length - 1) return null;
  const next = stages[idx + 1];
  if (isLostStage(next.id)) return null;
  return next.id;
}

export function isTerminalStage(stageId: string): boolean {
  return TERMINAL_STAGES.includes(stageId);
}

/** Estágio de "perda" do funil (varia por funil). Vendas usa 'perdido'. */
export function getLostStage(funnelType: FunnelType): string {
  const stages = getStagesForFunnel(funnelType);
  const found = stages.find((s) => isLostStage(s.id));
  return found?.id ?? "sem_interesse";
}

export function getDaysSinceUpdate(updatedAt: string): number {
  return Math.floor((Date.now() - new Date(updatedAt).getTime()) / (1000 * 60 * 60 * 24));
}

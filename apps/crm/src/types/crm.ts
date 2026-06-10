export type FunnelType = "f1" | "f2" | "f3" | "f4" | "f5" | "f6" | "f7" | "f8";

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

export const FUNNEL_CONFIG: Record<FunnelType, FunnelConfig> = {
  f1: { id: "f1", name: "B2C CarboZé / CarboPRO",          shortName: "B2C",           description: "Consumidor final",          icon: "🛒", color: "#3BC770", cycleLabel: "1-7 dias",   stages: STAGES_COMMERCIAL },
  f2: { id: "f2", name: "Licenciados CarboVapt",            shortName: "Licenciados",   description: "Licenciamento",             icon: "🏢", color: "#8B5CF6", cycleLabel: "15-60 dias", stages: STAGES_LICENSEE  },
  f3: { id: "f3", name: "Frotistas Diretos",                shortName: "Frotistas",     description: "Clientes com frota",        icon: "🚛", color: "#F59E0B", cycleLabel: "7-30 dias",  stages: STAGES_COMMERCIAL },
  f4: { id: "f4", name: "PDVs CarboZé",                     shortName: "PDVs CarboZé",  description: "Revendas e postos",         icon: "🏪", color: "#3B82F6", cycleLabel: "7-21 dias",  stages: STAGES_PDV       },
  f5: { id: "f5", name: "PDVs CarboPRO",                    shortName: "PDVs CarboPRO", description: "PDVs premium",              icon: "⭐", color: "#06B6D4", cycleLabel: "14-30 dias", stages: STAGES_PDV       },
  f6: { id: "f6", name: "Frotistas via Licenciado",         shortName: "Frotistas Lic.",description: "Frotistas de licenciados",  icon: "🔗", color: "#F97316", cycleLabel: "15-45 dias", stages: STAGES_COMMERCIAL },
  f7: { id: "f7", name: "Empresas com Motores",             shortName: "Motores",       description: "Geradores, compressores",   icon: "⚙️", color: "#EF4444", cycleLabel: "30-90 dias", stages: STAGES_ENTERPRISE },
  f8: { id: "f8", name: "Empresas c/ Estoque Combustível",  shortName: "Estoque Comb.", description: "Alto valor + recorrência",  icon: "⛽", color: "#10B981", cycleLabel: "30-90 dias", stages: STAGES_ENTERPRISE },
};

export const LOSS_REASONS = [
  "Preço", "Concorrente", "Timing / Momento inadequado", "Não atende telefone",
  "Sem interesse no produto", "Já usa produto similar", "Empresa fechou",
  "Mudou de região", "Outro",
] as const;

export const SOURCE_OPTIONS = [
  "Prospecção ativa", "Indicação", "Evento", "Meta Ads", "Google Ads",
  "TikTok Ads", "ML Ads", "Shopee Ads", "LinkedIn Ads", "Landing Page",
  "ChatWoot / WhatsApp", "Formulário CarboVapt", "Google Merchant", "Orgânico", "Bling", "Outro",
] as const;

export function getStagesForFunnel(funnelType: FunnelType): StageConfig[] {
  return FUNNEL_CONFIG[funnelType]?.stages || STAGES_COMMERCIAL;
}

export function getNextStage(funnelType: FunnelType, currentStage: string): string | null {
  const stages = getStagesForFunnel(funnelType);
  const idx = stages.findIndex((s) => s.id === currentStage);
  if (idx === -1 || idx >= stages.length - 1) return null;
  const next = stages[idx + 1];
  if (next.id === "sem_interesse" || next.id === "descartado") return null;
  return next.id;
}

export function isTerminalStage(stageId: string): boolean {
  return ["convertido", "sem_interesse", "parceiro", "descartado", "fechamento"].includes(stageId);
}

export function getDaysSinceUpdate(updatedAt: string): number {
  return Math.floor((Date.now() - new Date(updatedAt).getTime()) / (1000 * 60 * 60 * 24));
}

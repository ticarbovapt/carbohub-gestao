import type { BugStatus, BugPriority } from "@/hooks/useBugReports";

// ─────────────────────────────────────────────────────────────────────────────
// Fluxo de trabalho do TI. Os 4 status originais foram preservados e ganharam o
// significado da etapa, por isso nenhuma demanda existente precisou ser migrada.
// ─────────────────────────────────────────────────────────────────────────────
export interface StageConfig {
  id: BugStatus;
  label: string;
  hint: string;
  /** Cor do acento da coluna (faixa + dot). */
  color: string;
  /** Conta como fila do TI ("o que falta fazer"). */
  pendente?: boolean;
  /** Etapa final — sem aging, sem cobrança. */
  final?: boolean;
  /** A bola está com o solicitante — o relógio do TI para. */
  espera?: boolean;
}

export const STAGES: StageConfig[] = [
  { id: "open",        label: "Entrada",      hint: "Chegou, falta triar",                  color: "#F59E0B", pendente: true },
  // "Na fila" (e não "Priorizada") pra não colidir com o campo Prioridade.
  { id: "priorizada",  label: "Na fila",      hint: "Triada, aguardando execução",          color: "#A855F7", pendente: true },
  { id: "in_progress", label: "Em andamento", hint: "Alguém está resolvendo",               color: "#3B82F6", pendente: true },
  { id: "aguardando",  label: "Aguardando",   hint: "Esperando resposta de quem reportou",  color: "#EAB308", espera: true },
  { id: "em_teste",    label: "Em teste",     hint: "Aguardando validação de quem pediu",   color: "#06B6D4", pendente: true },
  { id: "resolved",    label: "Concluída",    hint: "Entregue",                             color: "#22C55E", final: true },
  { id: "declined",    label: "Recusada",     hint: "Não será feita",                       color: "#64748B", final: true },
];

/** Etapa desconhecida NÃO vira "Entrada" silenciosamente — fica explícita. */
export const UNKNOWN_STAGE: StageConfig = {
  id: "open", label: "Etapa desconhecida", hint: "Status fora do fluxo atual", color: "#DC2626",
};

export const stageOf = (id: string): StageConfig =>
  STAGES.find((s) => s.id === id) ?? UNKNOWN_STAGE;
export const stageLabel = (id: string): string => stageOf(id).label;
export const isKnownStage = (id: string): boolean => STAGES.some((s) => s.id === id);

/** Etapas de trabalho ainda não entregue (inclui as desconhecidas, pra board e
 *  dashboard nunca discordarem no total). */
export const isAberta = (s: string) => {
  const cfg = STAGES.find((x) => x.id === s);
  return cfg ? !cfg.final : true;
};
/** Fila que efetivamente depende do TI (exclui a espera por terceiro). */
export const isFilaTI = (s: string) => !!STAGES.find((x) => x.id === s)?.pendente;

// ── Prioridade ───────────────────────────────────────────────────────────────
export interface PrioConfig {
  key: BugPriority;
  label: string;
  dot: string;
  badge: string;
  /** Cor sólida — usada na borda esquerda do cartão. */
  hex: string;
  weight: number;
}

export const PRIOS: PrioConfig[] = [
  { key: "critica", label: "Crítica", dot: "bg-red-500",    badge: "text-red-600 bg-red-500/10",       hex: "#EF4444", weight: 4 },
  { key: "alta",    label: "Alta",    dot: "bg-orange-500", badge: "text-orange-600 bg-orange-500/10", hex: "#F97316", weight: 3 },
  { key: "media",   label: "Média",   dot: "bg-amber-500",  badge: "text-amber-600 bg-amber-500/10",   hex: "#F59E0B", weight: 2 },
  { key: "baixa",   label: "Baixa",   dot: "bg-slate-400",  badge: "text-slate-500 bg-slate-400/10",   hex: "#94A3B8", weight: 1 },
];

/** Sem prioridade = ainda não triada (nasce assim quando não há sinal de impacto). */
export const A_TRIAR: PrioConfig = {
  key: "media", label: "A triar", dot: "bg-muted-foreground", badge: "text-muted-foreground bg-muted", hex: "#64748B", weight: 2.5,
};

export const prioOf = (p: string | null | undefined): PrioConfig =>
  (p ? PRIOS.find((x) => x.key === p) : undefined) ?? (p ? PRIOS[2] : A_TRIAR);

// ── Impacto declarado por quem reportou (base da prioridade calculada) ───────
export const BLOQUEIOS = [
  { key: "travado",  label: "Estou travado", hint: "Não consigo trabalhar por causa disso" },
  { key: "contorno", label: "Tenho um jeitinho", hint: "Dá pra contornar, mas atrapalha" },
  { key: "incomoda", label: "Só incomoda", hint: "Funciona, mas podia ser melhor" },
] as const;

export const ALCANCES = [
  { key: "so_eu",      label: "Só eu" },
  { key: "meu_time",   label: "Meu time" },
  { key: "todo_mundo", label: "Todo mundo" },
] as const;

export const bloqueioLabel = (b: string | null) =>
  BLOQUEIOS.find((x) => x.key === b)?.label ?? null;
export const alcanceLabel = (a: string | null) =>
  ALCANCES.find((x) => x.key === a)?.label ?? null;

/** Mesma régua da função no banco (urgência × alcance). */
export function calcPriority(bloqueio?: string | null, afetadas?: string | null): BugPriority | null {
  if (!bloqueio) return null;
  if (bloqueio === "travado") return afetadas === "todo_mundo" || afetadas === "meu_time" ? "critica" : "alta";
  if (bloqueio === "contorno") return afetadas === "todo_mundo" ? "alta" : "media";
  if (bloqueio === "incomoda") return afetadas === "todo_mundo" ? "media" : "baixa";
  return null;
}

// ── Tempo ────────────────────────────────────────────────────────────────────
export const daysSince = (iso: string): number =>
  Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);

/** Quanto tempo parada NA ETAPA atual (stage_since; cai pra created_at no legado). */
export const stageDays = (d: { stage_since?: string | null; updated_at?: string | null; created_at: string }): number =>
  daysSince(d.stage_since || d.updated_at || d.created_at);

/**
 * Régua de atraso. Não acusa etapa final nem espera por terceiro — senão o
 * quadro cobra o TI por um silêncio que não é dele.
 */
export const agingOf = (d: { status: string; stage_since?: string | null; updated_at?: string | null; created_at: string }):
  "red" | "amber" | null => {
  const cfg = STAGES.find((s) => s.id === d.status);
  if (cfg?.final || cfg?.espera) return null;
  const days = stageDays(d);
  return days > 7 ? "red" : days > 3 ? "amber" : null;
};

export const dtFmt = (s: string) =>
  new Date(s).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });
export const dFmt = (s: string) =>
  new Date(s).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" });

import type { BugStatus, BugPriority } from "@/hooks/useBugReports";

// ─────────────────────────────────────────────────────────────────────────────
// Fluxo de trabalho do TI — 6 etapas. Os 4 status originais foram preservados
// (open/in_progress/resolved/declined) e ganharam o significado da etapa, por
// isso nenhuma demanda existente precisou ser migrada.
// ─────────────────────────────────────────────────────────────────────────────
export interface StageConfig {
  id: BugStatus;
  label: string;
  hint: string;
  /** Cor do acento da coluna (faixa + dot). */
  color: string;
  /** Etapa que conta como "fila" (o que ainda falta fazer). */
  pendente?: boolean;
  /** Etapa final (não conta como pendente nem como trabalho ativo). */
  final?: boolean;
}

export const STAGES: StageConfig[] = [
  { id: "open",        label: "Entrada",      hint: "Chegou, falta triar",        color: "#F59E0B", pendente: true },
  { id: "priorizada",  label: "Priorizada",   hint: "Triada, na fila",            color: "#A855F7", pendente: true },
  { id: "in_progress", label: "Em andamento", hint: "Alguém está resolvendo",     color: "#3B82F6" },
  { id: "em_teste",    label: "Em teste",     hint: "Validando a correção",       color: "#06B6D4" },
  { id: "resolved",    label: "Concluída",    hint: "Entregue",                   color: "#22C55E", final: true },
  { id: "declined",    label: "Recusada",     hint: "Não será feita",             color: "#64748B", final: true },
];

export const stageOf = (id: string): StageConfig =>
  STAGES.find((s) => s.id === id) ?? STAGES[0];
export const stageLabel = (id: string): string => stageOf(id).label;

/** Etapas que representam trabalho ainda não entregue ("o que falta"). */
export const OPEN_STAGES: BugStatus[] = ["open", "priorizada", "in_progress", "em_teste"];
export const isAberta = (s: string) => OPEN_STAGES.includes(s as BugStatus);

// ── Prioridade ───────────────────────────────────────────────────────────────
export interface PrioConfig {
  key: BugPriority;
  label: string;
  dot: string;
  badge: string;
  /** Peso pra ordenar a fila (maior = mais urgente). */
  weight: number;
}

export const PRIOS: PrioConfig[] = [
  { key: "critica", label: "Crítica", dot: "bg-red-500",    badge: "text-red-600 bg-red-500/10",       weight: 4 },
  { key: "alta",    label: "Alta",    dot: "bg-orange-500", badge: "text-orange-600 bg-orange-500/10", weight: 3 },
  { key: "media",   label: "Média",   dot: "bg-amber-500",  badge: "text-amber-600 bg-amber-500/10",   weight: 2 },
  { key: "baixa",   label: "Baixa",   dot: "bg-slate-400",  badge: "text-slate-500 bg-slate-400/10",   weight: 1 },
];

export const prioOf = (p: string): PrioConfig =>
  PRIOS.find((x) => x.key === p) ?? PRIOS[2];

// ── Envelhecimento (mesma régua do card de lead do CRM) ──────────────────────
export const daysSince = (iso: string): number =>
  Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);

/** Parada há quanto tempo? >7d vermelho, >3d âmbar, senão nada. */
export const agingOf = (iso: string): "red" | "amber" | null => {
  const d = daysSince(iso);
  return d > 7 ? "red" : d > 3 ? "amber" : null;
};

export const dtFmt = (s: string) =>
  new Date(s).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });
export const dFmt = (s: string) =>
  new Date(s).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" });

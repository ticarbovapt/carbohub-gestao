import type { OSRow } from "@/hooks/useOS";

// A forma que as três visões da tela de Ordens de Serviço (quadro, lista e
// agenda) leem. Uma conversão só, para as três mostrarem a mesma OS igual.

export type OsStageId = "nova" | "em_execucao" | "concluida" | "cancelada";

export interface OSView {
  id: string;
  numero: string;
  cliente: string;
  tipo: string;          // rótulo: B2C · B2B · Frota
  tipoKey: string;       // chave crua: b2c · b2b · frota
  veiculo: string | null;
  agendamento: string | null;
  stage: OsStageId | string;
  vagas: number;
  vagasExecutadas: number;
  portes: string;        // "8 leves · 1 pesado"
  pedido: string | null;
  valor: number | null;
}

export interface StageMeta {
  id: OsStageId;
  label: string;
  /** Classes de cor da etapa (ponto, faixa, selo). */
  dot: string;
  bar: string;
  badge: string;
}

export const STAGES: StageMeta[] = [
  { id: "nova", label: "Nova", dot: "bg-slate-400", bar: "bg-slate-400",
    badge: "bg-slate-500/10 text-slate-600 dark:text-slate-300 ring-slate-500/20" },
  { id: "em_execucao", label: "Em execução", dot: "bg-violet-500", bar: "bg-violet-500",
    badge: "bg-violet-500/10 text-violet-700 dark:text-violet-300 ring-violet-500/20" },
  { id: "concluida", label: "Concluída", dot: "bg-emerald-500", bar: "bg-emerald-500",
    badge: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 ring-emerald-500/20" },
];

export const STAGE_CANCELADA: StageMeta = {
  id: "cancelada", label: "Cancelada", dot: "bg-red-500", bar: "bg-red-500",
  badge: "bg-red-500/10 text-red-700 dark:text-red-300 ring-red-500/20",
};

export const stageMeta = (id: string): StageMeta =>
  STAGES.find((s) => s.id === id) ?? (id === "cancelada" ? STAGE_CANCELADA : { ...STAGES[0], id: id as OsStageId, label: id });

export const TIPO_LABEL: Record<string, string> = { b2c: "B2C", b2b: "B2B", frota: "Frota" };

/** Cor por tipo de cliente (agenda e selos). */
export const TIPO_TONE: Record<string, string> = {
  b2c: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  b2b: "bg-sky-500/10 text-sky-700 dark:text-sky-300",
  frota: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
};

// Coluna DATE volta como "2026-07-30". new Date() parseia isso como meia-noite
// UTC, que no Brasil é 21h do dia anterior — a data aparecia um dia atrás.
export const parseData = (s: string): Date =>
  /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(`${s}T00:00:00`) : new Date(s);

export const dt = (s: string | null) => (s ? parseData(s).toLocaleDateString("pt-BR") : "—");

export const brl = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

// Duas categorias desde 09/10/2026 (ver `descarb.ts` do packages/shell): P e M
// são LEVES, G é PESADO. As letras continuam no banco por causa do histórico e
// da OS; na tela, a categoria. Vaga sem porte fica como número solto.
const portesLabel = (p: Record<string, number>) => {
  const leves = (p.P ?? 0) + (p.M ?? 0);
  const pesados = p.G ?? 0;
  const sem = p["—"] ?? 0;
  return [
    leves ? `${leves} ${leves === 1 ? "leve" : "leves"}` : "",
    pesados ? `${pesados} ${pesados === 1 ? "pesado" : "pesados"}` : "",
    sem ? String(sem) : "",
  ].filter(Boolean).join(" · ");
};

export function toView(o: OSRow): OSView {
  const veiculo = [o.placa, o.modelo].filter(Boolean).join(" · ");
  return {
    id: o.id,
    numero: o.numero?.trim() || o.titulo?.trim() || `OS-${o.id.slice(0, 8)}`,
    cliente: o.cliente_nome?.trim() || "Cliente sem nome",
    tipo: TIPO_LABEL[o.tipo] ?? o.tipo,
    tipoKey: o.tipo,
    veiculo: veiculo || null,
    agendamento: o.data_prevista,
    stage: o.stage,
    vagas: o.vagas,
    vagasExecutadas: o.vagasExecutadas,
    portes: portesLabel(o.portes),
    pedido: o.saleOrderNumber,
    valor: o.saleTotal,
  };
}

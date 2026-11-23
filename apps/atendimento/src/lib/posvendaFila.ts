import type { Pendencia } from "../hooks/usePendenciasEntrega";
import { TIPO_DO_ASSUNTO, passoDe, type TipoCaso } from "./posvendaCasos";

// ─────────────────────────────────────────────────────────────────────────────
// As regras PURAS da fila do pós-venda (`/pos-venda`, aba "Para tratar") e dos
// casos (23/11/2026, decisões do dono do processo):
//
//   · 1ª resposta em até 24 h ÚTEIS (como o Mercado Livre): o relógio conta só
//     de segunda a sexta, no horário de Brasília, a partir de `aguarda_desde`
//     (a 1ª reclamação ainda sem resposta de GENTE — 20261182).
//   · Reclamação com mais de 30 dias e sem caso vai para "Antigas": continua
//     visível, mas não pesa na fila (`reclamacao.antiga`, do banco).
//   · Motivo = POR QUE está na fila, para quem atende escolher por onde começar.
//
// ⚠️ `precisaDeAtencao` é a MESMA condição do banco (`p_so_atencao`, 20261181/82):
// mudou lá, mude aqui.
// ─────────────────────────────────────────────────────────────────────────────

export const SLA_HORAS_UTEIS = 24;
const HORA = 3_600_000;
const BRASILIA = -3 * HORA; // sem horário de verão desde 2019

/** Dia da semana em Brasília (0 = domingo). */
const diaDaSemana = (t: number) => new Date(t + BRASILIA).getUTCDay();
const ehUtil = (t: number) => { const d = diaDaSemana(t); return d !== 0 && d !== 6; };

/** O instante em que vencem `horas` úteis contadas de `inicio` (sábado e domingo não contam). */
export function somarHorasUteis(inicio: Date, horas = SLA_HORAS_UTEIS): Date {
  let t = inicio.getTime();
  let resta = horas * HORA;
  // Começou no fim de semana: o relógio só anda na segunda, 00:00 de Brasília.
  while (!ehUtil(t)) {
    const local = new Date(t + BRASILIA);
    t = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() + 1) - BRASILIA;
  }
  while (resta > 0) {
    const local = new Date(t + BRASILIA);
    const fimDoDia = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() + 1) - BRASILIA;
    if (ehUtil(t)) {
      const passo = Math.min(resta, fimDoDia - t);
      t += passo;
      resta -= passo;
    } else {
      t = fimDoDia;
    }
  }
  return new Date(t);
}

/** Horas úteis entre dois instantes (negativo quando `ate` vem antes). */
export function horasUteisEntre(de: Date, ate: Date): number {
  const sinal = ate >= de ? 1 : -1;
  let a = Math.min(de.getTime(), ate.getTime());
  const b = Math.max(de.getTime(), ate.getTime());
  let ms = 0;
  while (a < b) {
    const local = new Date(a + BRASILIA);
    const fimDoDia = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() + 1) - BRASILIA;
    const ate2 = Math.min(fimDoDia, b);
    if (ehUtil(a)) ms += ate2 - a;
    a = ate2;
  }
  return (sinal * ms) / HORA;
}

export type SituacaoResposta = "respondida" | "no_prazo" | "vence_logo" | "atrasada";

export interface PrazoResposta {
  situacao: SituacaoResposta;
  /** Vencimento do prazo (nulo quando já respondida). */
  limite: Date | null;
  /** Horas ÚTEIS que faltam (negativo = atrasada). */
  horas: number;
}

/** O prazo da 1ª resposta à reclamação; nulo quando não há reclamação pendente de resposta. */
export function prazoResposta(p: Pendencia, agora = new Date()): PrazoResposta | null {
  const r = p.reclamacao;
  if (!r) return null;
  if (r.respondida_em) return { situacao: "respondida", limite: null, horas: 0 };
  const desde = r.aguarda_desde ?? r.primeira_em;
  if (!desde) return null;
  const limite = somarHorasUteis(new Date(desde));
  const horas = horasUteisEntre(agora, limite);
  return { situacao: horas < 0 ? "atrasada" : horas <= 6 ? "vence_logo" : "no_prazo", limite, horas };
}

/** "vence em 5h" · "vence em 2d" · "atrasada 3h" · "atrasada 2d" (horas úteis). */
export function textoPrazo(pz: PrazoResposta): string {
  if (pz.situacao === "respondida") return "Respondida";
  const h = Math.abs(pz.horas);
  const qto = h < 1 ? "menos de 1h" : h < 24 ? `${Math.floor(h)}h` : `${Math.floor(h / 24)}d`;
  return pz.horas < 0 ? `atrasada ${qto}` : `vence em ${qto}`;
}

// ── Por que está na fila ─────────────────────────────────────────────────────
export type Motivo = "risco" | "nao_recebeu" | "avaria" | "faltou" | "atraso" | "cobranca" | "parada" | "outro";

/** Na ordem da gravidade: é a ordem dos filtros e o desempate da prioridade. */
export const MOTIVOS: { id: Motivo; rotulo: string }[] = [
  { id: "risco",       rotulo: "Risco" },
  { id: "nao_recebeu", rotulo: "Não recebeu" },
  { id: "avaria",      rotulo: "Avaria ou defeito" },
  { id: "faltou",      rotulo: "Faltou ou veio errado" },
  { id: "atraso",      rotulo: "Atraso" },
  { id: "cobranca",    rotulo: "Cobrança e cancelamento" },
  { id: "parada",      rotulo: "Entrega parada" },
  { id: "outro",       rotulo: "Outros" },
];
export const ROTULO_MOTIVO = Object.fromEntries(MOTIVOS.map((m) => [m.id, m.rotulo])) as Record<Motivo, string>;

/** Assunto da reclamação (cadastro de assuntos do atendimento, 20261149) → motivo. */
const MOTIVO_DO_ASSUNTO: Record<string, Motivo> = {
  ameaca: "risco",
  entrega_falhou: "nao_recebeu",
  avaria: "avaria", nao_funcionou: "avaria",
  faltou_item: "faltou", produto_diferente: "faltou",
  atraso: "atraso", rastreio: "atraso",
  cobranca_duplicada: "cobranca", pagamento: "cobranca", cancelamento: "cobranca",
};

const ORDEM_MOTIVO = Object.fromEntries(MOTIVOS.map((m, i) => [m.id, i])) as Record<Motivo, number>;

/** A reclamação pendente (é o cliente falando) vem antes do problema da entrega. */
export function motivoDe(p: Pendencia): Motivo {
  const r = p.reclamacao?.pendente ? p.reclamacao : null;
  if (r) {
    const ms = r.assuntos.map((a) => MOTIVO_DO_ASSUNTO[a.codigo]).filter(Boolean) as Motivo[];
    if (ms.length) return ms.sort((a, b) => ORDEM_MOTIVO[a] - ORDEM_MOTIVO[b])[0];
  }
  if (p.problema === "atrasado") return "atraso";
  if (p.problema) return "parada";
  return "outro";
}

/** O assunto que explica o motivo (o de risco antes do resto), e quantos mais há. */
export function assuntoDoMotivo(p: Pendencia): { rotulo: string; mais: number } | null {
  const r = p.reclamacao;
  if (!r || !r.assuntos.length) return null;
  const m = motivoDe(p);
  const a = r.assuntos.find((x) => MOTIVO_DO_ASSUNTO[x.codigo] === m) ?? r.assuntos[0];
  return { rotulo: a.rotulo, mais: r.assuntos.length - 1 };
}

/** O tipo de caso em que o pedido PROVAVELMENTE se enquadra — um palpite (a
 *  classificação por palavra erra), para quem atende revisar ao abrir o caso.
 *  Nulo quando o problema é só nosso (etiqueta, NF): ali não há caso do cliente. */
export function tipoProvavel(p: Pendencia): TipoCaso | null {
  const r = p.reclamacao?.pendente ? p.reclamacao : null;
  if (r) {
    const doMotivo = assuntoDoMotivo(p);
    const codigos = r.assuntos.map((a) => a.codigo);
    const prim = r.assuntos.find((a) => a.rotulo === doMotivo?.rotulo)?.codigo;
    for (const c of [prim, ...codigos]) if (c && TIPO_DO_ASSUNTO[c]) return TIPO_DO_ASSUNTO[c];
  }
  if (p.problema === "atrasado" || p.problema === "transportadora") return "atraso";
  return null;
}

// ── A fila ───────────────────────────────────────────────────────────────────
const ehFinal = (s: string | null | undefined) => s === "reembolsado" || s === "resolvido" || s === "sem_solucao";

/** O problema da entrega pede alguém: sem caso aberto e sem tratativa encerrada. */
export const problemaPendente = (p: Pendencia) =>
  !!p.problema && p.caso?.status !== "aberto" && !ehFinal(p.trato?.situacao);

/** Precisa de alguém: reclamou e ninguém trata, ou tem problema sem caso nem tratativa encerrada. */
export const precisaDeAtencao = (p: Pendencia) => !!p.reclamacao?.pendente || problemaPendente(p);

/** Só está na fila por uma reclamação de mais de 30 dias: vai para "Antigas". */
export const ehAntiga = (p: Pendencia) =>
  !!p.reclamacao?.pendente && !!p.reclamacao.antiga && !problemaPendente(p);

/** Quando entrou na fila: a reclamação (pendente) ou o problema. */
export const entrouEm = (p: Pendencia) =>
  (p.reclamacao?.pendente ? p.reclamacao.aguarda_desde ?? p.reclamacao.primeira_em : null) ?? p.desde ?? p.data_pedido;

/** Prioridade: risco; depois a resposta que vence primeiro; depois o mais antigo. */
export function compararPrioridade(a: Pendencia, b: Pendencia, agora = new Date()): number {
  const ra = motivoDe(a) === "risco" ? 0 : 1;
  const rb = motivoDe(b) === "risco" ? 0 : 1;
  if (ra !== rb) return ra - rb;
  const pa = a.reclamacao?.pendente ? prazoResposta(a, agora) : null;
  const pb = b.reclamacao?.pendente ? prazoResposta(b, agora) : null;
  const la = pa?.limite?.getTime() ?? Infinity;
  const lb = pb?.limite?.getTime() ?? Infinity;
  if (la !== lb) return la - lb;
  return String(entrouEm(a)).localeCompare(String(entrouEm(b)));
}

// ── Os casos ─────────────────────────────────────────────────────────────────
export type EstadoCaso = "em_atendimento" | "aguardando_cliente" | "aguardando_terceiro";

export const ESTADOS: { id: EstadoCaso; rotulo: string }[] = [
  { id: "em_atendimento",      rotulo: "Em atendimento" },
  { id: "aguardando_cliente",  rotulo: "Aguardando cliente" },
  { id: "aguardando_terceiro", rotulo: "Aguardando terceiro" },
];
export const ROTULO_ESTADO = Object.fromEntries(ESTADOS.map((e) => [e.id, e.rotulo])) as Record<EstadoCaso, string>;

/** Com quem está a bola. O passo de esperar o Financeiro manda sobre o estado gravado. */
export function estadoDoCaso(c: { tipo: string; passo: string; estado?: string | null }): EstadoCaso | "aguardando_financeiro" {
  if (passoDe(c.tipo, c.passo)?.financeiro) return "aguardando_financeiro";
  return (c.estado as EstadoCaso) || "em_atendimento";
}

/** O cliente escreveu depois de o caso passar a esperar por ele. */
export function clienteRespondeu(p: Pendencia): boolean {
  const c = p.caso;
  const e = p.reclamacao?.ultima_entrada_em;
  if (!c || c.status !== "aberto" || c.estado !== "aguardando_cliente" || !e) return false;
  return e > (c.estado_em ?? c.atualizado_em);
}

export type FiltroCasos = "todos" | "comigo" | "sem_dono" | "cliente" | "terceiro" | "financeiro";

export function passaFiltroCaso(p: Pendencia, f: FiltroCasos, eu: string | null): boolean {
  const c = p.caso;
  if (!c) return false;
  const est = estadoDoCaso(c);
  switch (f) {
    case "comigo":     return !!eu && c.responsavel === eu;
    case "sem_dono":   return !c.responsavel;
    case "cliente":    return est === "aguardando_cliente";
    case "terceiro":   return est === "aguardando_terceiro";
    case "financeiro": return est === "aguardando_financeiro";
    default:           return true;
  }
}

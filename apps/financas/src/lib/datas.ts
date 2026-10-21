// ─────────────────────────────────────────────────────────────────────────────
// Datas do Finanças — o dia é o de BRASÍLIA, sempre.
//
// ⚠️ `new Date().toISOString().slice(0, 10)` é o dia em UTC: depois das 21h ele
// já é AMANHÃ, e o título que vence hoje aparecia como atrasado num filtro e
// "vence hoje" no cartão ao lado. E `new Date("2026-10-21")` é meia-noite UTC
// — em Brasília, 21h do dia 20: a data saía UM DIA ANTES na tela.
//
// Data pura (`due_date`, `needed_by`, `invoice_date`) é TEXTO `AAAA-MM-DD` e
// assim é comparada e mostrada — sem passar por `Date`, não há fuso para errar.
// Instante (`paid_at`, `created_at`) é formatado no fuso de Brasília.
// ─────────────────────────────────────────────────────────────────────────────

const FUSO = "America/Sao_Paulo";

const fmtDia = new Intl.DateTimeFormat("en-CA", { timeZone: FUSO, year: "numeric", month: "2-digit", day: "2-digit" });

/** Dia de Brasília (`AAAA-MM-DD`) de um instante — por padrão, agora. */
export function diaBrasilia(d: Date = new Date()): string {
  return fmtDia.format(d);
}

/** Hoje em Brasília, `AAAA-MM-DD`. */
export const hojeISO = (): string => diaBrasilia();

/** Mês corrente em Brasília, `AAAA-MM`. Calcule NA HORA — nunca numa constante de módulo. */
export const mesAtualISO = (): string => hojeISO().slice(0, 7);

/** Soma dias a uma data pura, sem fuso (meio-dia UTC não troca de dia). */
export function somarDias(iso: string, dias: number): string {
  const d = new Date(`${iso.slice(0, 10)}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

/** Dias de `hoje` até a data (negativo = já passou). */
export function diasAte(iso: string | null | undefined, hoje: string = hojeISO()): number | null {
  if (!iso) return null;
  const a = Date.parse(`${hoje}T12:00:00Z`);
  const b = Date.parse(`${iso.slice(0, 10)}T12:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}

/** Primeiro e último dia de um mês `AAAA-MM`. */
export function limitesDoMes(mes: string): { de: string; ate: string } {
  const [a, m] = mes.split("-").map(Number);
  const ultimo = new Date(Date.UTC(a, m, 0)).getUTCDate();
  return { de: `${mes}-01`, ate: `${mes}-${String(ultimo).padStart(2, "0")}` };
}

/**
 * Data para a tela, `dd/mm/aaaa`.
 * - `AAAA-MM-DD` (data pura): lida como texto, sem fuso.
 * - instante (`…T…`): o dia em Brasília.
 */
export function dataBR(v: string | null | undefined): string {
  if (!v) return "—";
  const s = /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : diaBrasilia(new Date(v));
  const [a, m, d] = s.split("-");
  return `${d}/${m}/${a}`;
}

/** Instante para a tela, `dd/mm/aaaa hh:mm`, no fuso de Brasília. */
export function dataHoraBR(v: string | null | undefined): string {
  if (!v) return "—";
  return new Intl.DateTimeFormat("pt-BR", { timeZone: FUSO, day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(v));
}

/**
 * Data escolhida num `<input type="date">` gravada como instante (`paid_at`,
 * `received_at`): meio-dia de Brasília, para nenhum fuso trocá-la de dia.
 */
export const instanteDoDia = (iso: string): string => `${iso}T12:00:00-03:00`;

/**
 * ⚠️ A regra ÚNICA de "vencido": em aberto e com vencimento ANTES de hoje.
 * O status gravado não decide — o espelho do Bling grava `atrasado` e o
 * título interno fica `programado` para sempre; olhar o status fazia o
 * cartão, a pílula da aba e o Início contarem conjuntos diferentes.
 */
export function estaVencido(t: { status: string; due_date: string | null }, hoje: string = hojeISO()): boolean {
  if (!t.due_date) return false;
  if (["pago", "recebido", "cancelado"].includes(t.status)) return false;
  return t.due_date.slice(0, 10) < hoje;
}

/** Em aberto = nem pago/recebido, nem cancelado. */
export const emAberto = (status: string): boolean => !["pago", "recebido", "cancelado"].includes(status);

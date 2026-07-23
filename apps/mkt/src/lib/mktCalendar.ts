// Helpers de calendário (cálculo puro de datas — sem lib). Semana começa no
// domingo. Datas locais.

const pad = (n: number) => String(n).padStart(2, "0");

/** YYYY-MM-DD local de uma Date. */
export function ymd(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** YYYY-MM-DD local de um ISO timestamp (usa o dia local). */
export function ymdOfIso(iso: string): string {
  return ymd(new Date(iso));
}

export function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}
export function addMonths(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + n, 1);
}

/** Matriz do mês: semanas (começando no domingo) cobrindo o mês de `ref`. */
export function monthMatrix(ref: Date): Date[][] {
  const first = new Date(ref.getFullYear(), ref.getMonth(), 1);
  const start = addDays(first, -first.getDay()); // volta pro domingo
  const weeks: Date[][] = [];
  let cursor = start;
  // 6 semanas cobrem qualquer mês.
  for (let w = 0; w < 6; w++) {
    const week: Date[] = [];
    for (let i = 0; i < 7; i++) { week.push(cursor); cursor = addDays(cursor, 1); }
    weeks.push(week);
  }
  return weeks;
}

/** Semana (domingo→sábado) que contém `ref`. */
export function weekDays(ref: Date): Date[] {
  const start = addDays(ref, -ref.getDay());
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

export const WEEKDAY_LABELS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

export function fmtMonthYear(d: Date): string {
  return d.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
}

/** Constrói um ISO no dia `dayYmd`, preservando a hora de `keepFromIso` (ou meio-dia). */
export function isoForDay(dayYmd: string, keepFromIso: string | null): string {
  const [y, m, d] = dayYmd.split("-").map(Number);
  let hh = 12, mm = 0;
  if (keepFromIso) {
    const k = new Date(keepFromIso);
    hh = k.getHours(); mm = k.getMinutes();
  }
  return new Date(y, m - 1, d, hh, mm, 0).toISOString();
}

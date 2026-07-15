// ─────────────────────────────────────────────────────────────────────────────
// Lógica de aniversários (funções puras, testáveis).
// birth_date vem como 'YYYY-MM-DD'. O ANO existe, então dá pra calcular a idade
// que a pessoa completa — mas tratamos anos "não confiáveis" de forma graciosa.
// ─────────────────────────────────────────────────────────────────────────────

export const MESES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
] as const;

export const MESES_ABREV = [
  "Jan", "Fev", "Mar", "Abr", "Mai", "Jun",
  "Jul", "Ago", "Set", "Out", "Nov", "Dez",
] as const;

export interface ParsedBirth {
  year: number | null; // null quando o ano não é confiável
  month: number;        // 1..12
  day: number;          // 1..31
}

/** Extrai {year, month, day} de 'YYYY-MM-DD'. Retorna null se inválido. */
export function parseBirth(bd: string | null): ParsedBirth | null {
  const m = (bd ?? "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const year = Number(m[1]), month = Number(m[2]), day = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  // Ano só é "confiável" se render uma idade plausível (evita placeholders tipo 1900).
  const nowYear = new Date().getFullYear();
  const reliableYear = year >= 1920 && year <= nowYear;
  return { year: reliableYear ? year : null, month, day };
}

/** Meia-noite local — normaliza pra comparar só a data, sem horas. */
function midnight(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export interface BirthdayInfo extends ParsedBirth {
  /** Data do PRÓXIMO aniversário (hoje conta como 0). */
  nextDate: Date;
  /** Dias corridos até o próximo aniversário (0 = hoje). */
  daysUntil: number;
  isToday: boolean;
  /** Faz aniversário nos próximos 7 dias (1..7). */
  isThisWeek: boolean;
  /** Aniversário cai no mês corrente. */
  isThisMonth: boolean;
  /** Idade que a pessoa completa no próximo aniversário (null se ano incerto). */
  turningAge: number | null;
}

/** Computa tudo sobre um aniversário a partir de uma data de referência (hoje). */
export function computeBirthday(bd: string | null, today: Date = new Date()): BirthdayInfo | null {
  const p = parseBirth(bd);
  if (!p) return null;
  const t0 = midnight(today);
  let next = new Date(today.getFullYear(), p.month - 1, p.day);
  next = midnight(next);
  if (next.getTime() < t0.getTime()) next = midnight(new Date(today.getFullYear() + 1, p.month - 1, p.day));
  const daysUntil = Math.round((next.getTime() - t0.getTime()) / 86_400_000);

  let turningAge: number | null = null;
  if (p.year != null) {
    const age = next.getFullYear() - p.year;
    if (age >= 1 && age <= 120) turningAge = age;
  }

  return {
    ...p,
    nextDate: next,
    daysUntil,
    isToday: daysUntil === 0,
    isThisWeek: daysUntil >= 1 && daysUntil <= 7,
    isThisMonth: p.month === today.getMonth() + 1,
    turningAge,
  };
}

/** Rótulo de destaque progressivo pra um aniversário. */
export type BdayTier = "today" | "week" | "month" | "future";
export function tierOf(info: BirthdayInfo): BdayTier {
  if (info.isToday) return "today";
  if (info.isThisWeek) return "week";
  if (info.isThisMonth) return "month";
  return "future";
}

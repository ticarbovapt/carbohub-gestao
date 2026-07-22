import { useMemo } from "react";
import type { EmployeeRow } from "@/hooks/useEmployeeFinance";
import { computeBirthday, type BirthdayInfo } from "@/lib/birthdays";

// Junta cada funcionário com o cálculo do aniversário, já agrupado/ordenado.
// Deixa a tela enxuta: a UI só consome os grupos prontos.

export interface BirthdayEntry {
  row: EmployeeRow;
  info: BirthdayInfo;
}

export interface BirthdaysResult {
  /** Todos com data válida, ordenados por proximidade do próximo aniversário. */
  entries: BirthdayEntry[];
  /** Quem faz aniversário HOJE. */
  todays: BirthdayEntry[];
  /** Próximos 30 dias (exclui hoje — hoje tem destaque próprio). */
  upcoming: BirthdayEntry[];
  /** Aniversariantes do mês corrente, ordenados por dia. */
  thisMonth: BirthdayEntry[];
  /** 12 posições (Jan..Dez), cada uma ordenada por dia. */
  byMonth: BirthdayEntry[][];
  /** Funcionários sem data cadastrada. */
  noDate: EmployeeRow[];
  /** Próximo aniversário (o mais próximo, incluindo hoje). */
  next: BirthdayEntry | null;
  // Contadores prontos pros KPIs.
  total: number;
  withDate: number;
  withoutDate: number;
  coveragePct: number;
}

export function useBirthdays(rows: EmployeeRow[], today: Date = new Date()): BirthdaysResult {
  // Normaliza pra chave estável do dia (evita recomputar a cada render por causa das horas).
  const dayKey = today.getFullYear() * 10000 + today.getMonth() * 100 + today.getDate();

  return useMemo(() => {
    const ref = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const curMonth = ref.getMonth() + 1;

    const entries: BirthdayEntry[] = [];
    const noDate: EmployeeRow[] = [];
    for (const row of rows) {
      const info = computeBirthday(row.birth_date, ref);
      if (info) entries.push({ row, info });
      else noDate.push(row);
    }
    entries.sort((a, b) => a.info.daysUntil - b.info.daysUntil || a.row.displayName.localeCompare(b.row.displayName, "pt-BR"));

    const byMonth: BirthdayEntry[][] = Array.from({ length: 12 }, () => []);
    for (const e of entries) byMonth[e.info.month - 1].push(e);
    for (const list of byMonth) list.sort((a, b) => a.info.day - b.info.day);

    const todays = entries.filter((e) => e.info.isToday);
    const upcoming = entries.filter((e) => e.info.daysUntil >= 1 && e.info.daysUntil <= 30);
    const thisMonth = byMonth[curMonth - 1];
    const next = entries[0] ?? null;

    const total = rows.length;
    const withDate = entries.length;
    const withoutDate = noDate.length;
    const coveragePct = total > 0 ? Math.round((withDate / total) * 100) : 0;

    return { entries, todays, upcoming, thisMonth, byMonth, noDate, next, total, withDate, withoutDate, coveragePct };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, dayKey]);
}

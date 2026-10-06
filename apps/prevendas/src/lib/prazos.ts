// Cálculo de prazos de fábrica (PPF/PPE) em dias úteis — puro, sem React.
// Espelha as funções SQL (carbo_add_business_days/carbo_compute_prazos): o banco
// recalcula tudo de forma autoritativa no INSERT; aqui é só para exibir ao vendedor.
// Arquivo replicado idêntico nos 4 apps.

export interface PrazoConfig {
  enabled: boolean;
  minBusinessDays: number;  // mínimo de dias úteis p/ fabricar
  shipOffsetDays: number;   // PPE = PPF + N dias úteis
}

export interface PrazoResult {
  ppf: Date;                    // fabricar até
  ppe: Date;                    // expedir até (= PPF + offset dias úteis)
  businessDaysAvailable: number; // dias úteis de hoje até o PPF
  belowMinimum: boolean;
  suggestedDeliveryDate: Date;  // menor data de entrega válida (respeita o mínimo)
  error: string | null;
}

const isWeekend = (d: Date) => d.getDay() === 0 || d.getDay() === 6;
const dateOnly = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

/** Anda `days` dias úteis (days<0 = pra trás), pulando fim de semana. */
export function addBusinessDays(from: Date, days: number): Date {
  const d = dateOnly(from);
  if (days === 0) { while (isWeekend(d)) d.setDate(d.getDate() + 1); return d; }
  const step = days > 0 ? 1 : -1;
  let remaining = Math.abs(days);
  while (remaining > 0) { d.setDate(d.getDate() + step); if (!isWeekend(d)) remaining -= 1; }
  return d;
}

/** Dias úteis estritamente depois de `from` até `to` (inclusive). hoje = dia 0. */
export function countBusinessDays(from: Date, to: Date): number {
  let c = 0;
  const d = dateOnly(from);
  const end = dateOnly(to);
  d.setDate(d.getDate() + 1);
  while (d <= end) { if (!isWeekend(d)) c += 1; d.setDate(d.getDate() + 1); }
  return c;
}

/** PPF/PPE + runway + abaixo-do-mínimo + data mínima sugerida. */
export function computePrazos(hoje: Date, delivery: Date, cfg: PrazoConfig): PrazoResult {
  const today = dateOnly(hoje);
  const D = dateOnly(delivery);
  const suggested = addBusinessDays(today, cfg.minBusinessDays + cfg.shipOffsetDays);
  if (D < today) {
    return { ppf: today, ppe: today, businessDaysAvailable: 0, belowMinimum: true, suggestedDeliveryDate: suggested, error: "Data de entrega no passado." };
  }
  // PPE = último dia útil <= data de entrega
  const ppe = new Date(D);
  while (isWeekend(ppe)) ppe.setDate(ppe.getDate() - 1);
  // PPF = PPE − offset dias úteis
  let ppf = addBusinessDays(ppe, -cfg.shipOffsetDays);
  if (ppf < today) ppf = new Date(today);
  if (ppe < today) ppe.setTime(today.getTime());
  const businessDaysAvailable = countBusinessDays(today, ppf);
  return {
    ppf, ppe, businessDaysAvailable,
    belowMinimum: businessDaysAvailable < cfg.minBusinessDays,
    suggestedDeliveryDate: suggested,
    error: null,
  };
}

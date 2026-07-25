// Formatadores compartilhados pelos dashboards espelhados (Dashboards/*).
// Mantém a mesma convenção pt-BR usada no restante do Admin (EcommerceVendas).

export const fmtBRL = (v: number) =>
  (v ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

/** BRL com centavos — para tickets médios e valores unitários. */
export const fmtBRLc = (v: number) =>
  (v ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export const fmtNum = (v: number) => (v ?? 0).toLocaleString("pt-BR");

export const pct = (a: number, b: number) => (b > 0 ? ((a / b) * 100).toFixed(1) + "%" : "0%");

/** Δ% entre atual e anterior, com direção pra alimentar o trend do CarboKPI. */
export function delta(current: number, previous: number): { value: number; direction: "up" | "down" | "neutral" } {
  if (!previous) return { value: 0, direction: "neutral" };
  const diff = ((current - previous) / previous) * 100;
  return {
    value: Math.abs(Math.round(diff * 10) / 10),
    direction: diff > 0.05 ? "up" : diff < -0.05 ? "down" : "neutral",
  };
}

/** Rótulo curto de mês (ex.: "jul/25") a partir de um date ISO.
 *  TZ-safe: uma data pura ("2026-06-01" ou "2026-06") é interpretada pelo JS como
 *  meia-noite UTC e, em fusos atrás do UTC (ex.: Brasil UTC-3), recuaria um dia →
 *  rótulo do mês anterior. Ancoramos no meio-dia local antes de formatar. Strings
 *  com hora ("...T12:00:00") e objetos Date passam sem alteração. */
export function monthLabel(iso: string): string {
  const anchored = typeof iso === "string" && /^\d{4}-\d{2}(-\d{2})?$/.test(iso)
    ? `${iso.length === 7 ? `${iso}-01` : iso}T12:00:00`
    : iso;
  return new Date(anchored).toLocaleDateString("pt-BR", { month: "short", year: "2-digit" }).replace(".", "");
}

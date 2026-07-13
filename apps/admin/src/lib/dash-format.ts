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

/** Rótulo curto de mês (ex.: "jul/25") a partir de um date ISO. */
export function monthLabel(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", { month: "short", year: "2-digit" }).replace(".", "");
}

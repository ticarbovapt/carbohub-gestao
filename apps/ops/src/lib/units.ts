// ─────────────────────────────────────────────────────────────────────────────
// Conversão de unidades por DIMENSÃO (volume / massa / contagem).
// Ex.: a receita usa 100 ml de um insumo estocado em L → 100 ml = 0,1 L.
// Usado no editor de BOM e no cálculo de consumo/estoque da produção.
// ─────────────────────────────────────────────────────────────────────────────

interface UnitDef { dim: "vol" | "mass" | "count"; toBase: number; label: string }

// toBase = fator para a unidade-base da dimensão (vol→L, mass→kg, count→un).
const UNITS: Record<string, UnitDef> = {
  ml: { dim: "vol", toBase: 0.001, label: "ml" },
  l:  { dim: "vol", toBase: 1, label: "L" },
  g:  { dim: "mass", toBase: 0.001, label: "g" },
  kg: { dim: "mass", toBase: 1, label: "kg" },
  un: { dim: "count", toBase: 1, label: "un" },
};

const norm = (u: string) => (u || "").trim().toLowerCase();

/** Todas as unidades padrão para o seletor (contagem, volume, massa). */
export const ALL_UNITS: string[] = ["un", "ml", "l", "g", "kg"];

/** Converte `qty` de `from` para `to`. Retorna null se as unidades forem de
 *  dimensões diferentes ou desconhecidas (ex.: ml → un). */
export function convertUnit(qty: number, from: string, to: string): number | null {
  const a = UNITS[norm(from)], b = UNITS[norm(to)];
  if (!a || !b || a.dim !== b.dim) return null;
  return (qty * a.toBase) / b.toBase;
}

/** Unidades compatíveis (mesma dimensão) com a unidade dada. Se desconhecida,
 *  devolve a própria unidade (deixa cadastrar livre). */
export function compatibleUnits(unit: string): string[] {
  const u = UNITS[norm(unit)];
  if (!u) return [norm(unit) || "un"];
  return Object.entries(UNITS).filter(([, d]) => d.dim === u.dim).map(([k]) => k);
}

/** Rótulo bonito da unidade ("L" em vez de "l"). */
export function unitLabel(unit: string): string {
  return UNITS[norm(unit)]?.label ?? unit;
}

/** Unidade contável (peças inteiras — un, cx…). Volume/massa aceitam decimal.
 *  Desconhecidas são tratadas como contáveis (inteiro) por segurança. */
export function isCountUnit(unit: string): boolean {
  const dim = UNITS[norm(unit)]?.dim;
  return dim === "count" || dim === undefined;
}

/** Arredonda respeitando a unidade: inteiro p/ contável, 3 casas p/ vol/massa. */
export function roundForUnit(qty: number, unit: string): number {
  return isCountUnit(unit) ? Math.round(qty) : Math.round(qty * 1000) / 1000;
}

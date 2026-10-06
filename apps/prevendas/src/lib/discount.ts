// Cálculo de desconto + resolução de alçada (puro, sem React — testável).
// Espelha a config do banco (discount_approval_tiers/config). Alçada DESLIGADA
// ⇒ tudo auto-aprovado. Arquivo replicado idêntico nos 4 apps (sales/ops/finance/admin).

export type DiscountType = "value" | "percent";
export type DiscountAuthority = "auto" | "gestor" | "ceo";

export interface DiscountTier {
  min_percent: number;         // limite inferior (inclusive)
  max_percent: number | null;  // limite superior (inclusive); null = ∞
  authority: DiscountAuthority;
  label: string | null;
}

export interface DiscountConfig {
  enabled: boolean;
  tiers: DiscountTier[];
}

export interface DiscountInput {
  enabled: boolean;
  type: DiscountType;
  rawValue: number;  // número digitado (R$ se value, % se percent)
  reason: string;
}

export interface DiscountResult {
  amount: number;      // R$ de desconto
  percent: number;     // % efetivo sobre o subtotal
  finalTotal: number;  // subtotal - amount (nunca < 0)
  error: string | null;
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** Dado o subtotal + intenção do vendedor, calcula desconto, % efetivo e total. */
export function computeDiscount(subtotal: number, s: DiscountInput): DiscountResult {
  if (!s.enabled || !s.rawValue || s.rawValue <= 0 || subtotal <= 0) {
    return { amount: 0, percent: 0, finalTotal: subtotal, error: null };
  }
  let amount: number;
  let percent: number;
  if (s.type === "percent") {
    percent = round2(s.rawValue);
    if (percent > 100) return { amount: 0, percent, finalTotal: subtotal, error: "Percentual não pode passar de 100%." };
    amount = round2((subtotal * percent) / 100);
  } else {
    amount = round2(s.rawValue);
    if (amount > subtotal) return { amount, percent: 0, finalTotal: 0, error: "Desconto não pode exceder o subtotal." };
    percent = round2((amount / subtotal) * 100);
  }
  return { amount, percent, finalTotal: round2(Math.max(0, subtotal - amount)), error: null };
}

export interface LineDiscountInput {
  type: DiscountType;  // 'percent' ou 'value'
  value: number;       // número digitado na linha (% se percent, R$ se value)
}

export interface LineDiscountResult {
  amount: number;   // R$ abatido na linha (>= 0, <= bruto)
  net: number;      // líquido da linha (bruto - amount, nunca < 0)
  percent: number;  // % efetivo do desconto sobre o bruto da linha
}

/**
 * Desconto POR LINHA (dinheiro): dado o bruto (qty*unit) e a intenção do item,
 * devolve o R$ abatido, o líquido e o % efetivo. Clampa sempre: nunca negativo,
 * nunca maior que o bruto. Função pura — replicada idêntica nos 4 apps.
 */
export function computeLineDiscount(bruto: number, s: LineDiscountInput): LineDiscountResult {
  const grossBase = bruto > 0 ? round2(bruto) : 0;
  if (grossBase <= 0 || !s.value || s.value <= 0) {
    return { amount: 0, net: grossBase, percent: 0 };
  }
  let amount: number;
  if (s.type === "percent") {
    const pct = Math.min(100, Math.max(0, s.value));
    amount = round2((grossBase * pct) / 100);
  } else {
    amount = round2(s.value);
  }
  // Clamp: nunca negativo, nunca acima do bruto.
  amount = Math.min(Math.max(0, amount), grossBase);
  const net = round2(grossBase - amount);
  const percent = grossBase > 0 ? round2((amount / grossBase) * 100) : 0;
  return { amount, net, percent };
}

/** Faixa/alçada de um percentual, conforme a config. Desligado ⇒ auto. */
export function resolveTier(
  percent: number,
  cfg: DiscountConfig,
): { authority: DiscountAuthority; hint: string; needsApproval: boolean } {
  if (!cfg.enabled || percent <= 0) {
    return { authority: "auto", hint: percent > 0 ? "Aprovação automática." : "", needsApproval: false };
  }
  const match = cfg.tiers
    .filter((t) => percent >= t.min_percent && (t.max_percent == null || percent <= t.max_percent))
    .sort((a, b) => b.min_percent - a.min_percent)[0];
  const authority = match?.authority ?? "auto";
  if (authority === "auto") return { authority: "auto", hint: "Aprovação automática.", needsApproval: false };
  return {
    authority,
    hint: `Precisa de aprovação ${authority === "ceo" ? "do CEO" : "do gestor"}.`,
    needsApproval: true,
  };
}

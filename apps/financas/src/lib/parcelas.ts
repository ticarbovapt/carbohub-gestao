// ─────────────────────────────────────────────────────────────────────────────
// Parcelas a partir do PRAZO DE PAGAMENTO do pedido (`carboze_orders.payment_terms`).
//
// O campo é TEXTO LIVRE do `/vender`, e chega escrito de vários jeitos:
//   "Boleto faturado (30/60)" · "(30\60)" · "(30 60)" · "(30/60 dias)"
//   "Cartão de crédito 11x" · "10x" · "PIX" · "Boleto à vista" · "Cartão de débito"
//
// ⚠️ Texto que não se reconhece devolve `null` — NUNCA um palpite. O cálculo
// antigo pegava o PRIMEIRO número do texto como "dias": "Cartão 3x" virava um
// título vencendo em 3 dias, e "(30/60)" virava UM título de valor cheio em 30.
// Vencimento inventado é pior que vencimento em branco: o branco a tela pede,
// o inventado entra no fluxo de caixa como fato.
//
// ⚠️ Centavos: o total é dividido em CENTAVOS e a sobra vai para a ÚLTIMA
// parcela — a soma das parcelas fecha exato com o total do pedido.
// ─────────────────────────────────────────────────────────────────────────────

import { somarDias } from "@/lib/datas";

export interface Parcela {
  /** 1, 2, 3… */
  numero: number;
  /** quantas parcelas no total */
  de: number;
  /** `AAAA-MM-DD` */
  vencimento: string;
  valor: number;
}

const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");

/**
 * Os prazos, em dias a partir da data-base, que o texto declara.
 * `null` = não reconhecido.
 */
export function prazosDoTexto(paymentTerms: string | null | undefined): number[] | null {
  if (!paymentTerms) return null;
  const t = semAcento(paymentTerms).toLowerCase().replace(/\s+/g, " ").trim();
  if (!t) return null;

  // À vista: vence na data-base.
  if (/\bdebito\b/.test(t)) return [0];
  if (/\bpix\b/.test(t)) return [0];
  if (/\ba ?vista\b/.test(t)) return [0];
  if (/\bdinheiro\b/.test(t)) return [0];

  // Cartão de crédito em N vezes ("11x", "Cartão de crédito 2x", "10 x"):
  // a operadora repassa uma parcela a cada 30 dias, a primeira em 30.
  const vezes = t.match(/\b(\d{1,2}) ?x\b/);
  if (vezes) {
    const n = Number(vezes[1]);
    if (n < 1 || n > 24) return null;
    return Array.from({ length: n }, (_, i) => 30 * (i + 1));
  }

  // Lista de dias: "(30/60)", "(30\60)", "(30 60)", "(30/60 dias)", "30/60/90",
  // "boleto 28 dias". Dentro dos parênteses se houver; senão o texto inteiro,
  // desde que ele seja SÓ isso (palavras conhecidas + números).
  const par = t.match(/\(([^)]*)\)/);
  let miolo: string;
  if (par) {
    const fora = t.replace(par[0], " ").replace(/\b(boleto|bancario|faturado|prazo)\b/g, " ").trim();
    if (fora) return null; // texto desconhecido fora dos parênteses
    miolo = par[1];
  } else {
    miolo = t.replace(/\b(boleto|bancario|faturado|prazo)\b/g, " ");
  }
  miolo = miolo
    .replace(/(\d) ?(dias|dia|ddl|dd|d)\b/g, "$1 ") // "30d", "30 dias"
    .replace(/\b(dias|dia|ddl|dd|d)\b/g, " ")
    .trim();
  if (!miolo) return null;
  const partes = miolo.split(/[\s/\\,;\-]+/).filter(Boolean);
  if (!partes.length || !partes.every((p) => /^\d{1,3}$/.test(p))) return null;
  const dias = partes.map(Number);
  // Prazos têm de CRESCER: "(60/30)" ou "(30/30)" não tem leitura segura.
  for (let i = 1; i < dias.length; i++) if (dias[i] <= dias[i - 1]) return null;
  if (dias.some((d) => d > 365)) return null;
  return dias;
}

/**
 * As parcelas de um pedido: prazo, total e a data-base (`AAAA-MM-DD`, o dia da
 * venda/faturamento). `null` = prazo não reconhecido — a tela pede o vencimento.
 */
export function parcelasDoPrazo(
  paymentTerms: string | null | undefined,
  total: number,
  baseISO: string,
): Parcela[] | null {
  const dias = prazosDoTexto(paymentTerms);
  if (!dias) return null;
  const centavos = Math.round(Number(total || 0) * 100);
  if (centavos <= 0) return [];
  const n = dias.length;
  const cada = Math.floor(centavos / n);
  const sobra = centavos - cada * n;
  return dias.map((d, i) => ({
    numero: i + 1,
    de: n,
    vencimento: somarDias(baseISO, d),
    valor: (cada + (i === n - 1 ? sobra : 0)) / 100,
  }));
}

/** O texto que vai em `receivables.notes` — não existe coluna de parcela. */
export const notaDaParcela = (p: { numero: number; de: number }, orderNumber: string | null) =>
  `Parcela ${p.numero}/${p.de} · ${orderNumber || "pedido sem número"}`;

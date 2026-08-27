// ─────────────────────────────────────────────────────────────────────────────
// As parcelas do pedido no Bling — e o total que elas TÊM de somar
//
// ⚠️ O caso real que originou este arquivo (27/08/2026, pedido V2026080089,
// R$ 2.088,00, boleto 30/60 em 2x). O Bling recusou a venda inteira:
//
//     VALIDATION_ERROR — code 22
//     "O somatório do valor das parcelas difere do total da venda"
//     element: "parcelas", namespace: "VENDAS"
//
// O `bling-sync` calculava as parcelas a partir de `order.total` — o total do
// PEDIDO no nosso banco — enquanto o Bling as confere contra o total da NOTA,
// que ele deriva do que recebe:
//
//     total da venda = Σ(item.valor × item.quantidade) − desconto + frete
//
// (é a forma da própria resposta dele: `totalProdutos`, `totalDesconto`,
// `totalFrete`, `total`.)
//
// Três coisas fazem os dois divergirem, e a terceira é a que apareceu:
//   1. o frete vai no payload e entra no total do Bling;
//   2. o desconto do pedido idem;
//   3. ⚠️ com BONIFICAÇÃO, as linhas do brinde SAEM deste pedido e vão para uma
//      remessa separada (natureza "Remessa em bonificação" — a natureza é
//      propriedade do PEDIDO, não da nota). Mas `order.total` continua sendo o
//      do pedido inteiro. Por isso o erro só aparecia nos pedidos que geram
//      DUAS notas.
//
// ── A decisão ─────────────────────────────────────────────────────────────
//
// A base das parcelas é derivada do PAYLOAD que está sendo enviado, nunca de
// uma segunda fonte. Duas contas que precisam coincidir acabam divergindo; uma
// conta só não tem como.
// ─────────────────────────────────────────────────────────────────────────────

export interface ItemBling {
  quantidade?: number | string;
  valor?: number | string;
}

export interface Parcela {
  dataVencimento: string;
  valor: number;
  formaPagamento: { id: number };
}

/** Arredonda para centavos sem carregar erro de ponto flutuante. */
const cent = (v: number) => Math.round(v * 100) / 100;

/**
 * O total que o Bling vai calcular para esta venda.
 *
 * ⚠️ É esta função que define o que as parcelas somam. Ela recebe exatamente os
 * mesmos números que vão no POST — se o payload mudar, ela muda junto.
 */
export function totalDaVenda(
  itens: ItemBling[], desconto: unknown = 0, frete: unknown = 0,
): number {
  const soma = (itens ?? []).reduce(
    (s, it) => s + (Number(it?.valor) || 0) * (Number(it?.quantidade) || 0), 0);
  return cent(soma - (Number(desconto) || 0) + (Number(frete) || 0));
}

/**
 * Reparte o total nas parcelas do cronograma.
 *
 * ⚠️ A sobra de centavos vai na ÚLTIMA parcela, e é isso que garante o
 * somatório exato. R$ 100,00 em 3x é 33,33 + 33,33 + 33,34 — dividir e
 * arredondar cada uma daria 99,99 ou 100,02, e o Bling recusa os dois.
 *
 * É a mesma aritmética do rateio de desconto do `quotePdf.ts`, pela mesma
 * razão: o total impresso tem de fechar com as linhas que o compõem.
 */
export function repartirParcelas(
  total: number, vencimentos: string[], formaPagamentoId: number,
): Parcela[] {
  const n = vencimentos.length;
  if (n === 0) return [];
  const alvo = cent(total);
  // Piso, não arredondamento: com arredondamento para cima a soma das n−1
  // primeiras poderia passar do total e a última ficaria NEGATIVA.
  const cada = Math.floor((alvo / n) * 100) / 100;
  return vencimentos.map((dataVencimento, i) => ({
    dataVencimento,
    valor: i === n - 1 ? cent(alvo - cada * (n - 1)) : cada,
    formaPagamento: { id: formaPagamentoId },
  }));
}

/** A soma das parcelas, para conferir contra o total antes de enviar. */
export function somaParcelas(parcelas: Parcela[]): number {
  return cent((parcelas ?? []).reduce((s, p) => s + (Number(p?.valor) || 0), 0));
}

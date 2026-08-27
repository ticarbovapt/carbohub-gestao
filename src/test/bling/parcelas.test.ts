import { describe, it, expect } from "vitest";
import {
  totalDaVenda, repartirParcelas, somaParcelas,
} from "../../../supabase/functions/_shared/blingParcelas";

/**
 * ⚠️ O caso real está no primeiro teste. Pedido V2026080089, 27/08/2026, boleto
 * 30/60 em 2x: o Bling recusou a venda inteira com
 *
 *     code 22 — "O somatório do valor das parcelas difere do total da venda"
 *
 * porque as parcelas saíam de `order.total` (o pedido inteiro) enquanto a nota
 * levava só os itens PAGOS — as linhas de bonificação vão numa remessa
 * separada, com outra natureza de operação.
 */

const FORMA = 12345;
const VENC2 = ["2026-09-26", "2026-10-26"];

describe("o caso real: pedido com bonificação gera duas notas", () => {
  it("a base é a da nota PAGA, não a do pedido inteiro", () => {
    // O pedido tem quatro linhas; duas são o gêmeo de bonificação e saem daqui.
    const itensPagos = [
      { quantidade: 10, valor: 133.68 },
      { quantidade: 4,  valor: 187.80 },
    ];
    const total = totalDaVenda(itensPagos);
    expect(total).toBe(2088.0);

    const parcelas = repartirParcelas(total, VENC2, FORMA);
    // ⚠️ A condição que o Bling confere, e a única que importa.
    expect(somaParcelas(parcelas)).toBe(total);
  });

  it("as linhas de bonificação vão a ZERO e não mudam o total", () => {
    const comBonificacao = [
      { quantidade: 10, valor: 133.68 },
      { quantidade: 10, valor: 0 },      // o gêmeo, já zerado no payload
    ];
    expect(totalDaVenda(comBonificacao)).toBe(1336.8);
  });
});

describe("o total é o que o Bling calcula, não o do nosso banco", () => {
  it("desconto do pedido ABATE", () => {
    expect(totalDaVenda([{ quantidade: 2, valor: 100 }], 30)).toBe(170);
  });

  it("frete SOMA", () => {
    expect(totalDaVenda([{ quantidade: 2, valor: 100 }], 0, 45.9)).toBe(245.9);
  });

  it("desconto e frete juntos", () => {
    expect(totalDaVenda([{ quantidade: 2, valor: 100 }], 30, 45.9)).toBe(215.9);
  });

  it("aceita número em texto, que é como o payload às vezes chega", () => {
    expect(totalDaVenda([{ quantidade: "3", valor: "19.90" }] as never)).toBe(59.7);
  });

  it("lista vazia é zero, não erro", () => {
    expect(totalDaVenda([])).toBe(0);
  });
});

describe("⚠️ a soma das parcelas fecha SEMPRE — é o que o Bling recusa", () => {
  const casos: Array<[number, number]> = [
    [100, 3],        // 33,33 + 33,33 + 33,34
    [2088, 2],
    [0.03, 2],
    [0.01, 3],       // não dá para dividir: as duas primeiras vão a zero
    [1336.8, 7],
    [15200, 6],
    [59.9, 4],
    [1047, 3],
  ];

  for (const [total, n] of casos) {
    it(`R$ ${total} em ${n}x soma exatamente ${total}`, () => {
      const venc = Array.from({ length: n }, (_, i) => `2026-0${(i % 9) + 1}-10`);
      const p = repartirParcelas(total, venc, FORMA);
      expect(p).toHaveLength(n);
      expect(somaParcelas(p)).toBe(total);
      // ⚠️ Nenhuma parcela negativa. Arredondar para CIMA nas n−1 primeiras
      // faria a última virar negativa em alguns valores, e o Bling recusa.
      for (const x of p) expect(x.valor).toBeGreaterThanOrEqual(0);
    });
  }

  it("a sobra de centavos cai na ÚLTIMA parcela", () => {
    const p = repartirParcelas(100, ["a", "b", "c"], FORMA);
    expect(p.map((x) => x.valor)).toEqual([33.33, 33.33, 33.34]);
  });

  it("valor que divide exato não cria sobra", () => {
    const p = repartirParcelas(300, ["a", "b", "c"], FORMA);
    expect(p.map((x) => x.valor)).toEqual([100, 100, 100]);
  });

  it("uma parcela só leva o total inteiro", () => {
    const p = repartirParcelas(1234.56, ["a"], FORMA);
    expect(p).toHaveLength(1);
    expect(p[0].valor).toBe(1234.56);
  });

  it("sem vencimento não há parcela — e não é erro", () => {
    expect(repartirParcelas(500, [], FORMA)).toEqual([]);
  });

  it("a forma de pagamento vai em todas", () => {
    const p = repartirParcelas(90, ["a", "b"], FORMA);
    expect(p.every((x) => x.formaPagamento.id === FORMA)).toBe(true);
  });

  it("o vencimento é preservado na ordem", () => {
    const p = repartirParcelas(90, VENC2, FORMA);
    expect(p.map((x) => x.dataVencimento)).toEqual(VENC2);
  });
});

describe("⚠️ ponto flutuante não pode vazar", () => {
  it("0,1 + 0,2 não vira 0,30000000000000004", () => {
    expect(totalDaVenda([{ quantidade: 1, valor: 0.1 }, { quantidade: 1, valor: 0.2 }]))
      .toBe(0.3);
  });

  it("a soma das parcelas é comparável com ===", () => {
    for (const total of [0.1, 0.7, 1.1, 19.9, 199.99, 12345.67]) {
      const p = repartirParcelas(total, ["a", "b", "c"], FORMA);
      expect(somaParcelas(p)).toBe(total);
    }
  });
});

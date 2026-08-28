import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  linhasDaPayt, statusDaPayt, reais, dataDeBrasilia,
} from "../../../supabase/functions/_shared/paytPedido.ts";

// ─────────────────────────────────────────────────────────────────────────────
// ⚠️ Estes fixtures são PAYLOADS REAIS de produção da PayT, não exemplos da
// documentação. É a diferença que o `_shared/shopeePedido.ts` não teve: lá os
// caminhos dos campos vieram da doc, e quando o SKU voltou vazio ninguém sabia
// dizer se era campo com outro nome ou anúncio sem cadastro.
//
// Se a PayT mudar o formato, é AQUI que se descobre — não em produção, contando
// venda errada.
// ─────────────────────────────────────────────────────────────────────────────

const fx = (nome: string) =>
  JSON.parse(readFileSync(join(__dirname, "fixtures", `${nome}.json`), "utf-8"));

describe("PayT · centavos", () => {
  it("converte inteiro de centavos para reais", () => {
    expect(reais(21272)).toBe(212.72);
    expect(reais(1500)).toBe(15);
    expect(reais(0)).toBe(0);
  });

  // ⚠️ O erro que mais custa caro aqui: usar o inteiro direto dá faturamento
  // ×100, e ninguém desconfia no primeiro dia porque "vendeu bem".
  it("NÃO devolve o inteiro cru", () => {
    expect(reais(22392)).not.toBe(22392);
  });

  it("valor ausente ou lixo vira 0, não NaN", () => {
    expect(reais(undefined)).toBe(0);
    expect(reais("abc")).toBe(0);
  });
});

describe("PayT · data sem fuso é Brasília", () => {
  it("interpreta como -03:00, não como UTC", () => {
    // 13:47 em Brasília = 16:47 UTC.
    expect(dataDeBrasilia("2020-07-10 13:47:17")).toBe("2020-07-10T16:47:17.000Z");
  });

  // ⚠️ O caso que quebra o painel do dia: venda das 21h30 vira o dia SEGUINTE
  // se a data for lida como UTC.
  it("venda da noite não pula para o dia seguinte", () => {
    const iso = dataDeBrasilia("2026-08-28 21:30:00")!;
    const emBrasilia = new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
    expect(emBrasilia).toBe("28/08/2026");
  });

  it("formato irreconhecível devolve null, nunca a data de hoje disfarçada", () => {
    expect(dataDeBrasilia("ontem")).toBeNull();
    expect(dataDeBrasilia(null)).toBeNull();
  });
});

describe("PayT · status", () => {
  it("traduz o que conhecemos", () => {
    expect(statusDaPayt("paid")).toBe("paid");
    expect(statusDaPayt("waiting_payment")).toBe("pending");
    expect(statusDaPayt("canceled")).toBe("cancelled");
  });

  // Faturada e o ciclo logístico já são venda: a mercadoria saiu ou está saindo.
  it("faturada e ciclo logístico contam como venda", () => {
    for (const s of ["billed", "separation", "collected", "shipping", "shipped"]) {
      expect(statusDaPayt(s)).toBe("shipped");
    }
  });

  // ⚠️ Enum ABERTO. A PayT cria status sem avisar; perder a venda é pior que
  // guardar um rótulo que ainda não sabemos ler.
  it("status desconhecido passa cru em vez de virar 'pending' por engano", () => {
    expect(statusDaPayt("status_que_ainda_nao_existe")).toBe("status_que_ainda_nao_existe");
  });
});

describe("PayT · o que NÃO vira pedido", () => {
  // Vem com transaction_id null e sem `transaction`. Virar linha aqui inflaria
  // a contagem de vendas e dispararia o som de venda para todo o time.
  it("carrinho perdido não entra em ecommerce_orders", () => {
    const { linhas, motivo } = linhasDaPayt(fx("lost_cart"));
    expect(linhas).toHaveLength(0);
    expect(motivo).toContain("carrinho perdido");
  });

  it("venda de homologação (test: true) não entra", () => {
    const { linhas } = linhasDaPayt({ ...fx("credit_card"), test: true });
    expect(linhas).toHaveLength(0);
  });

  it("payload vazio não explode e não inventa pedido", () => {
    expect(linhasDaPayt({}).linhas).toHaveLength(0);
    expect(linhasDaPayt(null).linhas).toHaveLength(0);
  });
});

describe("PayT · o pedido de cartão (payload real)", () => {
  const { linhas } = linhasDaPayt(fx("credit_card"));

  it("gera UMA linha — o kit é um item vendido, não quatro", () => {
    // ⚠️ `product.items[]` são os COMPONENTES do kit (`type: "grouped"`).
    // Contá-los multiplicaria quantidade e faturamento pelo tamanho do kit.
    expect(fx("credit_card").product.items).toHaveLength(4);
    expect(linhas).toHaveLength(1);
  });

  it("a chave é <pedido>-<code>, o que faz o upsert não duplicar", () => {
    expect(linhas[0].order_id).toBe("4ZVK7L-2RVDER");
    expect(linhas[0].platform_order_number).toBe("4ZVK7L");
  });

  it("o SKU vai como TEXTO — zero à esquerda não pode sumir", () => {
    expect(linhas[0].product_sku).toBe("9001");
    // O componente traz "0001": virar número apagaria os zeros e o mapa
    // deixaria de casar, sem erro nenhum.
    expect(fx("credit_card").product.items[0].sku).toBe("0001");
  });

  it("converte os centavos", () => {
    expect(linhas[0].unit_price).toBe(223.92);
    expect(linhas[0].total).toBe(223.92);
  });

  it("marca como pago e no fuso certo", () => {
    expect(linhas[0].status).toBe("paid");
    expect(linhas[0].ordered_at).toBe("2020-07-10T16:47:17.000Z");
  });
});

describe("PayT · order bump", () => {
  // ⚠️ O fixture real de order bump vem com `test: true` — é uma venda de
  // homologação. Isto NÃO é detalhe do teste: foi a trava de `test` que o
  // rejeitou quando escrevi este arquivo esperando 2 linhas, e é exatamente o
  // comportamento que se quer. Para exercitar a forma do bump, tiro a marca.
  const bruto = { ...fx("order_bump"), test: false };
  const { linhas } = linhasDaPayt(bruto);

  it("com test: true, o fixture original é recusado", () => {
    expect(fx("order_bump").test).toBe(true);
    expect(linhasDaPayt(fx("order_bump")).linhas).toHaveLength(0);
  });

  it("o bump vira uma linha própria, não some", () => {
    expect(bruto.order_bumps).toHaveLength(1);
    expect(linhas).toHaveLength(2);
  });

  it("cada linha tem chave distinta dentro do MESMO pedido", () => {
    const ids = linhas.map((l) => l.order_id);
    expect(new Set(ids).size).toBe(2);
    expect(linhas.every((l) => l.platform_order_number === linhas[0].platform_order_number)).toBe(true);
  });

  it("o bump carrega o SKU dele, não o do produto principal", () => {
    expect(linhas[0].product_sku).toBe("5da418756a44e");
    expect(linhas[1].product_sku).toBe("2c0f51e2521a4");
  });

  // ⚠️ `transaction.total_price` é do PEDIDO. Repeti-lo em cada linha
  // multiplicaria o faturamento pelo número de itens — o furo que a 20260855
  // fechou na contagem de pedidos.
  it("nenhuma linha recebe o total do pedido", () => {
    const totalDoPedido = reais(bruto.transaction.total_price);
    expect(linhas.some((l) => l.total === totalDoPedido)).toBe(false);
  });
});

describe("PayT · upsell é pedido próprio", () => {
  it("tem transaction_id próprio, então não colide com a venda original", () => {
    const { linhas } = linhasDaPayt(fx("upsell"));
    expect(linhas).toHaveLength(1);
    expect(linhas[0].platform_order_number).toBe("L9OEO4");
    expect(linhas[0].order_id).toBe("L9OEO4-BLJOOR");
  });
});

describe("PayT · os 15 payloads reais, em bloco", () => {
  const todos = [
    "bankslip", "cancelled", "cart_recovered", "credit_card", "lost_cart",
    "manual_upsell", "order_bump", "overdue_subscription", "pix",
    "reactivated_subscription", "renewed_subscription", "subscription_activated",
    "subscription_canceled", "upsell", "with_utm_sources",
  ];

  it.each(todos)("%s não derruba o parser", (nome) => {
    expect(() => linhasDaPayt(fx(nome))).not.toThrow();
  });

  it.each(todos)("%s nunca produz linha sem chave ou com valor negativo", (nome) => {
    for (const l of linhasDaPayt(fx(nome)).linhas) {
      expect(l.order_id).toMatch(/.+-.+/);
      expect(l.quantity).toBeGreaterThan(0);
      expect(l.total).toBeGreaterThanOrEqual(0);
      expect(l.platform).toBe("payt");
    }
  });
});

import { describe, it, expect } from "vitest";
import { jaEnviado } from "../../../supabase/functions/_shared/nuvemshopFulfill";

/**
 * A regra que impede o SEGUNDO e-mail.
 *
 * ⚠️ É a mais perigosa de toda a integração. Marcar um pedido como enviado
 * dispara e-mail para o cliente, e não existe desfazer um e-mail — o erro aqui
 * é irreversível, ao contrário de quase tudo neste projeto.
 *
 * A assimetria que os casos abaixo protegem: dizer "já saiu" quando não saiu
 * custa uma marcação perdida (a rodada seguinte tenta de novo); dizer "não
 * saiu" quando saiu custa um cliente recebendo dois e-mails de rastreio. Na
 * dúvida, `true`.
 */

describe("jaEnviado", () => {
  it("shipping_status fulfilled é enviado", () => {
    expect(jaEnviado({ shipping_status: "fulfilled" })).toBe(true);
  });

  it("shipping_status shipped é enviado", () => {
    expect(jaEnviado({ shipping_status: "shipped" })).toBe(true);
  });

  it("delivered é enviado", () => {
    expect(jaEnviado({ shipping_status: "delivered" })).toBe(true);
  });

  it("aceita maiúscula", () => {
    expect(jaEnviado({ shipping_status: "SHIPPED" })).toBe(true);
  });

  /**
   * ⚠️ O caso que o campo clássico não pega. A Nuvemshop mais nova registra o
   * despacho num array próprio, e `shipping_status` pode continuar vazio.
   * Olhar só o primeiro campo deixaria passar o pedido enviado pela interface
   * nova — e o cliente receberia o segundo e-mail.
   */
  it("fulfillments vale como sinal quando shipping_status não vem", () => {
    expect(jaEnviado({ shipping_status: null, fulfillments: [{ id: 1 }] })).toBe(true);
  });

  it("fulfillments vazio não é enviado", () => {
    expect(jaEnviado({ shipping_status: "unpacked", fulfillments: [] })).toBe(false);
  });

  /**
   * ⚠️ REGRESSÃO — o caso real que travava a integração inteira.
   *
   * Seis pedidos em producao vieram com `shipping_status: "unshipped"` E o
   * array `fulfillments` preenchido. A Nuvemshop o preenche quando o METODO DE
   * FRETE e escolhido, nao quando a mercadoria sai.
   *
   * A versao antiga olhava o array primeiro e devolvia `true` para os seis:
   * todo pedido virava "a loja ja registra o envio", nenhum cliente receberia
   * rastreio, e nada dava erro. Uma automacao que nunca faz nada.
   *
   * Quando `shipping_status` existe, ele decide — e ponto.
   */
  it("unshipped com fulfillments preenchido NÃO está enviado", () => {
    expect(jaEnviado({
      shipping_status: "unshipped",
      fulfillments: [{ id: 1, shipping_option: "Jadlog .Package" }],
    })).toBe(false);
  });

  it("shipping_status vence o fulfillments nos dois sentidos", () => {
    expect(jaEnviado({ shipping_status: "shipped", fulfillments: [] })).toBe(true);
    expect(jaEnviado({ shipping_status: "unshipped", fulfillments: [{}, {}] })).toBe(false);
  });

  /** Cancelado não é "enviado", mas também NÃO pode ser marcado: seria
   *  escrever por cima de uma decisão do cliente. */
  it("cancelado bloqueia a escrita", () => {
    expect(jaEnviado({ status: "cancelled" })).toBe(true);
    expect(jaEnviado({ status: "canceled" })).toBe(true);
  });

  /** O caso que DEVE passar: pago, por embalar, nada despachado. É o estado
   *  dos pedidos que esta integração existe para marcar. */
  it("pago e por embalar NÃO está enviado", () => {
    expect(jaEnviado({
      status: "open", payment_status: "paid", shipping_status: "unpacked",
    })).toBe(false);
  });

  it("o cancelado vence até o shipping_status", () => {
    // Cancelado nao pode ser tocado nem que diga "shipped": marcar seria
    // escrever por cima de uma decisao do cliente.
    expect(jaEnviado({ status: "cancelled", shipping_status: "unshipped" })).toBe(true);
  });

  it("pedido vazio não está enviado", () => {
    expect(jaEnviado({})).toBe(false);
  });

  /** ⚠️ Objeto nulo devolve false aqui, e isso é seguro porque quem chama
   *  pula a escrita quando o GET falha — o pedido nunca chega nulo a esta
   *  função com a intenção de escrever. */
  it("não estoura com null", () => {
    expect(() => jaEnviado(null)).not.toThrow();
    expect(() => jaEnviado(undefined)).not.toThrow();
  });
});

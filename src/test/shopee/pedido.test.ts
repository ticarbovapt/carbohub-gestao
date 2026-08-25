import { describe, it, expect } from "vitest";
import {
  statusDaShopee, statusLogistico, isoDeUnix, mapearPedido, lerRastreio,
} from "../../../supabase/functions/_shared/shopeePedido";

/**
 * Testes da leitura do pedido da Shopee.
 *
 * ⚠️ Estes testes NÃO provam que os caminhos dos campos estão certos — isso só
 * a primeira venda real prova. O que eles guardam são as decisões que, se
 * mudarem sem querer, produzem mentira em vez de erro:
 *
 *   · READY_TO_SHIP é PAGO, não enviado (senão o cliente recebe "está a
 *     caminho" antes de o pacote ser coletado);
 *   · o timestamp é em SEGUNDOS (senão a venda cai em 1970);
 *   · uma linha por ITEM, com item_id E model_id no sufixo (senão duas
 *     variações do mesmo produto se sobrescrevem no upsert);
 *   · devolução não é cancelamento (senão uma venda que aconteceu some).
 */

describe("statusDaShopee", () => {
  it("⚠️ READY_TO_SHIP e PROCESSED são PAGOS, não enviados", () => {
    expect(statusDaShopee("READY_TO_SHIP")).toBe("paid");
    expect(statusDaShopee("PROCESSED")).toBe("paid");
    expect(statusDaShopee("RETRY_SHIP")).toBe("paid");
  });

  it("SHIPPED é o único que vira shipped", () => {
    expect(statusDaShopee("SHIPPED")).toBe("shipped");
  });

  it("entregue inclui quem ainda não confirmou recebimento", () => {
    expect(statusDaShopee("COMPLETED")).toBe("delivered");
    expect(statusDaShopee("TO_CONFIRM_RECEIVE")).toBe("delivered");
  });

  it("⚠️ TO_RETURN não é cancelamento — a venda aconteceu", () => {
    expect(statusDaShopee("TO_RETURN")).toBe("delivered");
  });

  it("cancelado é cancelado", () => {
    expect(statusDaShopee("CANCELLED")).toBe("cancelled");
    expect(statusDaShopee("IN_CANCEL")).toBe("cancelled");
  });

  it("desconhecido cai em pending, não em paid", () => {
    // Estado novo da Shopee não pode entrar na esteira como pago: pending
    // deixa o card parado e visível; paid dispara WhatsApp.
    expect(statusDaShopee("ESTADO_QUE_NAO_EXISTE")).toBe("pending");
    expect(statusDaShopee("")).toBe("pending");
  });

  it("é indiferente a caixa", () => {
    expect(statusDaShopee("shipped")).toBe("shipped");
  });
});

describe("isoDeUnix", () => {
  it("⚠️ interpreta SEGUNDOS", () => {
    expect(isoDeUnix(1700000000)).toBe("2023-11-14T22:13:20.000Z");
  });

  it("recusa o que não é data", () => {
    expect(isoDeUnix(0)).toBeNull();
    expect(isoDeUnix(null)).toBeNull();
    expect(isoDeUnix("abc")).toBeNull();
    expect(isoDeUnix(undefined)).toBeNull();
  });
});

describe("mapearPedido", () => {
  const base = {
    order_sn: "2411AB12CD34EF",
    order_status: "SHIPPED",
    create_time: 1700000000,
    total_amount: 300,
    item_list: [
      { item_id: 111, model_id: 1, item_name: "CarboZé 100ml", model_sku: "CZ100",
        model_quantity_purchased: 2, model_discounted_price: 100, model_original_price: 130 },
      { item_id: 111, model_id: 2, item_name: "CarboZé 1L", model_sku: "CZ1L",
        model_quantity_purchased: 1, model_discounted_price: 100 },
    ],
  };

  it("uma linha por item, e o pedido inteiro em platform_order_number", () => {
    const { linhas } = mapearPedido(base);
    expect(linhas).toHaveLength(2);
    expect(linhas.every((l) => l.platform_order_number === "2411AB12CD34EF")).toBe(true);
  });

  it("⚠️ o sufixo usa item_id E model_id — variações não se sobrescrevem", () => {
    const { linhas } = mapearPedido(base);
    expect(linhas[0].order_id).toBe("2411AB12CD34EF-111-1");
    expect(linhas[1].order_id).toBe("2411AB12CD34EF-111-2");
    expect(new Set(linhas.map((l) => l.order_id)).size).toBe(2);
  });

  it("⚠️ usa o preço COM desconto, não a etiqueta", () => {
    const { linhas } = mapearPedido(base);
    expect(linhas[0].unit_price).toBe(100);   // não 130
    expect(linhas[0].total).toBe(200);        // 100 × 2
  });

  it("propaga o status do pedido para todas as linhas", () => {
    const { linhas } = mapearPedido(base);
    expect(linhas.every((l) => l.status === "shipped")).toBe(true);
  });

  it("pedido sem itens vira linha única, COM aviso", () => {
    const { linhas, avisos } = mapearPedido({ ...base, item_list: [] });
    expect(linhas).toHaveLength(1);
    expect(linhas[0].order_id).toBe("2411AB12CD34EF");
    expect(linhas[0].total).toBe(300);
    expect(avisos.join(" ")).toContain("sem item_list");
  });

  it("⚠️ item sem preço legível AVISA em vez de gravar zero calado", () => {
    const { linhas, avisos } = mapearPedido({
      ...base,
      item_list: [{ item_id: 1, model_id: 0, model_quantity_purchased: 1 }],
    });
    expect(linhas[0].unit_price).toBe(0);
    expect(avisos.join(" ")).toContain("sem preço legível");
  });

  it("pedido sem order_sn é descartado com aviso, não gravado", () => {
    const { linhas, avisos } = mapearPedido({ order_status: "SHIPPED" });
    expect(linhas).toHaveLength(0);
    expect(avisos.join(" ")).toContain("order_sn");
  });

  it("create_time ausente avisa e usa o agora, para não perder o pedido", () => {
    const { linhas, avisos } = mapearPedido({ ...base, create_time: null });
    expect(avisos.join(" ")).toContain("create_time");
    expect(linhas[0].ordered_at).toBeTruthy();
  });
});

describe("statusLogistico", () => {
  it("mapeia os marcos que movem o card", () => {
    expect(statusLogistico("LOGISTICS_REQUEST_CREATED")).toBe("postado");
    expect(statusLogistico("LOGISTICS_PICKUP_DONE")).toBe("em_transito");
    expect(statusLogistico("LOGISTICS_DELIVERY_DONE")).toBe("entregue");
    expect(statusLogistico("LOGISTICS_DELIVERY_FAILED")).toBe("problema");
  });

  it("⚠️ desconhecido devolve null, e não um chute de em_transito", () => {
    expect(statusLogistico("LOGISTICS_ALGO_NOVO")).toBeNull();
    expect(statusLogistico("")).toBeNull();
  });
});

describe("lerRastreio", () => {
  const info = {
    tracking_info: [
      { update_time: 1700000000, description: "Coletado", logistics_status: "LOGISTICS_PICKUP_DONE" },
      { update_time: 1700100000, description: "Em rota" },  // sem logistics_status
      { update_time: 1700200000, description: "Entregue", logistics_status: "LOGISTICS_DELIVERY_DONE" },
    ],
  };

  it("ordena os eventos no tempo", () => {
    const r = lerRastreio("BR123", { tracking_info: [...info.tracking_info].reverse() })!;
    expect(r.eventos.map((e) => e.ocorrido_em)).toEqual([...r.eventos].sort(
      (a, b) => a.ocorrido_em.localeCompare(b.ocorrido_em)).map((e) => e.ocorrido_em));
  });

  it("⚠️ o status vem do último evento COM status, não do último evento", () => {
    // Se o último evento fosse o "Em rota" sem status, pegar o último cru
    // zeraria um envio já entregue.
    const semUltimo = { tracking_info: [info.tracking_info[0], info.tracking_info[2], info.tracking_info[1]] };
    expect(lerRastreio("BR123", semUltimo)!.status).toBe("entregue");
  });

  it("⚠️ sem código não há rastreio — devolve null", () => {
    expect(lerRastreio("", info)).toBeNull();
    expect(lerRastreio(null, info)).toBeNull();
    expect(lerRastreio("   ", info)).toBeNull();
  });

  it("código sem histórico ainda vale — o envio existe", () => {
    const r = lerRastreio("BR123", null)!;
    expect(r.codigo).toBe("BR123");
    expect(r.eventos).toEqual([]);
    expect(r.status).toBeNull();
  });

  it("evento sem data é descartado, e não vira 1970", () => {
    const r = lerRastreio("BR123", { tracking_info: [{ description: "sem data" }] })!;
    expect(r.eventos).toHaveLength(0);
  });
});

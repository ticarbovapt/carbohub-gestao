// ─────────────────────────────────────────────────────────────────────────────
// Shopee — a leitura do pedido, pura e testável
//
// ⚠️ SOBRE A CONFIANÇA DESTE ARQUIVO, dito na cara:
//
// A assinatura (shopeeAssina.ts) eu consigo provar sem rede — HMAC é
// determinístico. ISTO AQUI eu NÃO consegui conferir contra a API real: os
// caminhos dos campos (`item_list`, `model_quantity_purchased`,
// `model_discounted_price`, `package_list`) vêm da documentação, não de uma
// resposta observada. É exatamente a mesma situação do `melhorEnvioParse.ts`, e
// lá o aviso se provou justo.
//
// O modo de falha é o pior que existe: campo com nome errado devolve
// `undefined`, o `?? 0` transforma em zero, e o pedido entra com valor R$ 0,00
// sem erro nenhum. Por isso `mapearPedido` DEVOLVE `avisos` em vez de engolir —
// e o `pullShopee` loga cada um. Na primeira venda real, leia o log antes de
// acreditar no número.
// ─────────────────────────────────────────────────────────────────────────────

import type { StatusRastreio } from "./rastreio.ts";

/** O que a esteira entende. Ver o CTE `plataforma` da `bling2_esteira`:
 *  paid=1, shipped=2, delivered=3 — qualquer outra coisa é 0 e o card não anda. */
export type StatusEcommerce = "pending" | "paid" | "shipped" | "delivered" | "cancelled";

/**
 * Situação da Shopee → a nossa.
 *
 * ⚠️ `READY_TO_SHIP` e `PROCESSED` são PAGOS, não enviados. O dinheiro entrou e
 * a etiqueta ainda não saiu — mapeá-los para `shipped` faria a esteira anunciar
 * "seu pedido está a caminho" por WhatsApp para quem ainda não teve o pacote
 * coletado. A `carbo_msg_fila` dispara de verdade; um mapeamento otimista aqui
 * vira mentira no celular do cliente.
 *
 * ⚠️ `COMPLETED` é entregue E o prazo de disputa passou. `TO_CONFIRM_RECEIVE`
 * é entregue e aguardando o comprador confirmar — para o cliente, chegou. Os
 * dois viram `delivered`: quem está na porta de casa com a caixa na mão não
 * quer saber de janela de disputa.
 */
export function statusDaShopee(s: string): StatusEcommerce {
  switch (String(s ?? "").toUpperCase()) {
    case "UNPAID":              return "pending";
    case "READY_TO_SHIP":
    case "PROCESSED":
    case "RETRY_SHIP":
    case "INVOICE_PENDING":     return "paid";
    case "SHIPPED":             return "shipped";
    case "TO_CONFIRM_RECEIVE":
    case "COMPLETED":           return "delivered";
    case "IN_CANCEL":
    case "CANCELLED":           return "cancelled";
    // ⚠️ Devolução NÃO é cancelamento: o pedido foi pago, enviado e entregue, e
    // a receita existiu. Tratá-lo como cancelado apagaria uma venda que
    // aconteceu. Fica em `delivered` até existir um estado próprio.
    case "TO_RETURN":           return "delivered";
    default:                    return "pending";
  }
}

/**
 * Situação logística da Shopee → o nosso rastreio.
 *
 * Devolve `null` para o que não sabemos classificar, e `null` é tratado como
 * "sem status" pelo `gravarRastreio` — melhor que chutar `em_transito` e mover
 * o card por engano.
 */
export function statusLogistico(s: string): StatusRastreio | null {
  switch (String(s ?? "").toUpperCase()) {
    case "LOGISTICS_READY":
    case "LOGISTICS_REQUEST_CREATED": return "postado";
    case "LOGISTICS_PICKUP_DONE":     return "em_transito";
    case "LOGISTICS_DELIVERY_DONE":   return "entregue";
    case "LOGISTICS_PICKUP_FAILED":
    case "LOGISTICS_DELIVERY_FAILED": return "problema";
    case "LOGISTICS_REQUEST_CANCELED":
    case "LOGISTICS_COD_REJECTED":    return "cancelado";
    default:                          return null;
  }
}

/**
 * Unix em segundos → ISO.
 *
 * ⚠️ A Shopee devolve SEGUNDOS. `new Date(1700000000)` sem multiplicar dá
 * janeiro de 1970, e o pedido entra com data que joga o faturamento para fora
 * de qualquer janela — sem erro. Mesma família do `ordered_at::date` em UTC.
 */
export function isoDeUnix(seg: unknown): string | null {
  const n = Number(seg);
  if (!Number.isFinite(n) || n <= 0) return null;
  return new Date(n * 1000).toISOString();
}

export interface LinhaEcommerce {
  platform: "shopee";
  order_id: string;
  platform_order_number: string;
  product_sku: string | null;
  product_name: string | null;
  quantity: number;
  units_real: number;
  unit_price: number;
  total: number;
  status: StatusEcommerce;
  ordered_at: string;
  sync_source: string;
  raw: unknown;
}

export interface ResultadoMapa {
  linhas: LinhaEcommerce[];
  avisos: string[];
}

/**
 * Um pedido da Shopee vira N linhas — uma por item.
 *
 * ⚠️ UMA LINHA POR ITEM é o formato desta tabela, não um detalhe: a chave do
 * upsert é (platform, order_id) e o `order_id` leva o sufixo do item. É o que
 * deixa webhook e sync rodarem em qualquer ordem sem duplicar. Consequência
 * conhecida: `count(*)` conta ITENS, e quem quer contar pedido usa
 * `platform_order_number` (ou `ecommerce_pedido_raiz`).
 *
 * ⚠️ E o `platform_order_number` é preenchido AQUI, explicitamente. O gatilho
 * `trg_ecommerce_numero_da_loja` também passa a cobrir a Shopee, mas o painel
 * do Supabase publica uma função por vez — com o valor atribuído aqui,
 * publicar só o `ecommerce-sync` já faz o vínculo funcionar. Mesma decisão que
 * está anotada no caminho da Nuvemshop.
 */
export function mapearPedido(
  pedido: Record<string, unknown>, origem = "cron",
): ResultadoMapa {
  const avisos: string[] = [];
  const sn = String(pedido.order_sn ?? "");
  if (!sn) return { linhas: [], avisos: ["pedido sem order_sn — descartado"] };

  const status = statusDaShopee(String(pedido.order_status ?? ""));
  const ordered = isoDeUnix(pedido.create_time);
  if (!ordered) avisos.push(`${sn}: create_time ausente ou inválido`);

  const itens = Array.isArray(pedido.item_list) ? pedido.item_list as Record<string, unknown>[] : [];
  if (itens.length === 0) {
    avisos.push(`${sn}: sem item_list — gravado como linha única do pedido`);
    const total = Number(pedido.total_amount ?? 0);
    return {
      linhas: [{
        platform: "shopee", order_id: sn, platform_order_number: sn,
        product_sku: null, product_name: null,
        quantity: 1, units_real: 1, unit_price: total, total,
        status, ordered_at: ordered ?? new Date().toISOString(),
        sync_source: origem, raw: pedido,
      }],
      avisos,
    };
  }

  const linhas = itens.map((it, i) => {
    const qtd = Number(it.model_quantity_purchased ?? 1) || 1;
    // ⚠️ `model_discounted_price` é o preço UNITÁRIO já com desconto, e é o que
    // o cliente pagou. `model_original_price` é a etiqueta antes da promoção —
    // usá-lo infla o faturamento sem que nada acuse.
    const unit = Number(it.model_discounted_price ?? it.model_original_price ?? 0);
    if (!Number.isFinite(unit) || unit <= 0) {
      avisos.push(`${sn}: item ${i} sem preço legível (model_discounted_price)`);
    }
    // O sufixo usa item_id + model_id: o mesmo produto em duas variações
    // (tamanho, cor) é item_id igual e model_id diferente. Só com item_id, a
    // segunda variação sobrescreveria a primeira no upsert.
    const sufixo = `${it.item_id ?? i}-${it.model_id ?? 0}`;
    return {
      platform: "shopee" as const,
      order_id: `${sn}-${sufixo}`,
      platform_order_number: sn,
      product_sku: (it.model_sku as string) || (it.item_sku as string) || null,
      product_name: (it.item_name as string) ?? null,
      quantity: qtd,
      units_real: qtd,
      unit_price: unit,
      total: unit * qtd,
      status,
      ordered_at: ordered ?? new Date().toISOString(),
      sync_source: origem,
      raw: { ...pedido, _item: it },
    };
  });

  return { linhas, avisos };
}

export interface RastreioShopee {
  codigo: string;
  status: StatusRastreio | null;
  eventos: { ocorrido_em: string; descricao: string; status?: StatusRastreio | null }[];
}

/**
 * Lê o histórico logístico da Shopee.
 *
 * ⚠️ O código de rastreio é a CHAVE das nossas tabelas de rastreio. Sem ele não
 * há o que gravar — e a Shopee devolve pedido sem tracking_number enquanto a
 * coleta não acontece. Devolver `null` aqui é o certo: gravar uma linha com
 * código vazio criaria um envio fantasma que nenhuma consulta encontra.
 */
export function lerRastreio(
  codigo: string | null | undefined,
  info: Record<string, unknown> | null,
): RastreioShopee | null {
  const cod = String(codigo ?? "").trim();
  if (!cod) return null;

  const lista = Array.isArray(info?.tracking_info)
    ? info!.tracking_info as Record<string, unknown>[]
    : [];

  const eventos = lista
    .map((e) => {
      const quando = isoDeUnix(e.update_time);
      if (!quando) return null;
      return {
        ocorrido_em: quando,
        descricao: String(e.description ?? e.logistics_status ?? "").trim() || "Atualização",
        status: statusLogistico(String(e.logistics_status ?? "")),
      };
    })
    .filter((e): e is NonNullable<typeof e> => e !== null)
    .sort((a, b) => a.ocorrido_em.localeCompare(b.ocorrido_em));

  // ⚠️ O status do envio é o do evento MAIS RECENTE que tem status conhecido —
  // não o último evento qualquer. A Shopee intercala eventos informativos sem
  // `logistics_status`, e pegar o último cru zeraria o status de um envio que
  // já estava entregue.
  const ultimoComStatus = [...eventos].reverse().find((e) => e.status != null);

  return { codigo: cod, status: ultimoComStatus?.status ?? null, eventos };
}

// ─────────────────────────────────────────────────────────────────────────────
// A pergunta que impede o segundo e-mail: este pedido já saiu?
//
// ⚠️ Módulo PURO porque é a regra mais perigosa desta integração. Marcar como
// enviado dispara e-mail para o cliente, e não existe desfazer um e-mail — o
// erro aqui é irreversível, ao contrário de quase tudo neste projeto.
// ─────────────────────────────────────────────────────────────────────────────

// deno-lint-ignore-file no-explicit-any

/**
 * O pedido já está enviado (ou não deve ser tocado) na loja?
 *
 * ⚠️ `shipping_status` DECIDE quando existe. O `fulfillments[]` é só rede para
 * quando ele não vem.
 *
 * A primeira versão tratava `fulfillments` não-vazio como "enviado", e isso
 * estava errado de um jeito que travava a integração inteira: MEDIDO em
 * produção, seis pedidos com `shipping_status: "unshipped"` tinham o array
 * preenchido. A Nuvemshop o preenche quando o MÉTODO DE FRETE é escolhido, não
 * quando a mercadoria sai.
 *
 * O efeito era silencioso e total: `jaEnviado()` devolvia sempre `true`, todo
 * pedido virava "a loja já registra o envio", e nenhum cliente jamais receberia
 * o rastreio. Uma automação que nunca faz nada e não dá erro.
 *
 * ── A assimetria que rege esta função ────────────────────────────────────────
 *
 *   errar para `true`   custa uma marcação perdida — a rodada seguinte tenta
 *   errar para `false`  custa um cliente recebendo DOIS e-mails de rastreio
 *
 * Por isso o cancelado devolve `true` (não é "enviado", mas não pode ser
 * tocado: seria escrever por cima de uma decisão do cliente), e por isso quem
 * chama pula a escrita quando o GET falha.
 *
 * ⚠️ Mas "na dúvida, true" tem limite, e este caso é o limite: uma regra que
 * devolve `true` para TUDO não é conservadora, é quebrada.
 */
export function jaEnviado(pedido: any): boolean {
  const st = String(pedido?.status ?? "").toLowerCase();
  if (st === "cancelled" || st === "canceled") return true;

  const ship = String(pedido?.shipping_status ?? "").trim().toLowerCase();
  if (ship) {
    // O campo existe: ele é a resposta, e nada mais opina.
    return ship === "fulfilled" || ship === "shipped" || ship === "delivered";
  }

  // Sem `shipping_status`: aí sim o array vale como sinal.
  const f = pedido?.fulfillments;
  return Array.isArray(f) && f.length > 0;
}

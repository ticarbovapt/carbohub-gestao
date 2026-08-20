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
 * ⚠️ Três caminhos dizem SIM, e os três precisam existir:
 *
 *   shipping_status   o campo clássico
 *   fulfillments[]    a Nuvemshop mais nova registra o despacho aqui, e o
 *                     `shipping_status` pode continuar vazio. Olhar só o
 *                     primeiro deixaria passar o pedido já enviado pela
 *                     interface nova — e o cliente receberia o segundo e-mail.
 *   status cancelled  cancelado não é "enviado", mas também NÃO pode ser
 *                     marcado: seria escrever por cima de uma decisão do
 *                     cliente.
 *
 * A ausência de dado conta como SIM em quem chama (GET que falha pula a
 * escrita). Na dúvida sobre o estado, não escrever é o erro barato.
 */
export function jaEnviado(pedido: any): boolean {
  const ship = String(pedido?.shipping_status ?? "").toLowerCase();
  if (ship === "fulfilled" || ship === "shipped" || ship === "delivered") return true;

  const f = pedido?.fulfillments;
  if (Array.isArray(f) && f.length > 0) return true;

  const st = String(pedido?.status ?? "").toLowerCase();
  if (st === "cancelled" || st === "canceled") return true;

  return false;
}

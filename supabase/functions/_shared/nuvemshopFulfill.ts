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
 * ⚠️ QUALQUER sinal positivo basta. `shipping_status: "unshipped"` NÃO conta
 * como negativa — e essa distinção custou um erro de ida e volta.
 *
 * ── O que foi medido, na ordem em que se aprendeu ────────────────────────────
 *
 * 1. Seis pedidos vieram do GET com `shipping_status: "unshipped"` e o array
 *    `fulfillments` PREENCHIDO. Concluí que o array era lixo (preenchido ao
 *    escolher o frete) e reescrevi para o `shipping_status` decidir.
 *
 * 2. O painel da loja foi conferido, pedido #330: **"Enviada"**. Ou seja, os
 *    seis ESTÃO enviados, o array estava certo, e o `shipping_status` é que é
 *    o campo não confiável — ele fica em "unshipped" mesmo depois do despacho.
 *
 * A reescrita, se a fila não estivesse vazia, teria mandado e-mail de rastreio
 * duplicado para gente que já tinha recebido. Só não custou porque a automação
 * estava desligada e a fila, vazia.
 *
 * ── A regra que resta ────────────────────────────────────────────────────────
 *
 * Positivo vence; ausência de positivo é o único "não". Isso vem da assimetria:
 *
 *   errar para `true`   custa uma marcação perdida — a rodada seguinte tenta
 *   errar para `false`  custa um cliente recebendo DOIS e-mails de rastreio
 *
 * E o cancelado devolve `true` porque não pode ser tocado: marcar como enviado
 * um pedido que o cliente cancelou é escrever por cima da decisão dele.
 */
export function jaEnviado(pedido: any): boolean {
  const st = String(pedido?.status ?? "").toLowerCase();
  if (st === "cancelled" || st === "canceled") return true;

  // ⚠️ O sinal MODERNO, e o que o painel realmente lê. Verificado contra o
  // pedido #330, que aparece como "Enviada" com `shipping_status: "unshipped"`.
  const f = pedido?.fulfillments;
  if (Array.isArray(f) && f.length > 0) return true;

  const ship = String(pedido?.shipping_status ?? "").trim().toLowerCase();
  return ship === "fulfilled" || ship === "shipped" || ship === "delivered";
}

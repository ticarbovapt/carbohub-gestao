// ═══════════════════════════════════════════════════════════════════════════
// Quais pedidos podem receber uma NF — UMA lista, um lugar
//
// ── O que aconteceu em 03/09/2026 ────────────────────────────────────────
//
// A NF 000412 (GUARAVES, R$ 2.600,00) estava órfã. O pedido `V2026080116`,
// do mesmo cliente e do mesmo valor, aparecia na aba "Do Bling" marcado
// "Sem NF" — e o modal "Vincular NF a um pedido" respondia
// **"Nenhum pedido sem NF encontrado"** com o número digitado inteiro.
//
// Não havia erro em lugar nenhum. Eram DUAS listas para a MESMA pergunta:
//
//     useFaturamento     pending, confirmed, invoiced, shipped, delivered
//     useLinkableOrders           confirmed, invoiced, shipped, delivered
//     useNfeLinkSuggestions       confirmed, invoiced, shipped, delivered
//
// `pending` estava na primeira e fora das outras duas. Ou seja: a tela LISTAVA
// o pedido e o buscador NEGAVA a existência dele. Quem opera conclui que o
// pedido não existe, ou que o sistema está quebrado — e a NF fica órfã.
//
// É o mesmo defeito que este repositório já pagou várias vezes: a lista de
// etapas do pós-venda que o Sales tinha pela metade (pedido sumia do quadro),
// a lista de interfaces internas em três lugares, o `ALLOWED_ORIGINS` copiado
// nas três funções do WhatsApp, e a cópia de `ecommerce_status_e_venda` sem
// `lower()` dentro do ensaio de estoque.
//
// ── Por que a lista é "tudo menos cancelado" ─────────────────────────────
//
// `carboze_orders.status` tem seis valores: pending, confirmed, invoiced,
// shipped, delivered e cancelled. Emitir/vincular NF de pedido CANCELADO é a
// única combinação que não faz sentido — todas as outras são pedido vivo, em
// alguma etapa, que pode legitimamente ter uma nota.
//
// ⚠️ O comentário antigo justificava o corte com "pra não trazer rascunho/novo
// à toa". Não existe status de rascunho nesta tabela: `pending` é pedido
// AGUARDANDO faturamento — exatamente aquele que precisa de NF. O corte
// removia o alvo em vez do ruído.
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Status de pedido que pode ter (ou receber) nota fiscal.
 *
 * ⚠️ Use SEMPRE esta constante ao consultar `carboze_orders` para faturamento
 * ou vínculo de NF. Escrever o array à mão é o que produziu o defeito de
 * 03/09 — e a divergência não dá erro, dá pedido invisível.
 */
export const STATUS_COM_NF_POSSIVEL = [
  "pending",    // aguardando faturamento — é o que MAIS precisa de NF
  "confirmed",
  "invoiced",
  "shipped",
  "delivered",
] as const;

/**
 * O único status que NÃO pode receber NF. Existe nomeado para que a exclusão
 * seja uma decisão legível, e não um array que alguém copia pela metade.
 */
export const STATUS_SEM_NF = "cancelled" as const;

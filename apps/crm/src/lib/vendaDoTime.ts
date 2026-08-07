/**
 * "Esta venda é do time?" — regra ÚNICA do app do Sales.
 *
 * A ponte do Bling 2 traz para `carboze_orders` os pedidos de marketplace já
 * faturados. Eles precisam existir ali: alimentam o Comercial do admin, a
 * esteira do on-line e o follow-up. Mas o Sales é a tela de QUEM VENDE —
 * marketplace ali infla o faturamento do mês e apaga a leitura de quem fez o
 * quê.
 *
 * ⚠️ O corte é por `segmento = 'online'`, NÃO pela origem do dado. Pedido do
 * Bling 2 que é venda direta (loja 0, balcão) CONTINUA aparecendo, porque é
 * venda de gente — foi o caso do BLING2-145, de R$ 16.800. E venda nativa que
 * alguém marcou como on-line também continua: ela teve vendedor.
 *
 * O filtro NÃO vai na view `carbo_vendas_metrica`: ela é compartilhada com o
 * admin, que precisa enxergar o on-line (tem aba própria para ele). Regra de
 * tela mora na tela.
 */

/** Filtro PostgREST para usar em `.or(...)`.
 *
 * Os quatro termos são a negação de "(veio do Bling 2) E (é on-line)":
 *     NÃO(A E B) = (NÃO A) OU (NÃO B)
 *
 * Cada NÃO precisa do `is.null` junto porque, no Postgres, `coluna <> 'x'` é
 * NULO — e não verdadeiro — quando a coluna é nula. Sem os dois `is.null`,
 * toda venda sem `source_file` (ou seja, quase todas as vendas do time)
 * sumiria da tela. Não "simplifique" para dois termos.
 */
export const FILTRO_VENDA_DO_TIME =
  "source_file.is.null,source_file.neq.bling2_bridge,segmento.is.null,segmento.neq.online";

/** Mesma regra, para filtrar em memória o que veio de uma RPC. */
export function ehVendaDoTime(row: { source_file?: string | null; segmento?: string | null }): boolean {
  return !(row?.source_file === "bling2_bridge" && row?.segmento === "online");
}

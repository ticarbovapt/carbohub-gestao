/**
 * "Esta venda é do time?" — regra ÚNICA do app do Sales.
 *
 * Marketplace não aparece nas telas de quem vende. A ponte do Bling 2 traz
 * esses pedidos para `carboze_orders` — eles precisam existir ali, para o
 * Comercial do admin, a esteira do on-line e o follow-up —, mas somá-los ao
 * faturamento do mês do time infla o número e apaga a leitura de quem fez o
 * quê. O mesmo vale para os pedidos on-line que vêm do Bling 1.
 *
 * ── Por que a condição tem DUAS partes ────────────────────────────────────
 *
 * Cortar só por `segmento = 'online'` teria um efeito colateral silencioso: o
 * gatilho `carbo_set_segmento_pdv` HERDA o canal quando o histórico do CNPJ é
 * unânime. Cliente que só comprou por marketplace tem histórico 100% on-line —
 * então uma venda nova, feita por um vendedor para esse mesmo CNPJ, nasceria
 * marcada como on-line e sumiria da tela dele. Sem erro, sem aviso: a venda
 * simplesmente não estaria lá.
 *
 * A guarda é o vendedor. Pedido de marketplace nunca tem `vendedor_id` (a
 * ponte não atribui ninguém); venda feita por gente sempre tem. Então sai da
 * tela o que é on-line E não tem vendedor.
 *
 * ⚠️ O filtro NÃO vai na view `carbo_vendas_metrica`: ela é compartilhada com
 * o admin, que precisa enxergar o on-line e tem aba própria para ele. Regra de
 * tela mora na tela.
 */

/** Filtro PostgREST para usar em `.or(...)`.
 *
 * Os termos são a negação de "(é on-line) E (não tem vendedor)":
 *     NÃO(A E B) = (NÃO A) OU (NÃO B)
 *
 * O `segmento.is.null` existe porque, no Postgres, `coluna <> 'x'` é NULO — e
 * não verdadeiro — quando a coluna é nula. Sem ele, toda venda sem canal
 * classificado (a maioria) sumiria da tela. Não "simplifique" removendo-o.
 */
export const FILTRO_VENDA_DO_TIME =
  "segmento.is.null,segmento.neq.online,vendedor_id.not.is.null";

/** Mesma regra, para filtrar em memória o que veio de uma RPC. */
export function ehVendaDoTime(row: { segmento?: string | null; vendedor_id?: string | null }): boolean {
  return !(row?.segmento === "online" && !row?.vendedor_id);
}

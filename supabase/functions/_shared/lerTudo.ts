// Leitura que ESCALA — cópia, para as edge functions, de `lerSemTeto` e
// `lerPorIdsSemTeto` do `packages/shell/src/leitura.ts` (as funções não
// importam `@carbo/shell`). MESMA API e MESMO comportamento: mudou lá, mude aqui.
//
// ⚠️ O PostgREST corta toda resposta em 1.000 linhas e NÃO AVISA: não há erro,
// não há campo "truncado", a resposta parece completa. Vale para tabela, view
// e RPC `returns setof`/`table` — e vale TAMBÉM com service role. E
// `.limit(5000)` NÃO fura o teto: vira 1.000 do mesmo jeito. O defeito é
// invisível até o volume cruzar — foi assim que o Dashboard Comercial perdeu
// meses inteiros, o Carbo Chat congelou num dia e a busca de Conversas deu
// "0 de 435" para quem tinha recebido mensagem.
//
//   lerSemTeto        lê TODAS as linhas, em páginas de 1.000
//   lerPorIdsSemTeto  `.in(coluna, ids)` em lotes (URL longa estoura) e cada
//                     lote lido sem teto
//
// ⚠️ ORDEM ESTÁVEL é obrigatória ao paginar: a última coluna do `.order()` tem
// de ser única (`id`). Com empate (DATE, status), a mesma linha volta em duas
// páginas e outra em nenhuma — número LIGEIRAMENTE errado, que ninguém nota.
// ⚠️ Isto não é filtro. Conjunto grande se encolhe no `where`, ou é agregado
// no BANCO (view/RPC que devolve o total, não as linhas).
// ⚠️ Lote de trabalho por rodada (`.limit(40)` que a próxima rodada continua)
// NÃO passa por aqui: ali o teto é de propósito, para caber no tempo da função.

/* eslint-disable @typescript-eslint/no-explicit-any */

/** O teto do PostgREST neste projeto (Supabase → API → Max rows). */
export const TETO_POSTGREST = 1000;

// Sem teto de sanidade, um filtro esquecido baixa a tabela inteira e trava a
// função. Falhar alto e explicando é melhor que rodar para sempre.
const TETO_ABSURDO = 200_000;

/**
 * Lê todas as linhas. `montar` devolve a consulta SEM `.range()` — este helper
 * põe o `.range()` de cada página. Erro SOBE: leitura que falha não vira [].
 *
 *   const pedidos = await lerSemTeto<Pedido>(() =>
 *     supabase.from("carboze_orders").select("id,total")
 *       .gte("created_at", de).order("created_at").order("id"));
 */
export async function lerSemTeto<T = any>(montar: () => any, pagina = TETO_POSTGREST): Promise<T[]> {
  const tudo: T[] = [];
  for (let de = 0; ; de += pagina) {
    const { data, error } = await montar().range(de, de + pagina - 1);
    if (error) throw new Error(error.message);
    const lote = (data ?? []) as T[];
    tudo.push(...lote);
    // Página incompleta = acabou. É o único sinal confiável de fim.
    if (lote.length < pagina) return tudo;
    if (tudo.length >= TETO_ABSURDO) {
      throw new Error(
        `Leitura passou de ${TETO_ABSURDO.toLocaleString("pt-BR")} linhas — falta filtro na consulta, não é volume real.`,
      );
    }
  }
}

/**
 * `.in(coluna, ids)` em lotes, cada lote lido sem teto. Ids repetidos saem.
 *
 *   const itens = await lerPorIdsSemTeto<Item>(ids, (lote) =>
 *     supabase.from("itens").select("*").in("pedido_id", lote).order("id"));
 *
 * ⚠️ Lote de ids NÃO é lote de linhas: 100 pedidos podem ter 700 itens.
 */
export async function lerPorIdsSemTeto<T = any, I = string | number>(
  ids: readonly I[],
  montar: (lote: I[]) => any,
  tamanhoDoLote = 100,
): Promise<T[]> {
  const unicos = [...new Set(ids.filter((x) => x !== null && x !== undefined))];
  if (unicos.length === 0) return [];
  const partes: T[][] = [];
  // Em SÉRIE de propósito: N lotes em paralelo são N consultas simultâneas no
  // banco — é o pico que derruba quando todo mundo abre a tela.
  for (let i = 0; i < unicos.length; i += tamanhoDoLote) {
    const lote = unicos.slice(i, i + tamanhoDoLote);
    partes.push(await lerSemTeto<T>(() => montar(lote)));
  }
  return partes.flat();
}

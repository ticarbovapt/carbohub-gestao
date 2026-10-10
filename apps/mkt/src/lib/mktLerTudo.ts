// Leitura SEM TETO do PostgREST.
//
// ⚠️ Consulta sem `.range()` não devolve tudo: devolve 1.000 linhas e NÃO
// avisa. O quadro importado do Trello passa de 1.000 comentários, então o "12"
// de comentários na frente de um cartão podia ser 0 em outro, calado — a
// família do teto que já escondeu meses inteiros no Dashboard Comercial.
// ⚠️ A ordem TEM de ser estável (coluna única ou chave composta inteira), senão
// a mesma linha volta em duas páginas e outra não volta em nenhuma.
// ⚠️ `.in()` com centenas de uuids estoura o tamanho da URL; vai em LOTES.
// ⚠️ Erro SOBE: contagem que falha não pode virar zero.

/* eslint-disable @typescript-eslint/no-explicit-any */
const PAGINA = 1000;
const TETO = 200_000;

export async function lerTudo<T>(montar: () => any): Promise<T[]> {
  const out: T[] = [];
  for (let de = 0; de < TETO; de += PAGINA) {
    const { data, error } = await montar().range(de, de + PAGINA - 1);
    if (error) throw new Error(error.message);
    out.push(...((data ?? []) as T[]));
    if (!data || data.length < PAGINA) return out;
  }
  throw new Error(`Leitura passou de ${TETO} linhas — filtro esquecido?`);
}

/** `.in(coluna, ids)` em lotes de 150, cada lote lido sem teto. */
export async function lerPorIds<T>(ids: string[], montar: (lote: string[]) => any, tamanho = 150): Promise<T[]> {
  if (ids.length === 0) return [];
  const lotes: string[][] = [];
  for (let i = 0; i < ids.length; i += tamanho) lotes.push(ids.slice(i, i + tamanho));
  const partes = await Promise.all(lotes.map((l) => lerTudo<T>(() => montar(l))));
  return partes.flat();
}

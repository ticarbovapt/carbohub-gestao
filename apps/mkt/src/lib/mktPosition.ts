// Ordenação por posição (double) — insere entre dois itens fazendo a média,
// sem reindexar a lista inteira (mesmo padrão do Trello).
export const POS_GAP = 1024;

/** Posição para inserir um item no índice `index` de uma lista já ordenada
 * (asc) de posições `positions` (SEM o item sendo movido). */
export function positionForIndex(positions: number[], index: number): number {
  if (positions.length === 0) return POS_GAP;
  if (index <= 0) return positions[0] - POS_GAP;
  if (index >= positions.length) return positions[positions.length - 1] + POS_GAP;
  return (positions[index - 1] + positions[index]) / 2;
}

import type { QueryClient, QueryKey } from "@tanstack/react-query";
import { toast } from "sonner";
import type { BoardData, CardSummary } from "@/hooks/useBoards";

// Atualização OTIMISTA: a tela muda NO CLIQUE e o banco confirma depois.
//
// ⚠️ Antes, todo botão do cartão (capa, etiqueta, membro, checklist…) esperava o
// banco gravar E o quadro INTEIRO recarregar (listas, cartões, etiquetas,
// membros, contagens) para só então mudar — o "delayzinho" que o time sentia.
// Arrastar cartão já era otimista e por isso parecia instantâneo.
// ⚠️ Errou no banco ⇒ DESFAZ o que mudou e AVISA. Mudança otimista que falha
// calada deixaria a tela dizendo uma coisa e o banco outra.
// ⚠️ O recarregamento continua acontecendo depois (`onSettled`), em segundo
// plano: é ele que traz o que só o banco sabe (gatilhos, contagens).

export type Foto = [QueryKey, unknown][];

const ehQuadro = (d: unknown): d is BoardData =>
  !!d && typeof d === "object" && Array.isArray((d as BoardData).cards) && Array.isArray((d as BoardData).lists);

// Onde um cartão aparece: o quadro aberto e as visões da ÁREA (Tabela e
// Calendário de todos os quadros), que têm a mesma forma `{ lists, cards }`.
export const CHAVES_DE_QUADRO: QueryKey[] = [["mkt", "board"], ["mkt", "workspace"]];

/** Aplica `fn` em todo quadro aberto no cache (o cartão pode estar espelhado em outro). */
export function editarQuadros(qc: QueryClient, fn: (d: BoardData) => BoardData) {
  for (const k of CHAVES_DE_QUADRO) qc.setQueriesData({ queryKey: k }, (old: unknown) => (ehQuadro(old) ? fn(old) : old));
}

/** Atualiza UM cartão em todos os quadros — o próprio e os espelhos dele. */
export function editarCartaoNosQuadros(qc: QueryClient, cardId: string, fn: (c: CardSummary) => CardSummary) {
  editarQuadros(qc, (d) => ({ ...d, cards: d.cards.map((c) => (c.id === cardId || c.mirrorOf === cardId ? fn(c) : c)) }));
}

/** Para as consultas em voo (senão um refetch antigo pisa no otimista) e tira a FOTO para desfazer. */
export async function fotografar(qc: QueryClient, chaves: QueryKey[]): Promise<Foto> {
  await Promise.all(chaves.map((k) => qc.cancelQueries({ queryKey: k })));
  return chaves.flatMap((k) => qc.getQueriesData({ queryKey: k }));
}

export function desfazer(qc: QueryClient, foto: Foto | undefined, erro: unknown) {
  for (const [k, v] of foto ?? []) qc.setQueryData(k, v);
  toast.error(`Não salvou: ${(erro as Error)?.message ?? "erro desconhecido"}. A tela voltou ao que estava.`);
}

// O id de um item CRIADO nasce no navegador e é o MESMO no cache otimista e no
// insert: as duas pontas chamam `idNovo(variaveis)` e recebem o mesmo uuid.
// Id provisório trocado depois faria o clique no item recém-criado abrir nada.
const ids = new WeakMap<object, string>();
export function idNovo(v: object): string {
  let id = ids.get(v);
  if (!id) { id = crypto.randomUUID(); ids.set(v, id); }
  return id;
}

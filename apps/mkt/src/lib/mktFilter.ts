// ─────────────────────────────────────────────────────────────────────────────
// Filtro dos quadros — o do Trello: palavra-chave, membros (inclusive "sem
// membros" e "atribuídos a mim"), status, prazo, etiquetas (inclusive "sem
// etiquetas") e atividade, combinados por QUALQUER ou TODAS.
//
// ⚠️ Busca SALVA antiga não tem `modo` e foi gravada quando tudo era E (todas
// as etiquetas pedidas, o membro, o intervalo). `modo` ausente = "todas", para
// ela continuar devolvendo exatamente o que devolvia. Filtro novo nasce em
// "qualquer", que é o padrão do Trello.
// ⚠️ A palavra-chave e o intervalo de datas são SEMPRE E: são recorte, não
// opção — "qualquer" com texto devolveria cartão que nem tem a palavra.
// ⚠️ Campo que o cartão não traz (a busca entre quadros não lê descrição nem
// concluído) não é "falso": as opções que dependem dele só aparecem no filtro
// do QUADRO (`FilterControls` com `completo`).
// ─────────────────────────────────────────────────────────────────────────────

export interface MatchableCard {
  title: string; labelIds: string[]; memberIds: string[]; due_date: string | null;
  description?: string | null; is_complete?: boolean; updated_at?: string | null;
}

export type Prazo = "sem_data" | "atrasado" | "dia" | "semana" | "mes";
export type Atividade = "" | "1s" | "2s" | "4s" | "sem4s";

export interface SearchCriteria {
  text?: string;
  labelIds?: string[];
  semEtiquetas?: boolean;
  /** Legado (buscas salvas antigas): um membro só. */
  memberId?: string;
  memberIds?: string[];
  semMembros?: boolean;
  atribuidosAMim?: boolean;
  status?: "" | "concluido" | "nao_concluido";
  prazos?: Prazo[];
  atividade?: Atividade;
  modo?: "qualquer" | "todas";
  /** Lista sem nenhum cartão no filtro aparece recolhida. */
  recolherVazias?: boolean;
  dueFrom?: string; // YYYY-MM-DD
  dueTo?: string;   // YYYY-MM-DD
}

export const emptyCriteria = (): SearchCriteria => ({
  text: "", labelIds: [], memberId: "", memberIds: [], dueFrom: "", dueTo: "",
  semEtiquetas: false, semMembros: false, atribuidosAMim: false, status: "", prazos: [], atividade: "",
  modo: "qualquer", recolherVazias: false,
});

const membrosDe = (c: SearchCriteria) => [...new Set([...(c.memberIds ?? []), ...(c.memberId ? [c.memberId] : [])])];

/** Quantas opções estão ligadas (para o selo do botão "Filtro"). */
export function contarFiltros(c: SearchCriteria): number {
  return (c.text?.trim() ? 1 : 0) + (c.labelIds?.length ?? 0) + (c.semEtiquetas ? 1 : 0)
    + membrosDe(c).length + (c.semMembros ? 1 : 0) + (c.atribuidosAMim ? 1 : 0)
    + (c.status ? 1 : 0) + (c.prazos?.length ?? 0) + (c.atividade ? 1 : 0)
    + (c.dueFrom || c.dueTo ? 1 : 0);
}

export function criteriaActive(c: SearchCriteria): boolean {
  return contarFiltros(c) > 0;
}

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const DIA = 864e5;

// Um cartão bate no critério?
export function matchCard(card: MatchableCard, c: SearchCriteria, ctx?: { meuId?: string | null; agora?: number }): boolean {
  const agora = ctx?.agora ?? Date.now();

  // Recortes — sempre E.
  if (c.text && c.text.trim()) {
    const t = norm(c.text.trim());
    if (!norm(card.title).includes(t) && !norm(card.description ?? "").includes(t)) return false;
  }
  if (c.dueFrom || c.dueTo) {
    if (!card.due_date) return false;
    const d = card.due_date.slice(0, 10);
    if (c.dueFrom && d < c.dueFrom) return false;
    if (c.dueTo && d > c.dueTo) return false;
  }

  // Opções — combinadas por QUALQUER ou TODAS.
  const conds: boolean[] = [];
  for (const id of c.labelIds ?? []) conds.push(card.labelIds.includes(id));
  if (c.semEtiquetas) conds.push(card.labelIds.length === 0);
  for (const id of membrosDe(c)) conds.push(card.memberIds.includes(id));
  if (c.semMembros) conds.push(card.memberIds.length === 0);
  if (c.atribuidosAMim) conds.push(!!ctx?.meuId && card.memberIds.includes(ctx.meuId));
  if (c.status === "concluido") conds.push(!!card.is_complete);
  if (c.status === "nao_concluido") conds.push(!card.is_complete);
  const due = card.due_date ? new Date(card.due_date).getTime() : null;
  for (const p of c.prazos ?? []) {
    if (p === "sem_data") conds.push(due === null);
    else if (p === "atrasado") conds.push(due !== null && due < agora && !card.is_complete);
    else {
      const janela = p === "dia" ? DIA : p === "semana" ? 7 * DIA : 30 * DIA;
      conds.push(due !== null && due >= agora && due <= agora + janela && !card.is_complete);
    }
  }
  if (c.atividade) {
    const u = card.updated_at ? new Date(card.updated_at).getTime() : 0;
    const semanas = c.atividade === "1s" ? 1 : c.atividade === "2s" ? 2 : 4;
    conds.push(c.atividade === "sem4s" ? u < agora - 28 * DIA : u >= agora - semanas * 7 * DIA);
  }
  if (conds.length === 0) return true;
  return (c.modo ?? "todas") === "todas" ? conds.every(Boolean) : conds.some(Boolean);
}

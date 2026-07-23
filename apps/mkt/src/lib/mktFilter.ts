// Forma mínima de cartão que o filtro precisa (CardSummary satisfaz).
export interface MatchableCard { title: string; labelIds: string[]; memberIds: string[]; due_date: string | null; }

// Critério de busca/filtro (usado no filtro do quadro e nas buscas salvas).
export interface SearchCriteria {
  text?: string;
  labelIds?: string[];
  memberId?: string;
  dueFrom?: string; // YYYY-MM-DD
  dueTo?: string;   // YYYY-MM-DD
}

export const emptyCriteria = (): SearchCriteria => ({ text: "", labelIds: [], memberId: "", dueFrom: "", dueTo: "" });

export function criteriaActive(c: SearchCriteria): boolean {
  return !!(c.text?.trim() || (c.labelIds && c.labelIds.length) || c.memberId || c.dueFrom || c.dueTo);
}

// Um cartão bate no critério? (título contém texto; TODAS as etiquetas pedidas;
// membro atribuído; data de entrega no intervalo).
export function matchCard(card: MatchableCard, c: SearchCriteria): boolean {
  if (c.text && c.text.trim()) {
    if (!card.title.toLowerCase().includes(c.text.trim().toLowerCase())) return false;
  }
  if (c.labelIds && c.labelIds.length) {
    if (!c.labelIds.every((id) => card.labelIds.includes(id))) return false;
  }
  if (c.memberId) {
    if (!card.memberIds.includes(c.memberId)) return false;
  }
  if (c.dueFrom || c.dueTo) {
    if (!card.due_date) return false;
    const d = card.due_date.slice(0, 10);
    if (c.dueFrom && d < c.dueFrom) return false;
    if (c.dueTo && d > c.dueTo) return false;
  }
  return true;
}

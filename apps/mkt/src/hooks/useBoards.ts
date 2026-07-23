import { useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { POS_GAP } from "@/lib/mktPosition";

// ─────────────────────────────────────────────────────────────────────────────
// Dados dos Quadros (Trello interno) — lista de quadros, e o quadro aberto com
// suas listas + cartões + etiquetas + "badges" do cartão (etiquetas, membros,
// progresso de checklist, comentários). Mutações estruturais (criar/mover/
// arquivar quadro/lista/cartão). Detalhe do cartão fica em useCardDetail.
// ─────────────────────────────────────────────────────────────────────────────

const db = supabase as unknown as {
  from: (t: string) => any;
  auth: { getUser: () => Promise<{ data: { user: { id: string } | null } }> };
};

export interface Board {
  id: string; workspace_id: string | null; title: string; background: string;
  position: number; is_archived: boolean; created_at: string;
}
export interface List { id: string; board_id: string; title: string; position: number; color: string | null; }
export interface Label { id: string; board_id: string; name: string; color: string; }
export interface CardSummary {
  id: string; list_id: string; board_id: string; title: string;
  description: string | null; position: number;
  start_date: string | null; due_date: string | null; is_complete: boolean; cover: string | null;
  labelIds: string[]; memberIds: string[];
  checklistDone: number; checklistTotal: number; commentCount: number; attachmentCount: number;
  checklistOverdue: boolean;
  // Espelho: quando não-nulo, o conteúdo acima vem do cartão ORIGINAL (mirrorOf).
  mirrorOf: string | null; mirrorSourceBoard: string | null; mirrorSourceList: string | null;
}
export interface BoardData { board: Board; lists: List[]; cards: CardSummary[]; labels: Label[]; }

const num = (v: unknown) => Number(v) || 0;

// ── Lista de quadros ─────────────────────────────────────────────────────────
export function useBoards() {
  return useQuery({
    queryKey: ["mkt", "boards"],
    queryFn: async (): Promise<Board[]> => {
      const res = await db.from("mkt_boards").select("*").eq("is_archived", false).order("position");
      if (res.error) throw res.error;
      return (res.data ?? []) as Board[];
    },
  });
}

// Listas de um quadro (leve) — usado no picker de espelhar.
export function useBoardLists(boardId: string | null) {
  return useQuery({
    queryKey: ["mkt", "board-lists", boardId],
    enabled: !!boardId,
    queryFn: async (): Promise<List[]> => {
      const res = await db.from("mkt_lists").select("id, board_id, title, position, color").eq("board_id", boardId).eq("is_archived", false).order("position");
      if (res.error) throw res.error;
      return (res.data ?? []) as List[];
    },
  });
}

// ── Quadro aberto (kanban completo) ──────────────────────────────────────────
export function useBoard(boardId: string | null) {
  return useQuery({
    queryKey: ["mkt", "board", boardId],
    enabled: !!boardId,
    queryFn: async (): Promise<BoardData | null> => {
      const boardRes = await db.from("mkt_boards").select("*").eq("id", boardId).maybeSingle();
      if (boardRes.error) throw boardRes.error;
      if (!boardRes.data) return null;

      const [listsRes, cardsRes, labelsRes] = await Promise.all([
        db.from("mkt_lists").select("*").eq("board_id", boardId).eq("is_archived", false).order("position"),
        db.from("mkt_cards").select("*").eq("board_id", boardId).eq("is_archived", false).order("position"),
        db.from("mkt_labels").select("*").eq("board_id", boardId).order("created_at"),
      ]);
      if (listsRes.error) throw listsRes.error;
      if (cardsRes.error) throw cardsRes.error;
      if (labelsRes.error) throw labelsRes.error;

      const boardCards = (cardsRes.data ?? []) as Record<string, unknown>[];
      const cardIds: string[] = boardCards.map((c) => c.id as string);
      // Originais dos espelhos deste quadro (podem estar em OUTROS quadros).
      const originalIds = [...new Set(boardCards.map((c) => c.mirror_of as string | null).filter(Boolean) as string[])];

      // Resolve os cartões originais (mesmo arquivados) + títulos de quadro/lista de origem.
      const originalById = new Map<string, Record<string, unknown>>();
      const origBoardTitle = new Map<string, string>();
      const origListTitle = new Map<string, string>();
      if (originalIds.length > 0) {
        const oRes = await db.from("mkt_cards")
          .select("id, title, description, position, start_date, due_date, is_complete, cover, list_id, board_id, is_archived")
          .in("id", originalIds);
        const origs = (oRes.data ?? []) as Record<string, unknown>[];
        for (const o of origs) originalById.set(o.id as string, o);
        const obIds = [...new Set(origs.map((o) => o.board_id as string))];
        const olIds = [...new Set(origs.map((o) => o.list_id as string))];
        const [obRes, olRes] = await Promise.all([
          obIds.length ? db.from("mkt_boards").select("id, title").in("id", obIds) : Promise.resolve({ data: [] }),
          olIds.length ? db.from("mkt_lists").select("id, title").in("id", olIds) : Promise.resolve({ data: [] }),
        ]);
        for (const b of (obRes.data ?? []) as { id: string; title: string }[]) origBoardTitle.set(b.id, b.title);
        for (const l of (olRes.data ?? []) as { id: string; title: string }[]) origListTitle.set(l.id, l.title);
      }

      // Badges são calculados sobre cartões próprios + originais (espelhos herdam do original).
      const allIds = [...new Set([...cardIds, ...originalIds])];
      let cardLabels: { card_id: string; label_id: string }[] = [];
      let cardMembers: { card_id: string; user_id: string }[] = [];
      let checklists: { id: string; card_id: string }[] = [];
      let comments: { card_id: string }[] = [];
      let attachments: { card_id: string }[] = [];
      if (allIds.length > 0) {
        const [clRes, cmRes, ckRes, coRes, atRes] = await Promise.all([
          db.from("mkt_card_labels").select("card_id, label_id").in("card_id", allIds),
          db.from("mkt_card_members").select("card_id, user_id").in("card_id", allIds),
          db.from("mkt_checklists").select("id, card_id").in("card_id", allIds),
          db.from("mkt_comments").select("card_id").in("card_id", allIds),
          db.from("mkt_card_attachments").select("card_id").in("card_id", allIds),
        ]);
        cardLabels = clRes.data ?? [];
        cardMembers = cmRes.data ?? [];
        checklists = ckRes.data ?? [];
        comments = coRes.data ?? [];
        attachments = atRes.data ?? [];
      }
      // Progresso e ATRASO de checklist (item com data vencida e não concluído).
      const checklistIds = checklists.map((c) => c.id);
      let items: { checklist_id: string; is_done: boolean; due_date: string | null }[] = [];
      if (checklistIds.length > 0) {
        const itRes = await db.from("mkt_checklist_items").select("checklist_id, is_done, due_date").in("checklist_id", checklistIds);
        items = itRes.data ?? [];
      }
      const checklistToCard = new Map(checklists.map((c) => [c.id, c.card_id]));
      const doneByCard = new Map<string, number>();
      const totalByCard = new Map<string, number>();
      const overdueByCard = new Map<string, boolean>();
      const now = Date.now();
      for (const it of items) {
        const cid = checklistToCard.get(it.checklist_id);
        if (!cid) continue;
        totalByCard.set(cid, (totalByCard.get(cid) ?? 0) + 1);
        if (it.is_done) doneByCard.set(cid, (doneByCard.get(cid) ?? 0) + 1);
        else if (it.due_date && new Date(it.due_date).getTime() < now) overdueByCard.set(cid, true);
      }
      const labelsByCard = new Map<string, string[]>();
      for (const cl of cardLabels) (labelsByCard.get(cl.card_id) ?? labelsByCard.set(cl.card_id, []).get(cl.card_id)!).push(cl.label_id);
      const membersByCard = new Map<string, string[]>();
      for (const cm of cardMembers) (membersByCard.get(cm.card_id) ?? membersByCard.set(cm.card_id, []).get(cm.card_id)!).push(cm.user_id);
      const commentsByCard = new Map<string, number>();
      for (const co of comments) commentsByCard.set(co.card_id, (commentsByCard.get(co.card_id) ?? 0) + 1);
      const attByCard = new Map<string, number>();
      for (const a of attachments) attByCard.set(a.card_id, (attByCard.get(a.card_id) ?? 0) + 1);

      const cards: CardSummary[] = boardCards.map((c) => {
        const mirrorOf = (c.mirror_of as string | null) ?? null;
        const original = mirrorOf ? originalById.get(mirrorOf) ?? null : null;
        const removed = !!mirrorOf && !original;      // espelho de original apagado
        const src = original ?? c;                     // fonte do conteúdo
        const contentId = mirrorOf ? mirrorOf : (c.id as string); // id p/ badges
        return {
          id: c.id as string, list_id: c.list_id as string, board_id: c.board_id as string,
          position: num(c.position),
          title: removed ? "(original removido)" : ((src.title as string) ?? ""),
          description: removed ? null : ((src.description as string) ?? null),
          start_date: (src.start_date as string) ?? null,
          due_date: (src.due_date as string) ?? null, is_complete: !!src.is_complete, cover: (src.cover as string) ?? null,
          labelIds: labelsByCard.get(contentId) ?? [], memberIds: membersByCard.get(contentId) ?? [],
          checklistDone: doneByCard.get(contentId) ?? 0, checklistTotal: totalByCard.get(contentId) ?? 0,
          commentCount: commentsByCard.get(contentId) ?? 0,
          attachmentCount: attByCard.get(contentId) ?? 0,
          checklistOverdue: overdueByCard.get(contentId) ?? false,
          mirrorOf,
          mirrorSourceBoard: original ? (origBoardTitle.get(original.board_id as string) ?? null) : null,
          mirrorSourceList: original ? (origListTitle.get(original.list_id as string) ?? null) : null,
        };
      });

      return { board: boardRes.data as Board, lists: (listsRes.data ?? []) as List[], cards, labels: (labelsRes.data ?? []) as Label[] };
    },
  });
}

// Todos os cartões (entre quadros) — para a busca da página Quadros.
export interface AllCard {
  id: string; title: string; due_date: string | null;
  labelIds: string[]; memberIds: string[];
  board_id: string; boardTitle: string; list_id: string; listTitle: string;
}
export function useAllCards(enabled: boolean) {
  return useQuery({
    queryKey: ["mkt", "all-cards"],
    enabled,
    queryFn: async (): Promise<AllCard[]> => {
      const cardsRes = await db.from("mkt_cards").select("id, title, due_date, board_id, list_id, mirror_of").eq("is_archived", false);
      if (cardsRes.error) throw cardsRes.error;
      const cards = ((cardsRes.data ?? []) as Record<string, unknown>[]).filter((c) => !c.mirror_of); // originais (ignora espelhos)
      const ids = cards.map((c) => c.id as string);
      if (ids.length === 0) return [];
      const [clRes, cmRes, bRes, lRes] = await Promise.all([
        db.from("mkt_card_labels").select("card_id, label_id").in("card_id", ids),
        db.from("mkt_card_members").select("card_id, user_id").in("card_id", ids),
        db.from("mkt_boards").select("id, title"),
        db.from("mkt_lists").select("id, title"),
      ]);
      const labelsByCard = new Map<string, string[]>();
      for (const cl of (clRes.data ?? []) as { card_id: string; label_id: string }[]) (labelsByCard.get(cl.card_id) ?? labelsByCard.set(cl.card_id, []).get(cl.card_id)!).push(cl.label_id);
      const membersByCard = new Map<string, string[]>();
      for (const cm of (cmRes.data ?? []) as { card_id: string; user_id: string }[]) (membersByCard.get(cm.card_id) ?? membersByCard.set(cm.card_id, []).get(cm.card_id)!).push(cm.user_id);
      const boardTitle = new Map((bRes.data ?? []).map((b: { id: string; title: string }) => [b.id, b.title]));
      const listTitle = new Map((lRes.data ?? []).map((l: { id: string; title: string }) => [l.id, l.title]));
      return cards.map((c) => ({
        id: c.id as string, title: (c.title as string) ?? "", due_date: (c.due_date as string) ?? null,
        labelIds: labelsByCard.get(c.id as string) ?? [], memberIds: membersByCard.get(c.id as string) ?? [],
        board_id: c.board_id as string, boardTitle: boardTitle.get(c.board_id as string) ?? "—",
        list_id: c.list_id as string, listTitle: listTitle.get(c.list_id as string) ?? "—",
      }));
    },
  });
}

// ── Realtime do quadro (colaboração ao vivo) ─────────────────────────────────
export function useBoardLive(boardId: string | null) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!boardId) return;
    const inval = () => {
      qc.invalidateQueries({ queryKey: ["mkt", "board", boardId] });
      qc.invalidateQueries({ queryKey: ["mkt", "boards"] });
    };
    const ch = supabase
      .channel(`mkt-board-${boardId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "mkt_lists" }, inval)
      .on("postgres_changes", { event: "*", schema: "public", table: "mkt_cards" }, inval)
      .on("postgres_changes", { event: "*", schema: "public", table: "mkt_card_labels" }, inval)
      .on("postgres_changes", { event: "*", schema: "public", table: "mkt_card_members" }, inval)
      .on("postgres_changes", { event: "*", schema: "public", table: "mkt_checklist_items" }, inval)
      .on("postgres_changes", { event: "*", schema: "public", table: "mkt_comments" }, inval)
      .on("postgres_changes", { event: "*", schema: "public", table: "mkt_card_attachments" }, inval)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc, boardId]);
}

async function uid() {
  const { data } = await db.auth.getUser();
  return data?.user?.id ?? null;
}
async function defaultWorkspace(): Promise<string | null> {
  const res = await db.from("mkt_workspaces").select("id").order("created_at").limit(1).maybeSingle();
  return res.data?.id ?? null;
}
async function logActivity(board_id: string, type: string, data: Record<string, unknown>, card_id?: string) {
  await db.from("mkt_activity").insert({ board_id, card_id: card_id ?? null, user_id: await uid(), type, data });
}

// ── Mutações estruturais ─────────────────────────────────────────────────────
export function useBoardMutations(boardId?: string) {
  const qc = useQueryClient();
  const invBoard = () => boardId && qc.invalidateQueries({ queryKey: ["mkt", "board", boardId] });
  const invBoards = () => qc.invalidateQueries({ queryKey: ["mkt", "boards"] });

  const createBoard = useMutation({
    mutationFn: async ({ title, background }: { title: string; background: string }) => {
      const ws = await defaultWorkspace();
      const res = await db.from("mkt_boards").insert({ title, background, workspace_id: ws, created_by: await uid(), position: Date.now() }).select("id").single();
      if (res.error) throw res.error;
      return res.data.id as string;
    },
    onSuccess: invBoards,
  });

  const createList = useMutation({
    mutationFn: async ({ title, position }: { title: string; position: number }) => {
      const res = await db.from("mkt_lists").insert({ board_id: boardId, title, position }).select("id").single();
      if (res.error) throw res.error;
      return res.data.id as string;
    },
    onSuccess: invBoard,
  });

  const renameList = useMutation({
    mutationFn: async ({ id, title }: { id: string; title: string }) => {
      const res = await db.from("mkt_lists").update({ title }).eq("id", id);
      if (res.error) throw res.error;
    },
    onSuccess: invBoard,
  });

  const moveList = useMutation({
    mutationFn: async ({ id, position }: { id: string; position: number }) => {
      const res = await db.from("mkt_lists").update({ position }).eq("id", id);
      if (res.error) throw res.error;
    },
    onSuccess: invBoard,
  });

  const archiveList = useMutation({
    mutationFn: async ({ id }: { id: string }) => {
      const res = await db.from("mkt_lists").update({ is_archived: true, archived_at: new Date().toISOString() }).eq("id", id);
      if (res.error) throw res.error;
    },
    onSuccess: invBoard,
  });

  const setListColor = useMutation({
    mutationFn: async ({ id, color }: { id: string; color: string | null }) => {
      const res = await db.from("mkt_lists").update({ color }).eq("id", id);
      if (res.error) throw res.error;
    },
    onSuccess: invBoard,
  });

  const createCard = useMutation({
    mutationFn: async ({ listId, title, position }: { listId: string; title: string; position: number }) => {
      if (!boardId) throw new Error("sem quadro");
      const res = await db.from("mkt_cards").insert({ list_id: listId, board_id: boardId, title, position, created_by: await uid() }).select("id").single();
      if (res.error) throw res.error;
      await logActivity(boardId, "card.create", { title }, res.data.id);
      return res.data.id as string;
    },
    onSuccess: invBoard,
  });

  // Move cartão (mesma lista ou entre listas) — atualiza list_id + position.
  const moveCard = useMutation({
    mutationFn: async ({ id, listId, position }: { id: string; listId: string; position: number }) => {
      const res = await db.from("mkt_cards").update({ list_id: listId, position }).eq("id", id);
      if (res.error) throw res.error;
    },
    onSuccess: invBoard,
  });

  const archiveCard = useMutation({
    mutationFn: async ({ id }: { id: string }) => {
      const res = await db.from("mkt_cards").update({ is_archived: true, archived_at: new Date().toISOString() }).eq("id", id);
      if (res.error) throw res.error;
      if (boardId) await logActivity(boardId, "card.archive", {}, id);
    },
    onSuccess: invBoard,
  });

  // Data do cartão (usado ao arrastar no Calendário/Timeline).
  const setCardDates = useMutation({
    mutationFn: async ({ id, due_date, start_date }: { id: string; due_date?: string | null; start_date?: string | null }) => {
      const patch: Record<string, unknown> = {};
      if (due_date !== undefined) patch.due_date = due_date;
      if (start_date !== undefined) patch.start_date = start_date;
      const res = await db.from("mkt_cards").update(patch).eq("id", id);
      if (res.error) throw res.error;
    },
    onSuccess: invBoard,
  });

  return { createBoard, createList, renameList, moveList, archiveList, setListColor, createCard, moveCard, archiveCard, setCardDates };
}

export { POS_GAP };

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
export interface List { id: string; board_id: string; title: string; position: number; }
export interface Label { id: string; board_id: string; name: string; color: string; }
export interface CardSummary {
  id: string; list_id: string; board_id: string; title: string;
  description: string | null; position: number;
  start_date: string | null; due_date: string | null; is_complete: boolean; cover: string | null;
  labelIds: string[]; memberIds: string[];
  checklistDone: number; checklistTotal: number; commentCount: number;
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

      const cardIds: string[] = (cardsRes.data ?? []).map((c: { id: string }) => c.id);

      // Badges do cartão (só se houver cartões).
      let cardLabels: { card_id: string; label_id: string }[] = [];
      let cardMembers: { card_id: string; user_id: string }[] = [];
      let checklists: { id: string; card_id: string }[] = [];
      let comments: { card_id: string }[] = [];
      if (cardIds.length > 0) {
        const [clRes, cmRes, ckRes, coRes] = await Promise.all([
          db.from("mkt_card_labels").select("card_id, label_id").in("card_id", cardIds),
          db.from("mkt_card_members").select("card_id, user_id").in("card_id", cardIds),
          db.from("mkt_checklists").select("id, card_id").in("card_id", cardIds),
          db.from("mkt_comments").select("card_id").in("card_id", cardIds),
        ]);
        cardLabels = clRes.data ?? [];
        cardMembers = cmRes.data ?? [];
        checklists = ckRes.data ?? [];
        comments = coRes.data ?? [];
      }
      // Progresso de checklist: itens por checklist → agrega por cartão.
      const checklistIds = checklists.map((c) => c.id);
      let items: { checklist_id: string; is_done: boolean }[] = [];
      if (checklistIds.length > 0) {
        const itRes = await db.from("mkt_checklist_items").select("checklist_id, is_done").in("checklist_id", checklistIds);
        items = itRes.data ?? [];
      }
      const checklistToCard = new Map(checklists.map((c) => [c.id, c.card_id]));
      const doneByCard = new Map<string, number>();
      const totalByCard = new Map<string, number>();
      for (const it of items) {
        const cid = checklistToCard.get(it.checklist_id);
        if (!cid) continue;
        totalByCard.set(cid, (totalByCard.get(cid) ?? 0) + 1);
        if (it.is_done) doneByCard.set(cid, (doneByCard.get(cid) ?? 0) + 1);
      }
      const labelsByCard = new Map<string, string[]>();
      for (const cl of cardLabels) (labelsByCard.get(cl.card_id) ?? labelsByCard.set(cl.card_id, []).get(cl.card_id)!).push(cl.label_id);
      const membersByCard = new Map<string, string[]>();
      for (const cm of cardMembers) (membersByCard.get(cm.card_id) ?? membersByCard.set(cm.card_id, []).get(cm.card_id)!).push(cm.user_id);
      const commentsByCard = new Map<string, number>();
      for (const co of comments) commentsByCard.set(co.card_id, (commentsByCard.get(co.card_id) ?? 0) + 1);

      const cards: CardSummary[] = (cardsRes.data ?? []).map((c: Record<string, unknown>) => ({
        id: c.id as string, list_id: c.list_id as string, board_id: c.board_id as string,
        title: (c.title as string) ?? "", description: (c.description as string) ?? null,
        position: num(c.position), start_date: (c.start_date as string) ?? null,
        due_date: (c.due_date as string) ?? null, is_complete: !!c.is_complete, cover: (c.cover as string) ?? null,
        labelIds: labelsByCard.get(c.id as string) ?? [], memberIds: membersByCard.get(c.id as string) ?? [],
        checklistDone: doneByCard.get(c.id as string) ?? 0, checklistTotal: totalByCard.get(c.id as string) ?? 0,
        commentCount: commentsByCard.get(c.id as string) ?? 0,
      }));

      return { board: boardRes.data as Board, lists: (listsRes.data ?? []) as List[], cards, labels: (labelsRes.data ?? []) as Label[] };
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

  return { createBoard, createList, renameList, moveList, archiveList, createCard, moveCard, archiveCard };
}

export { POS_GAP };

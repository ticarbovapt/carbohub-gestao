import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Board, List, Label, CardSummary } from "@/hooks/useBoards";

// ─────────────────────────────────────────────────────────────────────────────
// Agregação em nível de ÁREA DE TRABALHO (workspace) — cruza todos os quadros
// não arquivados de um workspace para as views geais (Calendário/Tabela — D6).
// Reaproveita as mesmas "badges" do quadro; IGNORA cartões espelho (mostra só o
// original, evitando duplicar o mesmo cartão em vários quadros da área).
// ─────────────────────────────────────────────────────────────────────────────

const db = supabase as unknown as {
  from: (t: string) => any;
  auth: { getUser: () => Promise<{ data: { user: { id: string } | null } }> };
};

const num = (v: unknown) => Number(v) || 0;

export interface Workspace { id: string; name: string; }
// Cartão da área: um CardSummary + de qual quadro/lista ele veio.
export interface WorkspaceCard extends CardSummary { boardTitle: string; listTitle: string; }
export interface WorkspaceData {
  workspace: Workspace | null;
  boards: Board[];
  lists: List[];
  labels: Label[];
  cards: WorkspaceCard[];
}

// Workspace padrão (a "Marketing" semeada na Fase 1) — o primeiro criado.
export function useDefaultWorkspace() {
  return useQuery({
    queryKey: ["mkt", "default-workspace"],
    queryFn: async (): Promise<Workspace | null> => {
      const res = await db.from("mkt_workspaces").select("id, name").order("created_at").limit(1).maybeSingle();
      if (res.error) throw res.error;
      return (res.data as Workspace) ?? null;
    },
  });
}

export function useWorkspaceData(workspaceId: string | null) {
  return useQuery({
    queryKey: ["mkt", "workspace", workspaceId],
    enabled: !!workspaceId,
    queryFn: async (): Promise<WorkspaceData | null> => {
      const wsRes = await db.from("mkt_workspaces").select("id, name").eq("id", workspaceId).maybeSingle();
      if (wsRes.error) throw wsRes.error;

      const boardsRes = await db.from("mkt_boards").select("*").eq("workspace_id", workspaceId).eq("is_archived", false).order("position");
      if (boardsRes.error) throw boardsRes.error;
      const boards = (boardsRes.data ?? []) as Board[];
      const boardIds = boards.map((b) => b.id);
      if (boardIds.length === 0) {
        return { workspace: (wsRes.data as Workspace) ?? null, boards, lists: [], labels: [], cards: [] };
      }

      const [listsRes, cardsRes, labelsRes] = await Promise.all([
        db.from("mkt_lists").select("*").in("board_id", boardIds).eq("is_archived", false).order("position"),
        db.from("mkt_cards").select("*").in("board_id", boardIds).eq("is_archived", false).order("position"),
        db.from("mkt_labels").select("*").in("board_id", boardIds).order("created_at"),
      ]);
      if (listsRes.error) throw listsRes.error;
      if (cardsRes.error) throw cardsRes.error;
      if (labelsRes.error) throw labelsRes.error;

      const lists = (listsRes.data ?? []) as List[];
      const labels = (labelsRes.data ?? []) as Label[];
      const boardTitle = new Map(boards.map((b) => [b.id, b.title]));
      const listTitle = new Map(lists.map((l) => [l.id, l.title]));

      // Só cartões próprios (ignora espelhos — o original já aparece no seu quadro).
      const raw = ((cardsRes.data ?? []) as Record<string, unknown>[]).filter((c) => !c.mirror_of);
      const cardIds = raw.map((c) => c.id as string);

      let cardLabels: { card_id: string; label_id: string }[] = [];
      let cardMembers: { card_id: string; user_id: string }[] = [];
      let checklists: { id: string; card_id: string }[] = [];
      let comments: { card_id: string }[] = [];
      let attachments: { card_id: string }[] = [];
      if (cardIds.length > 0) {
        const [clRes, cmRes, ckRes, coRes, atRes] = await Promise.all([
          db.from("mkt_card_labels").select("card_id, label_id").in("card_id", cardIds),
          db.from("mkt_card_members").select("card_id, user_id").in("card_id", cardIds),
          db.from("mkt_checklists").select("id, card_id").in("card_id", cardIds),
          db.from("mkt_comments").select("card_id").in("card_id", cardIds),
          db.from("mkt_card_attachments").select("card_id").in("card_id", cardIds),
        ]);
        cardLabels = clRes.data ?? [];
        cardMembers = cmRes.data ?? [];
        checklists = ckRes.data ?? [];
        comments = coRes.data ?? [];
        attachments = atRes.data ?? [];
      }
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

      const cards: WorkspaceCard[] = raw.map((c) => ({
        id: c.id as string, list_id: c.list_id as string, board_id: c.board_id as string,
        position: num(c.position),
        title: (c.title as string) ?? "",
        description: (c.description as string) ?? null,
        start_date: (c.start_date as string) ?? null,
        due_date: (c.due_date as string) ?? null, is_complete: !!c.is_complete, cover: (c.cover as string) ?? null,
        location_lat: (c.location_lat as number) ?? null, location_lng: (c.location_lng as number) ?? null, location_name: (c.location_name as string) ?? null,
        labelIds: labelsByCard.get(c.id as string) ?? [], memberIds: membersByCard.get(c.id as string) ?? [],
        checklistDone: doneByCard.get(c.id as string) ?? 0, checklistTotal: totalByCard.get(c.id as string) ?? 0,
        commentCount: commentsByCard.get(c.id as string) ?? 0,
        attachmentCount: attByCard.get(c.id as string) ?? 0,
        checklistOverdue: overdueByCard.get(c.id as string) ?? false,
        mirrorOf: null, mirrorSourceBoard: null, mirrorSourceList: null,
        boardTitle: boardTitle.get(c.board_id as string) ?? "—",
        listTitle: listTitle.get(c.list_id as string) ?? "—",
      }));

      return { workspace: (wsRes.data as Workspace) ?? null, boards, lists, labels, cards };
    },
  });
}

// Realtime da área — invalida a query da área ao mudar qualquer cartão/badge.
export function useWorkspaceLive(workspaceId: string | null) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!workspaceId) return;
    const inval = () => {
      qc.invalidateQueries({ queryKey: ["mkt", "workspace", workspaceId] });
      qc.invalidateQueries({ queryKey: ["mkt", "boards"] });
    };
    const ch = supabase
      .channel(`mkt-workspace-${workspaceId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "mkt_boards" }, inval)
      .on("postgres_changes", { event: "*", schema: "public", table: "mkt_lists" }, inval)
      .on("postgres_changes", { event: "*", schema: "public", table: "mkt_cards" }, inval)
      .on("postgres_changes", { event: "*", schema: "public", table: "mkt_card_labels" }, inval)
      .on("postgres_changes", { event: "*", schema: "public", table: "mkt_card_members" }, inval)
      .on("postgres_changes", { event: "*", schema: "public", table: "mkt_checklist_items" }, inval)
      .on("postgres_changes", { event: "*", schema: "public", table: "mkt_comments" }, inval)
      .on("postgres_changes", { event: "*", schema: "public", table: "mkt_card_attachments" }, inval)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc, workspaceId]);
}

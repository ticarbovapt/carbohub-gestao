import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { isDriveUrl, parseDriveFileId, driveThumbUrl, guessNameFromUrl } from "@/lib/mktDrive";

// Detalhe do cartão (modal): campos, etiquetas, membros, checklists+itens,
// comentários. Mutações granulares. Ao alterar, invalida o cartão E o quadro
// (pra atualizar os badges no kanban).

const db = supabase as unknown as {
  from: (t: string) => any;
  auth: { getUser: () => Promise<{ data: { user: { id: string } | null } }> };
};

export interface CardFull {
  id: string; board_id: string; list_id: string; title: string; description: string | null;
  start_date: string | null; due_date: string | null; is_complete: boolean; cover: string | null;
}
export interface ChecklistItem { id: string; checklist_id: string; text: string; is_done: boolean; position: number; }
export interface Checklist { id: string; card_id: string; title: string; position: number; items: ChecklistItem[]; }
export interface Comment { id: string; card_id: string; user_id: string; body: string; created_at: string; authorName: string | null; authorAvatar: string | null; }
export interface Attachment {
  id: string; card_id: string; kind: "drive" | "link"; name: string;
  external_url: string; drive_file_id: string | null; thumbnail_url: string | null;
  mime_type: string | null; created_at: string;
}
export interface CardDetail {
  card: CardFull;
  labelIds: string[];
  memberIds: string[];
  checklists: Checklist[];
  comments: Comment[];
  attachments: Attachment[];
  fieldValues: Record<string, unknown>; // field_id → value (jsonb)
}

async function uid() {
  const { data } = await db.auth.getUser();
  return data?.user?.id ?? null;
}

export function useCardDetail(cardId: string | null) {
  return useQuery({
    queryKey: ["mkt", "card", cardId],
    enabled: !!cardId,
    queryFn: async (): Promise<CardDetail | null> => {
      const cardRes = await db.from("mkt_cards").select("id, board_id, list_id, title, description, start_date, due_date, is_complete, cover").eq("id", cardId).maybeSingle();
      if (cardRes.error) throw cardRes.error;
      if (!cardRes.data) return null;

      const [clabRes, memRes, ckRes, coRes, attRes, fvRes] = await Promise.all([
        db.from("mkt_card_labels").select("label_id").eq("card_id", cardId),
        db.from("mkt_card_members").select("user_id").eq("card_id", cardId),
        db.from("mkt_checklists").select("*").eq("card_id", cardId).order("position"),
        db.from("mkt_comments").select("*").eq("card_id", cardId).order("created_at", { ascending: false }),
        db.from("mkt_card_attachments").select("*").eq("card_id", cardId).order("created_at", { ascending: false }),
        db.from("mkt_card_field_values").select("field_id, value").eq("card_id", cardId),
      ]);

      const checklists = (ckRes.data ?? []) as { id: string; card_id: string; title: string; position: number }[];
      const clIds = checklists.map((c) => c.id);
      let items: ChecklistItem[] = [];
      if (clIds.length > 0) {
        const itRes = await db.from("mkt_checklist_items").select("*").in("checklist_id", clIds).order("position");
        items = (itRes.data ?? []) as ChecklistItem[];
      }
      const itemsByCl = new Map<string, ChecklistItem[]>();
      for (const it of items) (itemsByCl.get(it.checklist_id) ?? itemsByCl.set(it.checklist_id, []).get(it.checklist_id)!).push(it);

      const comments = (coRes.data ?? []) as { id: string; card_id: string; user_id: string; body: string; created_at: string }[];
      const authorIds = [...new Set(comments.map((c) => c.user_id))];
      const nameById = new Map<string, { name: string | null; avatar: string | null }>();
      if (authorIds.length > 0) {
        const pRes = await db.from("profiles").select("id, full_name, avatar_url").in("id", authorIds);
        for (const p of (pRes.data ?? []) as { id: string; full_name: string | null; avatar_url: string | null }[]) {
          nameById.set(p.id, { name: p.full_name, avatar: p.avatar_url });
        }
      }

      return {
        card: cardRes.data as CardFull,
        labelIds: (clabRes.data ?? []).map((r: { label_id: string }) => r.label_id),
        memberIds: (memRes.data ?? []).map((r: { user_id: string }) => r.user_id),
        checklists: checklists.map((c) => ({ ...c, items: itemsByCl.get(c.id) ?? [] })),
        comments: comments.map((c) => ({ ...c, authorName: nameById.get(c.user_id)?.name ?? null, authorAvatar: nameById.get(c.user_id)?.avatar ?? null })),
        attachments: (attRes.data ?? []) as Attachment[],
        fieldValues: Object.fromEntries((fvRes.data ?? []).map((r: { field_id: string; value: unknown }) => [r.field_id, r.value])),
      };
    },
  });
}

export function useCardMutations(cardId: string | null, boardId?: string) {
  const qc = useQueryClient();
  const inval = () => {
    if (cardId) qc.invalidateQueries({ queryKey: ["mkt", "card", cardId] });
    if (boardId) qc.invalidateQueries({ queryKey: ["mkt", "board", boardId] });
  };
  const run = <T>(fn: (v: T) => Promise<void>) => useMutation({ mutationFn: fn, onSuccess: inval });

  const updateCard = run(async (patch: Record<string, unknown>) => {
    const res = await db.from("mkt_cards").update(patch).eq("id", cardId);
    if (res.error) throw res.error;
  });

  const toggleLabel = run(async ({ labelId, on }: { labelId: string; on: boolean }) => {
    if (on) {
      const res = await db.from("mkt_card_labels").insert({ card_id: cardId, label_id: labelId });
      if (res.error && !String(res.error.message).includes("duplicate")) throw res.error;
    } else {
      const res = await db.from("mkt_card_labels").delete().eq("card_id", cardId).eq("label_id", labelId);
      if (res.error) throw res.error;
    }
  });

  const createLabel = run(async ({ name, color }: { name: string; color: string }) => {
    const res = await db.from("mkt_labels").insert({ board_id: boardId, name, color });
    if (res.error) throw res.error;
  });

  const toggleMember = run(async ({ userId, on }: { userId: string; on: boolean }) => {
    if (on) {
      const res = await db.from("mkt_card_members").insert({ card_id: cardId, user_id: userId });
      if (res.error && !String(res.error.message).includes("duplicate")) throw res.error;
    } else {
      const res = await db.from("mkt_card_members").delete().eq("card_id", cardId).eq("user_id", userId);
      if (res.error) throw res.error;
    }
  });

  const addChecklist = run(async ({ title }: { title: string }) => {
    const res = await db.from("mkt_checklists").insert({ card_id: cardId, title, position: Date.now() });
    if (res.error) throw res.error;
  });
  const removeChecklist = run(async ({ id }: { id: string }) => {
    const res = await db.from("mkt_checklists").delete().eq("id", id);
    if (res.error) throw res.error;
  });
  const addItem = run(async ({ checklistId, text, position }: { checklistId: string; text: string; position: number }) => {
    const res = await db.from("mkt_checklist_items").insert({ checklist_id: checklistId, text, position });
    if (res.error) throw res.error;
  });
  const toggleItem = run(async ({ id, done }: { id: string; done: boolean }) => {
    const res = await db.from("mkt_checklist_items").update({ is_done: done }).eq("id", id);
    if (res.error) throw res.error;
  });
  const removeItem = run(async ({ id }: { id: string }) => {
    const res = await db.from("mkt_checklist_items").delete().eq("id", id);
    if (res.error) throw res.error;
  });

  const addAttachment = run(async ({ url, name }: { url: string; name?: string }) => {
    const clean = url.trim();
    if (!clean) throw new Error("Cole um link.");
    const drive = isDriveUrl(clean);
    const fileId = drive ? parseDriveFileId(clean) : null;
    const res = await db.from("mkt_card_attachments").insert({
      card_id: cardId,
      kind: fileId ? "drive" : "link",
      name: (name && name.trim()) || guessNameFromUrl(clean),
      external_url: clean,
      drive_file_id: fileId,
      thumbnail_url: fileId ? driveThumbUrl(fileId) : null,
      created_by: await uid(),
    });
    if (res.error) throw res.error;
  });
  const removeAttachment = run(async ({ id }: { id: string }) => {
    const res = await db.from("mkt_card_attachments").delete().eq("id", id);
    if (res.error) throw res.error;
  });

  // Valor de Campo Personalizado: value null/"" limpa (remove a linha); senão upsert.
  const setFieldValue = run(async ({ fieldId, value }: { fieldId: string; value: unknown }) => {
    const empty = value === null || value === undefined || value === "" || (Array.isArray(value) && value.length === 0);
    if (empty) {
      const res = await db.from("mkt_card_field_values").delete().eq("card_id", cardId).eq("field_id", fieldId);
      if (res.error) throw res.error;
    } else {
      const res = await db.from("mkt_card_field_values").upsert({ card_id: cardId, field_id: fieldId, value, updated_at: new Date().toISOString() }, { onConflict: "card_id,field_id" });
      if (res.error) throw res.error;
    }
  });

  const addComment = useMutation({
    mutationFn: async ({ body }: { body: string }) => {
      const res = await db.from("mkt_comments").insert({ card_id: cardId, user_id: await uid(), body });
      if (res.error) throw res.error;
      if (boardId) await db.from("mkt_activity").insert({ board_id: boardId, card_id: cardId, user_id: await uid(), type: "comment.add", data: {} });
    },
    onSuccess: inval,
  });

  return { updateCard, toggleLabel, createLabel, toggleMember, addChecklist, removeChecklist, addItem, toggleItem, removeItem, addAttachment, removeAttachment, setFieldValue, addComment };
}

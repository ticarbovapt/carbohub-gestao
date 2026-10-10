import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { QueryKey } from "@tanstack/react-query";
import { fotografar, desfazer, editarCartaoNosQuadros, editarQuadros, CHAVES_DE_QUADRO, idNovo, type Foto } from "@/lib/mktOtimista";
import { useAuth } from "@/contexts/AuthContext";
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
  location_lat: number | null; location_lng: number | null; location_name: string | null;
  is_archived?: boolean;
  lembrete_minutos?: number | null; recorrencia?: string | null;
}
export interface ChecklistItem {
  id: string; checklist_id: string; text: string; is_done: boolean; position: number;
  assignee_id: string | null; due_date: string | null;
}
export interface Checklist { id: string; card_id: string; title: string; position: number; items: ChecklistItem[]; }
export interface Comment { id: string; card_id: string; user_id: string; body: string; created_at: string; updated_at?: string; authorName: string | null; authorAvatar: string | null; }
export interface Attachment {
  id: string; card_id: string; kind: "drive" | "link" | "arquivo"; name: string;
  external_url: string; drive_file_id: string | null; thumbnail_url: string | null;
  /** Arquivo NOSSO, no bucket privado `mkt-anexos` (kind = "arquivo"). */
  storage_path?: string | null;
  /** Capa leve (jpeg) no mesmo bucket: é o que a lista mostra. */
  poster_path?: string | null;
  tamanho?: number | null;
  atualizado_em?: string | null;
  /** Número da versão ATUAL (v1, v2…); as anteriores ficam em `mkt_anexo_versoes`. */
  versao?: number | null;
  /** Cópia para ASSISTIR (H.264), gerada pelo conversor quando o navegador não toca o original. */
  web_path?: string | null;
  web_status?: "nativo" | "pronto" | "falhou" | null;
  mime_type: string | null; created_at: string;
}

/** Uma versão ANTERIOR de um arquivo (a atual mora no próprio anexo). */
export interface VersaoAnexo {
  id: string; anexo_id: string; versao: number; name: string;
  storage_path: string; poster_path: string | null; web_path: string | null;
  mime_type: string | null; tamanho: number | null;
  criado_em: string | null; criado_por: string | null; substituido_em: string;
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

// Posição do checklist novo: a MESMA no cache e no insert (molde do `idNovo`).
const posicaoNova = new WeakMap<object, number>();
const pos = (v: object) => { if (!posicaoNova.has(v)) posicaoNova.set(v, Date.now()); return posicaoNova.get(v)!; };

async function uid() {
  const { data } = await db.auth.getUser();
  return data?.user?.id ?? null;
}

export function useCardDetail(cardId: string | null) {
  return useQuery({
    queryKey: ["mkt", "card", cardId],
    enabled: !!cardId,
    queryFn: async (): Promise<CardDetail | null> => {
      const cardRes = await db.from("mkt_cards").select("*").eq("id", cardId).maybeSingle();
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
  const { user, profile } = useAuth();
  const inval = () => {
    if (cardId) qc.invalidateQueries({ queryKey: ["mkt", "card", cardId] });
    if (boardId) qc.invalidateQueries({ queryKey: ["mkt", "board", boardId] });
  };
  // Com `otimista`, a tela muda NO CLIQUE e o banco confirma depois
  // (`lib/mktOtimista.ts`); falhou, desfaz e avisa. Sem ele, espera o banco.
  const chaves: QueryKey[] = [["mkt", "card", cardId], ...CHAVES_DE_QUADRO];
  const run = <T>(fn: (v: T) => Promise<void>, otimista?: (v: T) => void) => useMutation<void, Error, T, { foto: Foto } | undefined>({
    mutationFn: fn,
    onMutate: async (v) => {
      if (!otimista) return undefined;
      const foto = await fotografar(qc, chaves);
      otimista(v);
      return { foto };
    },
    onError: (e, _v, ctx) => { if (ctx) desfazer(qc, ctx.foto, e); },
    onSettled: inval,
  });
  // O cartão aberto (cache do detalhe) e o cartão no quadro (cache do quadro).
  const noCartao = (f: (d: CardDetail) => CardDetail) =>
    qc.setQueryData<CardDetail | null>(["mkt", "card", cardId], (d) => (d ? f(d) : d));
  const noQuadro = (f: Parameters<typeof editarCartaoNosQuadros>[2]) => { if (cardId) editarCartaoNosQuadros(qc, cardId, f); };

  const updateCard = run(async (patch: Record<string, unknown>) => {
    const res = await db.from("mkt_cards").update(patch).eq("id", cardId);
    if (res.error) throw res.error;
  }, (patch) => {
    noCartao((d) => ({ ...d, card: { ...d.card, ...patch } as CardFull }));
    // Arquivar/restaurar tira ou põe o cartão no quadro: isso o recarregamento faz.
    if (!("is_archived" in patch)) noQuadro((c) => ({ ...c, ...patch }));
  });

  const toggleLabel = run(async ({ labelId, on }: { labelId: string; on: boolean }) => {
    if (on) {
      const res = await db.from("mkt_card_labels").insert({ card_id: cardId, label_id: labelId });
      if (res.error && !String(res.error.message).includes("duplicate")) throw res.error;
    } else {
      const res = await db.from("mkt_card_labels").delete().eq("card_id", cardId).eq("label_id", labelId);
      if (res.error) throw res.error;
    }
  }, ({ labelId, on }) => {
    const troca = (ids: string[]) => (on ? [...new Set([...ids, labelId])] : ids.filter((x) => x !== labelId));
    noCartao((d) => ({ ...d, labelIds: troca(d.labelIds) }));
    noQuadro((c) => ({ ...c, labelIds: troca(c.labelIds) }));
  });

  // Criar: o id nasce no NAVEGADOR e vai junto no insert (`idNovo`), então o
  // item aparece na hora já com o id definitivo — clicar nele logo depois funciona.
  const createLabel = run(async (v: { name: string; color: string }) => {
    const res = await db.from("mkt_labels").insert({ id: idNovo(v), board_id: boardId, name: v.name, color: v.color });
    if (res.error) throw res.error;
  }, (v) => {
    if (!boardId) return;
    editarQuadros(qc, (d) => (d.board?.id === boardId ? { ...d, labels: [...d.labels, { id: idNovo(v), board_id: boardId, name: v.name, color: v.color }] } : d));
  });

  const updateLabel = run(async ({ id, name }: { id: string; name: string }) => {
    const res = await db.from("mkt_labels").update({ name }).eq("id", id);
    if (res.error) throw res.error;
  });

  const deleteLabel = run(async ({ id }: { id: string }) => {
    const res = await db.from("mkt_labels").delete().eq("id", id);
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
  }, ({ userId, on }) => {
    const troca = (ids: string[]) => (on ? [...new Set([...ids, userId])] : ids.filter((x) => x !== userId));
    noCartao((d) => ({ ...d, memberIds: troca(d.memberIds) }));
    noQuadro((c) => ({ ...c, memberIds: troca(c.memberIds) }));
  });

  const addChecklist = run(async (v: { title: string }) => {
    const res = await db.from("mkt_checklists").insert({ id: idNovo(v), card_id: cardId, title: v.title, position: pos(v) });
    if (res.error) throw res.error;
  }, (v) => {
    noCartao((d) => ({ ...d, checklists: [...d.checklists, { id: idNovo(v), card_id: cardId!, title: v.title, position: pos(v), items: [] }] }));
  });
  const removeChecklist = run(async ({ id }: { id: string }) => {
    const res = await db.from("mkt_checklists").delete().eq("id", id);
    if (res.error) throw res.error;
  }, ({ id }) => {
    noCartao((d) => ({ ...d, checklists: d.checklists.filter((cl) => cl.id !== id) }));
  });
  const addItem = run(async (v: { checklistId: string; text: string; position: number }) => {
    const res = await db.from("mkt_checklist_items").insert({ id: idNovo(v), checklist_id: v.checklistId, text: v.text, position: v.position });
    if (res.error) throw res.error;
  }, (v) => {
    noCartao((d) => ({ ...d, checklists: d.checklists.map((cl) => (cl.id === v.checklistId
      ? { ...cl, items: [...cl.items, { id: idNovo(v), checklist_id: v.checklistId, text: v.text, is_done: false, position: v.position } as ChecklistItem] }
      : cl)) }));
    noQuadro((c) => ({ ...c, checklistTotal: c.checklistTotal + 1 }));
  });
  const toggleItem = run(async ({ id, done }: { id: string; done: boolean }) => {
    const res = await db.from("mkt_checklist_items").update({ is_done: done }).eq("id", id);
    if (res.error) throw res.error;
  }, ({ id, done }) => {
    const antes: { v: boolean | null } = { v: null };
    noCartao((d) => ({ ...d, checklists: d.checklists.map((cl) => ({ ...cl, items: cl.items.map((it) => {
      if (it.id !== id) return it;
      antes.v = it.is_done;
      return { ...it, is_done: done };
    }) })) }));
    // O "3/5" da frente do cartão anda junto.
    if (antes.v !== null && antes.v !== done) noQuadro((c) => ({ ...c, checklistDone: Math.max(0, c.checklistDone + (done ? 1 : -1)) }));
  });
  // Checklist avançado: responsável e data por item.
  const updateItem = run(async ({ id, patch }: { id: string; patch: { assignee_id?: string | null; due_date?: string | null; text?: string } }) => {
    const res = await db.from("mkt_checklist_items").update(patch).eq("id", id);
    if (res.error) throw res.error;
  }, ({ id, patch }) => {
    noCartao((d) => ({ ...d, checklists: d.checklists.map((cl) => ({ ...cl, items: cl.items.map((it) => (it.id === id ? { ...it, ...patch } : it)) })) }));
  });
  const removeItem = run(async ({ id }: { id: string }) => {
    const res = await db.from("mkt_checklist_items").delete().eq("id", id);
    if (res.error) throw res.error;
  }, ({ id }) => {
    noCartao((d) => ({ ...d, checklists: d.checklists.map((cl) => ({ ...cl, items: cl.items.filter((it) => it.id !== id) })) }));
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
  }, ({ id }) => {
    noCartao((d) => ({ ...d, attachments: d.attachments.filter((a) => a.id !== id) }));
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
  }, ({ fieldId, value }) => {
    noCartao((d) => ({ ...d, fieldValues: { ...d.fieldValues, [fieldId]: value } }));
  });

  // Espelhar: cria um cartão-espelho (mirror_of = original) no quadro/lista destino.
  const mirrorCard = useMutation({
    mutationFn: async ({ targetListId, targetBoardId, title, position }: { targetListId: string; targetBoardId: string; title: string; position: number }) => {
      const res = await db.from("mkt_cards").insert({
        list_id: targetListId, board_id: targetBoardId, mirror_of: cardId,
        title, position, created_by: await uid(),
      });
      if (res.error) throw res.error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["mkt", "board"] }); // atualiza o quadro destino
    },
  });

  const addComment = run(async (v: { body: string }) => {
    const res = await db.from("mkt_comments").insert({ id: idNovo(v), card_id: cardId, user_id: await uid(), body: v.body });
    if (res.error) throw res.error;
    if (boardId) await db.from("mkt_activity").insert({ board_id: boardId, card_id: cardId, user_id: await uid(), type: "comment.add", data: {} });
  }, (v) => {
    const agora = new Date().toISOString();
    noCartao((d) => ({ ...d, comments: [{
      id: idNovo(v), card_id: cardId!, user_id: user?.id ?? "", body: v.body, created_at: agora, updated_at: agora,
      authorName: profile?.full_name ?? null, authorAvatar: null,
    }, ...d.comments] }));
    noQuadro((c) => ({ ...c, commentCount: c.commentCount + 1 }));
  });

  const updateComment = run(async ({ id, body }: { id: string; body: string }) => {
    const res = await db.from("mkt_comments").update({ body, updated_at: new Date().toISOString() }).eq("id", id);
    if (res.error) throw res.error;
  }, ({ id, body }) => {
    noCartao((d) => ({ ...d, comments: d.comments.map((c) => (c.id === id ? { ...c, body, updated_at: new Date().toISOString() } : c)) }));
  });

  const removeComment = run(async ({ id }: { id: string }) => {
    const res = await db.from("mkt_comments").delete().eq("id", id);
    if (res.error) throw res.error;
  }, ({ id }) => {
    noCartao((d) => ({ ...d, comments: d.comments.filter((c) => c.id !== id) }));
    noQuadro((c) => ({ ...c, commentCount: Math.max(0, c.commentCount - 1) }));
  });

  return { updateComment, removeComment, updateCard, toggleLabel, createLabel, updateLabel, deleteLabel, toggleMember, addChecklist, removeChecklist, addItem, toggleItem, updateItem, removeItem, addAttachment, removeAttachment, setFieldValue, mirrorCard, addComment };
}

import { useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from "@tanstack/react-query";
import { useChatCtx } from "./context";

// Sufixo único por assinatura Realtime — evita colidir nomes de canal quando o
// mesmo hook é usado em vários componentes ("cannot add callbacks after subscribe").
const rid = () => Math.random().toString(36).slice(2, 10);
import type { ChatAttachment, ChatChannel, ChatMessage, ChatProfileRef, Conversation, FeedComment, FeedHighlights, FeedPost, MessageKind, PollResults, RecentAnnouncement, ScheduledMessage, ScheduledStatus } from "./types";

export interface ChatUserInfo {
  id: string; full_name: string | null; avatar_url: string | null;
  department: string | null; funcao: string | null; email: string | null; username: string | null;
  last_seen_at?: string | null;
}
export interface ChannelMember {
  id: string; role: string; full_name: string | null; avatar_url: string | null;
  // recibos de leitura (estilo WhatsApp)
  lastReadAt?: string | null; lastDeliveredAt?: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Conversas (DMs + grupos) do usuário, já normalizadas + não-lidas.
// ─────────────────────────────────────────────────────────────────────────────
export function useConversations() {
  const { supabase, currentUser } = useChatCtx();
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["chat", "conversations", currentUser.id],
    // Realtime (<ChatAlerts>) invalida quando algo muda de fato; sem isso a lista
    // não precisa re-buscar só porque troquei de conversa/foquei a aba.
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    queryFn: async (): Promise<Conversation[]> => {
      // RPC definer: já traz o outro (DM), a última mensagem, não-lidas e ordena.
      const { data, error } = await supabase.rpc("chat_conversations");
      if (error) throw error;
      type Row = {
        channel_id: string; type: "group" | "dm"; name: string | null; is_private: boolean; channel_avatar: string | null;
        other_id: string | null; other_name: string | null; other_avatar: string | null;
        last_body: string | null; last_kind: string | null; last_at: string | null;
        last_sender_id: string | null; last_sender_name: string | null;
        unread: number; last_activity: string | null; muted: boolean; pinned: boolean; archived: boolean; is_announcement: boolean; needs_ack: boolean;
      };
      return ((data ?? []) as Row[]).map((r): Conversation => ({
        channel: {
          id: r.channel_id, type: r.type, name: r.name, description: null,
          is_private: r.is_private, avatar_url: r.channel_avatar, created_by: null,
          created_at: r.last_activity ?? new Date(0).toISOString(), archived_at: null,
          is_announcement: !!r.is_announcement,
        },
        title: r.type === "dm" ? (r.other_name ?? "Conversa") : (r.name ?? "Canal"),
        avatarUrl: r.type === "dm" ? r.other_avatar : r.channel_avatar,
        otherUserId: r.other_id,
        unread: Number(r.unread) || 0,
        lastAt: r.last_at,
        lastBody: r.last_body,
        lastKind: (r.last_kind as Conversation["lastKind"]) ?? null,
        lastSenderId: r.last_sender_id,
        lastSenderName: r.last_sender_name,
        muted: !!r.muted,
        pinned: !!r.pinned,
        archived: !!r.archived,
        isAnnouncement: !!r.is_announcement,
        needsAck: !!r.needs_ack,
      }));
    },
  });
  // A atualização em tempo real é feita UMA vez pelo <ChatAlerts> (no provider),
  // que invalida esta query — evita múltiplas assinaturas do mesmo canal.
  return query;
}

// ─────────────────────────────────────────────────────────────────────────────
// Mensagens de um canal + realtime.
// ─────────────────────────────────────────────────────────────────────────────
const MSG_SELECT =
  "*, sender:profiles!chat_messages_sender_id_fkey(id, full_name, avatar_url), attachments:chat_attachments(*), reactions:chat_reactions(message_id, user_id, emoji)";

// focusAt: quando "pulamos" pra uma mensagem antiga (fora das 200 recentes),
// carrega uma janela em volta dela (100 antes + 100 depois).
export function useMessages(channelId: string | null, focusAt?: string | null) {
  const { supabase, currentUser } = useChatCtx();
  const qc = useQueryClient();
  const baseKey = ["chat", "messages", channelId];
  const key = [...baseKey, focusAt ?? "tail"];

  const query = useQuery({
    queryKey: key,
    enabled: !!channelId,
    // Mensagens já vistas ficam em cache: reabrir a conversa renderiza na hora e
    // atualiza em segundo plano. O Realtime (abaixo) invalida quando chega msg
    // nova, então o cache nunca fica velho de verdade. Sem isso, cada troca
    // mostrava "Carregando…" e esperava ~600ms do chat_messages.
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    queryFn: async (): Promise<ChatMessage[]> => {
      if (focusAt) {
        const before = await supabase.from("chat_messages").select(MSG_SELECT)
          .eq("channel_id", channelId).lte("created_at", focusAt)
          .order("created_at", { ascending: false }).limit(100);
        if (before.error) throw before.error;
        const after = await supabase.from("chat_messages").select(MSG_SELECT)
          .eq("channel_id", channelId).gt("created_at", focusAt)
          .order("created_at", { ascending: true }).limit(100);
        if (after.error) throw after.error;
        return [...((before.data ?? []) as ChatMessage[]).reverse(), ...((after.data ?? []) as ChatMessage[])];
      }
      const { data, error } = await supabase
        .from("chat_messages").select(MSG_SELECT)
        .eq("channel_id", channelId)
        .order("created_at", { ascending: true })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as ChatMessage[];
    },
  });

  useEffect(() => {
    if (!channelId) return;
    const ch = supabase
      .channel("chat:messages:" + channelId + ":" + rid())
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_messages", filter: `channel_id=eq.${channelId}` }, () => {
        qc.invalidateQueries({ queryKey: baseKey });
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "chat_messages", filter: `channel_id=eq.${channelId}` }, () => {
        qc.invalidateQueries({ queryKey: baseKey });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "chat_reactions" }, () => {
        qc.invalidateQueries({ queryKey: baseKey });
      })
      // Recibos de leitura ao vivo: quando um membro marca lido/entregue, o
      // last_read_at/last_delivered_at muda → recalcula os ✓/✓✓ nas mensagens.
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "chat_channel_members", filter: `channel_id=eq.${channelId}` }, () => {
        qc.invalidateQueries({ queryKey: ["chat", "members", channelId] });
      })
      // Confirmações de comunicado (ao vivo) — "Li e estou ciente".
      .on("postgres_changes", { event: "*", schema: "public", table: "chat_acks", filter: `channel_id=eq.${channelId}` }, () => {
        qc.invalidateQueries({ queryKey: ["chat", "acks", channelId] });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase, channelId]);

  // Marca lido UMA vez ao abrir o canal e novamente só quando chega mensagem
  // nova enquanto vejo (msgLen cresce). Antes disparava 2x por troca e ainda
  // invalidava a lista toda (chat_conversations em rajada). Agora: 1 chamada por
  // abertura; zera as não-lidas DESTE canal no cache (sem refetch da lista) e só
  // toca o unread-total se havia algo não-lido.
  const convKey = ["chat", "conversations", currentUser.id];
  const msgLen = query.data?.length ?? 0;
  const marked = useRef<{ ch: string | null; len: number }>({ ch: null, len: 0 });
  useEffect(() => {
    if (!channelId || query.isLoading) return;
    const prev = marked.current;
    const isNewChannel = prev.ch !== channelId;
    const grew = !isNewChannel && msgLen > prev.len;
    if (!isNewChannel && !grew) return;
    // Debounce: clicar rápido por várias conversas NÃO dispara um chat_mark_read
    // por clique (isso entupia o pool de conexões e travava os cliques "um por
    // um"). Só marca a conversa em que você fica ~500ms.
    const t = window.setTimeout(() => {
      marked.current = { ch: channelId, len: msgLen };
      const cur = qc.getQueryData<Conversation[]>(convKey);
      const hadUnread = (cur?.find((c) => c.channel.id === channelId)?.unread ?? 0) > 0;
      supabase.rpc("chat_mark_read", { p_channel: channelId }).then(() => {
        if (!hadUnread) return;
        qc.setQueryData<Conversation[]>(convKey, (old) =>
          old ? old.map((c) => (c.channel.id === channelId ? { ...c, unread: 0 } : c)) : old);
        qc.invalidateQueries({ queryKey: ["chat", "unread-total", currentUser.id] });
      }, () => {});
    }, 500);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelId, msgLen, query.isLoading]);

  return query;
}

// ─────────────────────────────────────────────────────────────────────────────
// Busca no servidor (full-text). p_channel nulo = global; preenchido = 1 canal.
// ─────────────────────────────────────────────────────────────────────────────
export interface SearchHit {
  messageId: string; channelId: string; channelType: "dm" | "group"; channelTitle: string;
  body: string; createdAt: string; senderId: string | null; senderName: string | null; rank: number;
}

const SEARCH_PAGE = 20;

export function useSearchMessages(query: string, channelId?: string | null) {
  const { supabase } = useChatCtx();
  const q = query.trim();
  return useInfiniteQuery({
    queryKey: ["chat", "search", channelId ?? "global", q],
    enabled: q.length >= 2,
    initialPageParam: 0,
    queryFn: async ({ pageParam }): Promise<SearchHit[]> => {
      const { data, error } = await supabase.rpc("chat_search", {
        p_query: q, p_channel: channelId ?? null, p_limit: SEARCH_PAGE, p_offset: pageParam,
      });
      if (error) throw error;
      type Row = {
        message_id: string; channel_id: string; channel_type: "dm" | "group"; channel_title: string;
        body: string; created_at: string; sender_id: string | null; sender_name: string | null; rank: number;
      };
      return ((data ?? []) as Row[]).map((r) => ({
        messageId: r.message_id, channelId: r.channel_id, channelType: r.channel_type, channelTitle: r.channel_title,
        body: r.body, createdAt: r.created_at, senderId: r.sender_id, senderName: r.sender_name, rank: r.rank,
      }));
    },
    getNextPageParam: (last, all) => (last.length === SEARCH_PAGE ? all.length * SEARCH_PAGE : undefined),
  });
}

export interface OutgoingAttachment {
  file: File | Blob;
  filename: string;
  kind: "image" | "video" | "audio" | "file";
  durationMs?: number;
}

export function kindFromMime(mime: string): "image" | "video" | "audio" | "file" {
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  return "file";
}

const BUCKET = "chat-media";
const safeName = (n: string) => n.replace(/[^\w.\-]+/g, "_").slice(-80);

export function useSendMessage(channelId: string | null) {
  const { supabase, currentUser } = useChatCtx();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: string | { body?: string; attachments?: OutgoingAttachment[]; mentions?: string[]; replyToId?: string | null; mentionAll?: boolean }) => {
      const body = typeof payload === "string" ? payload : (payload.body ?? "");
      const attachments = typeof payload === "string" ? [] : (payload.attachments ?? []);
      const mentions = typeof payload === "string" ? [] : (payload.mentions ?? []);
      const replyToId = typeof payload === "string" ? null : (payload.replyToId ?? null);
      const mentionAll = typeof payload === "string" ? false : !!payload.mentionAll;
      if (!channelId) return;
      if (!body.trim() && attachments.length === 0) return;

      const kind = attachments.length ? attachments[0].kind : "text";
      const { data: msg, error } = await supabase.from("chat_messages").insert({
        channel_id: channelId, sender_id: currentUser.id, kind, body: body.trim() || null,
        mentions: mentions.length ? mentions : [],
        reply_to_id: replyToId,
        metadata: mentionAll ? { mention_all: true } : {},
      }).select("id").single();
      if (error) throw error;
      const messageId = (msg as { id: string }).id;

      for (const att of attachments) {
        // Imagens: reduz pra ≤1600px antes de subir. Um screenshot/foto de 90+MP
        // custava >2s de decode na main thread ao aparecer (travava a UI).
        const isImage = att.kind === "image" && ((att.file as File).type ?? "").startsWith("image/");
        const upload: Blob = isImage ? await downscaleImage(att.file as File, 1600) : att.file;
        const path = `${channelId}/${messageId}/${Date.now()}-${safeName(att.filename)}`;
        const contentType = upload.type || (att.file as File).type || undefined;
        const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, upload, { contentType, upsert: false });
        if (upErr) throw upErr;
        const { error: aErr } = await supabase.from("chat_attachments").insert({
          message_id: messageId,
          storage_path: path,
          mime_type: contentType ?? null,
          size_bytes: upload.size ?? null,
          duration_ms: att.durationMs ?? null,
        });
        if (aErr) throw aErr;
      }

      // Anexos são inseridos depois da mensagem; um UPDATE "toca" a mensagem para
      // que o destinatário (que só escuta a tabela de mensagens) recarregue já com eles.
      if (attachments.length) {
        await supabase.from("chat_messages")
          .update({ metadata: { attachments: attachments.length } }).eq("id", messageId);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["chat", "messages", channelId] });
      qc.invalidateQueries({ queryKey: ["chat", "conversations", currentUser.id] });
    },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Agendar mensagem ("enviar depois"). Os anexos sobem AGORA (o cron não tem
// navegador pra subir depois); guardamos os paths em metadata.attachments.
// ─────────────────────────────────────────────────────────────────────────────
export interface ScheduleInput {
  body?: string;
  attachments?: OutgoingAttachment[];
  mentions?: string[];
  mentionAll?: boolean;
  sendAt: Date;
}

export function useScheduleMessage(channelId: string | null) {
  const { supabase, currentUser } = useChatCtx();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: ScheduleInput): Promise<string> => {
      if (!channelId) throw new Error("Sem canal");
      const body = (input.body ?? "").trim();
      const attachments = input.attachments ?? [];
      if (!body && attachments.length === 0) throw new Error("Mensagem vazia");

      const folder = (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`);
      const uploaded: { storage_path: string; mime_type: string | null; size_bytes: number | null; duration_ms: number | null }[] = [];
      for (const att of attachments) {
        const isImage = att.kind === "image" && ((att.file as File).type ?? "").startsWith("image/");
        const upload: Blob = isImage ? await downscaleImage(att.file as File, 1600) : att.file;
        const path = `${channelId}/scheduled/${folder}/${Date.now()}-${safeName(att.filename)}`;
        const contentType = upload.type || (att.file as File).type || undefined;
        const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, upload, { contentType, upsert: false });
        if (upErr) throw upErr;
        uploaded.push({ storage_path: path, mime_type: contentType ?? null, size_bytes: upload.size ?? null, duration_ms: att.durationMs ?? null });
      }

      const kind: MessageKind = attachments.length ? attachments[0].kind : "text";
      const metadata: Record<string, unknown> = {};
      if (input.mentionAll) metadata.mention_all = true;
      if (uploaded.length) metadata.attachments = uploaded;

      const { data, error } = await supabase.from("chat_scheduled_messages").insert({
        author_id: currentUser.id, channel_id: channelId, kind,
        body: body || null, mentions: input.mentions ?? [],
        metadata, send_at: input.sendAt.toISOString(),
      }).select("send_at").single();
      if (error) throw error;
      return (data as { send_at: string }).send_at; // já arredondado pelo trigger
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["chat", "scheduled", currentUser.id] }),
  });
}

// Fila de agendadas do usuário (pendentes + falhas). Some ao ser enviada.
export function useScheduledMessages() {
  const { supabase, currentUser } = useChatCtx();
  return useQuery({
    queryKey: ["chat", "scheduled", currentUser.id],
    refetchInterval: 30_000,
    queryFn: async (): Promise<ScheduledMessage[]> => {
      const { data, error } = await supabase.from("chat_scheduled_messages")
        .select("id, channel_id, kind, body, mentions, metadata, send_at, status, attempts, last_error")
        .in("status", ["pending", "failed"])
        .order("send_at", { ascending: true });
      if (error) throw error;
      type Row = {
        id: string; channel_id: string; kind: MessageKind; body: string | null;
        mentions: string[] | null; metadata: Record<string, unknown> | null;
        send_at: string; status: ScheduledStatus; attempts: number; last_error: string | null;
      };
      return ((data ?? []) as Row[]).map((r): ScheduledMessage => {
        const atts = (r.metadata as { attachments?: unknown[] } | null)?.attachments;
        return {
          id: r.id, channelId: r.channel_id, kind: r.kind, body: r.body,
          mentions: r.mentions ?? [], metadata: r.metadata ?? {}, sendAt: r.send_at,
          status: r.status, attempts: r.attempts, lastError: r.last_error,
          attachmentCount: Array.isArray(atts) ? atts.length : 0,
        };
      });
    },
  });
}

export function useUpdateScheduled() {
  const { supabase, currentUser } = useChatCtx();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, body, sendAt }: { id: string; body?: string; sendAt?: Date }) => {
      const patch: Record<string, unknown> = {};
      if (body !== undefined) patch.body = body.trim() || null;
      if (sendAt) patch.send_at = sendAt.toISOString();
      const { error } = await supabase.from("chat_scheduled_messages").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["chat", "scheduled", currentUser.id] }),
  });
}

export function useCancelScheduled() {
  const { supabase, currentUser } = useChatCtx();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("chat_scheduled_messages").update({ status: "canceled" }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["chat", "scheduled", currentUser.id] }),
  });
}

// Reagir / desreagir a uma mensagem.
export function useToggleReaction() {
  const { supabase, currentUser } = useChatCtx();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ messageId, emoji, active }: { messageId: string; emoji: string; channelId: string; active: boolean }) => {
      if (active) {
        const { error } = await supabase.from("chat_reactions")
          .delete().eq("message_id", messageId).eq("user_id", currentUser.id).eq("emoji", emoji);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("chat_reactions")
          .insert({ message_id: messageId, user_id: currentUser.id, emoji });
        if (error) throw error;
      }
    },
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ["chat", "messages", v.channelId] }),
  });
}

// Editar a própria mensagem (marca "(editado)").
export function useEditMessage() {
  const { supabase, currentUser } = useChatCtx();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ messageId, body }: { messageId: string; body: string; channelId: string }) => {
      const { error } = await supabase.rpc("chat_edit_message", { p_id: messageId, p_body: body });
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ["chat", "messages", v.channelId] });
      qc.invalidateQueries({ queryKey: ["chat", "conversations", currentUser.id] });
    },
  });
}

// Apagar a própria mensagem (soft-delete → "Esta mensagem foi apagada").
export function useDeleteMessage() {
  const { supabase, currentUser } = useChatCtx();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ messageId }: { messageId: string; channelId: string }) => {
      const { error } = await supabase.rpc("chat_delete_message", { p_id: messageId });
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ["chat", "messages", v.channelId] });
      qc.invalidateQueries({ queryKey: ["chat", "conversations", currentUser.id] });
      qc.invalidateQueries({ queryKey: ["chat", "media", v.channelId] });
    },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Comunicado Oficial (announcement)
// ─────────────────────────────────────────────────────────────────────────────
export function useCanAnnounce() {
  const { supabase, currentUser } = useChatCtx();
  return useQuery({
    queryKey: ["chat", "can-announce", currentUser.id],
    queryFn: async (): Promise<boolean> => {
      const { data, error } = await supabase.rpc("chat_can_announce");
      if (error) throw error;
      return !!data;
    },
  });
}

export function useCreateAnnouncement() {
  const { supabase, currentUser } = useChatCtx();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ name, memberIds, adminIds }: { name: string; memberIds: string[]; adminIds?: string[] }): Promise<string> => {
      const { data, error } = await supabase.rpc("chat_create_announcement", {
        p_name: name, p_member_ids: memberIds, p_admin_ids: adminIds ?? [],
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["chat", "conversations", currentUser.id] }),
  });
}

// Departamentos (pro seletor de público do comunicado).
export function useDepartments() {
  const { supabase } = useChatCtx();
  return useQuery({
    queryKey: ["chat", "departments"],
    queryFn: async (): Promise<string[]> => {
      const { data, error } = await supabase.rpc("chat_departments");
      if (error) throw error;
      return ((data ?? []) as { dep: string }[]).map((r) => r.dep);
    },
  });
}

export type AnnAudience = "all" | "departments" | "users";

// Cria o comunicado (público resolvido no servidor) E publica a 1ª mensagem.
export function usePublishAnnouncement() {
  const { supabase, currentUser } = useChatCtx();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ name, audience, departments, memberIds, body, image }:
      { name: string; audience: AnnAudience; departments?: string[]; memberIds?: string[]; body: string; image?: File | null }): Promise<string> => {
      const { data, error } = await supabase.rpc("chat_create_announcement_audience", {
        p_name: name, p_audience: audience,
        p_departments: departments ?? [], p_user_ids: memberIds ?? [],
      });
      if (error) throw error;
      const channelId = data as string;
      const kind = image ? "image" : "text";
      const { data: msg, error: mErr } = await supabase.from("chat_messages")
        .insert({ channel_id: channelId, sender_id: currentUser.id, kind, body: body.trim() || null, mentions: [], metadata: {} })
        .select("id").single();
      if (mErr) throw mErr;
      const messageId = (msg as { id: string }).id;
      if (image) {
        const path = `${channelId}/${messageId}/${Date.now()}-${safeName(image.name)}`;
        const contentType = image.type || undefined;
        const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, image, { contentType, upsert: false });
        if (upErr) throw upErr;
        const { error: aErr } = await supabase.from("chat_attachments")
          .insert({ message_id: messageId, storage_path: path, mime_type: contentType ?? null, size_bytes: image.size ?? null });
        if (aErr) throw aErr;
        await supabase.from("chat_messages").update({ metadata: { attachments: 1 } }).eq("id", messageId);
      }
      return channelId;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["chat", "conversations", currentUser.id] }),
  });
}

export function useAckMessage() {
  const { supabase } = useChatCtx();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ messageId }: { messageId: string; channelId: string }) => {
      const { error } = await supabase.rpc("chat_ack_message", { p_message: messageId });
      if (error) throw error;
    },
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ["chat", "acks", v.channelId] }),
  });
}

export interface AckRow { message_id: string; user_id: string; acked_at: string }
// Confirmações do canal: RLS devolve as minhas + (se sou admin) as de todos.
export function useChannelAcks(channelId: string | null, enabled = true) {
  const { supabase } = useChatCtx();
  return useQuery({
    queryKey: ["chat", "acks", channelId],
    enabled: !!channelId && enabled,
    queryFn: async (): Promise<AckRow[]> => {
      const { data, error } = await supabase.from("chat_acks")
        .select("message_id, user_id, acked_at").eq("channel_id", channelId);
      if (error) throw error;
      return (data ?? []) as AckRow[];
    },
  });
}

export interface AnnouncementStatusRow { user_id: string; full_name: string | null; avatar_url: string | null; acked: boolean; acked_at: string | null }
export function useAnnouncementStatus(messageId: string | null) {
  const { supabase } = useChatCtx();
  return useQuery({
    queryKey: ["chat", "ann-status", messageId],
    enabled: !!messageId,
    queryFn: async (): Promise<AnnouncementStatusRow[]> => {
      const { data, error } = await supabase.rpc("chat_announcement_status", { p_message: messageId });
      if (error) throw error;
      return (data ?? []) as AnnouncementStatusRow[];
    },
  });
}

// URL assinada (bucket privado) com cache — expira em 1h.
export function useSignedUrl(path: string | null | undefined) {
  const { supabase } = useChatCtx();
  return useQuery({
    queryKey: ["chat", "signed-url", path],
    enabled: !!path,
    staleTime: 55 * 60_000,
    queryFn: async (): Promise<string | null> => {
      const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path!, 3600);
      if (error) throw error;
      return data?.signedUrl ?? null;
    },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Total de não-lidas (badge).
// ─────────────────────────────────────────────────────────────────────────────
export function useUnreadTotal() {
  const { supabase, currentUser } = useChatCtx();
  // Invalidação em tempo real é feita pelo <ChatAlerts> (assinatura única).
  return useQuery({
    queryKey: ["chat", "unread-total", currentUser.id],
    queryFn: async (): Promise<number> => {
      const { data, error } = await supabase.rpc("chat_unread_counts");
      if (error) throw error;
      return ((data ?? []) as { unread: number }[]).reduce((n, r) => n + (Number(r.unread) || 0), 0);
    },
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    refetchInterval: 60_000,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Diretório de internos (para iniciar DM / montar grupo).
// ─────────────────────────────────────────────────────────────────────────────
export function useDirectory(search: string) {
  const { supabase, currentUser } = useChatCtx();
  return useQuery({
    queryKey: ["chat", "directory", search],
    // O diretório muda raramente; sem isso, cada troca de conversa (o Composer
    // remonta e busca "" de novo) refazia chat_directory.
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    queryFn: async (): Promise<ChatProfileRef[]> => {
      // RPC definer: traz TODOS os internos (a RLS de profiles filtraria por escopo).
      const { data, error } = await supabase.rpc("chat_directory", { p_search: search.trim() || null });
      if (error) throw error;
      return ((data ?? []) as ChatProfileRef[]).filter((p) => p.id !== currentUser.id);
    },
  });
}

// Mapa id → {full_name, avatar_url} via RPC definer (contorna a RLS de profiles).
export function useProfilesMap(ids: string[]) {
  const { supabase } = useChatCtx();
  const key = Array.from(new Set(ids.filter(Boolean))).sort();
  return useQuery({
    queryKey: ["chat", "profiles-map", key],
    enabled: key.length > 0,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<Record<string, ChatProfileRef>> => {
      const { data, error } = await supabase.rpc("chat_profiles", { p_ids: key });
      if (error) throw error;
      const map: Record<string, ChatProfileRef> = {};
      for (const p of (data ?? []) as ChatProfileRef[]) map[p.id] = p;
      return map;
    },
  });
}

// Excluir/limpar a conversa para mim (sai do canal — some da minha lista).
export function useLeaveConversation() {
  const { supabase, currentUser } = useChatCtx();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (channelId: string) => {
      const { error } = await supabase.from("chat_channel_members")
        .delete().eq("channel_id", channelId).eq("user_id", currentUser.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["chat", "conversations", currentUser.id] });
      qc.invalidateQueries({ queryKey: ["chat", "unread-total", currentUser.id] });
    },
  });
}

// Silenciar / fixar a conversa (por usuário).
export function useUpdateMembership() {
  const { supabase, currentUser } = useChatCtx();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ channelId, patch }: { channelId: string; patch: { muted?: boolean; pinned?: boolean; last_read_at?: string; archived?: boolean } }) => {
      const { error } = await supabase.from("chat_channel_members")
        .update(patch).eq("channel_id", channelId).eq("user_id", currentUser.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["chat", "conversations", currentUser.id] });
      qc.invalidateQueries({ queryKey: ["chat", "unread-total", currentUser.id] });
    },
  });
}

// Renomear grupo (dono/admin — validado na RLS de chat_channels).
export function useRenameChannel() {
  const { supabase, currentUser } = useChatCtx();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ channelId, name }: { channelId: string; name: string }) => {
      const { error } = await supabase.from("chat_channels").update({ name: name.trim() }).eq("id", channelId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["chat", "conversations", currentUser.id] }),
  });
}

// Trocar a foto do grupo (upload no bucket público chat-avatars + avatar_url).
// Reduz a imagem a no máx. `max`px (avatar é exibido em ≤80px). Uma foto de vários
// MB vira ~20–40KB → sem download/decodificação pesada travando a troca de conversa.
async function downscaleImage(file: File, max = 256): Promise<Blob> {
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
    if (scale >= 1 && file.size < 120_000) { bmp.close?.(); return file; }
    const w = Math.max(1, Math.round(bmp.width * scale));
    const h = Math.max(1, Math.round(bmp.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) { bmp.close?.(); return file; }
    ctx.drawImage(bmp, 0, 0, w, h);
    bmp.close?.();
    const blob: Blob | null = await new Promise((res) => canvas.toBlob(res, "image/webp", 0.85));
    return blob ?? file;
  } catch {
    return file; // navegador sem suporte → sobe original
  }
}

export function useSetChannelAvatar() {
  const { supabase, currentUser } = useChatCtx();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ channelId, file }: { channelId: string; file: File }): Promise<string> => {
      const blob = await downscaleImage(file);
      const ext = blob.type === "image/webp" ? "webp" : (file.name.split(".").pop() || "jpg").toLowerCase();
      const path = `${channelId}/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("chat-avatars").upload(path, blob, { contentType: blob.type || undefined, upsert: true });
      if (upErr) throw upErr;
      const url = supabase.storage.from("chat-avatars").getPublicUrl(path).data.publicUrl;
      const { error } = await supabase.from("chat_channels").update({ avatar_url: url }).eq("id", channelId);
      if (error) throw error;
      return url;
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ["chat", "conversations", currentUser.id] });
      qc.invalidateQueries({ queryKey: ["chat", "members", v.channelId] });
    },
  });
}

// Adicionar membros a um grupo (dono/admin).
export function useAddMembers() {
  const { supabase, currentUser } = useChatCtx();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ channelId, userIds }: { channelId: string; userIds: string[] }) => {
      if (!userIds.length) return;
      const rows = userIds.map((id) => ({ channel_id: channelId, user_id: id, role: "member" }));
      const { error } = await supabase.from("chat_channel_members").upsert(rows, { onConflict: "channel_id,user_id", ignoreDuplicates: true });
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ["chat", "members", v.channelId] });
      qc.invalidateQueries({ queryKey: ["chat", "conversations", currentUser.id] });
    },
  });
}

// Remover membro de um grupo (dono/admin).
export function useRemoveMember() {
  const { supabase, currentUser } = useChatCtx();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ channelId, userId }: { channelId: string; userId: string }) => {
      const { error } = await supabase.from("chat_channel_members")
        .delete().eq("channel_id", channelId).eq("user_id", userId);
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ["chat", "members", v.channelId] });
      qc.invalidateQueries({ queryKey: ["chat", "conversations", currentUser.id] });
    },
  });
}

// Dados do contato (DM).
export function useUserInfo(userId: string | null) {
  const { supabase } = useChatCtx();
  return useQuery({
    queryKey: ["chat", "user-info", userId],
    enabled: !!userId,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    queryFn: async (): Promise<ChatUserInfo | null> => {
      const { data, error } = await supabase.rpc("chat_user_info", { p_id: userId });
      if (error) throw error;
      return ((data ?? [])[0] as ChatUserInfo) ?? null;
    },
  });
}

// Membros de um grupo (com nome/avatar via RPC definer).
export function useChannelMembers(channelId: string | null, enabled = true) {
  const { supabase } = useChatCtx();
  return useQuery({
    queryKey: ["chat", "members", channelId],
    enabled: !!channelId && enabled,
    // Recibos de leitura são atualizados ao vivo pelo listener de members em
    // useMessages (invalida esta key). Sem isso, não re-busca a cada troca.
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    queryFn: async (): Promise<ChannelMember[]> => {
      const { data: mem, error } = await supabase
        .from("chat_channel_members").select("user_id, role, last_read_at, last_delivered_at").eq("channel_id", channelId);
      if (error) throw error;
      const rows = (mem ?? []) as { user_id: string; role: string; last_read_at: string | null; last_delivered_at: string | null }[];
      const ids = rows.map((r) => r.user_id);
      const map: Record<string, ChatProfileRef> = {};
      if (ids.length) {
        const { data: profs } = await supabase.rpc("chat_profiles", { p_ids: ids });
        for (const p of (profs ?? []) as ChatProfileRef[]) map[p.id] = p;
      }
      return rows.map((r) => ({
        id: r.user_id, role: r.role,
        full_name: map[r.user_id]?.full_name ?? null,
        avatar_url: map[r.user_id]?.avatar_url ?? null,
        lastReadAt: r.last_read_at,
        lastDeliveredAt: r.last_delivered_at,
      }));
    },
  });
}

// Mídias/arquivos da conversa (anexos), mais recentes primeiro.
export function useChannelMedia(channelId: string | null, enabled = true) {
  const { supabase } = useChatCtx();
  return useQuery({
    queryKey: ["chat", "media", channelId],
    enabled: !!channelId && enabled,
    queryFn: async (): Promise<ChatAttachment[]> => {
      const { data: msgs, error } = await supabase
        .from("chat_messages").select("id, created_at").eq("channel_id", channelId).is("deleted_at", null);
      if (error) throw error;
      const rows = (msgs ?? []) as { id: string; created_at: string }[];
      const when: Record<string, string> = {};
      for (const m of rows) when[m.id] = m.created_at;
      const ids = rows.map((m) => m.id);
      if (!ids.length) return [];
      const { data: atts, error: aErr } = await supabase.from("chat_attachments").select("*").in("message_id", ids);
      if (aErr) throw aErr;
      return ((atts ?? []) as ChatAttachment[]).sort(
        (a, b) => (when[b.message_id] ?? "").localeCompare(when[a.message_id] ?? ""),
      );
    },
  });
}

export function useStartDm() {
  const { supabase, currentUser } = useChatCtx();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (otherUserId: string): Promise<string> => {
      const { data, error } = await supabase.rpc("chat_get_or_create_dm", { p_other: otherUserId });
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["chat", "conversations", currentUser.id] }),
  });
}

export function useCreateChannel() {
  const { supabase, currentUser } = useChatCtx();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ name, memberIds, isPrivate, description, topic }: {
      name: string; memberIds: string[]; isPrivate: boolean; description?: string; topic?: string;
    }): Promise<string> => {
      // RPC definer: cria canal + owner + membros atomicamente, sem o impasse de
      // RLS (grupo privado não é "visível" ao inserir membros pelo cliente).
      const { data, error } = await supabase.rpc("chat_create_group", {
        p_name: name, p_member_ids: memberIds, p_is_private: isPrivate,
        p_visibility: isPrivate ? "private" : "public",
        p_description: description ?? null, p_topic: topic ?? null,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["chat", "conversations", currentUser.id] });
      qc.invalidateQueries({ queryKey: ["chat", "public-channels"] });
    },
  });
}

// Diretório de canais PÚBLICOS (Explorar). Respeita is_employee no servidor.
export interface PublicChannel {
  channelId: string; name: string | null; description: string | null; topic: string | null;
  avatarUrl: string | null; memberCount: number; isMember: boolean; lastActivity: string | null;
}
export function usePublicChannels(search: string) {
  const { supabase } = useChatCtx();
  const q = search.trim();
  return useQuery({
    queryKey: ["chat", "public-channels", q],
    queryFn: async (): Promise<PublicChannel[]> => {
      const { data, error } = await supabase.rpc("chat_public_channels", { p_search: q || null });
      if (error) throw error;
      type Row = {
        channel_id: string; name: string | null; description: string | null; topic: string | null;
        avatar_url: string | null; member_count: number; is_member: boolean; last_activity: string | null;
      };
      return ((data ?? []) as Row[]).map((r) => ({
        channelId: r.channel_id, name: r.name, description: r.description, topic: r.topic,
        avatarUrl: r.avatar_url, memberCount: Number(r.member_count) || 0,
        isMember: !!r.is_member, lastActivity: r.last_activity,
      }));
    },
  });
}

export function useJoinChannel() {
  const { supabase, currentUser } = useChatCtx();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (channelId: string) => {
      const { error } = await supabase.rpc("chat_join_channel", { p_channel: channelId });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["chat", "public-channels"] });
      qc.invalidateQueries({ queryKey: ["chat", "conversations", currentUser.id] });
      qc.invalidateQueries({ queryKey: ["chat", "members"] });
    },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Status pessoal + Não perturbe / horário de silêncio.
// ─────────────────────────────────────────────────────────────────────────────
export type Availability = "disponivel" | "em_reuniao" | "em_campo" | "ausente" | "ferias";
export interface UserStatus {
  emoji: string | null; texto: string | null; availability: Availability; dnd: boolean; expiraEm: string | null;
}
export interface MyStatus extends UserStatus {
  quietInicio: string | null; quietFim: string | null; timezone: string; urgentBypass: boolean;
}

export function useMyStatus() {
  const { supabase, currentUser } = useChatCtx();
  return useQuery({
    queryKey: ["chat", "my-status", currentUser.id],
    queryFn: async (): Promise<MyStatus | null> => {
      const { data, error } = await supabase.from("chat_user_status").select("*").eq("user_id", currentUser.id).maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const r = data as Record<string, unknown>;
      return {
        emoji: (r.emoji as string) ?? null, texto: (r.texto as string) ?? null,
        availability: (r.availability as Availability) ?? "disponivel", dnd: !!r.dnd,
        expiraEm: (r.expira_em as string) ?? null,
        quietInicio: (r.quiet_inicio as string) ?? null, quietFim: (r.quiet_fim as string) ?? null,
        timezone: (r.timezone as string) ?? "America/Sao_Paulo", urgentBypass: r.urgent_bypass !== false,
      };
    },
  });
}

export interface SetStatusInput {
  emoji?: string | null; texto?: string | null; availability?: Availability; expira_em?: string | null;
  dnd?: boolean; quiet_inicio?: string | null; quiet_fim?: string | null; timezone?: string; urgent_bypass?: boolean;
}
export function useSetStatus() {
  const { supabase, currentUser } = useChatCtx();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch: SetStatusInput) => {
      const { error } = await supabase.from("chat_user_status")
        .upsert({ user_id: currentUser.id, ...patch, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["chat", "my-status", currentUser.id] });
      qc.invalidateQueries({ queryKey: ["chat", "statuses"] });
    },
  });
}

// Status efetivo (emoji/texto/availability) de várias pessoas — lista/painel.
export function useUserStatuses(ids: string[]) {
  const { supabase } = useChatCtx();
  const key = Array.from(new Set(ids.filter(Boolean))).sort();
  return useQuery({
    queryKey: ["chat", "statuses", key],
    enabled: key.length > 0,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    queryFn: async (): Promise<Record<string, UserStatus>> => {
      const { data, error } = await supabase.rpc("chat_statuses", { p_ids: key });
      if (error) throw error;
      const map: Record<string, UserStatus> = {};
      for (const r of (data ?? []) as Record<string, unknown>[]) {
        map[r.user_id as string] = {
          emoji: (r.emoji as string) ?? null, texto: (r.texto as string) ?? null,
          availability: (r.availability as Availability) ?? "disponivel", dnd: !!r.dnd, expiraEm: (r.expira_em as string) ?? null,
        };
      }
      return map;
    },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Enquetes/votações (kind='poll'). Resultados ao vivo reaproveitam a assinatura
// do ChatAlerts (voto "toca" a mensagem-pai + tabelas de poll no Realtime).
// ─────────────────────────────────────────────────────────────────────────────
export interface CreatePollInput {
  pergunta: string;
  opcoes: string[];
  multipla: boolean;
  anonima: boolean;
  expiraEm?: string | null;
}

export function useCreatePoll(channelId: string | null) {
  const { supabase, currentUser } = useChatCtx();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreatePollInput) => {
      if (!channelId) return;
      const { data, error } = await supabase.rpc("chat_poll_create", {
        p_channel: channelId,
        p_pergunta: input.pergunta,
        p_opcoes: input.opcoes,
        p_multipla: input.multipla,
        p_anonima: input.anonima,
        p_expira_em: input.expiraEm ?? null,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => {
      if (channelId) qc.invalidateQueries({ queryKey: ["chat", "messages", channelId] });
      qc.invalidateQueries({ queryKey: ["chat", "conversations", currentUser.id] });
    },
  });
}

// Config + resultados de uma enquete. staleTime curto; o ChatAlerts invalida
// ["chat","poll"] quando chega/muda voto → atualiza a barra ao vivo.
export function usePoll(messageId: string | null) {
  const { supabase } = useChatCtx();
  return useQuery({
    queryKey: ["chat", "poll", messageId],
    enabled: !!messageId,
    staleTime: 10_000,
    refetchOnWindowFocus: false,
    queryFn: async (): Promise<PollResults | null> => {
      const { data, error } = await supabase.rpc("chat_poll_get", { p_message_id: messageId });
      if (error) throw error;
      return (data as PollResults | null) ?? null;
    },
  });
}

export function useVotePoll() {
  const { supabase } = useChatCtx();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ pollId, opcoes }: { pollId: string; opcoes: number[] }) => {
      const { error } = await supabase.rpc("chat_poll_vote", { p_poll: pollId, p_opcoes: opcoes });
      if (error) throw error;
    },
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ["chat", "poll", v.pollId] }),
  });
}

export function useClosePoll() {
  const { supabase } = useChatCtx();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ pollId }: { pollId: string }) => {
      const { error } = await supabase.rpc("chat_poll_close", { p_poll: pollId });
      if (error) throw error;
    },
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ["chat", "poll", v.pollId] }),
  });
}

// Grava a transcrição/estado de um anexo de áudio (chat_set_transcription).
// A UI atualiza ao vivo pra todos porque a RPC "toca" a mensagem-pai.
export function useSetTranscription() {
  const { supabase, currentUser } = useChatCtx();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ attachmentId, text, status }: { attachmentId: string; text: string | null; status: "none" | "pending" | "done" | "failed"; channelId: string }) => {
      const { error } = await supabase.rpc("chat_set_transcription", { p_attachment: attachmentId, p_text: text, p_status: status });
      if (error) throw error;
    },
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ["chat", "messages", v.channelId] }),
    onError: () => { /* silencioso: o balão já mostra "não foi possível transcrever" */ },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Mural/Home (feed): destaques, comunicados, kudos, reações e comentários.
// Atualização ao vivo pelo ChatAlerts (tabelas chat_feed_* no Realtime).
// ─────────────────────────────────────────────────────────────────────────────
export function useFeedHighlights() {
  const { supabase } = useChatCtx();
  return useQuery({
    queryKey: ["chat", "feed", "highlights"],
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    queryFn: async (): Promise<FeedHighlights> => {
      const { data, error } = await supabase.rpc("chat_feed_highlights");
      if (error) throw error;
      return (data as FeedHighlights) ?? { aniversariantes: [], novos_membros: [] };
    },
  });
}

export function useRecentAnnouncements(limit = 5) {
  const { supabase } = useChatCtx();
  return useQuery({
    queryKey: ["chat", "feed", "announcements", limit],
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    queryFn: async (): Promise<RecentAnnouncement[]> => {
      const { data, error } = await supabase.rpc("chat_recent_announcements", { p_limit: limit });
      if (error) throw error;
      type Row = { message_id: string; channel_id: string; channel_name: string | null; body: string | null; created_at: string; sender_name: string | null };
      return ((data ?? []) as Row[]).map((r) => ({ ...r }));
    },
  });
}

export function useFeed() {
  const { supabase } = useChatCtx();
  return useQuery({
    queryKey: ["chat", "feed", "list"],
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    queryFn: async (): Promise<FeedPost[]> => {
      const { data, error } = await supabase.rpc("chat_feed_list", { p_limit: 30, p_before: null });
      if (error) throw error;
      return (data as FeedPost[]) ?? [];
    },
  });
}

export function useCreateKudos() {
  const { supabase } = useChatCtx();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ body, targets }: { body: string; targets: string[] }) => {
      const { error } = await supabase.rpc("chat_feed_create_kudos", { p_body: body, p_targets: targets });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["chat", "feed", "list"] }),
  });
}

export function useCreateAviso() {
  const { supabase } = useChatCtx();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ body }: { body: string }) => {
      const { error } = await supabase.rpc("chat_feed_create_aviso", { p_body: body });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["chat", "feed", "list"] }),
  });
}

export function useDeleteFeedPost() {
  const { supabase } = useChatCtx();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ postId }: { postId: string }) => {
      const { error } = await supabase.rpc("chat_feed_delete_post", { p_post: postId });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["chat", "feed", "list"] }),
  });
}

export function useReactFeed() {
  const { supabase } = useChatCtx();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ postId, emoji, on }: { postId: string; emoji: string; on: boolean }) => {
      const { error } = await supabase.rpc("chat_feed_react", { p_post: postId, p_emoji: emoji, p_on: on });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["chat", "feed", "list"] }),
  });
}

export function useFeedComments(postId: string | null, enabled: boolean) {
  const { supabase } = useChatCtx();
  return useQuery({
    queryKey: ["chat", "feed", "comments", postId],
    enabled: !!postId && enabled,
    staleTime: 30_000,
    queryFn: async (): Promise<FeedComment[]> => {
      const { data, error } = await supabase.rpc("chat_feed_comments", { p_post: postId });
      if (error) throw error;
      return (data as FeedComment[]) ?? [];
    },
  });
}

export function useAddFeedComment() {
  const { supabase } = useChatCtx();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ postId, body }: { postId: string; body: string }) => {
      const { error } = await supabase.rpc("chat_feed_comment", { p_post: postId, p_body: body });
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ["chat", "feed", "comments", v.postId] });
      qc.invalidateQueries({ queryKey: ["chat", "feed", "list"] });
    },
  });
}

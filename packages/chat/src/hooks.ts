import { useEffect } from "react";
import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from "@tanstack/react-query";
import { useChatCtx } from "./context";

// Sufixo único por assinatura Realtime — evita colidir nomes de canal quando o
// mesmo hook é usado em vários componentes ("cannot add callbacks after subscribe").
const rid = () => Math.random().toString(36).slice(2, 10);
import type { ChatAttachment, ChatChannel, ChatMessage, ChatProfileRef, Conversation } from "./types";

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
    queryFn: async (): Promise<Conversation[]> => {
      // RPC definer: já traz o outro (DM), a última mensagem, não-lidas e ordena.
      const { data, error } = await supabase.rpc("chat_conversations");
      if (error) throw error;
      type Row = {
        channel_id: string; type: "group" | "dm"; name: string | null; is_private: boolean; channel_avatar: string | null;
        other_id: string | null; other_name: string | null; other_avatar: string | null;
        last_body: string | null; last_kind: string | null; last_at: string | null;
        last_sender_id: string | null; last_sender_name: string | null;
        unread: number; last_activity: string | null; muted: boolean; pinned: boolean; archived: boolean; is_announcement: boolean;
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

  // marca lido ao abrir/atualizar
  useEffect(() => {
    if (!channelId) return;
    supabase.rpc("chat_mark_read", { p_channel: channelId }).then(() => {
      qc.invalidateQueries({ queryKey: ["chat", "conversations", currentUser.id] });
    }, () => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelId, query.dataUpdatedAt]);

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
        const path = `${channelId}/${messageId}/${Date.now()}-${safeName(att.filename)}`;
        const contentType = (att.file as File).type || undefined;
        const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, att.file, { contentType, upsert: false });
        if (upErr) throw upErr;
        const { error: aErr } = await supabase.from("chat_attachments").insert({
          message_id: messageId,
          storage_path: path,
          mime_type: contentType ?? null,
          size_bytes: (att.file as File).size ?? null,
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
    mutationFn: async ({ name, memberIds, isPrivate }: { name: string; memberIds: string[]; isPrivate: boolean }): Promise<string> => {
      // id gerado no cliente: evita reler o canal (a RLS de SELECT exige já ser
      // membro, o que ainda não é o caso no instante do insert de um grupo privado).
      const channelId = crypto.randomUUID();
      const { error } = await supabase
        .from("chat_channels")
        .insert({ id: channelId, type: "group", name: name.trim(), is_private: isPrivate, created_by: currentUser.id });
      if (error) throw error;
      const members = [
        { channel_id: channelId, user_id: currentUser.id, role: "owner" },
        ...memberIds.filter((id) => id !== currentUser.id).map((id) => ({ channel_id: channelId, user_id: id, role: "member" })),
      ];
      const { error: mErr } = await supabase.from("chat_channel_members").insert(members);
      if (mErr) throw mErr;
      return channelId;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["chat", "conversations", currentUser.id] }),
  });
}

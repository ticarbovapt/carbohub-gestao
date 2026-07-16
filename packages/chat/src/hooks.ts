import { useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useChatCtx } from "./context";
import type { ChatChannel, ChatMessage, ChatProfileRef, Conversation } from "./types";

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
        unread: number; last_activity: string | null;
      };
      return ((data ?? []) as Row[]).map((r): Conversation => ({
        channel: {
          id: r.channel_id, type: r.type, name: r.name, description: null,
          is_private: r.is_private, avatar_url: r.channel_avatar, created_by: null,
          created_at: r.last_activity ?? new Date(0).toISOString(), archived_at: null,
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
      }));
    },
  });

  // Realtime: qualquer nova mensagem/canal recarrega a lista (não-lidas/ordem).
  useEffect(() => {
    const ch = supabase
      .channel("chat:conversations:" + currentUser.id)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_messages" }, () => {
        qc.invalidateQueries({ queryKey: ["chat", "conversations", currentUser.id] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "chat_channel_members", filter: `user_id=eq.${currentUser.id}` }, () => {
        qc.invalidateQueries({ queryKey: ["chat", "conversations", currentUser.id] });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [supabase, qc, currentUser.id]);

  return query;
}

// ─────────────────────────────────────────────────────────────────────────────
// Mensagens de um canal + realtime.
// ─────────────────────────────────────────────────────────────────────────────
export function useMessages(channelId: string | null) {
  const { supabase, currentUser } = useChatCtx();
  const qc = useQueryClient();
  const key = ["chat", "messages", channelId];

  const query = useQuery({
    queryKey: key,
    enabled: !!channelId,
    queryFn: async (): Promise<ChatMessage[]> => {
      const { data, error } = await supabase
        .from("chat_messages")
        .select("*, sender:profiles!chat_messages_sender_id_fkey(id, full_name, avatar_url), attachments:chat_attachments(*)")
        .eq("channel_id", channelId)
        .is("deleted_at", null)
        .order("created_at", { ascending: true })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as ChatMessage[];
    },
  });

  useEffect(() => {
    if (!channelId) return;
    const ch = supabase
      .channel("chat:messages:" + channelId)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_messages", filter: `channel_id=eq.${channelId}` }, () => {
        qc.invalidateQueries({ queryKey: key });
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "chat_messages", filter: `channel_id=eq.${channelId}` }, () => {
        qc.invalidateQueries({ queryKey: key });
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
    mutationFn: async (payload: string | { body?: string; attachments?: OutgoingAttachment[]; mentions?: string[] }) => {
      const body = typeof payload === "string" ? payload : (payload.body ?? "");
      const attachments = typeof payload === "string" ? [] : (payload.attachments ?? []);
      const mentions = typeof payload === "string" ? [] : (payload.mentions ?? []);
      if (!channelId) return;
      if (!body.trim() && attachments.length === 0) return;

      const kind = attachments.length ? attachments[0].kind : "text";
      const { data: msg, error } = await supabase.from("chat_messages").insert({
        channel_id: channelId, sender_id: currentUser.id, kind, body: body.trim() || null,
        mentions: mentions.length ? mentions : [],
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
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ["chat", "unread-total", currentUser.id],
    queryFn: async (): Promise<number> => {
      const { data, error } = await supabase.rpc("chat_unread_counts");
      if (error) throw error;
      return ((data ?? []) as { unread: number }[]).reduce((n, r) => n + (Number(r.unread) || 0), 0);
    },
    refetchInterval: 60_000,
  });
  useEffect(() => {
    const ch = supabase
      .channel("chat:unread:" + currentUser.id)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_messages" }, () => {
        qc.invalidateQueries({ queryKey: ["chat", "unread-total", currentUser.id] });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [supabase, qc, currentUser.id]);
  return query;
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
      const { data: ch, error } = await supabase
        .from("chat_channels")
        .insert({ type: "group", name: name.trim(), is_private: isPrivate, created_by: currentUser.id })
        .select("id").single();
      if (error) throw error;
      const channelId = (ch as { id: string }).id;
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

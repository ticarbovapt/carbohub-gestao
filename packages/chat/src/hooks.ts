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
      // canais dos quais sou membro (RLS já garante o escopo)
      const { data: memberships, error: mErr } = await supabase
        .from("chat_channel_members").select("channel_id").eq("user_id", currentUser.id);
      if (mErr) throw mErr;
      const ids = (memberships ?? []).map((m: { channel_id: string }) => m.channel_id);
      if (!ids.length) return [];

      const { data: channels, error: cErr } = await supabase
        .from("chat_channels").select("*").in("id", ids).is("archived_at", null);
      if (cErr) throw cErr;

      // membros das DMs → o "outro" define título/avatar
      const dmIds = (channels ?? []).filter((c: ChatChannel) => c.type === "dm").map((c: ChatChannel) => c.id);
      const otherByChannel: Record<string, ChatProfileRef> = {};
      if (dmIds.length) {
        const { data: others } = await supabase
          .from("chat_channel_members")
          .select("channel_id, profiles!chat_channel_members_user_id_fkey(id, full_name, avatar_url)")
          .in("channel_id", dmIds)
          .neq("user_id", currentUser.id);
        for (const r of (others ?? []) as any[]) {
          const p = r.profiles;
          if (p) otherByChannel[r.channel_id] = p;
        }
      }

      // não-lidas
      const { data: unreadRows } = await supabase.rpc("chat_unread_counts");
      const unreadByChannel: Record<string, number> = {};
      for (const u of (unreadRows ?? []) as { channel_id: string; unread: number }[]) {
        unreadByChannel[u.channel_id] = Number(u.unread) || 0;
      }

      const list: Conversation[] = (channels ?? []).map((c: ChatChannel) => {
        const other = otherByChannel[c.id];
        const title = c.type === "dm"
          ? (other?.full_name ?? "Conversa")
          : (c.name ?? "Canal");
        return {
          channel: c,
          title,
          avatarUrl: c.type === "dm" ? (other?.avatar_url ?? null) : c.avatar_url,
          otherUserId: c.type === "dm" ? (other?.id ?? null) : null,
          unread: unreadByChannel[c.id] ?? 0,
        };
      });
      // ordena: mais recentes primeiro (por created_at do canal como proxy)
      list.sort((a, b) => b.channel.created_at.localeCompare(a.channel.created_at));
      return list;
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
        .select("*, sender:profiles!chat_messages_sender_id_fkey(id, full_name, avatar_url)")
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

export function useSendMessage(channelId: string | null) {
  const { supabase, currentUser } = useChatCtx();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: string) => {
      if (!channelId || !body.trim()) return;
      const { error } = await supabase.from("chat_messages").insert({
        channel_id: channelId, sender_id: currentUser.id, kind: "text", body: body.trim(),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["chat", "messages", channelId] });
      qc.invalidateQueries({ queryKey: ["chat", "conversations", currentUser.id] });
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
      let q = supabase.from("profiles").select("id, full_name, avatar_url").order("full_name").limit(30);
      if (search.trim()) q = q.ilike("full_name", `%${search.trim()}%`);
      const { data, error } = await q;
      if (error) throw error;
      return ((data ?? []) as ChatProfileRef[]).filter((p) => p.id !== currentUser.id);
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

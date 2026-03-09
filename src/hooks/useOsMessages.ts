import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Database } from "@/integrations/supabase/types";

type MessageTag = Database["public"]["Enums"]["message_tag"];

export interface MessageAttachment {
  name: string;
  url: string;
  type: string;
  size: number;
}

export interface OsMessage {
  id: string;
  service_order_id: string;
  user_id: string;
  content: string;
  tag: MessageTag | null;
  mentions: string[];
  attachments: MessageAttachment[];
  created_at: string;
  updated_at: string;
  // Joined
  profile?: {
    id: string;
    full_name: string | null;
    avatar_url: string | null;
  };
}

export function useOsMessages(serviceOrderId: string) {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const messagesQuery = useQuery({
    queryKey: ["os-messages", serviceOrderId],
    queryFn: async () => {
      // First fetch messages
      const { data: messages, error } = await supabase
        .from("os_messages")
        .select("*")
        .eq("service_order_id", serviceOrderId)
        .order("created_at", { ascending: true });

      if (error) throw error;
      if (!messages || messages.length === 0) return [];

      // Get unique user IDs
      const userIds = [...new Set(messages.map((m) => m.user_id))];

      // Fetch profiles
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name, avatar_url")
        .in("id", userIds);

      const profileMap = new Map((profiles || []).map((p) => [p.id, p]));

      // Combine data
      return messages.map((m) => ({
        ...m,
        attachments: (m.attachments as unknown as MessageAttachment[]) || [],
        profile: profileMap.get(m.user_id) || undefined,
      })) as OsMessage[];
    },
    enabled: !!serviceOrderId,
  });

  // Subscribe to realtime updates
  useEffect(() => {
    if (!serviceOrderId) return;

    const channel = supabase
      .channel(`os-messages-${serviceOrderId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "os_messages",
          filter: `service_order_id=eq.${serviceOrderId}`,
        },
        () => {
          // Invalidate query to refetch with profile data
          queryClient.invalidateQueries({ queryKey: ["os-messages", serviceOrderId] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [serviceOrderId, queryClient]);

  const sendMessageMutation = useMutation({
    mutationFn: async ({
      content,
      tag,
      mentions,
      attachments,
    }: {
      content: string;
      tag?: MessageTag;
      mentions?: string[];
      attachments?: MessageAttachment[];
    }) => {
      if (!user) throw new Error("Usuário não autenticado");

      // Use type assertion to handle attachments column not yet in generated types
      const { data, error } = await (supabase
        .from("os_messages") as unknown as {
          insert: (data: Record<string, unknown>) => { select: () => { single: () => Promise<{ data: { id: string } | null; error: Error | null }> } }
        })
        .insert({
          service_order_id: serviceOrderId,
          user_id: user.id,
          content,
          tag: tag || null,
          mentions: mentions || [],
          attachments: attachments || [],
        })
        .select()
        .single();

      if (error) throw error;

      // Create notifications for mentions
      if (mentions && mentions.length > 0) {
        const notifications = mentions.map((mentionedUserId) => ({
          user_id: mentionedUserId,
          type: "mention",
          title: "Você foi mencionado",
          body: content.substring(0, 100),
          reference_type: "os_message",
          reference_id: data.id,
        }));

        await supabase.from("notifications").insert(notifications);
      }

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["os-messages", serviceOrderId] });
    },
    onError: (error: Error) => {
      toast.error("Erro ao enviar mensagem: " + error.message);
    },
  });

  const updateMessageTagMutation = useMutation({
    mutationFn: async ({ messageId, tag }: { messageId: string; tag: MessageTag | null }) => {
      const { error } = await supabase
        .from("os_messages")
        .update({ tag })
        .eq("id", messageId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["os-messages", serviceOrderId] });
    },
  });

  return {
    messages: messagesQuery.data || [],
    isLoading: messagesQuery.isLoading,
    sendMessage: sendMessageMutation.mutate,
    isSending: sendMessageMutation.isPending,
    updateMessageTag: updateMessageTagMutation.mutate,
  };
}

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { MessageSquare } from "lucide-react";
import { useChatCtx } from "../context";
import { playMessageChime } from "../lib/sound";
import type { Conversation } from "../types";

const kindLabel = (k: string) =>
  k === "image" ? "📷 Imagem" : k === "audio" ? "🎤 Áudio" : k === "video" ? "🎬 Vídeo" : k === "file" ? "📎 Arquivo" : "Nova mensagem";

// Alerta global de mensagem recebida. Roda no provider (persiste entre páginas).
// Toca som + toast, EXCETO quando você já está com aquele canal aberto e visível.
// A RLS do Realtime entrega só mensagens dos canais dos quais você é membro.
export function ChatAlerts() {
  const { supabase, currentUser, activeChannelRef, openConversation } = useChatCtx();
  const qc = useQueryClient();

  useEffect(() => {
    const ch = supabase
      .channel("chat:alerts:" + currentUser.id + ":" + Math.random().toString(36).slice(2, 10))
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_messages" }, async (payload) => {
        const msg = payload.new as { sender_id: string | null; channel_id: string; body: string | null; kind: string };
        if (!msg || msg.sender_id === currentUser.id) return;

        // Vendo esse canal agora? só atualiza, sem som/toast.
        const viewing = activeChannelRef.current === msg.channel_id && document.visibilityState === "visible";
        // Conversa silenciada? não toca/toasta.
        const convs = qc.getQueryData<Conversation[]>(["chat", "conversations", currentUser.id]);
        const muted = convs?.find((c) => c.channel.id === msg.channel_id)?.muted;
        qc.invalidateQueries({ queryKey: ["chat", "unread-total", currentUser.id] });
        qc.invalidateQueries({ queryKey: ["chat", "conversations", currentUser.id] });
        if (viewing || muted) return;

        playMessageChime();

        let name = "Nova mensagem";
        try {
          const { data } = await supabase.from("profiles").select("full_name").eq("id", msg.sender_id).maybeSingle();
          if (data?.full_name) name = data.full_name;
        } catch { /* ignora */ }

        const preview = msg.body?.trim() || kindLabel(msg.kind);
        // Toast inteiro clicável (funciona no PC também) → abre a conversa (?c=).
        toast.custom((id) => (
          <div
            role="button"
            tabIndex={0}
            onClick={() => { openConversation(msg.channel_id); toast.dismiss(id); }}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { openConversation(msg.channel_id); toast.dismiss(id); } }}
            className="flex w-full max-w-[90vw] cursor-pointer items-start gap-3 rounded-lg border bg-background p-3 shadow-lg transition-colors hover:bg-accent"
          >
            <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <MessageSquare className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-foreground">{name}</p>
              <p className="line-clamp-2 text-xs text-muted-foreground">{preview}</p>
            </div>
          </div>
        ), { duration: 6000 });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "chat_channel_members", filter: `user_id=eq.${currentUser.id}` }, () => {
        qc.invalidateQueries({ queryKey: ["chat", "conversations", currentUser.id] });
        qc.invalidateQueries({ queryKey: ["chat", "unread-total", currentUser.id] });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [supabase, qc, currentUser.id, activeChannelRef]);

  return null;
}

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useChatCtx } from "../context";
import { playMessageChime } from "../lib/sound";

const kindLabel = (k: string) =>
  k === "image" ? "📷 Imagem" : k === "audio" ? "🎤 Áudio" : k === "video" ? "🎬 Vídeo" : k === "file" ? "📎 Arquivo" : "Nova mensagem";

// Alerta global de mensagem recebida. Roda no provider (persiste entre páginas).
// Toca som + toast, EXCETO quando você já está com aquele canal aberto e visível.
// A RLS do Realtime entrega só mensagens dos canais dos quais você é membro.
export function ChatAlerts() {
  const { supabase, currentUser, activeChannelRef } = useChatCtx();
  const qc = useQueryClient();

  useEffect(() => {
    const ch = supabase
      .channel("chat:alerts:" + currentUser.id)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_messages" }, async (payload) => {
        const msg = payload.new as { sender_id: string | null; channel_id: string; body: string | null; kind: string };
        if (!msg || msg.sender_id === currentUser.id) return;

        // Vendo esse canal agora? só atualiza, sem som/toast.
        const viewing = activeChannelRef.current === msg.channel_id && document.visibilityState === "visible";
        qc.invalidateQueries({ queryKey: ["chat", "unread-total", currentUser.id] });
        qc.invalidateQueries({ queryKey: ["chat", "conversations", currentUser.id] });
        if (viewing) return;

        playMessageChime();

        let name = "Nova mensagem";
        try {
          const { data } = await supabase.from("profiles").select("full_name").eq("id", msg.sender_id).maybeSingle();
          if (data?.full_name) name = data.full_name;
        } catch { /* ignora */ }

        toast(name, {
          description: msg.body?.trim() || kindLabel(msg.kind),
          duration: 6000,
        });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [supabase, qc, currentUser.id, activeChannelRef]);

  return null;
}

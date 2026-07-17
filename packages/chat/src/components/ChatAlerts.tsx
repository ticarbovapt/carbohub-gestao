import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Avatar } from "./Avatar";
import { useChatCtx } from "../context";
import { playMessageChime } from "../lib/sound";
import { presenceBus } from "../lib/presence";
import { richToPlain } from "../lib/format";
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
    // UM canal compartilhado (tópico estável) dono do postgres_changes + presence
    // + broadcast de "digitando". Montado 1x por cliente (aqui) → sem colidir.
    const ch = supabase
      .channel("carbo-chat-room", { config: { presence: { key: currentUser.id } } })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_messages" }, async (payload) => {
        const msg = payload.new as { sender_id: string | null; channel_id: string; body: string | null; kind: string };
        if (!msg || msg.sender_id === currentUser.id) return;

        // Recibo "entregue": recebi a mensagem (mesmo com a conversa fechada/mutada).
        supabase.rpc("chat_mark_delivered", { p_channel: msg.channel_id }).then(() => {}, () => {});

        // Vendo esse canal agora? só atualiza, sem som/toast.
        const viewing = activeChannelRef.current === msg.channel_id && document.visibilityState === "visible";
        // Conversa silenciada? não toca/toasta.
        const convs = qc.getQueryData<Conversation[]>(["chat", "conversations", currentUser.id]);
        const muted = convs?.find((c) => c.channel.id === msg.channel_id)?.muted;
        qc.invalidateQueries({ queryKey: ["chat", "unread-total", currentUser.id] });
        qc.invalidateQueries({ queryKey: ["chat", "conversations", currentUser.id] });
        // Mensagem do sistema (bug/sugestão no grupo): entra na lista, mas nunca toca/toasta.
        if (viewing || muted || msg.kind === "system") return;

        playMessageChime();

        let name = "Nova mensagem";
        let avatarUrl: string | null = null;
        try {
          const { data } = await supabase.from("profiles").select("full_name, avatar_url").eq("id", msg.sender_id).maybeSingle();
          if (data?.full_name) name = data.full_name;
          avatarUrl = (data as { avatar_url?: string | null } | null)?.avatar_url ?? null;
        } catch { /* ignora */ }

        const preview = (msg.body?.trim() ? richToPlain(msg.body.trim()) : "") || kindLabel(msg.kind);
        // Toast inteiro clicável (funciona no PC também) → abre a conversa (?c=).
        // Largura fixa (o toast.custom não herda a largura padrão do sonner).
        // Fica no top-right; o <Toaster offset> dos apps o mantém abaixo do header.
        toast.custom((id) => (
          <div
            role="button"
            tabIndex={0}
            onClick={() => { openConversation(msg.channel_id); toast.dismiss(id); }}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { openConversation(msg.channel_id); toast.dismiss(id); } }}
            className="flex w-[360px] max-w-[calc(100vw-2rem)] cursor-pointer items-center gap-3 rounded-xl border bg-background p-3.5 shadow-lg transition-colors hover:bg-accent"
          >
            <Avatar name={name} url={avatarUrl} size={42} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-foreground">{name}</p>
              <p className="line-clamp-2 text-sm text-muted-foreground">{preview}</p>
            </div>
          </div>
        ), { duration: 6000, position: "top-right" });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "chat_channel_members", filter: `user_id=eq.${currentUser.id}` }, () => {
        qc.invalidateQueries({ queryKey: ["chat", "conversations", currentUser.id] });
        qc.invalidateQueries({ queryKey: ["chat", "unread-total", currentUser.id] });
      })
      // Edição/exclusão de mensagem → atualiza a prévia da lista ao vivo p/ todos.
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "chat_messages" }, () => {
        qc.invalidateQueries({ queryKey: ["chat", "conversations", currentUser.id] });
        qc.invalidateQueries({ queryKey: ["chat", "unread-total", currentUser.id] });
      })
      // Presence: quem está online agora (chave = user_id).
      .on("presence", { event: "sync" }, () => {
        presenceBus.setOnline(Object.keys(ch.presenceState()));
      })
      // "Digitando…" via broadcast (ignora o próprio).
      .on("broadcast", { event: "typing" }, ({ payload }) => {
        const p = payload as { channelId: string; userId: string; name: string; on: boolean };
        if (!p || p.userId === currentUser.id) return;
        presenceBus.setTyping(p.channelId, p.userId, p.name, p.on);
      })
      .subscribe((status) => {
        if (status !== "SUBSCRIBED") return;
        ch.track({ user_id: currentUser.id, online_at: new Date().toISOString() });
        // manda "digitando" pelo mesmo canal (registro pro store global).
        presenceBus.registerSendTyping((channelId, on) => {
          ch.send({ type: "broadcast", event: "typing",
            payload: { channelId, userId: currentUser.id, name: currentUser.full_name ?? "Alguém", on } });
        });
      });

    // Heartbeat de "visto por último" (app-wide) + poda dos "digitando" expirados.
    const touch = () => { if (document.visibilityState === "visible") supabase.rpc("chat_touch_last_seen").then(() => {}, () => {}); };
    touch();
    const hb = window.setInterval(touch, 45_000);
    const prune = window.setInterval(() => presenceBus.prune(), 1_000);
    document.addEventListener("visibilitychange", touch);

    return () => {
      presenceBus.registerSendTyping(null);
      window.clearInterval(hb);
      window.clearInterval(prune);
      document.removeEventListener("visibilitychange", touch);
      supabase.removeChannel(ch);
    };
  }, [supabase, qc, currentUser.id, currentUser.full_name, activeChannelRef]);

  return null;
}

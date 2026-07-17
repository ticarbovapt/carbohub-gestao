import { useEffect, useMemo, useRef, useState } from "react";
import { MessagesSquare } from "lucide-react";
import { ConversationList } from "./ConversationList";
import { Conversation } from "./Conversation";
import { EnablePushButton } from "./EnablePushButton";
import { useChatCtx } from "../context";
import { useConversations } from "../hooks";
import type { Conversation as Conv } from "../types";

const STORAGE_KEY = "carbo-chat-open";

// Tela cheia do Carbo Chat: lista (esquerda) + conversa aberta (direita).
export function ChatApp() {
  const [selected, setSelected] = useState<Conv | null>(null);
  const [focus, setFocus] = useState<{ messageId: string; at: string } | null>(null);
  const { supabase, currentUser, activeChannelRef } = useChatCtx();
  const { data: conversations = [] } = useConversations();

  // canal aberto ANTES dos efeitos limparem (para restaurar no F5).
  const initialId = useMemo(() => {
    try {
      const url = new URL(window.location.href);
      return url.searchParams.get("c") || localStorage.getItem(STORAGE_KEY);
    } catch { return null; }
  }, []);
  const restored = useRef(false);
  // Conversa pedida por clique (toast/sininho) que ainda não está na lista
  // (ex.: DM nova) — abre assim que a lista atualizar.
  const pendingOpen = useRef<string | null>(null);

  // Restaura a conversa aberta quando a lista chega.
  useEffect(() => {
    if (restored.current || selected || !initialId) return;
    if (!conversations.length) return;
    const found = conversations.find((c) => c.channel.id === initialId);
    if (found) setSelected(found);
    restored.current = true; // tentou (achou ou não) — não repete
  }, [conversations, selected, initialId]);

  // Clique numa notificação (toast/sininho) → abre a conversa certa, mesmo já
  // estando no /chat. Reusa o evento disparado por openConversation (context).
  useEffect(() => {
    const onOpen = (e: Event) => {
      const detail = (e as CustomEvent<{ channelId: string; focus?: { messageId: string; at: string } }>).detail;
      const id = detail?.channelId;
      if (!id) return;
      setFocus(detail.focus ?? null);
      const found = conversations.find((c) => c.channel.id === id);
      if (found) { setSelected(found); pendingOpen.current = null; }
      else pendingOpen.current = id; // ainda não carregou → abre quando chegar
    };
    window.addEventListener("carbo-chat:open", onOpen as EventListener);
    return () => window.removeEventListener("carbo-chat:open", onOpen as EventListener);
  }, [conversations]);

  // Resolve o pendingOpen quando a lista atualiza (conversa nova entrou).
  useEffect(() => {
    if (!pendingOpen.current || !conversations.length) return;
    const found = conversations.find((c) => c.channel.id === pendingOpen.current);
    if (found) { setSelected(found); pendingOpen.current = null; }
  }, [conversations]);

  // Persiste a conversa aberta na URL (?c=) + localStorage. Só depois de tentar restaurar.
  useEffect(() => {
    if (!restored.current && !selected) return;
    try {
      const url = new URL(window.location.href);
      if (selected) { url.searchParams.set("c", selected.channel.id); localStorage.setItem(STORAGE_KEY, selected.channel.id); }
      else { url.searchParams.delete("c"); localStorage.removeItem(STORAGE_KEY); }
      window.history.replaceState(null, "", url.toString());
    } catch { /* ignora */ }
  }, [selected]);

  // Informa o alerta global qual canal está aberto (não toca/toasta o que você já vê).
  useEffect(() => {
    activeChannelRef.current = selected?.channel.id ?? null;
    return () => { activeChannelRef.current = null; };
  }, [selected, activeChannelRef]);

  // Heartbeat de presença: marca "app aberto" (origin) + canal em foco, para o
  // push saber (a) não avisar quem já está vendo o canal e (b) qual foi o último
  // app usado (entrega 1 push nele). Só enquanto a aba está visível.
  useEffect(() => {
    if (!currentUser.id) return;
    const ping = () => {
      if (document.visibilityState !== "visible") return;
      supabase.rpc("chat_presence_ping", {
        p_channel_id: selected?.channel.id ?? null,
        p_origin: window.location.origin,
      }).then(() => {}, () => {});
    };
    ping();
    const iv = window.setInterval(ping, 25_000);
    document.addEventListener("visibilitychange", ping);
    return () => { window.clearInterval(iv); document.removeEventListener("visibilitychange", ping); };
  }, [supabase, currentUser.id, selected]);

  return (
    <div className="flex h-full min-h-0 w-full overflow-hidden">
      {/* Lista: tela cheia no celular; coluna fixa no desktop. Some no mobile quando há conversa aberta. */}
      <div className={`${selected ? "hidden md:flex" : "flex"} w-full shrink-0 flex-col border-r md:w-72`}>
        <div className="min-h-0 flex-1">
          <ConversationList
            selectedId={selected?.channel.id ?? null}
            onSelect={(c) => { setFocus(null); setSelected(c); }}
            onRemoved={(id) => setSelected((s) => (s?.channel.id === id ? null : s))}
          />
        </div>
        <div className="shrink-0 empty:hidden [&>*]:m-2">
          <EnablePushButton />
        </div>
      </div>
      {/* Conversa: tela cheia no celular; some no mobile quando não há conversa. */}
      <div className={`${selected ? "block" : "hidden md:block"} min-w-0 flex-1`}>
        {selected ? (
          <Conversation key={selected.channel.id} conv={selected}
            focus={focus && focus.messageId ? focus : null}
            onClearFocus={() => setFocus(null)}
            onBack={() => setSelected(null)}
            onDeleted={() => setSelected(null)} />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center text-muted-foreground">
            <MessagesSquare className="h-12 w-12 opacity-40" />
            <div>
              <p className="text-sm font-medium text-foreground">Carbo Chat</p>
              <p className="text-sm">Selecione uma conversa ou comece uma nova.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

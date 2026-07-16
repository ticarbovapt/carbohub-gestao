import { useEffect, useMemo, useRef, useState } from "react";
import { MessagesSquare } from "lucide-react";
import { ConversationList } from "./ConversationList";
import { Conversation } from "./Conversation";
import { useChatCtx } from "../context";
import { useConversations } from "../hooks";
import type { Conversation as Conv } from "../types";

const STORAGE_KEY = "carbo-chat-open";

// Tela cheia do Carbo Chat: lista (esquerda) + conversa aberta (direita).
export function ChatApp() {
  const [selected, setSelected] = useState<Conv | null>(null);
  const { activeChannelRef } = useChatCtx();
  const { data: conversations = [] } = useConversations();

  // canal aberto ANTES dos efeitos limparem (para restaurar no F5).
  const initialId = useMemo(() => {
    try {
      const url = new URL(window.location.href);
      return url.searchParams.get("c") || localStorage.getItem(STORAGE_KEY);
    } catch { return null; }
  }, []);
  const restored = useRef(false);

  // Restaura a conversa aberta quando a lista chega.
  useEffect(() => {
    if (restored.current || selected || !initialId) return;
    if (!conversations.length) return;
    const found = conversations.find((c) => c.channel.id === initialId);
    if (found) setSelected(found);
    restored.current = true; // tentou (achou ou não) — não repete
  }, [conversations, selected, initialId]);

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

  return (
    <div className="flex h-full min-h-0 w-full overflow-hidden">
      <div className="w-72 shrink-0">
        <ConversationList
          selectedId={selected?.channel.id ?? null}
          onSelect={setSelected}
          onRemoved={(id) => setSelected((s) => (s?.channel.id === id ? null : s))}
        />
      </div>
      <div className="min-w-0 flex-1">
        {selected ? (
          <Conversation key={selected.channel.id} conv={selected} onDeleted={() => setSelected(null)} />
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

import { useEffect, useState } from "react";
import { MessagesSquare } from "lucide-react";
import { ConversationList } from "./ConversationList";
import { Conversation } from "./Conversation";
import { useChatCtx } from "../context";
import type { Conversation as Conv } from "../types";

// Tela cheia do Carbo Chat: lista (esquerda) + conversa aberta (direita).
export function ChatApp() {
  const [selected, setSelected] = useState<Conv | null>(null);
  const { activeChannelRef } = useChatCtx();

  // Informa o alerta global qual canal está aberto (para não tocar/toastar o que
  // você já vê). Limpa ao sair do chat (desmontar) ou trocar de conversa.
  useEffect(() => {
    activeChannelRef.current = selected?.channel.id ?? null;
    return () => { activeChannelRef.current = null; };
  }, [selected, activeChannelRef]);

  return (
    <div className="flex h-full min-h-0 w-full overflow-hidden">
      <div className="w-72 shrink-0">
        <ConversationList selectedId={selected?.channel.id ?? null} onSelect={setSelected} />
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

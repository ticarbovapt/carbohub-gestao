import { useState } from "react";
import { MessagesSquare } from "lucide-react";
import { ConversationList } from "./ConversationList";
import { Conversation } from "./Conversation";
import type { Conversation as Conv } from "../types";

// Tela cheia do Carbo Chat: lista (esquerda) + conversa aberta (direita).
export function ChatApp() {
  const [selected, setSelected] = useState<Conv | null>(null);

  return (
    <div className="flex h-full min-h-0 w-full overflow-hidden">
      <div className="w-72 shrink-0">
        <ConversationList selectedId={selected?.channel.id ?? null} onSelect={setSelected} />
      </div>
      <div className="min-w-0 flex-1">
        {selected ? (
          <Conversation key={selected.channel.id} conv={selected} />
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

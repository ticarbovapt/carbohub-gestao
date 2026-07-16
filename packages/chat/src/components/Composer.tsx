import { useState } from "react";
import { Send } from "lucide-react";
import { useSendMessage } from "../hooks";

export function Composer({ channelId }: { channelId: string }) {
  const [text, setText] = useState("");
  const send = useSendMessage(channelId);

  async function submit() {
    const body = text.trim();
    if (!body || send.isPending) return;
    setText("");
    try { await send.mutateAsync(body); } catch { setText(body); }
  }

  return (
    <div className="border-t p-3">
      <div className="flex items-end gap-2">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); } }}
          placeholder="Escreva uma mensagem…  (Enter envia, Shift+Enter quebra linha)"
          rows={1}
          className="max-h-40 min-h-[40px] flex-1 resize-y rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <button
          onClick={submit}
          disabled={!text.trim() || send.isPending}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground disabled:opacity-40"
          title="Enviar"
        >
          <Send className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

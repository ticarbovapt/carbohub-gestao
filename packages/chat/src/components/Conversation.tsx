import { useEffect, useRef, useState } from "react";
import { useMessages, useProfilesMap } from "../hooks";
import { useChatCtx } from "../context";
import { Avatar } from "./Avatar";
import { Composer } from "./Composer";
import { Attachment } from "./Attachment";
import { ContactPanel } from "./ContactPanel";
import type { Conversation as Conv } from "../types";

const dayKey = (iso: string) => new Date(iso).toLocaleDateString("pt-BR");
function dayLabel(iso: string) {
  const d = new Date(iso), today = new Date(), y = new Date(); y.setDate(today.getDate() - 1);
  const same = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  if (same(d, today)) return "Hoje";
  if (same(d, y)) return "Ontem";
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
}

export function Conversation({ conv, onDeleted }: { conv: Conv; onDeleted?: () => void }) {
  const { currentUser } = useChatCtx();
  const { data: messages = [], isLoading } = useMessages(conv.channel.id);
  const { data: profMap = {} } = useProfilesMap(messages.map((m) => m.sender_id ?? "").filter(Boolean));
  const bottomRef = useRef<HTMLDivElement>(null);
  const [panelOpen, setPanelOpen] = useState(false);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "auto" }); }, [messages.length]);
  useEffect(() => { setPanelOpen(false); }, [conv.channel.id]);

  return (
    <div className="flex h-full">
    <div className="flex h-full min-w-0 flex-1 flex-col">
      {/* header (clique abre os dados) */}
      <button onClick={() => setPanelOpen((o) => !o)}
        className="flex items-center gap-3 border-b px-4 py-3 text-left hover:bg-muted/40">
        <Avatar name={conv.title} url={conv.avatarUrl} size={36} />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{conv.title}</p>
          <p className="text-[11px] text-muted-foreground">
            {conv.channel.type === "dm" ? "Mensagem direta" : (conv.channel.is_private ? "Grupo privado" : "Grupo")}
          </p>
        </div>
      </button>

      {/* mensagens */}
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Carregando…</p>
        ) : messages.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma mensagem ainda. Diga oi 👋</p>
        ) : (
          <div className="space-y-1">
            {messages.map((m, i) => {
              const prev = messages[i - 1];
              const newDay = !prev || dayKey(prev.created_at) !== dayKey(m.created_at);
              const mine = m.sender_id === currentUser.id;
              const grouped = prev && prev.sender_id === m.sender_id && !newDay
                && (new Date(m.created_at).getTime() - new Date(prev.created_at).getTime() < 5 * 60_000);
              return (
                <div key={m.id}>
                  {newDay && (
                    <div className="my-3 flex items-center gap-2">
                      <div className="h-px flex-1 bg-border" />
                      <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">{dayLabel(m.created_at)}</span>
                      <div className="h-px flex-1 bg-border" />
                    </div>
                  )}
                  <div className={`flex gap-2.5 ${grouped ? "mt-0.5" : "mt-2"}`}>
                    <div className="w-9 shrink-0">
                      {!grouped && <Avatar
                        name={profMap[m.sender_id ?? ""]?.full_name ?? m.sender?.full_name}
                        url={profMap[m.sender_id ?? ""]?.avatar_url ?? m.sender?.avatar_url}
                        size={36} />}
                    </div>
                    <div className="min-w-0 flex-1">
                      {!grouped && (
                        <p className="text-xs">
                          <span className="font-semibold text-foreground">
                            {mine ? "Você" : (profMap[m.sender_id ?? ""]?.full_name ?? m.sender?.full_name ?? "—")}
                          </span>
                          <span className="ml-2 text-muted-foreground">
                            {new Date(m.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                          </span>
                        </p>
                      )}
                      {m.body && <p className="whitespace-pre-wrap break-words text-sm text-foreground">{m.body}</p>}
                      {m.attachments && m.attachments.length > 0 && (
                        <div className="mt-1 space-y-1.5">
                          {m.attachments.map((att) => <Attachment key={att.id} att={att} />)}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      <Composer channelId={conv.channel.id} />
    </div>

    {panelOpen && (
      <ContactPanel
        conv={conv}
        onClose={() => setPanelOpen(false)}
        onDeleted={() => { setPanelOpen(false); onDeleted?.(); }}
      />
    )}
    </div>
  );
}

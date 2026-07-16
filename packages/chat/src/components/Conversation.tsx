import { useEffect, useMemo, useRef, useState } from "react";
import { Search, X, SmilePlus, Reply, CornerUpLeft } from "lucide-react";
import { useMessages, useProfilesMap, useToggleReaction } from "../hooks";
import { useChatCtx } from "../context";
import { Avatar } from "./Avatar";
import { Composer } from "./Composer";
import { Attachment } from "./Attachment";
import { ContactPanel } from "./ContactPanel";
import type { Conversation as Conv, ChatMessage } from "../types";

const REACTS = ["👍", "❤️", "😂", "😮", "😢", "🙏", "✅"];
const dayKey = (iso: string) => new Date(iso).toLocaleDateString("pt-BR");
function dayLabel(iso: string) {
  const d = new Date(iso), today = new Date(), y = new Date(); y.setDate(today.getDate() - 1);
  const same = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  if (same(d, today)) return "Hoje";
  if (same(d, y)) return "Ontem";
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
}
const kindLabel = (k: string) =>
  k === "image" ? "📷 Foto" : k === "audio" ? "🎤 Áudio" : k === "video" ? "🎬 Vídeo" : k === "file" ? "📎 Arquivo" : "Mensagem";

export function Conversation({ conv, onDeleted }: { conv: Conv; onDeleted?: () => void }) {
  const { currentUser } = useChatCtx();
  const isGroup = conv.channel.type === "group";
  const { data: messages = [], isLoading } = useMessages(conv.channel.id);
  const { data: profMap = {} } = useProfilesMap(messages.map((m) => m.sender_id ?? "").filter(Boolean));
  const react = useToggleReaction();
  const bottomRef = useRef<HTMLDivElement>(null);

  const [panelOpen, setPanelOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);

  const byId = useMemo(() => Object.fromEntries(messages.map((m) => [m.id, m])), [messages]);
  const q = search.trim().toLowerCase();
  const shown = q ? messages.filter((m) => (m.body ?? "").toLowerCase().includes(q)) : messages;

  useEffect(() => { if (!q) bottomRef.current?.scrollIntoView({ behavior: "auto" }); }, [messages.length, q]);
  useEffect(() => { setPanelOpen(false); setSearchOpen(false); setSearch(""); setReplyTo(null); }, [conv.channel.id]);

  const nameOf = (id: string | null) => (id ? (profMap[id]?.full_name ?? "—") : "—");

  return (
    <div className="flex h-full">
      <div className="flex h-full min-w-0 flex-1 flex-col">
        {/* header */}
        <div className="flex items-center gap-2 border-b px-4 py-2">
          <button onClick={() => setPanelOpen((o) => !o)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
            <Avatar name={conv.title} url={conv.avatarUrl} size={36} />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{conv.title}</p>
              <p className="text-[11px] text-muted-foreground">
                {isGroup ? (conv.channel.is_private ? "Grupo privado" : "Grupo") : "Mensagem direta"}
              </p>
            </div>
          </button>
          <button onClick={() => { setSearchOpen((o) => !o); setSearch(""); }} title="Buscar na conversa"
            className="shrink-0 rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground">
            <Search className="h-4 w-4" />
          </button>
        </div>

        {searchOpen && (
          <div className="border-b p-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <input autoFocus value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar mensagem…"
                className="h-8 w-full rounded-md border border-input bg-background pl-8 pr-8 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
              {search && <button onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"><X className="h-3.5 w-3.5" /></button>}
            </div>
            {q && <p className="mt-1 px-1 text-[11px] text-muted-foreground">{shown.length} resultado(s)</p>}
          </div>
        )}

        {/* mensagens */}
        <div className="flex-1 overflow-y-auto px-4 py-3">
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Carregando…</p>
          ) : shown.length === 0 ? (
            <p className="text-sm text-muted-foreground">{q ? "Nenhuma mensagem encontrada." : "Nenhuma mensagem ainda. Diga oi 👋"}</p>
          ) : (
            <div className="space-y-0.5">
              {shown.map((m, i) => {
                const prev = shown[i - 1];
                const newDay = !prev || dayKey(prev.created_at) !== dayKey(m.created_at);
                const mine = m.sender_id === currentUser.id;
                const grouped = prev && prev.sender_id === m.sender_id && !newDay
                  && (new Date(m.created_at).getTime() - new Date(prev.created_at).getTime() < 5 * 60_000);
                return (
                  <div key={m.id}>
                    {newDay && (
                      <div className="my-3 flex items-center justify-center">
                        <span className="rounded-full bg-muted px-3 py-0.5 text-[11px] text-muted-foreground">{dayLabel(m.created_at)}</span>
                      </div>
                    )}
                    <MessageBubble
                      m={m} mine={mine} isGroup={isGroup} showName={isGroup && !mine && !grouped}
                      senderName={nameOf(m.sender_id)}
                      repliedTo={m.reply_to_id ? byId[m.reply_to_id] ?? null : null}
                      repliedName={m.reply_to_id ? nameOf(byId[m.reply_to_id]?.sender_id ?? null) : ""}
                      currentUserId={currentUser.id}
                      onReply={() => setReplyTo(m)}
                      onReact={(emoji, active) => react.mutate({ messageId: m.id, emoji, channelId: conv.channel.id, active })}
                    />
                  </div>
                );
              })}
              <div ref={bottomRef} />
            </div>
          )}
        </div>

        <Composer channelId={conv.channel.id} isGroup={isGroup} replyTo={replyTo} onClearReply={() => setReplyTo(null)}
          replyToName={replyTo ? nameOf(replyTo.sender_id) : ""} />
      </div>

      {panelOpen && (
        <ContactPanel conv={conv} onClose={() => setPanelOpen(false)} onDeleted={() => { setPanelOpen(false); onDeleted?.(); }} />
      )}
    </div>
  );
}

function MessageBubble({
  m, mine, isGroup, showName, senderName, repliedTo, repliedName, currentUserId, onReply, onReact,
}: {
  m: ChatMessage; mine: boolean; isGroup: boolean; showName: boolean; senderName: string;
  repliedTo: ChatMessage | null; repliedName: string; currentUserId: string;
  onReply: () => void; onReact: (emoji: string, active: boolean) => void;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const when = new Date(m.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

  // agrega reações: emoji -> {count, mine}
  const agg: Record<string, { count: number; mine: boolean }> = {};
  for (const r of m.reactions ?? []) {
    agg[r.emoji] = agg[r.emoji] || { count: 0, mine: false };
    agg[r.emoji].count++;
    if (r.user_id === currentUserId) agg[r.emoji].mine = true;
  }
  const reactList = Object.entries(agg);

  return (
    <div className={`group flex ${mine ? "justify-end" : "justify-start"}`}>
      <div className={`relative max-w-[78%] ${mine ? "items-end" : "items-start"} flex flex-col`}>
        {/* toolbar no hover */}
        <div className={`absolute -top-3 z-10 flex items-center gap-0.5 rounded-full border bg-popover px-1 py-0.5 opacity-0 shadow-sm transition-opacity group-hover:opacity-100 ${mine ? "right-2" : "left-2"}`}>
          <button onClick={() => setPickerOpen((o) => !o)} title="Reagir" className="rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-foreground"><SmilePlus className="h-3.5 w-3.5" /></button>
          <button onClick={onReply} title="Responder" className="rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-foreground"><Reply className="h-3.5 w-3.5" /></button>
        </div>
        {pickerOpen && (
          <>
            <div className="fixed inset-0 z-20" onClick={() => setPickerOpen(false)} />
            <div className={`absolute -top-9 z-30 flex gap-0.5 rounded-full border bg-popover px-1.5 py-1 shadow-lg ${mine ? "right-0" : "left-0"}`}>
              {REACTS.map((e) => (
                <button key={e} onClick={() => { onReact(e, !!agg[e]?.mine); setPickerOpen(false); }}
                  className="rounded-full px-1 text-lg leading-none hover:scale-125 transition-transform">{e}</button>
              ))}
            </div>
          </>
        )}

        <div className={`rounded-2xl px-3 py-2 text-sm ${mine ? "rounded-br-sm bg-primary text-primary-foreground" : "rounded-bl-sm bg-muted text-foreground"}`}>
          {showName && <p className="mb-0.5 text-xs font-semibold text-primary">{senderName}</p>}

          {repliedTo && (
            <div className={`mb-1 rounded-md border-l-2 px-2 py-1 text-xs ${mine ? "border-primary-foreground/50 bg-primary-foreground/10" : "border-primary bg-background/60"}`}>
              <p className="font-medium opacity-80"><CornerUpLeft className="mr-1 inline h-3 w-3" />{repliedName}</p>
              <p className="truncate opacity-70">{repliedTo.body?.trim() || kindLabel(repliedTo.kind)}</p>
            </div>
          )}

          {m.body && <p className="whitespace-pre-wrap break-words">{m.body}</p>}
          {m.attachments && m.attachments.length > 0 && (
            <div className="mt-1 space-y-1.5">{m.attachments.map((att) => <Attachment key={att.id} att={att} />)}</div>
          )}
          <p className={`mt-0.5 text-right text-[10px] ${mine ? "text-primary-foreground/70" : "text-muted-foreground"}`}>{when}</p>
        </div>

        {/* reações abaixo do balão */}
        {reactList.length > 0 && (
          <div className={`mt-0.5 flex flex-wrap gap-1 ${mine ? "justify-end" : "justify-start"}`}>
            {reactList.map(([emoji, { count, mine: reacted }]) => (
              <button key={emoji} onClick={() => onReact(emoji, reacted)}
                className={`flex items-center gap-0.5 rounded-full border px-1.5 py-0.5 text-[11px] ${reacted ? "border-primary bg-primary/10" : "bg-background"}`}>
                <span>{emoji}</span><span className="text-muted-foreground">{count}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

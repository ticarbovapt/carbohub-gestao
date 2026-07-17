import { useEffect, useMemo, useRef, useState } from "react";
import { Search, X, SmilePlus, Reply, CornerUpLeft, Check, CheckCheck, MoreVertical, Pencil, Trash2, ArrowDown, Megaphone, Lock } from "lucide-react";
import { useMessages, useProfilesMap, useToggleReaction, useChannelMembers, useUserInfo, useEditMessage, useDeleteMessage, useSearchMessages, useChannelAcks, useAckMessage } from "../hooks";
import { useChatCtx } from "../context";
import { messageReceipt, type ReceiptStatus } from "../lib/receipts";
import { useIsOnline, useTyping } from "../lib/presence";
import { renderRich, richToPlain } from "../lib/format";
import { Avatar } from "./Avatar";
import { Composer } from "./Composer";
import { Attachment } from "./Attachment";
import { ContactPanel } from "./ContactPanel";
import { AnnouncementStatus } from "./AnnouncementStatus";

interface AnnInfo { isPublisher: boolean; acked: boolean; canAck: boolean; count: number; onAck: () => void; onStatus: () => void }
import type { Conversation as Conv, ChatMessage } from "../types";

// Indicador de recibo (só nas minhas mensagens): ✓ enviada, ✓✓ entregue, ✓✓ azul lida.
function Ticks({ status }: { status: ReceiptStatus }) {
  if (status === "sent") return <Check className="h-3.5 w-3.5 opacity-70" aria-label="Enviada" />;
  if (status === "read") {
    // Azul vivo do WhatsApp (#53bdeb), traço grosso pra dar destaque.
    return <CheckCheck className="h-4 w-4 text-[#53bdeb]" strokeWidth={2.75} aria-label="Lida" />;
  }
  return <CheckCheck className="h-3.5 w-3.5 opacity-70" aria-label="Entregue" />;
}

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
const firstName = (n: string) => n.split(/\s+/)[0] || n;
const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
// Realce best-effort do termo digitado no trecho do resultado.
function highlightSnippet(body: string, query: string) {
  const words = query.split(/\s+/).map((w) => w.trim()).filter((w) => w.length >= 2);
  if (!words.length) return body;
  const set = new Set(words.map((w) => w.toLowerCase()));
  const re = new RegExp(`(${words.map(escapeRegExp).join("|")})`, "ig");
  return body.split(re).map((part, i) =>
    set.has(part.toLowerCase())
      ? <mark key={i} className="rounded bg-yellow-400/40 text-inherit">{part}</mark>
      : part,
  );
}
function lastSeenLabel(iso: string) {
  const d = new Date(iso), now = new Date();
  if ((now.getTime() - d.getTime()) / 1000 < 60) return "agora há pouco";
  const hhmm = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  if (d.toDateString() === now.toDateString()) return `hoje às ${hhmm}`;
  const y = new Date(now); y.setDate(now.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return `ontem às ${hhmm}`;
  return `${d.toLocaleDateString("pt-BR")} às ${hhmm}`;
}

export function Conversation({ conv, focus, onClearFocus, onDeleted }: {
  conv: Conv; focus?: { messageId: string; at: string } | null; onClearFocus?: () => void; onDeleted?: () => void;
}) {
  const { currentUser, openConversation } = useChatCtx();
  const isGroup = conv.channel.type === "group";
  const { data: messages = [], isLoading } = useMessages(conv.channel.id, focus?.at ?? null);
  const { data: members = [] } = useChannelMembers(conv.channel.id);
  const { data: profMap = {} } = useProfilesMap(messages.map((m) => m.sender_id ?? "").filter(Boolean));
  // Comunicado oficial (announcement).
  const isAnnouncement = !!conv.isAnnouncement;
  const { data: ackRows = [] } = useChannelAcks(conv.channel.id, isAnnouncement);
  const ack = useAckMessage();
  const myRole = members.find((m) => m.id === currentUser.id)?.role;
  const isPublisher = myRole === "owner" || myRole === "admin";
  const [statusMsgId, setStatusMsgId] = useState<string | null>(null);
  const myAcked = useMemo(() => new Set(ackRows.filter((r) => r.user_id === currentUser.id).map((r) => r.message_id)), [ackRows, currentUser.id]);
  const ackCount = useMemo(() => {
    const m: Record<string, number> = {};
    for (const r of ackRows) m[r.message_id] = (m[r.message_id] || 0) + 1;
    return m;
  }, [ackRows]);
  // Presença/typing pro cabeçalho.
  const otherOnline = useIsOnline(isGroup ? null : conv.otherUserId);
  const typing = useTyping(conv.channel.id, currentUser.id);
  const { data: otherInfo } = useUserInfo(!isGroup ? conv.otherUserId : null);
  const react = useToggleReaction();
  const edit = useEditMessage();
  const del = useDeleteMessage();
  const bottomRef = useRef<HTMLDivElement>(null);
  const rowRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const [panelOpen, setPanelOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [highlight, setHighlight] = useState<string | null>(null);
  const [editRequestId, setEditRequestId] = useState<string | null>(null);

  // ↑ no campo vazio → edita minha última mensagem de texto.
  function editLast() {
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (m.sender_id === currentUser.id && m.kind === "text" && !m.deleted_at) { setEditRequestId(m.id); return; }
    }
  }

  // Esc fecha em cascata (fora de inputs, que o composer/busca já tratam).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (searchOpen) { setSearchOpen(false); setSearch(""); }
      else if (panelOpen) setPanelOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [searchOpen, panelOpen]);

  const q = search.trim();
  // Busca no SERVIDOR (full-text), dentro desta conversa.
  const searchQ = useSearchMessages(q, conv.channel.id);
  const hits = (searchQ.data?.pages ?? []).flat();

  const byId = useMemo(() => Object.fromEntries(messages.map((m) => [m.id, m])), [messages]);

  // Rola pro fim — exceto durante busca ou quando estamos focando uma msg antiga.
  useEffect(() => { if (!q && !focus) bottomRef.current?.scrollIntoView({ behavior: "auto" }); }, [messages.length, q, focus]);
  useEffect(() => { setPanelOpen(false); setSearchOpen(false); setSearch(""); setReplyTo(null); }, [conv.channel.id]);

  // Pular até a mensagem (busca): rola e destaca quando ela está carregada.
  useEffect(() => {
    if (!focus?.messageId) return;
    const el = rowRefs.current[focus.messageId];
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    setHighlight(focus.messageId);
    const t = window.setTimeout(() => setHighlight(null), 2500);
    return () => window.clearTimeout(t);
  }, [focus?.messageId, messages]);

  const nameOf = (id: string | null) => (id ? (profMap[id]?.full_name ?? "—") : "—");

  return (
    <div className="flex h-full">
      <div className="flex h-full min-w-0 flex-1 flex-col">
        {/* header */}
        <div className="flex items-center gap-2 border-b px-4 py-2">
          <button onClick={() => setPanelOpen((o) => !o)} aria-label={isGroup ? "Dados do grupo" : "Dados do contato"} aria-expanded={panelOpen}
            className="flex min-w-0 flex-1 items-center gap-3 rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <Avatar name={conv.title} url={conv.avatarUrl} size={36} />
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 truncate text-sm font-semibold">
                {isAnnouncement && <Megaphone className="h-3.5 w-3.5 shrink-0 text-amber-500" aria-label="Comunicado oficial" />}
                <span className="truncate">{conv.title}</span>
              </p>
              <p className="truncate text-[11px]">
                {typing.length > 0 ? (
                  <span className="text-emerald-500">
                    {isGroup
                      ? (typing.length === 1 ? `${firstName(typing[0].name)} está digitando…` : `${typing.length} pessoas digitando…`)
                      : "digitando…"}
                  </span>
                ) : isAnnouncement ? (
                  <span className="text-amber-500">Comunicado oficial{isPublisher ? " · você publica" : " · somente leitura"}</span>
                ) : !isGroup ? (
                  otherOnline
                    ? <span className="text-emerald-500">online</span>
                    : <span className="text-muted-foreground">{otherInfo?.last_seen_at ? `visto por último ${lastSeenLabel(otherInfo.last_seen_at)}` : "Mensagem direta"}</span>
                ) : (
                  <span className="text-muted-foreground">{conv.channel.is_private ? "Grupo privado" : "Grupo"}</span>
                )}
              </p>
            </div>
          </button>
          <button onClick={() => { setSearchOpen((o) => !o); setSearch(""); }} title="Buscar na conversa" aria-label="Buscar na conversa" aria-expanded={searchOpen}
            className="shrink-0 rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring">
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
            {q.length === 1 && <p className="mt-1 px-1 text-[11px] text-muted-foreground">Digite ao menos 2 letras…</p>}
          </div>
        )}

        {/* mensagens OU resultados de busca (servidor) */}
        <div className="relative flex-1 overflow-y-auto px-4 py-3">
          {q.length >= 2 ? (
            searchQ.isLoading ? (
              <p className="text-sm text-muted-foreground">Buscando…</p>
            ) : hits.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma mensagem encontrada.</p>
            ) : (
              <div className="space-y-1">
                {hits.map((h) => (
                  <button key={h.messageId}
                    onClick={() => { openConversation(conv.channel.id, { messageId: h.messageId, at: h.createdAt }); setSearchOpen(false); setSearch(""); }}
                    className="flex w-full flex-col gap-0.5 rounded-md border px-3 py-2 text-left hover:bg-muted">
                    <span className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                      <span className="truncate font-medium text-foreground">{h.senderName ?? "—"}</span>
                      <span className="shrink-0">{new Date(h.createdAt).toLocaleDateString("pt-BR")} {new Date(h.createdAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</span>
                    </span>
                    <span className="line-clamp-2 text-sm">{highlightSnippet(h.body, q)}</span>
                  </button>
                ))}
                {searchQ.hasNextPage && (
                  <button onClick={() => searchQ.fetchNextPage()} disabled={searchQ.isFetchingNextPage}
                    className="mx-auto mt-1 block rounded-md border px-3 py-1 text-xs text-muted-foreground hover:bg-muted">
                    {searchQ.isFetchingNextPage ? "Carregando…" : "Carregar mais"}
                  </button>
                )}
              </div>
            )
          ) : isLoading ? (
            <p className="text-sm text-muted-foreground">Carregando…</p>
          ) : messages.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma mensagem ainda. Diga oi 👋</p>
          ) : (
            <div className="space-y-0.5" role="log" aria-live="polite" aria-relevant="additions" aria-label="Mensagens">
              {messages.map((m, i) => {
                const prev = messages[i - 1];
                const newDay = !prev || dayKey(prev.created_at) !== dayKey(m.created_at);
                const mine = m.sender_id === currentUser.id;
                const grouped = prev && prev.sender_id === m.sender_id && !newDay
                  && (new Date(m.created_at).getTime() - new Date(prev.created_at).getTime() < 5 * 60_000);
                return (
                  <div key={m.id} ref={(el) => { rowRefs.current[m.id] = el; }}
                    className={highlight === m.id ? "rounded-lg ring-2 ring-yellow-400/60 transition-shadow" : undefined}>
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
                      receipt={mine ? messageReceipt(m.created_at, members, currentUser.id).status : null}
                      menuUp={i >= messages.length - 3}
                      startEdit={editRequestId === m.id}
                      onEditConsumed={() => setEditRequestId(null)}
                      ann={isAnnouncement ? {
                        isPublisher,
                        acked: myAcked.has(m.id),
                        canAck: !isPublisher && m.sender_id !== currentUser.id,
                        count: ackCount[m.id] || 0,
                        onAck: () => ack.mutate({ messageId: m.id, channelId: conv.channel.id }),
                        onStatus: () => setStatusMsgId(m.id),
                      } : null}
                      onReply={() => setReplyTo(m)}
                      onReact={(emoji, active) => react.mutate({ messageId: m.id, emoji, channelId: conv.channel.id, active })}
                      onEdit={(body) => edit.mutate({ messageId: m.id, body, channelId: conv.channel.id })}
                      onDelete={() => del.mutate({ messageId: m.id, channelId: conv.channel.id })}
                    />
                  </div>
                );
              })}
              <div ref={bottomRef} />
            </div>
          )}

          {/* Focando uma msg antiga (busca): botão de voltar ao fim. */}
          {focus && q.length < 2 && (
            <button onClick={() => onClearFocus?.()} title="Ir para o fim"
              className="absolute bottom-4 right-4 z-10 flex h-9 w-9 items-center justify-center rounded-full border bg-background shadow-md hover:bg-muted">
              <ArrowDown className="h-4 w-4" />
            </button>
          )}
        </div>

        {isAnnouncement && !isPublisher ? (
          <div className="flex items-center justify-center gap-1.5 border-t p-3 text-center text-xs text-muted-foreground">
            <Lock className="h-3.5 w-3.5" /> Somente leitura — comunicado oficial
          </div>
        ) : (
          <Composer channelId={conv.channel.id} isGroup={isGroup} replyTo={replyTo} onClearReply={() => setReplyTo(null)}
            replyToName={replyTo ? nameOf(replyTo.sender_id) : ""} onEditLast={editLast} />
        )}
      </div>

      {panelOpen && (
        <ContactPanel conv={conv} onClose={() => setPanelOpen(false)} onDeleted={() => { setPanelOpen(false); onDeleted?.(); }} />
      )}
      {statusMsgId && <AnnouncementStatus messageId={statusMsgId} onClose={() => setStatusMsgId(null)} />}
    </div>
  );
}

function MessageBubble({
  m, mine, isGroup, showName, senderName, repliedTo, repliedName, currentUserId, receipt, menuUp, startEdit, onEditConsumed, ann, onReply, onReact, onEdit, onDelete,
}: {
  m: ChatMessage; mine: boolean; isGroup: boolean; showName: boolean; senderName: string;
  repliedTo: ChatMessage | null; repliedName: string; currentUserId: string;
  receipt: ReceiptStatus | null; menuUp: boolean; startEdit?: boolean; onEditConsumed?: () => void;
  ann?: AnnInfo | null;
  onReply: () => void; onReact: (emoji: string, active: boolean) => void;
  onEdit: (body: string) => void; onDelete: () => void;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(m.body ?? "");
  function closeMenu() { setMenuOpen(false); setConfirmDel(false); }
  const when = new Date(m.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const deleted = !!m.deleted_at;
  const edited = !!m.edited_at;

  // Pedido externo (atalho ↑) pra editar esta mensagem.
  useEffect(() => {
    if (!startEdit) return;
    if (!deleted) { setDraft(m.body ?? ""); setEditing(true); }
    onEditConsumed?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startEdit]);

  function saveEdit() {
    const b = draft.trim();
    if (b && b !== m.body) onEdit(b);
    setEditing(false);
  }

  // Mensagem apagada: tombstone pra todos, sem ações/reações.
  if (deleted) {
    return (
      <div className={`flex ${mine ? "justify-end" : "justify-start"}`}>
        <div className={`max-w-[78%] rounded-2xl px-3 py-2 text-sm italic text-muted-foreground ${mine ? "rounded-br-sm bg-muted/60" : "rounded-bl-sm bg-muted/60"}`}>
          <span className="inline-flex items-center gap-1"><Trash2 className="h-3.5 w-3.5" /> Esta mensagem foi apagada</span>
          <span className="ml-2 text-[10px]">{when}</span>
        </div>
      </div>
    );
  }

  // agrega reações: emoji -> {count, mine}
  const agg: Record<string, { count: number; mine: boolean }> = {};
  for (const r of m.reactions ?? []) {
    agg[r.emoji] = agg[r.emoji] || { count: 0, mine: false };
    agg[r.emoji].count++;
    if (r.user_id === currentUserId) agg[r.emoji].mine = true;
  }
  const reactList = Object.entries(agg);

  // Toolbar ao LADO do balão (como no WhatsApp): escondido, aparece no hover.
  const toolbar = (
    <div className="relative hidden shrink-0 items-center gap-0.5 self-center group-hover:flex">
      <button onClick={() => setPickerOpen((o) => !o)} title="Reagir" aria-label="Reagir à mensagem" className="rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-foreground"><SmilePlus className="h-4 w-4" /></button>
      <button onClick={onReply} title="Responder" aria-label="Responder mensagem" className="rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-foreground"><Reply className="h-4 w-4" /></button>
      {mine && (
        <div className="relative">
          <button onClick={() => setMenuOpen((o) => !o)} title="Mais" aria-label="Mais opções da mensagem" aria-haspopup="menu" className="rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-foreground"><MoreVertical className="h-4 w-4" /></button>
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-20" onClick={closeMenu} />
              {confirmDel ? (
                <div className={`absolute right-0 z-30 w-52 overflow-hidden rounded-lg border bg-popover p-3 shadow-lg ${menuUp ? "bottom-7" : "top-7"}`}>
                  <p className="mb-2 text-xs text-foreground">Apagar esta mensagem para todos?</p>
                  <div className="flex justify-end gap-1.5 text-xs">
                    <button onClick={closeMenu} className="rounded-md px-2.5 py-1 hover:bg-muted">Cancelar</button>
                    <button onClick={() => { closeMenu(); onDelete(); }}
                      className="rounded-md bg-destructive px-2.5 py-1 font-medium text-destructive-foreground hover:bg-destructive/90">Apagar</button>
                  </div>
                </div>
              ) : (
                <div className={`absolute right-0 z-30 w-36 overflow-hidden rounded-lg border bg-popover shadow-lg ${menuUp ? "bottom-7" : "top-7"}`}>
                  {m.kind === "text" && (
                    <button onClick={() => { setDraft(m.body ?? ""); setEditing(true); closeMenu(); }}
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted"><Pencil className="h-3.5 w-3.5" /> Editar</button>
                  )}
                  <button onClick={() => setConfirmDel(true)}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-destructive hover:bg-destructive/10"><Trash2 className="h-3.5 w-3.5" /> Apagar</button>
                </div>
              )}
            </>
          )}
        </div>
      )}
      {pickerOpen && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setPickerOpen(false)} />
          <div className={`absolute -top-10 z-30 flex gap-0.5 rounded-full border bg-popover px-1.5 py-1 shadow-lg ${mine ? "right-0" : "left-0"}`}>
            {REACTS.map((e) => (
              <button key={e} onClick={() => { onReact(e, !!agg[e]?.mine); setPickerOpen(false); }}
                className="rounded-full px-1 text-lg leading-none transition-transform hover:scale-125">{e}</button>
            ))}
          </div>
        </>
      )}
    </div>
  );

  return (
    <div className={`group flex items-center gap-1 ${mine ? "justify-end" : "justify-start"}`}>
      {mine && toolbar}
      <div className={`flex max-w-[min(85%,560px)] flex-col ${mine ? "items-end" : "items-start"}`}>
        <div className={`rounded-2xl px-3 py-2 text-sm ${mine ? "rounded-br-sm bg-[#d9fdd3] text-neutral-900 dark:bg-[#005c4b] dark:text-neutral-50" : "rounded-bl-sm bg-muted text-foreground"}`}>
          {showName && <p className="mb-0.5 text-xs font-semibold text-primary">{senderName}</p>}

          {repliedTo && (
            <div className={`mb-1 rounded-md border-l-2 px-2 py-1 text-xs ${mine ? "border-black/20 bg-black/5 dark:border-white/40 dark:bg-white/10" : "border-primary bg-background/60"}`}>
              <p className="font-medium opacity-80"><CornerUpLeft className="mr-1 inline h-3 w-3" />{repliedName}</p>
              <p className="truncate opacity-70">{repliedTo.body?.trim() ? richToPlain(repliedTo.body.trim()) : kindLabel(repliedTo.kind)}</p>
            </div>
          )}

          {editing ? (
            <div className="flex flex-col gap-1">
              <textarea autoFocus value={draft} onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); saveEdit(); }
                  if (e.key === "Escape") { setEditing(false); setDraft(m.body ?? ""); }
                }}
                rows={Math.min(6, draft.split("\n").length)}
                className="w-full min-w-[180px] resize-none rounded-md border border-black/20 bg-white/70 px-2 py-1 text-sm text-neutral-900 focus:outline-none dark:border-white/30 dark:bg-black/20 dark:text-neutral-50" />
              <div className="flex justify-end gap-1 text-[11px]">
                <button onClick={() => { setEditing(false); setDraft(m.body ?? ""); }} className="rounded px-2 py-0.5 hover:bg-black/10 dark:hover:bg-white/10">Cancelar</button>
                <button onClick={saveEdit} className="rounded bg-black/10 px-2 py-0.5 font-medium hover:bg-black/20 dark:bg-white/15 dark:hover:bg-white/25">Salvar</button>
              </div>
            </div>
          ) : (
            <>
              {/* Imagem/mídia EM CIMA; texto embaixo (estilo WhatsApp). */}
              {m.attachments && m.attachments.length > 0 && (
                <div className={`space-y-1.5 ${m.body ? "mb-1.5" : ""}`}>{m.attachments.map((att) => <Attachment key={att.id} att={att} />)}</div>
              )}
              {m.body && <p className="whitespace-pre-wrap break-words">{renderRich(m.body)}</p>}
            </>
          )}
          <div className={`mt-0.5 flex items-center justify-end gap-1 text-[10px] ${mine ? "text-black/50 dark:text-white/60" : "text-muted-foreground"}`}>
            {edited && <span className="italic">editada</span>}
            <span>{when}</span>
            {mine && receipt && <Ticks status={receipt} />}
          </div>

          {/* Comunicado oficial: confirmação de leitura / painel do publicador. */}
          {ann && (
            <div className={`mt-1.5 border-t pt-1.5 ${mine ? "border-black/10 dark:border-white/10" : "border-border"}`}>
              {ann.isPublisher ? (
                <button onClick={ann.onStatus} className="text-xs font-medium underline-offset-2 hover:underline">
                  {ann.count} {ann.count === 1 ? "confirmou" : "confirmaram"} — ver quem
                </button>
              ) : ann.canAck ? (
                ann.acked ? (
                  <span className="flex items-center gap-1 text-xs font-medium text-emerald-600"><Check className="h-3.5 w-3.5" /> Você confirmou a leitura</span>
                ) : (
                  <button onClick={ann.onAck}
                    className="rounded-md bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-emerald-700 focus-visible:ring-2 focus-visible:ring-ring">
                    Li e estou ciente
                  </button>
                )
              ) : null}
            </div>
          )}
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
      {!mine && toolbar}
    </div>
  );
}

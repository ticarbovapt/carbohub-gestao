import { useEffect, useRef, useState } from "react";
import {
  MessageSquarePlus, UsersRound, Search, Plus, Pin, PinOff, BellOff, Bell,
  ChevronDown, CheckCheck, Circle, Trash2, LogOut, Archive, ArchiveRestore, Megaphone, Clock, Hash,
} from "lucide-react";
import { useConversations, useUpdateMembership, useLeaveConversation, useSearchMessages, useCanAnnounce, useScheduledMessages, useMyStatus, useUserStatuses } from "../hooks";
import { useChatCtx } from "../context";
import { useTyping } from "../lib/presence";
import { richToPlain } from "../lib/format";
import { Avatar } from "./Avatar";
import { NewDmDialog, NewChannelDialog, NewAnnouncementDialog } from "./dialogs";
import { ScheduledPanel } from "./ScheduledPanel";
import { ExploreChannels } from "./ExploreChannels";
import { StatusDialog } from "./StatusDialog";
import { AvailabilityDot, statusText, AVAIL_META } from "./StatusBadge";
import type { Conversation } from "../types";

// Subtítulo da linha: "digitando…" (verde) enquanto alguém digita; senão a prévia.
function PreviewOrTyping({ channelId, currentUserId, isGroup, preview }: {
  channelId: string; currentUserId: string; isGroup: boolean; preview: string;
}) {
  const typing = useTyping(channelId, currentUserId);
  if (typing.length > 0) {
    const label = isGroup
      ? (typing.length === 1 ? `${typing[0].name.split(/\s+/)[0]} digitando…` : `${typing.length} digitando…`)
      : "digitando…";
    return <span className="min-w-0 flex-1 truncate text-xs text-emerald-500">{label}</span>;
  }
  return <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{preview}</span>;
}

function kindPreview(kind: string | null) {
  switch (kind) {
    case "image": return "📷 Foto";
    case "audio": return "🎤 Áudio";
    case "video": return "🎬 Vídeo";
    case "file": return "📎 Arquivo";
    default: return "";
  }
}

function timeLabel(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso), now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const y = new Date(); y.setDate(now.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return "Ontem";
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

export function ConversationList({
  selectedId, onSelect, onRemoved,
}: {
  selectedId: string | null;
  onSelect: (conv: Conversation) => void;
  onRemoved?: (channelId: string) => void;
}) {
  const { currentUser, openConversation } = useChatCtx();
  const { data: conversations = [], isLoading } = useConversations();
  const { data: myStatus } = useMyStatus();
  const dmOtherIds = conversations.filter((c) => c.channel.type === "dm" && c.otherUserId).map((c) => c.otherUserId as string);
  const { data: statuses = {} } = useUserStatuses(dmOtherIds);
  const [showStatus, setShowStatus] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  // Atalho: Ctrl/⌘ + K foca a busca de conversas.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const membership = useUpdateMembership();
  const leave = useLeaveConversation();
  const [filter, setFilter] = useState<"all" | "group" | "archived">("all");
  const [search, setSearch] = useState("");
  const [dialog, setDialog] = useState<null | "dm" | "group" | "announcement">(null);
  const { data: canAnnounce } = useCanAnnounce();
  const { data: scheduled = [] } = useScheduledMessages();
  const scheduledCount = scheduled.filter((s) => s.status === "pending").length;
  const [showScheduled, setShowScheduled] = useState(false);
  const [showExplore, setShowExplore] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [rowMenu, setRowMenu] = useState<{ conv: Conversation; x: number; y: number } | null>(null);

  function openRowMenu(c: Conversation, e: React.MouseEvent) {
    e.stopPropagation(); e.preventDefault();
    setRowMenu({ conv: c, x: e.clientX, y: e.clientY });
  }
  function togglePin(c: Conversation) { membership.mutate({ channelId: c.channel.id, patch: { pinned: !c.pinned } }); setRowMenu(null); }
  function toggleMute(c: Conversation) { membership.mutate({ channelId: c.channel.id, patch: { muted: !c.muted } }); setRowMenu(null); }
  function toggleArchive(c: Conversation) { membership.mutate({ channelId: c.channel.id, patch: { archived: !c.archived } }); setRowMenu(null); }
  function markRead(c: Conversation) { membership.mutate({ channelId: c.channel.id, patch: { last_read_at: new Date().toISOString() } }); setRowMenu(null); }
  function markUnread(c: Conversation) {
    const base = c.lastAt ? new Date(new Date(c.lastAt).getTime() - 1000) : new Date(Date.now() - 1000);
    membership.mutate({ channelId: c.channel.id, patch: { last_read_at: base.toISOString() } }); setRowMenu(null);
  }
  function removeConv(c: Conversation) { leave.mutate(c.channel.id); onRemoved?.(c.channel.id); setRowMenu(null); }

  const filtered = conversations
    .filter((c) => (filter === "archived" ? c.archived : (!c.archived || c.needsAck)))
    .filter((c) => (filter === "group" ? c.channel.type === "group" : true))
    .filter((c) => !search.trim() || c.title.toLowerCase().includes(search.trim().toLowerCase()));
  const archivedCount = conversations.filter((c) => c.archived).length;

  // Busca GLOBAL de mensagens no servidor (full-text) — seção "Mensagens".
  const searching = search.trim().length >= 2;
  const gsearch = useSearchMessages(search.trim(), null);
  const ghits = (gsearch.data?.pages ?? []).flat();

  function previewText(c: Conversation) {
    const base = (c.lastBody?.trim() ? richToPlain(c.lastBody.trim()) : "") || kindPreview(c.lastKind);
    if (!base && !c.lastKind) return "Nova conversa";
    if (c.channel.type === "group" && c.lastSenderId) {
      const who = c.lastSenderId === currentUser.id ? "Você" : (c.lastSenderName ?? "—");
      return `${who}: ${base}`;
    }
    return base;
  }

  return (
    <div className="flex h-full w-full flex-col border-r">
      {/* barra do meu status */}
      <button onClick={() => setShowStatus(true)} title="Definir meu status"
        className="flex items-center gap-2.5 border-b px-3 py-2 text-left hover:bg-muted/50">
        <span className="relative shrink-0">
          <Avatar name={currentUser.full_name} url={currentUser.avatar_url} size={32} />
          {(!myStatus || myStatus.availability === "disponivel") && (
            <AvailabilityDot availability="disponivel" size={9} className="absolute -bottom-0.5 -right-0.5" />
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold">{currentUser.full_name ?? "Você"}</span>
          <span className="block truncate text-xs text-muted-foreground">
            {statusText(myStatus) || (myStatus ? AVAIL_META[myStatus.availability].label : "Definir status")}{myStatus?.dnd ? " · 🔕 Não perturbe" : ""}
          </span>
        </span>
      </button>
      {/* header: título + botão único (menu) */}
      <div className="relative flex items-center gap-1 border-b p-2">
        <span className="flex-1 px-1 text-sm font-semibold">Conversas</span>
        <button onClick={() => setShowExplore(true)} title="Explorar canais públicos" aria-label="Explorar canais públicos"
          className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring">
          <Hash className="h-4 w-4" />
        </button>
        <button onClick={() => setShowScheduled(true)} title="Mensagens agendadas" aria-label="Mensagens agendadas"
          className="relative rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring">
          <Clock className="h-4 w-4" />
          {scheduledCount > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
              {scheduledCount > 9 ? "9+" : scheduledCount}
            </span>
          )}
        </button>
        <button onClick={() => setMenuOpen((o) => !o)} title="Nova conversa ou grupo" aria-label="Nova conversa ou grupo"
          className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring">
          <Plus className="h-4 w-4" />
        </button>
        {menuOpen && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
            <div className="absolute right-2 top-11 z-20 w-48 overflow-hidden rounded-lg border bg-popover shadow-lg">
              <button onClick={() => { setDialog("dm"); setMenuOpen(false); }}
                className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm hover:bg-muted">
                <MessageSquarePlus className="h-4 w-4 text-muted-foreground" /> Nova conversa
              </button>
              <button onClick={() => { setDialog("group"); setMenuOpen(false); }}
                className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm hover:bg-muted">
                <UsersRound className="h-4 w-4 text-muted-foreground" /> Novo grupo
              </button>
              {canAnnounce && (
                <button onClick={() => { setDialog("announcement"); setMenuOpen(false); }}
                  className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm hover:bg-muted">
                  <Megaphone className="h-4 w-4 text-amber-500" /> Novo comunicado oficial
                </button>
              )}
            </div>
          </>
        )}
      </div>

      {/* busca + filtro */}
      <div className="space-y-2 border-b p-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input ref={searchRef} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar conversa… (Ctrl+K)"
            aria-label="Buscar conversas e mensagens"
            onKeyDown={(e) => { if (e.key === "Escape" && search) { e.stopPropagation(); setSearch(""); } }}
            className="h-8 w-full rounded-md border border-input bg-background pl-8 pr-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
        </div>
        <div className="flex gap-1">
          <button onClick={() => setFilter("all")}
            className={`rounded-full px-3 py-1 text-xs font-medium ${filter === "all" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted"}`}>
            Tudo
          </button>
          <button onClick={() => setFilter("group")}
            className={`rounded-full px-3 py-1 text-xs font-medium ${filter === "group" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted"}`}>
            Grupos
          </button>
          {(archivedCount > 0 || filter === "archived") && (
            <button onClick={() => setFilter("archived")}
              className={`rounded-full px-3 py-1 text-xs font-medium ${filter === "archived" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted"}`}>
              Arquivadas{archivedCount > 0 ? ` (${archivedCount})` : ""}
            </button>
          )}
        </div>
      </div>

      {/* lista */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <p className="p-3 text-sm text-muted-foreground">Carregando…</p>
        ) : filtered.length === 0 ? (
          <p className="p-3 text-sm text-muted-foreground">Nenhuma conversa. Clique em ✏️ para começar.</p>
        ) : (
          filtered.map((c) => (
            <div key={c.channel.id} onClick={() => onSelect(c)} onContextMenu={(e) => openRowMenu(c, e)}
              role="button" tabIndex={0} aria-current={selectedId === c.channel.id}
              aria-label={`Conversa com ${c.title}${c.unread > 0 ? `, ${c.unread} não lidas` : ""}`}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(c); } }}
              className={`group relative flex w-full cursor-pointer items-center gap-3 border-b border-border/50 px-3 py-2.5 text-left focus-visible:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring ${selectedId === c.channel.id ? "bg-primary/10" : c.needsAck ? "bg-amber-50 dark:bg-amber-500/10" : "md:hover:bg-muted/60"}`}>
              <span className="relative shrink-0">
                <Avatar name={c.title} url={c.avatarUrl} size={48} />
                {c.channel.type === "dm" && c.otherUserId && statuses[c.otherUserId]?.availability === "disponivel" && (
                  <AvailabilityDot availability="disponivel" className="absolute bottom-0 right-0" />
                )}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-1.5">
                  {c.needsAck ? <Megaphone className="h-3 w-3 shrink-0 self-center text-amber-500" /> : c.pinned && <Pin className="h-3 w-3 shrink-0 text-muted-foreground" />}
                  <span className="min-w-0 shrink truncate text-sm font-semibold">{c.title}</span>
                  {c.channel.type === "dm" && c.otherUserId && statusText(statuses[c.otherUserId]) && (
                    <span className="min-w-0 shrink truncate text-[11px] font-normal text-muted-foreground">
                      {statusText(statuses[c.otherUserId])}
                    </span>
                  )}
                  <span className="flex-1" />
                  <span className={`shrink-0 text-[11px] ${c.unread > 0 && !c.muted ? "font-semibold text-primary" : "text-muted-foreground"}`}>
                    {timeLabel(c.lastAt)}
                  </span>
                </div>
                <div className="mt-0.5 flex items-center gap-1.5">
                  <PreviewOrTyping channelId={c.channel.id} currentUserId={currentUser.id} isGroup={c.channel.type === "group"} preview={previewText(c)} />
                  {c.muted && <BellOff className="h-3 w-3 shrink-0 text-muted-foreground" />}
                  {c.unread > 0 && (
                    <span className={`inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full px-1.5 text-[11px] font-semibold ${c.muted ? "bg-muted-foreground/40 text-foreground" : "bg-primary text-primary-foreground"}`}>
                      {c.unread > 99 ? "99+" : c.unread}
                    </span>
                  )}
                  {/* botão de ações: no fluxo, aparece no hover e empurra o badge p/ esquerda */}
                  <button onClick={(e) => openRowMenu(c, e)} title="Opções" aria-label="Opções da conversa"
                    className="hidden shrink-0 items-center justify-center rounded text-muted-foreground hover:text-foreground md:group-hover:inline-flex">
                    <ChevronDown className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          ))
        )}

        {/* Busca global de mensagens (servidor) */}
        {searching && (
          <div className="border-t">
            <p className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Mensagens</p>
            {gsearch.isLoading ? (
              <p className="px-3 pb-3 text-xs text-muted-foreground">Buscando…</p>
            ) : ghits.length === 0 ? (
              <p className="px-3 pb-3 text-xs text-muted-foreground">Nenhuma mensagem encontrada.</p>
            ) : (
              <>
                {ghits.map((h) => (
                  <button key={h.messageId}
                    onClick={() => openConversation(h.channelId, { messageId: h.messageId, at: h.createdAt })}
                    className="flex w-full flex-col gap-0.5 border-b border-border/50 px-3 py-2 text-left hover:bg-muted/60">
                    <span className="flex items-center justify-between gap-2 text-[11px]">
                      <span className="truncate font-semibold">{h.channelTitle}</span>
                      <span className="shrink-0 text-muted-foreground">{timeLabel(h.createdAt)}</span>
                    </span>
                    <span className="truncate text-xs text-muted-foreground">
                      {h.senderName ? `${h.senderName.split(/\s+/)[0]}: ` : ""}{h.body}
                    </span>
                  </button>
                ))}
                {gsearch.hasNextPage && (
                  <button onClick={() => gsearch.fetchNextPage()} disabled={gsearch.isFetchingNextPage}
                    className="mx-auto my-2 block rounded-md border px-3 py-1 text-xs text-muted-foreground hover:bg-muted">
                    {gsearch.isFetchingNextPage ? "Carregando…" : "Carregar mais"}
                  </button>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* menu de ações da conversa */}
      {rowMenu && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setRowMenu(null)} onContextMenu={(e) => { e.preventDefault(); setRowMenu(null); }} />
          <div role="menu" aria-label="Ações da conversa" className="fixed z-50 w-56 overflow-hidden rounded-lg border bg-popover py-1 shadow-lg"
            style={{ left: Math.min(rowMenu.x, window.innerWidth - 232), top: Math.min(rowMenu.y, window.innerHeight - 230) }}>
            <MenuItem icon={rowMenu.conv.pinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
              label={rowMenu.conv.pinned ? "Desafixar conversa" : "Fixar conversa"} onClick={() => togglePin(rowMenu.conv)} />
            <MenuItem icon={rowMenu.conv.muted ? <Bell className="h-4 w-4" /> : <BellOff className="h-4 w-4" />}
              label={rowMenu.conv.muted ? "Ativar notificações" : "Silenciar"} onClick={() => toggleMute(rowMenu.conv)} />
            <MenuItem icon={rowMenu.conv.archived ? <ArchiveRestore className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
              label={rowMenu.conv.archived ? "Desarquivar" : "Arquivar conversa"} onClick={() => toggleArchive(rowMenu.conv)} />
            {rowMenu.conv.unread > 0 ? (
              <MenuItem icon={<CheckCheck className="h-4 w-4" />} label="Marcar como lida" onClick={() => markRead(rowMenu.conv)} />
            ) : (
              <MenuItem icon={<Circle className="h-4 w-4" />} label="Marcar como não lida" onClick={() => markUnread(rowMenu.conv)} />
            )}
            <div className="my-1 h-px bg-border" />
            <MenuItem danger
              icon={rowMenu.conv.channel.type === "dm" ? <Trash2 className="h-4 w-4" /> : <LogOut className="h-4 w-4" />}
              label={rowMenu.conv.channel.type === "dm" ? "Excluir conversa" : "Sair do grupo"} onClick={() => removeConv(rowMenu.conv)} />
          </div>
        </>
      )}

      {showScheduled && <ScheduledPanel onClose={() => setShowScheduled(false)} />}
      {showExplore && <ExploreChannels onClose={() => setShowExplore(false)} onOpen={onSelect} />}
      {showStatus && <StatusDialog onClose={() => setShowStatus(false)} />}
      {dialog === "dm" && <NewDmDialog onClose={() => setDialog(null)} onOpened={onSelect} />}
      {dialog === "group" && <NewChannelDialog onClose={() => setDialog(null)} onOpened={onSelect} />}
      {dialog === "announcement" && <NewAnnouncementDialog onClose={() => setDialog(null)} onOpened={onSelect} />}
    </div>
  );
}

function MenuItem({ icon, label, onClick, danger }: { icon: React.ReactNode; label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button onClick={onClick} role="menuitem"
      className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm hover:bg-muted focus-visible:bg-muted focus-visible:outline-none ${danger ? "text-destructive" : ""}`}>
      {icon} {label}
    </button>
  );
}

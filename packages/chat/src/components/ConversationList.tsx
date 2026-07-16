import { useState } from "react";
import {
  MessageSquarePlus, UsersRound, Search, Plus, Pin, PinOff, BellOff, Bell,
  ChevronDown, CheckCheck, Circle, Trash2, LogOut,
} from "lucide-react";
import { useConversations, useUpdateMembership, useLeaveConversation } from "../hooks";
import { useChatCtx } from "../context";
import { Avatar } from "./Avatar";
import { NewDmDialog, NewChannelDialog } from "./dialogs";
import type { Conversation } from "../types";

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
  const { currentUser } = useChatCtx();
  const { data: conversations = [], isLoading } = useConversations();
  const membership = useUpdateMembership();
  const leave = useLeaveConversation();
  const [filter, setFilter] = useState<"all" | "group">("all");
  const [search, setSearch] = useState("");
  const [dialog, setDialog] = useState<null | "dm" | "group">(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [rowMenu, setRowMenu] = useState<{ conv: Conversation; x: number; y: number } | null>(null);

  function openRowMenu(c: Conversation, e: React.MouseEvent) {
    e.stopPropagation(); e.preventDefault();
    setRowMenu({ conv: c, x: e.clientX, y: e.clientY });
  }
  function togglePin(c: Conversation) { membership.mutate({ channelId: c.channel.id, patch: { pinned: !c.pinned } }); setRowMenu(null); }
  function toggleMute(c: Conversation) { membership.mutate({ channelId: c.channel.id, patch: { muted: !c.muted } }); setRowMenu(null); }
  function markRead(c: Conversation) { membership.mutate({ channelId: c.channel.id, patch: { last_read_at: new Date().toISOString() } }); setRowMenu(null); }
  function markUnread(c: Conversation) {
    const base = c.lastAt ? new Date(new Date(c.lastAt).getTime() - 1000) : new Date(Date.now() - 1000);
    membership.mutate({ channelId: c.channel.id, patch: { last_read_at: base.toISOString() } }); setRowMenu(null);
  }
  function removeConv(c: Conversation) { leave.mutate(c.channel.id); onRemoved?.(c.channel.id); setRowMenu(null); }

  const filtered = conversations
    .filter((c) => (filter === "group" ? c.channel.type === "group" : true))
    .filter((c) => !search.trim() || c.title.toLowerCase().includes(search.trim().toLowerCase()));

  function previewText(c: Conversation) {
    const base = c.lastBody?.trim() || kindPreview(c.lastKind);
    if (!base && !c.lastKind) return "Nova conversa";
    if (c.channel.type === "group" && c.lastSenderId) {
      const who = c.lastSenderId === currentUser.id ? "Você" : (c.lastSenderName ?? "—");
      return `${who}: ${base}`;
    }
    return base;
  }

  return (
    <div className="flex h-full w-full flex-col border-r">
      {/* header: título + botão único (menu) */}
      <div className="relative flex items-center gap-1 border-b p-2">
        <span className="flex-1 px-1 text-sm font-semibold">Conversas</span>
        <button onClick={() => setMenuOpen((o) => !o)} title="Nova conversa ou grupo"
          className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground">
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
            </div>
          </>
        )}
      </div>

      {/* busca + filtro */}
      <div className="space-y-2 border-b p-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar conversa…"
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
              className={`group relative flex w-full cursor-pointer items-center gap-3 border-b border-border/50 px-3 py-2.5 text-left ${selectedId === c.channel.id ? "bg-primary/10" : "hover:bg-muted/60"}`}>
              <Avatar name={c.title} url={c.avatarUrl} size={48} />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-1.5">
                  {c.pinned && <Pin className="h-3 w-3 shrink-0 text-muted-foreground" />}
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold">{c.title}</span>
                  <span className={`shrink-0 text-[11px] ${c.unread > 0 && !c.muted ? "font-semibold text-primary" : "text-muted-foreground"}`}>
                    {timeLabel(c.lastAt)}
                  </span>
                </div>
                <div className="mt-0.5 flex items-center gap-1.5">
                  <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{previewText(c)}</span>
                  {c.muted && <BellOff className="h-3 w-3 shrink-0 text-muted-foreground" />}
                  {c.unread > 0 && (
                    <span className={`inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full px-1.5 text-[11px] font-semibold ${c.muted ? "bg-muted-foreground/40 text-foreground" : "bg-primary text-primary-foreground"}`}>
                      {c.unread > 99 ? "99+" : c.unread}
                    </span>
                  )}
                  {/* botão de ações: no fluxo, aparece no hover e empurra o badge p/ esquerda */}
                  <button onClick={(e) => openRowMenu(c, e)} title="Opções"
                    className="hidden shrink-0 items-center justify-center rounded text-muted-foreground hover:text-foreground group-hover:inline-flex">
                    <ChevronDown className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* menu de ações da conversa */}
      {rowMenu && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setRowMenu(null)} onContextMenu={(e) => { e.preventDefault(); setRowMenu(null); }} />
          <div className="fixed z-50 w-56 overflow-hidden rounded-lg border bg-popover py-1 shadow-lg"
            style={{ left: Math.min(rowMenu.x, window.innerWidth - 232), top: Math.min(rowMenu.y, window.innerHeight - 230) }}>
            <MenuItem icon={rowMenu.conv.pinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
              label={rowMenu.conv.pinned ? "Desafixar conversa" : "Fixar conversa"} onClick={() => togglePin(rowMenu.conv)} />
            <MenuItem icon={rowMenu.conv.muted ? <Bell className="h-4 w-4" /> : <BellOff className="h-4 w-4" />}
              label={rowMenu.conv.muted ? "Ativar notificações" : "Silenciar"} onClick={() => toggleMute(rowMenu.conv)} />
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

      {dialog === "dm" && <NewDmDialog onClose={() => setDialog(null)} onOpened={onSelect} />}
      {dialog === "group" && <NewChannelDialog onClose={() => setDialog(null)} onOpened={onSelect} />}
    </div>
  );
}

function MenuItem({ icon, label, onClick, danger }: { icon: React.ReactNode; label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button onClick={onClick}
      className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm hover:bg-muted ${danger ? "text-destructive" : ""}`}>
      {icon} {label}
    </button>
  );
}

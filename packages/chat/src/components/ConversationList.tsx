import { useState } from "react";
import { MessageSquarePlus, UsersRound, Search, Plus } from "lucide-react";
import { useConversations } from "../hooks";
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
  selectedId, onSelect,
}: {
  selectedId: string | null;
  onSelect: (conv: Conversation) => void;
}) {
  const { currentUser } = useChatCtx();
  const { data: conversations = [], isLoading } = useConversations();
  const [filter, setFilter] = useState<"all" | "group">("all");
  const [search, setSearch] = useState("");
  const [dialog, setDialog] = useState<null | "dm" | "group">(null);
  const [menuOpen, setMenuOpen] = useState(false);

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
            <button key={c.channel.id} onClick={() => onSelect(c)}
              className={`flex w-full items-center gap-3 border-b border-border/50 px-3 py-2.5 text-left ${selectedId === c.channel.id ? "bg-primary/10" : "hover:bg-muted/60"}`}>
              <Avatar name={c.title} url={c.avatarUrl} size={48} />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold">{c.title}</span>
                  <span className={`shrink-0 text-[11px] ${c.unread > 0 ? "font-semibold text-primary" : "text-muted-foreground"}`}>
                    {timeLabel(c.lastAt)}
                  </span>
                </div>
                <div className="mt-0.5 flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{previewText(c)}</span>
                  {c.unread > 0 && (
                    <span className="inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-semibold text-primary-foreground">
                      {c.unread > 99 ? "99+" : c.unread}
                    </span>
                  )}
                </div>
              </div>
            </button>
          ))
        )}
      </div>

      {dialog === "dm" && <NewDmDialog onClose={() => setDialog(null)} onOpened={onSelect} />}
      {dialog === "group" && <NewChannelDialog onClose={() => setDialog(null)} onOpened={onSelect} />}
    </div>
  );
}

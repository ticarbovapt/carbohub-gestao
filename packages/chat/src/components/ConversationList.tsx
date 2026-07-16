import { useState } from "react";
import { MessageSquarePlus, UsersRound, Search } from "lucide-react";
import { useConversations } from "../hooks";
import { Avatar } from "./Avatar";
import { NewDmDialog, NewChannelDialog } from "./dialogs";
import type { Conversation } from "../types";

export function ConversationList({
  selectedId, onSelect,
}: {
  selectedId: string | null;
  onSelect: (conv: Conversation) => void;
}) {
  const { data: conversations = [], isLoading } = useConversations();
  const [tab, setTab] = useState<"dm" | "group">("dm");
  const [search, setSearch] = useState("");
  const [dialog, setDialog] = useState<null | "dm" | "group">(null);

  const filtered = conversations
    .filter((c) => (tab === "dm" ? c.channel.type === "dm" : c.channel.type === "group"))
    .filter((c) => !search.trim() || c.title.toLowerCase().includes(search.trim().toLowerCase()));

  function openNew(conv: Conversation) {
    setTab(conv.channel.type === "dm" ? "dm" : "group");
    onSelect(conv); // abre já, mesmo antes da lista recarregar
  }

  return (
    <div className="flex h-full w-full flex-col border-r">
      {/* tabs + novo */}
      <div className="flex items-center gap-1 border-b p-2">
        <button onClick={() => setTab("dm")}
          className={`flex-1 rounded-md px-2 py-1.5 text-sm font-medium ${tab === "dm" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted"}`}>
          Diretas
        </button>
        <button onClick={() => setTab("group")}
          className={`flex-1 rounded-md px-2 py-1.5 text-sm font-medium ${tab === "group" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted"}`}>
          Canais
        </button>
        <button onClick={() => setDialog(tab)} title={tab === "dm" ? "Nova conversa" : "Novo grupo"}
          className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground">
          {tab === "dm" ? <MessageSquarePlus className="h-4 w-4" /> : <UsersRound className="h-4 w-4" />}
        </button>
      </div>

      {/* busca */}
      <div className="border-b p-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar conversa…"
            className="h-8 w-full rounded-md border border-input bg-background pl-8 pr-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
        </div>
      </div>

      {/* lista */}
      <div className="flex-1 overflow-y-auto p-1.5">
        {isLoading ? (
          <p className="p-3 text-sm text-muted-foreground">Carregando…</p>
        ) : filtered.length === 0 ? (
          <p className="p-3 text-sm text-muted-foreground">
            {tab === "dm" ? "Nenhuma conversa. Clique em + para começar." : "Nenhum canal ainda."}
          </p>
        ) : (
          filtered.map((c) => (
            <button key={c.channel.id} onClick={() => onSelect(c)}
              className={`flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left ${selectedId === c.channel.id ? "bg-primary/10" : "hover:bg-muted"}`}>
              <Avatar name={c.title} url={c.avatarUrl} size={36} />
              <span className="min-w-0 flex-1 truncate text-sm font-medium">{c.title}</span>
              {c.unread > 0 && (
                <span className="ml-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-semibold text-primary-foreground">
                  {c.unread > 99 ? "99+" : c.unread}
                </span>
              )}
            </button>
          ))
        )}
      </div>

      {dialog === "dm" && <NewDmDialog onClose={() => setDialog(null)} onOpened={openNew} />}
      {dialog === "group" && <NewChannelDialog onClose={() => setDialog(null)} onOpened={openNew} />}
    </div>
  );
}

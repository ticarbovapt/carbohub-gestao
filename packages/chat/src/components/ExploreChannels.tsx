import { useState } from "react";
import { X, Hash, Search, Users, Check, Loader2 } from "lucide-react";
import { usePublicChannels, useJoinChannel, useLeaveConversation, type PublicChannel } from "../hooks";
import { Avatar } from "./Avatar";
import type { Conversation } from "../types";

const nowIso = () => new Date().toISOString();

function toConv(pc: PublicChannel): Conversation {
  return {
    channel: {
      id: pc.channelId, type: "group", name: pc.name, description: pc.description,
      is_private: false, avatar_url: pc.avatarUrl, created_by: null,
      created_at: pc.lastActivity ?? nowIso(), archived_at: null, is_announcement: false,
      visibility: "public", topic: pc.topic,
    },
    title: pc.name ?? "Canal", avatarUrl: pc.avatarUrl, otherUserId: null, unread: 0,
    lastAt: pc.lastActivity, lastBody: null, lastKind: null, lastSenderId: null, lastSenderName: null,
    muted: false, pinned: false, archived: false, isAnnouncement: false, needsAck: false,
  };
}

// Diretório de canais públicos: qualquer interno vê, lê e pode Entrar/Sair.
export function ExploreChannels({ onClose, onOpen }: { onClose: () => void; onOpen: (conv: Conversation) => void }) {
  const [search, setSearch] = useState("");
  const { data: channels = [], isLoading } = usePublicChannels(search);
  const join = useJoinChannel();
  const leave = useLeaveConversation();
  const [busyId, setBusyId] = useState<string | null>(null);

  async function entrar(pc: PublicChannel) {
    setBusyId(pc.channelId);
    try { await join.mutateAsync(pc.channelId); onOpen(toConv(pc)); onClose(); }
    finally { setBusyId(null); }
  }

  return (
    <div className="fixed inset-0 z-[55] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="flex max-h-[80vh] w-full max-w-md flex-col rounded-xl border bg-background shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b px-4 py-3">
          <p className="flex items-center gap-2 text-sm font-semibold"><Hash className="h-4 w-4" /> Explorar canais</p>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
        </div>

        <div className="border-b p-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar canal por nome ou assunto…"
              className="h-9 w-full rounded-md border border-input bg-background pl-8 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {isLoading ? (
            <p className="p-4 text-sm text-muted-foreground">Carregando…</p>
          ) : channels.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">Nenhum canal público{search ? " para essa busca" : " ainda"}.</p>
          ) : (
            <div className="space-y-1">
              {channels.map((pc) => (
                <div key={pc.channelId} onClick={() => { onOpen(toConv(pc)); onClose(); }}
                  className="flex cursor-pointer items-center gap-3 rounded-lg px-2.5 py-2 hover:bg-muted">
                  <Avatar name={pc.name} url={pc.avatarUrl} size={40} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{pc.name ?? "Canal"}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {pc.topic || pc.description || "Canal público"}
                    </p>
                    <p className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground">
                      <Users className="h-3 w-3" /> {pc.memberCount} {pc.memberCount === 1 ? "membro" : "membros"}
                    </p>
                  </div>
                  {pc.isMember ? (
                    <button onClick={(e) => { e.stopPropagation(); leave.mutate(pc.channelId); }}
                      className="shrink-0 rounded-md border px-2.5 py-1 text-xs font-medium text-muted-foreground hover:bg-muted">
                      <span className="inline-flex items-center gap-1"><Check className="h-3.5 w-3.5 text-emerald-500" /> Membro</span>
                    </button>
                  ) : (
                    <button onClick={(e) => { e.stopPropagation(); entrar(pc); }} disabled={busyId === pc.channelId}
                      className="shrink-0 rounded-md bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground disabled:opacity-50">
                      {busyId === pc.channelId ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Entrar"}
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

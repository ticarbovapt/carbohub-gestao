import { useState } from "react";
import { X, Check, Search } from "lucide-react";
import { useDirectory, useStartDm, useCreateChannel } from "../hooks";
import { Avatar } from "./Avatar";
import type { ChatProfileRef, Conversation } from "../types";

const nowIso = () => new Date().toISOString();

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-xl border bg-background shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b px-4 py-3">
          <p className="text-sm font-semibold">{title}</p>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}

function DirectorySearch({ children }: { children: (search: string, setSearch: (s: string) => void) => React.ReactNode }) {
  const [search, setSearch] = useState("");
  return (
    <>
      <div className="relative mb-3">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar pessoa…"
          className="h-9 w-full rounded-md border border-input bg-background pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </div>
      {children(search, setSearch)}
    </>
  );
}

export function NewDmDialog({ onClose, onOpened }: { onClose: () => void; onOpened: (conv: Conversation) => void }) {
  const startDm = useStartDm();
  return (
    <Modal title="Nova mensagem direta" onClose={onClose}>
      <DirectorySearch>
        {(search) => <DirList search={search} onPick={async (p) => {
          const cid = await startDm.mutateAsync(p.id);
          onOpened({
            channel: { id: cid, type: "dm", name: null, description: null, is_private: true, avatar_url: null, created_by: null, created_at: nowIso(), archived_at: null },
            title: p.full_name ?? "Conversa",
            avatarUrl: p.avatar_url ?? null,
            otherUserId: p.id,
            unread: 0,
            lastAt: null, lastBody: null, lastKind: null, lastSenderId: null, lastSenderName: null,
            muted: false, pinned: false,
          });
          onClose();
        }} />}
      </DirectorySearch>
    </Modal>
  );
}

function DirList({ search, onPick, selected }: { search: string; onPick: (p: ChatProfileRef) => void; selected?: Set<string> }) {
  const { data: people = [], isLoading } = useDirectory(search);
  if (isLoading) return <p className="text-sm text-muted-foreground">Carregando…</p>;
  if (!people.length) return <p className="text-sm text-muted-foreground">Ninguém encontrado.</p>;
  return (
    <div className="max-h-72 space-y-1 overflow-y-auto">
      {people.map((p) => (
        <button key={p.id} onClick={() => onPick(p)}
          className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left hover:bg-muted">
          <Avatar name={p.full_name} url={p.avatar_url} size={32} />
          <span className="flex-1 truncate text-sm">{p.full_name ?? "—"}</span>
          {selected?.has(p.id) && <Check className="h-4 w-4 text-primary" />}
        </button>
      ))}
    </div>
  );
}

export function NewChannelDialog({ onClose, onOpened }: { onClose: () => void; onOpened: (conv: Conversation) => void }) {
  const [name, setName] = useState("");
  const [isPrivate, setIsPrivate] = useState(true);
  const [members, setMembers] = useState<Set<string>>(new Set());
  const create = useCreateChannel();

  function toggle(id: string) {
    setMembers((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }
  async function submit() {
    if (!name.trim() || create.isPending) return;
    const cid = await create.mutateAsync({ name, memberIds: [...members], isPrivate });
    onOpened({
      channel: { id: cid, type: "group", name: name.trim(), description: null, is_private: isPrivate, avatar_url: null, created_by: null, created_at: nowIso(), archived_at: null },
      title: name.trim(),
      avatarUrl: null,
      otherUserId: null,
      unread: 0,
      lastAt: null, lastBody: null, lastKind: null, lastSenderId: null, lastSenderName: null,
      muted: false, pinned: false,
    });
    onClose();
  }

  return (
    <Modal title="Novo grupo" onClose={onClose}>
      <input
        value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome do grupo"
        className="mb-3 h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
      />
      <label className="mb-3 flex items-center gap-2 text-sm">
        <input type="checkbox" checked={isPrivate} onChange={(e) => setIsPrivate(e.target.checked)} />
        Grupo privado (só convidados entram)
      </label>
      <p className="mb-1.5 text-xs font-medium text-muted-foreground">Adicionar pessoas ({members.size})</p>
      <DirectorySearch>
        {(search) => <DirList search={search} onPick={toggle} selected={members} />}
      </DirectorySearch>
      <div className="mt-4 flex justify-end gap-2">
        <button onClick={onClose} className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted">Cancelar</button>
        <button onClick={submit} disabled={!name.trim() || create.isPending}
          className="rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground disabled:opacity-40">
          {create.isPending ? "Criando…" : "Criar grupo"}
        </button>
      </div>
    </Modal>
  );
}

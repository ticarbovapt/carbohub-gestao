import { useState } from "react";
import { toast } from "sonner";
import { X, Check, Search, Image as ImageIcon } from "lucide-react";
import { useDirectory, useStartDm, useCreateChannel, usePublishAnnouncement, useDepartments } from "../hooks";
import type { AnnAudience } from "../hooks";
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
            muted: false, pinned: false, archived: false, isAnnouncement: false, needsAck: false,
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
  const selectable = !!selected;
  return (
    <div className="max-h-72 space-y-1 overflow-y-auto">
      {people.map((p) => {
        const isSel = selected?.has(p.id);
        return (
          <button key={p.id} onClick={() => onPick(p)} aria-pressed={selectable ? !!isSel : undefined}
            className={`flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors ${isSel ? "bg-primary/10 ring-1 ring-primary/40" : "hover:bg-muted"}`}>
            <Avatar name={p.full_name} url={p.avatar_url} size={32} />
            <span className="flex-1 truncate text-sm">{p.full_name ?? "—"}</span>
            {selectable && (
              <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${isSel ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/40"}`}>
                {isSel && <Check className="h-3.5 w-3.5" />}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// Seletor de membros reutilizável (chips no topo + busca + lista com ✓).
function MemberPicker({ selMap, setSelMap }: {
  selMap: Map<string, ChatProfileRef>;
  setSelMap: React.Dispatch<React.SetStateAction<Map<string, ChatProfileRef>>>;
}) {
  const selectedIds = new Set(selMap.keys());
  const toggle = (p: ChatProfileRef) => setSelMap((prev) => { const n = new Map(prev); n.has(p.id) ? n.delete(p.id) : n.set(p.id, p); return n; });
  const remove = (id: string) => setSelMap((prev) => { const n = new Map(prev); n.delete(id); return n; });
  return (
    <>
      <p className="mb-1.5 text-xs font-medium text-muted-foreground">Adicionar pessoas ({selMap.size})</p>
      {selMap.size > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {[...selMap.values()].map((p) => (
            <span key={p.id} className="flex items-center gap-1.5 rounded-full bg-primary/10 py-1 pl-1 pr-2 text-xs">
              <Avatar name={p.full_name} url={p.avatar_url} size={20} />
              <span className="max-w-[120px] truncate">{p.full_name ?? "—"}</span>
              <button onClick={() => remove(p.id)} aria-label={`Remover ${p.full_name ?? ""}`} className="text-muted-foreground hover:text-foreground"><X className="h-3 w-3" /></button>
            </span>
          ))}
        </div>
      )}
      <DirectorySearch>
        {(search) => <DirList search={search} onPick={toggle} selected={selectedIds} />}
      </DirectorySearch>
    </>
  );
}

export function NewChannelDialog({ onClose, onOpened }: { onClose: () => void; onOpened: (conv: Conversation) => void }) {
  const [name, setName] = useState("");
  const [isPrivate, setIsPrivate] = useState(true);
  const [selMap, setSelMap] = useState<Map<string, ChatProfileRef>>(new Map());
  const create = useCreateChannel();

  async function submit() {
    if (!name.trim() || create.isPending) return;
    let cid: string;
    try {
      cid = await create.mutateAsync({ name, memberIds: [...selMap.keys()], isPrivate });
    } catch (e) {
      toast.error("Não foi possível criar. " + ((e as { message?: string })?.message ?? ""));
      return;
    }
    onOpened({
      channel: { id: cid, type: "group", name: name.trim(), description: null, is_private: isPrivate, avatar_url: null, created_by: null, created_at: nowIso(), archived_at: null, is_announcement: false },
      title: name.trim(), avatarUrl: null, otherUserId: null, unread: 0,
      lastAt: null, lastBody: null, lastKind: null, lastSenderId: null, lastSenderName: null,
      muted: false, pinned: false, archived: false, isAnnouncement: false, needsAck: false,
    });
    onClose();
  }

  return (
    <Modal title="Novo grupo" onClose={onClose}>
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome do grupo"
        className="mb-3 h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
      <label className="mb-3 flex items-center gap-2 text-sm">
        <input type="checkbox" checked={isPrivate} onChange={(e) => setIsPrivate(e.target.checked)} />
        Grupo privado (só convidados entram)
      </label>
      <MemberPicker selMap={selMap} setSelMap={setSelMap} />
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

// Comunicado oficial: título + texto + imagem + PÚBLICO (todos/departamento/pessoas).
export function NewAnnouncementDialog({ onClose, onOpened }: { onClose: () => void; onOpened: (conv: Conversation) => void }) {
  const [name, setName] = useState("");
  const [body, setBody] = useState("");
  const [image, setImage] = useState<File | null>(null);
  const [audience, setAudience] = useState<AnnAudience>("all");
  const [depts, setDepts] = useState<Set<string>>(new Set());
  const [selMap, setSelMap] = useState<Map<string, ChatProfileRef>>(new Map());
  const publish = usePublishAnnouncement();
  const { data: departments = [] } = useDepartments();

  const audienceOk = audience === "all" || (audience === "departments" && depts.size > 0) || (audience === "users" && selMap.size > 0);
  const canSubmit = !!name.trim() && (!!body.trim() || !!image) && audienceOk && !publish.isPending;

  async function submit() {
    if (!canSubmit) return;
    let cid: string;
    try {
      cid = await publish.mutateAsync({
        name, audience,
        departments: [...depts], memberIds: [...selMap.keys()],
        body, image,
      });
    } catch (e) {
      toast.error("Não foi possível publicar. " + ((e as { message?: string })?.message ?? ""));
      return;
    }
    onOpened({
      channel: { id: cid, type: "group", name: name.trim(), description: null, is_private: true, avatar_url: null, created_by: null, created_at: nowIso(), archived_at: null, is_announcement: true },
      title: name.trim(), avatarUrl: null, otherUserId: null, unread: 0,
      lastAt: nowIso(), lastBody: body.trim() || (image ? "📷 Imagem" : null), lastKind: image ? "image" : "text", lastSenderId: null, lastSenderName: "Você",
      muted: false, pinned: false, archived: false, isAnnouncement: true, needsAck: false,
    });
    onClose();
  }

  const pretty = (d: string) => d.replace(/_/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());

  return (
    <Modal title="Novo comunicado oficial" onClose={onClose}>
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Título do comunicado"
        className="mb-2 h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
      <textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Texto do comunicado…" rows={4}
        className="mb-2 w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
      {image ? (
        <div className="mb-3 flex items-center gap-2 rounded-md border p-2">
          <img src={URL.createObjectURL(image)} alt="" className="h-12 w-12 rounded object-cover" />
          <span className="flex-1 truncate text-xs text-muted-foreground">{image.name}</span>
          <button onClick={() => setImage(null)} aria-label="Remover imagem" className="text-muted-foreground hover:text-destructive"><X className="h-4 w-4" /></button>
        </div>
      ) : (
        <label className="mb-3 flex w-fit cursor-pointer items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-muted">
          <ImageIcon className="h-4 w-4" /> Adicionar imagem
          <input type="file" accept="image/*" className="hidden" onChange={(e) => setImage(e.target.files?.[0] ?? null)} />
        </label>
      )}

      {/* PÚBLICO */}
      <p className="mb-1.5 text-xs font-medium text-muted-foreground">Enviar para</p>
      <div className="mb-2 flex flex-wrap gap-1.5">
        {([["all", "Todos"], ["departments", "Por departamento"], ["users", "Escolher pessoas"]] as [AnnAudience, string][]).map(([v, label]) => (
          <button key={v} onClick={() => setAudience(v)} type="button"
            className={`rounded-full px-3 py-1 text-xs font-medium ${audience === v ? "bg-primary/10 text-primary ring-1 ring-primary/40" : "text-muted-foreground hover:bg-muted"}`}>
            {label}
          </button>
        ))}
      </div>

      {audience === "all" && (
        <p className="mb-1 text-[11px] text-muted-foreground">Vai para todos os funcionários.</p>
      )}
      {audience === "departments" && (
        <div className="mb-1 flex flex-wrap gap-1.5">
          {departments.map((d) => {
            const on = depts.has(d);
            return (
              <button key={d} type="button"
                onClick={() => setDepts((prev) => { const n = new Set(prev); n.has(d) ? n.delete(d) : n.add(d); return n; })}
                className={`rounded-full border px-2.5 py-1 text-xs ${on ? "border-primary bg-primary/10 text-primary" : "hover:bg-muted"}`}>
                {pretty(d)}
              </button>
            );
          })}
        </div>
      )}
      {audience === "users" && <MemberPicker selMap={selMap} setSelMap={setSelMap} />}

      <div className="mt-4 flex justify-end gap-2">
        <button onClick={onClose} className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted">Cancelar</button>
        <button onClick={submit} disabled={!canSubmit}
          className="rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground disabled:opacity-40">
          {publish.isPending ? "Publicando…" : "Publicar comunicado"}
        </button>
      </div>
    </Modal>
  );
}

import { useState } from "react";
import {
  X, Trash2, LogOut, FileText, Play, Mic, Bell, BellOff, Pin, PinOff,
  Pencil, UserPlus, Check, CheckCheck, Clock, Camera, Search as SearchIcon,
} from "lucide-react";
import {
  useUserInfo, useChannelMembers, useChannelMedia, useLeaveConversation, useSignedUrl,
  useUpdateMembership, useRenameChannel, useAddMembers, useRemoveMember, useDirectory, useConversations, useSetChannelAvatar,
} from "../hooks";
import { useChatCtx } from "../context";
import { memberReceipt } from "../lib/receipts";
import { Avatar } from "./Avatar";
import type { Conversation, ChatAttachment } from "../types";

// Ícone de recibo de um membro para a última mensagem do grupo.
function MemberTick({ status }: { status: "sent" | "delivered" | "read" }) {
  if (status === "read") return <CheckCheck className="h-3.5 w-3.5 text-[#53bdeb]" aria-label="Leu" />;
  if (status === "delivered") return <CheckCheck className="h-3.5 w-3.5 text-muted-foreground/70" aria-label="Recebeu" />;
  return <Clock className="h-3 w-3 text-muted-foreground/60" aria-label="Pendente" />;
}

export function ContactPanel({ conv: convProp, onClose, onDeleted }: {
  conv: Conversation;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const { currentUser } = useChatCtx();
  // Lê o estado VIVO da conversa (muted/pinned) da lista; cai no snapshot se ainda não veio.
  const { data: convs = [] } = useConversations();
  const conv = convs.find((c) => c.channel.id === convProp.channel.id) ?? convProp;
  const isDm = conv.channel.type === "dm";
  const { data: info } = useUserInfo(isDm ? conv.otherUserId : null);
  const { data: members = [] } = useChannelMembers(conv.channel.id, !isDm);
  const { data: media = [] } = useChannelMedia(conv.channel.id);
  const leave = useLeaveConversation();
  const membership = useUpdateMembership();
  const rename = useRenameChannel();
  const setAvatar = useSetChannelAvatar();
  const addMembers = useAddMembers();
  const removeMember = useRemoveMember();

  const [confirm, setConfirm] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(conv.title);
  const [showAll, setShowAll] = useState(false);
  const [addOpen, setAddOpen] = useState(false);

  const myRole = members.find((m) => m.id === currentUser.id)?.role;
  const canManage = !isDm && (myRole === "owner" || myRole === "admin");

  async function doLeave() { await leave.mutateAsync(conv.channel.id); setConfirm(false); onDeleted(); }
  async function saveName() {
    if (nameDraft.trim() && nameDraft.trim() !== conv.title) await rename.mutateAsync({ channelId: conv.channel.id, name: nameDraft });
    setEditingName(false);
  }

  return (
    <div className="flex h-full w-full shrink-0 flex-col border-l bg-card md:w-80">
      <div className="flex items-center gap-2 border-b px-4 py-3">
        <button onClick={onClose} aria-label="Fechar painel" className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
        <span className="text-sm font-semibold">{isDm ? "Dados do contato" : "Dados do grupo"}</span>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* cabeçalho */}
        <div className="flex flex-col items-center gap-2 border-b px-4 py-6 text-center">
          {!isDm && canManage ? (
            <label className="group relative cursor-pointer" title="Trocar foto do grupo">
              <Avatar name={conv.title} url={conv.avatarUrl} size={88} />
              <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/45 text-white opacity-0 transition-opacity group-hover:opacity-100">
                {setAvatar.isPending ? <span className="text-[11px]">enviando…</span> : <Camera className="h-6 w-6" />}
              </span>
              <input type="file" accept="image/*" className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) setAvatar.mutate({ channelId: conv.channel.id, file: f }); e.currentTarget.value = ""; }} />
            </label>
          ) : (
            <Avatar name={conv.title} url={conv.avatarUrl} size={88} />
          )}
          {editingName ? (
            <div className="flex w-full items-center gap-1">
              <input autoFocus value={nameDraft} onChange={(e) => setNameDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") saveName(); if (e.key === "Escape") setEditingName(false); }}
                className="h-8 flex-1 rounded-md border border-input bg-background px-2 text-sm" />
              <button onClick={saveName} className="text-primary"><Check className="h-4 w-4" /></button>
            </div>
          ) : (
            <p className="flex items-center gap-1.5 text-lg font-semibold">
              {conv.title}
              {canManage && (
                <button onClick={() => { setNameDraft(conv.title); setEditingName(true); }} className="text-muted-foreground hover:text-foreground">
                  <Pencil className="h-3.5 w-3.5" />
                </button>
              )}
            </p>
          )}
          {isDm ? (
            <div className="text-sm text-muted-foreground">
              {[info?.department, info?.funcao].filter(Boolean).join(" · ") || "—"}
              {info?.email && <p className="text-xs">{info.email}</p>}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">{conv.channel.is_private ? "Grupo privado" : "Grupo"} · {members.length} membros</p>
          )}
        </div>

        {/* ações rápidas: silenciar / fixar */}
        <div className="grid grid-cols-2 gap-2 border-b p-3">
          <button onClick={() => membership.mutate({ channelId: conv.channel.id, patch: { muted: !conv.muted } })}
            className="flex flex-col items-center gap-1 rounded-lg py-2 text-xs hover:bg-muted">
            {conv.muted ? <BellOff className="h-5 w-5 text-primary" /> : <Bell className="h-5 w-5 text-muted-foreground" />}
            {conv.muted ? "Silenciado" : "Silenciar"}
          </button>
          <button onClick={() => membership.mutate({ channelId: conv.channel.id, patch: { pinned: !conv.pinned } })}
            className="flex flex-col items-center gap-1 rounded-lg py-2 text-xs hover:bg-muted">
            {conv.pinned ? <Pin className="h-5 w-5 text-primary" /> : <PinOff className="h-5 w-5 text-muted-foreground" />}
            {conv.pinned ? "Fixado" : "Fixar"}
          </button>
        </div>

        {/* membros (grupo) */}
        {!isDm && (
          <div className="border-b px-4 py-3">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Membros ({members.length})</p>
              {canManage && (
                <button onClick={() => setAddOpen(true)} className="flex items-center gap-1 text-xs text-primary hover:underline">
                  <UserPlus className="h-3.5 w-3.5" /> Adicionar
                </button>
              )}
            </div>
            {/* Recibo da última mensagem: quantos já leram + detalhe por membro. */}
            {conv.lastAt && (
              <p className="mb-2 flex items-center gap-1 text-[11px] text-muted-foreground">
                <CheckCheck className="h-3.5 w-3.5 text-[#53bdeb]" />
                {members.filter((m) => memberReceipt(conv.lastAt!, m) === "read").length} de {members.length} leram a última mensagem
              </p>
            )}
            <div className="space-y-1.5">
              {members.map((m) => (
                <div key={m.id} className="group flex items-center gap-2.5">
                  <Avatar name={m.full_name} url={m.avatar_url} size={30} />
                  <span className="flex-1 truncate text-sm">{m.full_name ?? "—"}{m.id === currentUser.id && " (você)"}</span>
                  {conv.lastAt && m.id !== currentUser.id && <MemberTick status={memberReceipt(conv.lastAt, m)} />}
                  {m.role !== "member" && <span className="text-[11px] text-muted-foreground">{m.role === "owner" ? "dono" : "admin"}</span>}
                  {canManage && m.id !== currentUser.id && m.role !== "owner" && (
                    <button onClick={() => removeMember.mutate({ channelId: conv.channel.id, userId: m.id })}
                      className="text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-destructive" title="Remover" aria-label="Remover membro">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* mídias */}
        <div className="border-b px-4 py-3">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Mídia e arquivos {media.length > 0 && <span className="text-muted-foreground/70">({media.length})</span>}
            </p>
            {media.length > 12 && <button onClick={() => setShowAll(true)} className="text-xs text-primary hover:underline">Ver todas</button>}
          </div>
          {media.length === 0 ? (
            <p className="text-xs text-muted-foreground">Nada compartilhado ainda.</p>
          ) : (
            <div className="grid grid-cols-3 gap-1.5">
              {media.slice(0, 12).map((a) => <MediaThumb key={a.id} att={a} />)}
            </div>
          )}
        </div>

        {/* ação destrutiva */}
        <div className="px-2 py-3">
          {!confirm ? (
            <button onClick={() => setConfirm(true)}
              className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-destructive hover:bg-destructive/10">
              {isDm ? <><Trash2 className="h-4 w-4" /> Excluir conversa</> : <><LogOut className="h-4 w-4" /> Sair do grupo</>}
            </button>
          ) : (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3">
              <p className="mb-2 text-xs text-muted-foreground">
                {isDm ? "A conversa some da sua lista (o histórico não é apagado para a outra pessoa)."
                      : "Você sai do grupo e deixa de receber as mensagens."}
              </p>
              <div className="flex gap-2">
                <button onClick={() => setConfirm(false)} className="flex-1 rounded-md border px-3 py-1.5 text-sm hover:bg-muted">Cancelar</button>
                <button onClick={doLeave} disabled={leave.isPending}
                  className="flex-1 rounded-md bg-destructive px-3 py-1.5 text-sm text-destructive-foreground disabled:opacity-40">
                  {leave.isPending ? "…" : isDm ? "Excluir" : "Sair"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {showAll && <MediaGalleryModal media={media} onClose={() => setShowAll(false)} />}
      {addOpen && (
        <AddMemberModal
          existingIds={new Set(members.map((m) => m.id))}
          onClose={() => setAddOpen(false)}
          onAdd={(ids) => { addMembers.mutate({ channelId: conv.channel.id, userIds: ids }); setAddOpen(false); }}
        />
      )}
    </div>
  );
}

function MediaThumb({ att }: { att: ChatAttachment }) {
  const { data: url } = useSignedUrl(att.storage_path);
  const m = att.mime_type ?? "";
  const isImg = m.startsWith("image/");
  const isVid = m.startsWith("video/");
  const isAud = m.startsWith("audio/");
  return (
    <a href={url ?? undefined} target="_blank" rel="noreferrer"
      className="relative flex aspect-square items-center justify-center overflow-hidden rounded-md border bg-muted/40">
      {isImg && url ? <img src={url} alt="" className="h-full w-full object-cover" />
        : isVid ? <Play className="h-5 w-5 text-muted-foreground" />
        : isAud ? <Mic className="h-5 w-5 text-muted-foreground" />
        : <FileText className="h-5 w-5 text-muted-foreground" />}
    </a>
  );
}

function MediaGalleryModal({ media, onClose }: { media: ChatAttachment[]; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="flex max-h-[85vh] w-full max-w-2xl flex-col rounded-xl border bg-background" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b px-4 py-3">
          <p className="text-sm font-semibold">Mídia e arquivos ({media.length})</p>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
        </div>
        <div className="grid grid-cols-4 gap-2 overflow-y-auto p-4 sm:grid-cols-5">
          {media.map((a) => <MediaThumb key={a.id} att={a} />)}
        </div>
      </div>
    </div>
  );
}

function AddMemberModal({ existingIds, onClose, onAdd }: {
  existingIds: Set<string>;
  onClose: () => void;
  onAdd: (ids: string[]) => void;
}) {
  const [search, setSearch] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const { data: people = [] } = useDirectory(search);
  const options = people.filter((p) => !existingIds.has(p.id));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-xl border bg-background shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b px-4 py-3">
          <p className="text-sm font-semibold">Adicionar ao grupo ({picked.size})</p>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
        </div>
        <div className="p-4">
          <div className="relative mb-3">
            <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar pessoa…"
              className="h-9 w-full rounded-md border border-input bg-background pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
          </div>
          <div className="max-h-64 space-y-1 overflow-y-auto">
            {options.map((p) => {
              const on = picked.has(p.id);
              return (
                <button key={p.id} onClick={() => setPicked((prev) => { const n = new Set(prev); on ? n.delete(p.id) : n.add(p.id); return n; })}
                  className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left hover:bg-muted">
                  <Avatar name={p.full_name} url={p.avatar_url} size={30} />
                  <span className="flex-1 truncate text-sm">{p.full_name ?? "—"}</span>
                  {on && <Check className="h-4 w-4 text-primary" />}
                </button>
              );
            })}
            {options.length === 0 && <p className="p-2 text-sm text-muted-foreground">Ninguém para adicionar.</p>}
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <button onClick={onClose} className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted">Cancelar</button>
            <button onClick={() => onAdd([...picked])} disabled={picked.size === 0}
              className="rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground disabled:opacity-40">Adicionar</button>
          </div>
        </div>
      </div>
    </div>
  );
}

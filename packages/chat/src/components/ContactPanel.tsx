import { useState } from "react";
import { X, Trash2, LogOut, FileText, Play, Mic } from "lucide-react";
import { useUserInfo, useChannelMembers, useChannelMedia, useLeaveConversation, useSignedUrl } from "../hooks";
import { Avatar } from "./Avatar";
import type { Conversation, ChatAttachment } from "../types";

export function ContactPanel({ conv, onClose, onDeleted }: {
  conv: Conversation;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const isDm = conv.channel.type === "dm";
  const { data: info } = useUserInfo(isDm ? conv.otherUserId : null);
  const { data: members = [] } = useChannelMembers(conv.channel.id, !isDm);
  const { data: media = [] } = useChannelMedia(conv.channel.id);
  const leave = useLeaveConversation();
  const [confirm, setConfirm] = useState(false);

  async function doLeave() {
    await leave.mutateAsync(conv.channel.id);
    setConfirm(false);
    onDeleted();
  }

  return (
    <div className="flex h-full w-80 shrink-0 flex-col border-l bg-card">
      <div className="flex items-center gap-2 border-b px-4 py-3">
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
        <span className="text-sm font-semibold">{isDm ? "Dados do contato" : "Dados do grupo"}</span>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* cabeçalho */}
        <div className="flex flex-col items-center gap-2 border-b px-4 py-6 text-center">
          <Avatar name={conv.title} url={conv.avatarUrl} size={88} />
          <p className="text-lg font-semibold">{conv.title}</p>
          {isDm ? (
            <div className="text-sm text-muted-foreground">
              {[info?.department, info?.funcao].filter(Boolean).join(" · ") || "—"}
              {info?.email && <p className="text-xs">{info.email}</p>}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">{conv.channel.is_private ? "Grupo privado" : "Grupo"} · {members.length} membros</p>
          )}
        </div>

        {/* membros (grupo) */}
        {!isDm && (
          <div className="border-b px-4 py-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Membros</p>
            <div className="space-y-1.5">
              {members.map((m) => (
                <div key={m.id} className="flex items-center gap-2.5">
                  <Avatar name={m.full_name} url={m.avatar_url} size={30} />
                  <span className="flex-1 truncate text-sm">{m.full_name ?? "—"}</span>
                  {m.role !== "member" && <span className="text-[11px] text-muted-foreground">{m.role === "owner" ? "dono" : "admin"}</span>}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* mídias */}
        <div className="border-b px-4 py-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Mídia e arquivos {media.length > 0 && <span className="text-muted-foreground/70">({media.length})</span>}
          </p>
          {media.length === 0 ? (
            <p className="text-xs text-muted-foreground">Nada compartilhado ainda.</p>
          ) : (
            <div className="grid grid-cols-3 gap-1.5">
              {media.slice(0, 12).map((a) => <MediaThumb key={a.id} att={a} />)}
            </div>
          )}
        </div>

        {/* ações */}
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
      {isImg && url ? (
        <img src={url} alt="" className="h-full w-full object-cover" />
      ) : isVid ? (
        <Play className="h-5 w-5 text-muted-foreground" />
      ) : isAud ? (
        <Mic className="h-5 w-5 text-muted-foreground" />
      ) : (
        <FileText className="h-5 w-5 text-muted-foreground" />
      )}
    </a>
  );
}

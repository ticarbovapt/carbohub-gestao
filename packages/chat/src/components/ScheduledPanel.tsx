import { useState } from "react";
import { X, Clock, Pencil, Trash2, CalendarClock, AlertTriangle, Paperclip } from "lucide-react";
import { useScheduledMessages, useUpdateScheduled, useCancelScheduled, useConversations } from "../hooks";
import { richToPlain } from "../lib/format";
import { formatWhen } from "../lib/schedule";
import { ScheduleDialog } from "./ScheduleDialog";
import type { ScheduledMessage } from "../types";

const kindLabel = (k: string) =>
  k === "image" ? "📷 Foto" : k === "audio" ? "🎤 Áudio" : k === "video" ? "🎬 Vídeo" : k === "file" ? "📎 Arquivo" : "";

export function ScheduledPanel({ onClose }: { onClose: () => void }) {
  const { data: items = [], isLoading } = useScheduledMessages();
  const { data: convs = [] } = useConversations();
  const update = useUpdateScheduled();
  const cancel = useCancelScheduled();
  const [editId, setEditId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [timeFor, setTimeFor] = useState<ScheduledMessage | null>(null);

  const titleOf = (channelId: string) => convs.find((c) => c.channel.id === channelId)?.title ?? "Conversa";
  const preview = (m: ScheduledMessage) => {
    const base = (m.body?.trim() ? richToPlain(m.body.trim()) : "") || kindLabel(m.kind);
    return base || "(sem texto)";
  };

  function startEdit(m: ScheduledMessage) { setEditId(m.id); setDraft(m.body ?? ""); }
  function saveEdit(m: ScheduledMessage) {
    update.mutate({ id: m.id, body: draft }, { onSettled: () => setEditId(null) });
  }

  return (
    <div className="fixed inset-0 z-[55] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="flex max-h-[80vh] w-full max-w-md flex-col rounded-xl border bg-background shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b px-4 py-3">
          <p className="flex items-center gap-2 text-sm font-semibold"><Clock className="h-4 w-4" /> Mensagens agendadas</p>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {isLoading ? (
            <p className="p-3 text-sm text-muted-foreground">Carregando…</p>
          ) : items.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">Nenhuma mensagem agendada.</p>
          ) : (
            <div className="space-y-2">
              {items.map((m) => (
                <div key={m.id} className="rounded-lg border p-3">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold">{titleOf(m.channelId)}</span>
                    <span className={`shrink-0 text-[11px] font-medium ${m.status === "failed" ? "text-rose-500" : "text-primary"}`}>
                      {m.status === "failed" ? "falhou" : formatWhen(new Date(m.sendAt))}
                    </span>
                  </div>

                  {editId === m.id ? (
                    <div className="mt-2 space-y-2">
                      <textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={3}
                        className="w-full resize-y rounded-md border border-input bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
                      <div className="flex justify-end gap-1.5 text-xs">
                        <button onClick={() => setEditId(null)} className="rounded-md border px-2.5 py-1 hover:bg-muted">Cancelar</button>
                        <button onClick={() => saveEdit(m)} className="rounded-md bg-primary px-2.5 py-1 font-medium text-primary-foreground">Salvar</button>
                      </div>
                    </div>
                  ) : (
                    <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                      {m.attachmentCount > 0 && <Paperclip className="mr-1 inline h-3 w-3" />}
                      {preview(m)}
                    </p>
                  )}

                  {m.status === "failed" && m.lastError && (
                    <p className="mt-1 flex items-center gap-1 text-[11px] text-rose-500"><AlertTriangle className="h-3 w-3" /> {m.lastError}</p>
                  )}

                  {editId !== m.id && (
                    <div className="mt-2 flex items-center gap-1 text-xs">
                      <button onClick={() => startEdit(m)} className="flex items-center gap-1 rounded-md px-2 py-1 text-muted-foreground hover:bg-muted"><Pencil className="h-3.5 w-3.5" /> Editar</button>
                      <button onClick={() => setTimeFor(m)} className="flex items-center gap-1 rounded-md px-2 py-1 text-muted-foreground hover:bg-muted"><CalendarClock className="h-3.5 w-3.5" /> Horário</button>
                      <button onClick={() => cancel.mutate(m.id)} className="ml-auto flex items-center gap-1 rounded-md px-2 py-1 text-destructive hover:bg-destructive/10"><Trash2 className="h-3.5 w-3.5" /> Cancelar</button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {timeFor && (
        <ScheduleDialog title="Reagendar" initial={new Date(timeFor.sendAt)}
          onClose={() => setTimeFor(null)}
          onConfirm={(date) => { update.mutate({ id: timeFor.id, sendAt: date }); setTimeFor(null); }} />
      )}
    </div>
  );
}

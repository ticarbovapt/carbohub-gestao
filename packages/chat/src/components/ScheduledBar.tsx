import { useState } from "react";
import { Clock, ChevronDown, ChevronUp, Pencil, Trash2, CalendarClock, AlertTriangle, Paperclip } from "lucide-react";
import { useScheduledMessages, useUpdateScheduled, useCancelScheduled } from "../hooks";
import { richToPlain } from "../lib/format";
import { formatWhen } from "../lib/schedule";
import { ScheduleDialog } from "./ScheduleDialog";
import type { ScheduledMessage } from "../types";

const kindLabel = (k: string) =>
  k === "image" ? "📷 Foto" : k === "audio" ? "🎤 Áudio" : k === "video" ? "🎬 Vídeo" : k === "file" ? "📎 Arquivo" : "";

// Barra de mensagens agendadas DESTA conversa, logo acima do compositor.
// Fica dentro da conversa (bom pra celular) — editar/reagendar/cancelar aqui.
export function ScheduledBar({ channelId }: { channelId: string }) {
  const { data: all = [] } = useScheduledMessages();
  const items = all.filter((m) => m.channelId === channelId);
  const update = useUpdateScheduled();
  const cancel = useCancelScheduled();
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [timeFor, setTimeFor] = useState<ScheduledMessage | null>(null);

  if (items.length === 0) return null;

  const preview = (m: ScheduledMessage) =>
    ((m.body?.trim() ? richToPlain(m.body.trim()) : "") || kindLabel(m.kind)) || "(sem texto)";
  function startEdit(m: ScheduledMessage) { setEditId(m.id); setDraft(m.body ?? ""); }
  function saveEdit(m: ScheduledMessage) { update.mutate({ id: m.id, body: draft }, { onSettled: () => setEditId(null) }); }

  return (
    <div className="border-t bg-amber-500/5">
      <button onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 px-4 py-2 text-xs font-medium text-amber-700 hover:bg-amber-500/10 dark:text-amber-300">
        <Clock className="h-3.5 w-3.5" />
        {items.length} {items.length === 1 ? "mensagem agendada" : "mensagens agendadas"} para esta conversa
        {open ? <ChevronUp className="ml-auto h-4 w-4" /> : <ChevronDown className="ml-auto h-4 w-4" />}
      </button>

      {open && (
        <div className="max-h-60 space-y-1.5 overflow-y-auto px-3 pb-2.5">
          {items.map((m) => (
            <div key={m.id} className="rounded-lg border bg-background p-2.5">
              <div className="flex items-baseline justify-between gap-2">
                <span className={`text-[11px] font-semibold ${m.status === "failed" ? "text-rose-500" : "text-amber-600 dark:text-amber-400"}`}>
                  {m.status === "failed" ? "falhou" : formatWhen(new Date(m.sendAt))}
                </span>
              </div>

              {editId === m.id ? (
                <div className="mt-1.5 space-y-1.5">
                  <textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={2}
                    className="w-full resize-y rounded-md border border-input bg-background px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
                  <div className="flex justify-end gap-1.5 text-xs">
                    <button onClick={() => setEditId(null)} className="rounded-md border px-2 py-0.5 hover:bg-muted">Cancelar</button>
                    <button onClick={() => saveEdit(m)} className="rounded-md bg-primary px-2 py-0.5 font-medium text-primary-foreground">Salvar</button>
                  </div>
                </div>
              ) : (
                <p className="mt-0.5 line-clamp-2 text-sm">
                  {m.attachmentCount > 0 && <Paperclip className="mr-1 inline h-3 w-3 text-muted-foreground" />}
                  {preview(m)}
                </p>
              )}

              {m.status === "failed" && m.lastError && (
                <p className="mt-1 flex items-center gap-1 text-[11px] text-rose-500"><AlertTriangle className="h-3 w-3" /> {m.lastError}</p>
              )}

              {editId !== m.id && (
                <div className="mt-1.5 flex items-center gap-1 text-xs">
                  <button onClick={() => startEdit(m)} className="flex items-center gap-1 rounded-md px-1.5 py-1 text-muted-foreground hover:bg-muted"><Pencil className="h-3.5 w-3.5" /> Editar</button>
                  <button onClick={() => setTimeFor(m)} className="flex items-center gap-1 rounded-md px-1.5 py-1 text-muted-foreground hover:bg-muted"><CalendarClock className="h-3.5 w-3.5" /> Horário</button>
                  <button onClick={() => cancel.mutate(m.id)} className="ml-auto flex items-center gap-1 rounded-md px-1.5 py-1 text-destructive hover:bg-destructive/10"><Trash2 className="h-3.5 w-3.5" /> Cancelar</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {timeFor && (
        <ScheduleDialog title="Reagendar" initial={new Date(timeFor.sendAt)}
          onClose={() => setTimeFor(null)}
          onConfirm={(date) => { update.mutate({ id: timeFor.id, sendAt: date }); setTimeFor(null); }} />
      )}
    </div>
  );
}

import { useRef, useState } from "react";
import { Send, Paperclip, X } from "lucide-react";
import { useSendMessage, kindFromMime, type OutgoingAttachment } from "../hooks";
import { AudioRecorder } from "./AudioRecorder";

export function Composer({ channelId }: { channelId: string }) {
  const [text, setText] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const send = useSendMessage(channelId);

  function pickFiles(list: FileList | null) {
    if (!list) return;
    setFiles((prev) => [...prev, ...Array.from(list)].slice(0, 10));
    if (fileRef.current) fileRef.current.value = "";
  }

  async function submit() {
    const body = text.trim();
    if ((!body && files.length === 0) || send.isPending) return;
    const attachments: OutgoingAttachment[] = files.map((f) => ({
      file: f, filename: f.name, kind: kindFromMime(f.type),
    }));
    setText(""); setFiles([]);
    try { await send.mutateAsync({ body, attachments }); }
    catch { setText(body); setFiles(files); }
  }

  async function sendAudio(blob: Blob, durationMs: number) {
    try {
      await send.mutateAsync({ attachments: [{ file: blob, filename: `audio-${Date.now()}.webm`, kind: "audio", durationMs }] });
    } catch { /* toast já não existe aqui; silencioso */ }
  }

  return (
    <div className="border-t p-3">
      {files.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-2">
          {files.map((f, i) => (
            <span key={i} className="flex items-center gap-1.5 rounded-md border bg-muted/40 px-2 py-1 text-xs">
              <span className="max-w-[160px] truncate">{f.name}</span>
              <button onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))} className="text-muted-foreground hover:text-destructive">
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="flex items-end gap-2">
        <input ref={fileRef} type="file" multiple hidden
          accept="image/*,video/*,audio/*,application/pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.zip"
          onChange={(e) => pickFiles(e.target.files)} />
        <button onClick={() => fileRef.current?.click()} title="Anexar"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border text-muted-foreground hover:bg-muted">
          <Paperclip className="h-4 w-4" />
        </button>

        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); } }}
          placeholder="Escreva uma mensagem…  (Enter envia, Shift+Enter quebra linha)"
          rows={1}
          className="max-h-40 min-h-[40px] flex-1 resize-y rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />

        <AudioRecorder onSend={sendAudio} disabled={send.isPending} />

        <button
          onClick={submit}
          disabled={(!text.trim() && files.length === 0) || send.isPending}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground disabled:opacity-40"
          title="Enviar"
        >
          <Send className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

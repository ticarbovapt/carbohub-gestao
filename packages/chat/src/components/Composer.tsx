import { useRef, useState } from "react";
import { Send, Paperclip, X } from "lucide-react";
import { useSendMessage, useDirectory, kindFromMime, type OutgoingAttachment } from "../hooks";
import { AudioRecorder } from "./AudioRecorder";
import { Avatar } from "./Avatar";

export function Composer({ channelId }: { channelId: string }) {
  const [text, setText] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [mention, setMention] = useState<{ query: string; start: number } | null>(null);
  const [chosen, setChosen] = useState<{ id: string; name: string }[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const send = useSendMessage(channelId);
  const { data: suggestions = [] } = useDirectory(mention?.query ?? "");

  function onType(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const val = e.target.value;
    const caret = e.target.selectionStart ?? val.length;
    setText(val);
    const m = val.slice(0, caret).match(/(?:^|\s)@([\p{L}\d._-]*)$/u);
    setMention(m ? { query: m[1], start: caret - m[1].length - 1 } : null);
  }

  function pickMention(p: { id: string; full_name: string | null }) {
    if (!mention) return;
    const end = mention.start + 1 + mention.query.length;
    const name = p.full_name ?? "";
    setText(text.slice(0, mention.start) + "@" + name + " " + text.slice(end));
    setChosen((prev) => [...prev, { id: p.id, name }]);
    setMention(null);
  }

  function pickFiles(list: FileList | null) {
    if (!list) return;
    setFiles((prev) => [...prev, ...Array.from(list)].slice(0, 10));
    if (fileRef.current) fileRef.current.value = "";
  }

  function currentMentions(body: string) {
    return Array.from(new Set(chosen.filter((c) => c.name && body.includes("@" + c.name)).map((c) => c.id)));
  }

  async function submit() {
    const body = text.trim();
    if ((!body && files.length === 0) || send.isPending) return;
    const attachments: OutgoingAttachment[] = files.map((f) => ({ file: f, filename: f.name, kind: kindFromMime(f.type) }));
    const mentions = currentMentions(body);
    setText(""); setFiles([]); setChosen([]); setMention(null);
    try { await send.mutateAsync({ body, attachments, mentions }); }
    catch { setText(body); setFiles(files); }
  }

  async function sendAudio(blob: Blob, durationMs: number) {
    try {
      await send.mutateAsync({ attachments: [{ file: blob, filename: `audio-${Date.now()}.webm`, kind: "audio", durationMs }] });
    } catch { /* silencioso */ }
  }

  return (
    <div className="relative border-t p-3">
      {/* dropdown de menção */}
      {mention && suggestions.length > 0 && (
        <div className="absolute bottom-full left-3 mb-1 w-64 overflow-hidden rounded-lg border bg-popover shadow-lg">
          {suggestions.slice(0, 6).map((p) => (
            <button key={p.id} onMouseDown={(e) => { e.preventDefault(); pickMention(p); }}
              className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left hover:bg-muted">
              <Avatar name={p.full_name} url={p.avatar_url} size={26} />
              <span className="truncate text-sm">{p.full_name ?? "—"}</span>
            </button>
          ))}
        </div>
      )}

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
          onChange={onType}
          onKeyDown={(e) => {
            if (e.key === "Escape") setMention(null);
            if (e.key === "Enter" && !e.shiftKey && !mention) { e.preventDefault(); submit(); }
          }}
          placeholder="Mensagem…  @ menciona alguém · Enter envia"
          rows={1}
          className="max-h-40 min-h-[40px] flex-1 resize-y rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />

        <AudioRecorder onSend={sendAudio} disabled={send.isPending} />

        <button onClick={submit} disabled={(!text.trim() && files.length === 0) || send.isPending}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground disabled:opacity-40"
          title="Enviar">
          <Send className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

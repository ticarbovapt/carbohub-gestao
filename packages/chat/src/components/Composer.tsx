import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Send, Paperclip, X, CornerUpLeft, Users, Smile, Clock } from "lucide-react";
import { useSendMessage, useScheduleMessage, useDirectory, kindFromMime, type OutgoingAttachment } from "../hooks";
import { sendTyping } from "../lib/presence";
import { formatWhen } from "../lib/schedule";
import { AudioRecorder } from "./AudioRecorder";
import { EmojiPicker } from "./EmojiPicker";
import { ScheduleDialog } from "./ScheduleDialog";
import { Avatar } from "./Avatar";
import type { ChatMessage } from "../types";

const kindLabel = (k: string) =>
  k === "image" ? "📷 Foto" : k === "audio" ? "🎤 Áudio" : k === "video" ? "🎬 Vídeo" : k === "file" ? "📎 Arquivo" : "Mensagem";
const ALL_ID = "__all__";

export function Composer({
  channelId, isGroup, replyTo, onClearReply, replyToName, onEditLast,
}: {
  channelId: string;
  isGroup: boolean;
  replyTo: ChatMessage | null;
  onClearReply: () => void;
  replyToName: string;
  onEditLast?: () => void;
}) {
  const [text, setText] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [mention, setMention] = useState<{ query: string; start: number } | null>(null);
  const [chosen, setChosen] = useState<{ id: string; name: string }[]>([]);
  const [allPicked, setAllPicked] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [sendMenu, setSendMenu] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const send = useSendMessage(channelId);
  const schedule = useScheduleMessage(channelId);

  // "Digitando…": envia no máx. a cada 2.5s enquanto digita; some após 4s parado.
  const lastTyping = useRef(0);
  const idleTimer = useRef<number | null>(null);
  function stopTyping() {
    if (idleTimer.current) { window.clearTimeout(idleTimer.current); idleTimer.current = null; }
    if (lastTyping.current) { lastTyping.current = 0; sendTyping(channelId, false); }
  }
  function signalTyping() {
    const now = Date.now();
    if (now - lastTyping.current > 2500) { lastTyping.current = now; sendTyping(channelId, true); }
    if (idleTimer.current) window.clearTimeout(idleTimer.current);
    idleTimer.current = window.setTimeout(stopTyping, 4000);
  }
  // Ao trocar de conversa/desmontar, limpa o "digitando".
  useEffect(() => stopTyping, [channelId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-cresce conforme as linhas até um máximo (depois rola) — estilo WhatsApp.
  useEffect(() => {
    const el = textRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 160) + "px";
  }, [text]);

  function insertEmoji(emoji: string) {
    const el = textRef.current;
    const start = el?.selectionStart ?? text.length;
    const end = el?.selectionEnd ?? text.length;
    const next = text.slice(0, start) + emoji + text.slice(end);
    setText(next);
    requestAnimationFrame(() => { el?.focus(); const p = start + emoji.length; el?.setSelectionRange(p, p); });
  }
  const { data: people = [] } = useDirectory(mention?.query ?? "");

  // sugestões: menção só em grupo; @todos no topo.
  const q = (mention?.query ?? "").toLowerCase();
  const suggestions = isGroup && mention
    ? [
        ...(("todos".startsWith(q) || q === "") ? [{ id: ALL_ID, full_name: "Todos (todo o grupo)", avatar_url: null }] : []),
        ...people,
      ]
    : [];

  function onType(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const val = e.target.value;
    const caret = e.target.selectionStart ?? val.length;
    setText(val);
    if (val.trim()) signalTyping(); else stopTyping();
    if (!isGroup) { setMention(null); return; }               // sem menção em DM
    const m = val.slice(0, caret).match(/(?:^|\s)@([\p{L}\d._-]*)$/u);
    setMention(m ? { query: m[1], start: caret - m[1].length - 1 } : null);
  }

  function pickMention(p: { id: string; full_name: string | null }) {
    if (!mention) return;
    const end = mention.start + 1 + mention.query.length;
    const isAll = p.id === ALL_ID;
    const label = isAll ? "todos" : (p.full_name ?? "");
    setText(text.slice(0, mention.start) + "@" + label + " " + text.slice(end));
    if (isAll) setAllPicked(true);
    else setChosen((prev) => [...prev, { id: p.id, name: label }]);
    setMention(null);
  }

  function pickFiles(list: FileList | null) {
    if (!list) return;
    setFiles((prev) => [...prev, ...Array.from(list)].slice(0, 10));
    if (fileRef.current) fileRef.current.value = "";
  }

  async function submit() {
    const body = text.trim();
    if ((!body && files.length === 0) || send.isPending) return;
    const attachments: OutgoingAttachment[] = files.map((f) => ({ file: f, filename: f.name, kind: kindFromMime(f.type) }));
    const mentionAll = isGroup && allPicked && body.includes("@todos");
    const mentionsSet = new Set(chosen.filter((c) => c.name && body.includes("@" + c.name)).map((c) => c.id));
    // responder no grupo notifica quem foi respondido
    if (isGroup && replyTo?.sender_id) mentionsSet.add(replyTo.sender_id);
    const payload = {
      body, attachments,
      mentions: [...mentionsSet],
      mentionAll,
      replyToId: replyTo?.id ?? null,
    };
    setText(""); setFiles([]); setChosen([]); setAllPicked(false); setMention(null); onClearReply();
    stopTyping();
    try { await send.mutateAsync(payload); }
    catch { setText(body); setFiles(files); }
  }

  async function scheduleAt(date: Date) {
    const body = text.trim();
    const attachments: OutgoingAttachment[] = files.map((f) => ({ file: f, filename: f.name, kind: kindFromMime(f.type) }));
    if (!body && attachments.length === 0) return;
    const mentionAll = isGroup && allPicked && body.includes("@todos");
    const mentions = [...new Set(chosen.filter((c) => c.name && body.includes("@" + c.name)).map((c) => c.id))];
    const prevText = text, prevFiles = files;
    setScheduleOpen(false);
    setText(""); setFiles([]); setChosen([]); setAllPicked(false); setMention(null); onClearReply(); stopTyping();
    try {
      const iso = await schedule.mutateAsync({ body, attachments, mentions, mentionAll, sendAt: date });
      toast.success(`Mensagem agendada para ${formatWhen(new Date(iso))}`);
    } catch (e) {
      setText(prevText); setFiles(prevFiles);
      toast.error("Não foi possível agendar. " + ((e as { message?: string })?.message ?? ""));
    }
  }

  async function sendAudio(blob: Blob, durationMs: number) {
    try {
      await send.mutateAsync({ attachments: [{ file: blob, filename: `audio-${Date.now()}.webm`, kind: "audio", durationMs }], replyToId: replyTo?.id ?? null });
      onClearReply();
    } catch { /* silencioso */ }
  }

  return (
    <div className="relative border-t">
      {/* barra de resposta */}
      {replyTo && (
        <div className="flex items-center gap-2 border-b bg-muted/40 px-3 py-2">
          <CornerUpLeft className="h-4 w-4 shrink-0 text-primary" />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-primary">Respondendo {replyToName}</p>
            <p className="truncate text-xs text-muted-foreground">{replyTo.body?.trim() || kindLabel(replyTo.kind)}</p>
          </div>
          <button onClick={onClearReply} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
        </div>
      )}

      <div className="p-3">
        {/* dropdown de menção */}
        {mention && suggestions.length > 0 && (
          <div className="absolute bottom-full left-3 mb-1 w-64 overflow-hidden rounded-lg border bg-popover shadow-lg">
            {suggestions.slice(0, 6).map((p) => (
              <button key={p.id} onMouseDown={(e) => { e.preventDefault(); pickMention(p); }}
                className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left hover:bg-muted">
                {p.id === ALL_ID ? (
                  <span className="flex h-[26px] w-[26px] items-center justify-center rounded-full bg-primary/15 text-primary"><Users className="h-3.5 w-3.5" /></span>
                ) : <Avatar name={p.full_name} url={p.avatar_url} size={26} />}
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
                <button onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))} className="text-muted-foreground hover:text-destructive"><X className="h-3 w-3" /></button>
              </span>
            ))}
          </div>
        )}

        <div className="flex items-end gap-2">
          <input ref={fileRef} type="file" multiple hidden
            accept="image/*,video/*,audio/*,application/pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.zip"
            onChange={(e) => pickFiles(e.target.files)} />
          <button onClick={() => fileRef.current?.click()} title="Anexar" aria-label="Anexar arquivo"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring">
            <Paperclip className="h-5 w-5" />
          </button>
          <div className="relative shrink-0">
            <button onClick={() => setEmojiOpen((o) => !o)} title="Emoji" aria-label="Inserir emoji" aria-expanded={emojiOpen}
              className="flex h-10 w-10 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring">
              <Smile className="h-5 w-5" />
            </button>
            {emojiOpen && <EmojiPicker onPick={insertEmoji} onClose={() => setEmojiOpen(false)} />}
          </div>

          <textarea
            ref={textRef}
            value={text}
            onChange={onType}
            onBlur={stopTyping}
            onKeyDown={(e) => {
              if (e.key === "Escape") { if (mention) setMention(null); else if (replyTo) onClearReply(); stopTyping(); return; }
              if (e.key === "Enter" && !e.shiftKey && !mention) { e.preventDefault(); submit(); return; }
              // ↑ no campo vazio edita a última mensagem sua (estilo WhatsApp/Slack).
              if (e.key === "ArrowUp" && !text && !mention && onEditLast) { e.preventDefault(); onEditLast(); }
            }}
            aria-label="Escrever mensagem"
            placeholder={isGroup ? "Mensagem…  @ menciona · Enter envia" : "Mensagem…  Enter envia"}
            rows={1}
            className="max-h-40 min-h-[40px] flex-1 resize-none overflow-y-auto rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />

          {/* direita: enviar quando há conteúdo, microfone quando vazio (estilo WhatsApp) */}
          {(text.trim() || files.length > 0) ? (
            <div className="flex shrink-0 items-center gap-1.5">
              <div className="relative">
                <button onClick={() => setSendMenu((o) => !o)} title="Enviar depois" aria-label="Agendar envio" aria-expanded={sendMenu}
                  className="flex h-10 w-10 items-center justify-center rounded-lg border text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring">
                  <Clock className="h-5 w-5" />
                </button>
                {sendMenu && (
                  <>
                    <div className="fixed inset-0 z-20" onClick={() => setSendMenu(false)} />
                    <div className="absolute bottom-12 right-0 z-30 w-44 overflow-hidden rounded-lg border bg-popover shadow-lg">
                      <button onClick={() => { setSendMenu(false); setScheduleOpen(true); }}
                        className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm hover:bg-muted">
                        <Clock className="h-4 w-4 text-muted-foreground" /> Enviar depois
                      </button>
                    </div>
                  </>
                )}
              </div>
              <button onClick={submit} disabled={send.isPending}
                className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-primary-foreground disabled:opacity-40 focus-visible:ring-2 focus-visible:ring-ring" title="Enviar" aria-label="Enviar mensagem">
                <Send className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <AudioRecorder onSend={sendAudio} disabled={send.isPending} />
          )}
        </div>
      </div>
      {scheduleOpen && <ScheduleDialog onClose={() => setScheduleOpen(false)} onConfirm={scheduleAt} />}
    </div>
  );
}

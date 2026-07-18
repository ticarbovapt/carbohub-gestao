import { useState } from "react";
import { FileText, Download, FileAudio, Loader2, ChevronDown, ChevronUp, RotateCcw } from "lucide-react";
import { useSignedUrl, useSetTranscription } from "../hooks";
import { transcribeAudio } from "../lib/transcribe";
import type { ChatAttachment } from "../types";

function kindOf(a: ChatAttachment): "image" | "video" | "audio" | "file" {
  const m = a.mime_type ?? "";
  if (m.startsWith("image/")) return "image";
  if (m.startsWith("video/")) return "video";
  if (m.startsWith("audio/")) return "audio";
  return "file";
}
function humanSize(n: number | null) {
  if (!n) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
function fileName(path: string) {
  const base = path.split("/").pop() ?? "arquivo";
  return base.replace(/^\d+-/, "");
}

// Áudio + transcrição sob demanda. O texto só aparece quando a pessoa clica em
// "ver transcrição" (vale p/ quem enviou e quem recebeu). A transcrição roda no
// navegador (Whisper) e fica salva no banco → transcreve-se uma vez, todos leem.
function AudioAttachment({ att, url, channelId }: { att: ChatAttachment; url: string; channelId?: string }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);       // ESTE cliente está transcrevendo
  const [localErr, setLocalErr] = useState(false);
  const setTr = useSetTranscription();

  const status = att.transcription_status ?? "none";
  const done = status === "done" && !!att.transcription;
  const failed = status === "failed" || localErr;
  // "pending" de outra pessoa (não deste cliente) → mostra "transcrevendo…".
  const othersWorking = status === "pending" && !busy;

  async function runTranscription() {
    if (!channelId || busy) return;
    setBusy(true); setLocalErr(false);
    try {
      // Sinaliza aos outros que está sendo transcrito (evita corrida + mostra ao vivo).
      setTr.mutate({ attachmentId: att.id, text: null, status: "pending", channelId });
      const blob = await (await fetch(url)).blob();
      const text = await transcribeAudio(blob);
      await setTr.mutateAsync({ attachmentId: att.id, text: text || "(áudio sem fala reconhecível)", status: "done", channelId });
    } catch {
      setLocalErr(true);
      if (channelId) setTr.mutate({ attachmentId: att.id, text: null, status: "failed", channelId });
    } finally {
      setBusy(false);
    }
  }

  function onToggle() {
    const next = !open;
    setOpen(next);
    // Ao abrir e ainda não houver texto pronto (nem alguém transcrevendo), começa.
    if (next && !done && !busy && !othersWorking) runTranscription();
  }

  return (
    <div className="flex flex-col gap-1">
      <audio src={url} controls className="h-10 w-64 max-w-full" />
      <button onClick={onToggle}
        className="flex items-center gap-1 self-start text-[11px] font-medium text-primary hover:underline">
        <FileAudio className="h-3 w-3" />
        {open ? "ocultar transcrição" : "ver transcrição"}
        {open ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
      </button>

      {open && (
        <div className="max-w-[260px] rounded-md bg-black/5 px-2.5 py-1.5 text-xs dark:bg-white/10">
          {done ? (
            <p className="whitespace-pre-wrap break-words">{att.transcription}</p>
          ) : busy || othersWorking ? (
            <span className="flex items-center gap-1.5 text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" /> Transcrevendo…</span>
          ) : failed ? (
            <div className="flex flex-col gap-1">
              <span className="text-muted-foreground">Não foi possível transcrever.</span>
              <button onClick={runTranscription} className="flex items-center gap-1 self-start font-medium text-primary hover:underline">
                <RotateCcw className="h-3 w-3" /> tentar de novo
              </button>
            </div>
          ) : (
            <span className="text-muted-foreground">Preparando…</span>
          )}
        </div>
      )}
    </div>
  );
}

export function Attachment({ att, channelId }: { att: ChatAttachment; channelId?: string }) {
  const { data: url, isLoading } = useSignedUrl(att.storage_path);
  const kind = kindOf(att);

  if (isLoading) return <div className="h-10 w-40 animate-pulse rounded-md bg-muted" />;
  if (!url) return <p className="text-xs text-muted-foreground">Anexo indisponível</p>;

  if (kind === "image") {
    // Frame quadrado padronizado (object-cover) como o WhatsApp: a exibição não
    // varia com o tamanho da imagem; abrir (clique) mostra a imagem completa.
    return (
      <a href={url} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-lg bg-neutral-100 dark:bg-neutral-800">
        <img src={url} alt="" loading="lazy" decoding="async" className="aspect-square w-full object-cover" />
      </a>
    );
  }
  if (kind === "video") {
    return <video src={url} controls className="block aspect-video w-full rounded-lg bg-black object-cover" />;
  }
  if (kind === "audio") {
    return <AudioAttachment att={att} url={url} channelId={channelId} />;
  }
  return (
    <a href={url} target="_blank" rel="noreferrer"
      className="flex max-w-xs items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2 hover:bg-muted">
      <FileText className="h-5 w-5 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm">{fileName(att.storage_path)}</span>
        <span className="text-[11px] text-muted-foreground">{humanSize(att.size_bytes)}</span>
      </span>
      <Download className="h-4 w-4 shrink-0 text-muted-foreground" />
    </a>
  );
}

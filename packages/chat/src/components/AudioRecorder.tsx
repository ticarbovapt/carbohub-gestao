import { useRef, useState } from "react";
import { Mic, Square, Trash2, Send } from "lucide-react";

// Gravação de áudio via MediaRecorder. Ao confirmar, entrega o blob + duração.
export function AudioRecorder({
  onSend, disabled,
}: {
  onSend: (blob: Blob, durationMs: number) => void;
  disabled?: boolean;
}) {
  const [state, setState] = useState<"idle" | "recording" | "preview">("idle");
  const [seconds, setSeconds] = useState(0);
  const [blob, setBlob] = useState<Blob | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const startedRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function stopTracks() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  }

  async function start() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];
      const rec = new MediaRecorder(stream);
      rec.ondataavailable = (e) => { if (e.data.size) chunksRef.current.push(e.data); };
      rec.onstop = () => {
        setBlob(new Blob(chunksRef.current, { type: rec.mimeType || "audio/webm" }));
        setState("preview");
        stopTracks();
      };
      recorderRef.current = rec;
      rec.start();
      startedRef.current = Date.now();
      setSeconds(0);
      setState("recording");
      timerRef.current = setInterval(() => setSeconds(Math.floor((Date.now() - startedRef.current) / 1000)), 250);
    } catch {
      alert("Não foi possível acessar o microfone. Verifique a permissão do navegador.");
    }
  }

  function stop() { recorderRef.current?.stop(); }

  function discard() {
    setBlob(null); setState("idle"); setSeconds(0);
  }

  function confirm() {
    if (blob) onSend(blob, seconds * 1000);
    discard();
  }

  const mmss = `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;

  if (state === "idle") {
    return (
      <button onClick={start} disabled={disabled} title="Gravar áudio"
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border text-muted-foreground hover:bg-muted disabled:opacity-40">
        <Mic className="h-4 w-4" />
      </button>
    );
  }
  if (state === "recording") {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-red-400/40 bg-red-500/10 px-3 py-2">
        <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-red-500" />
        <span className="text-sm tabular-nums text-red-600 dark:text-red-400">{mmss}</span>
        <button onClick={stop} title="Parar" className="ml-1 text-red-600 hover:opacity-80 dark:text-red-400">
          <Square className="h-4 w-4" />
        </button>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2 rounded-lg border px-3 py-2">
      <span className="text-sm tabular-nums text-muted-foreground">Áudio {mmss}</span>
      <button onClick={discard} title="Descartar" className="text-muted-foreground hover:text-destructive">
        <Trash2 className="h-4 w-4" />
      </button>
      <button onClick={confirm} title="Enviar áudio" className="text-primary hover:opacity-80">
        <Send className="h-4 w-4" />
      </button>
    </div>
  );
}

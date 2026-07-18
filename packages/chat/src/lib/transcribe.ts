// Transcrição de áudio no NAVEGADOR (Whisper), custo zero e privada — o áudio
// nunca sai do dispositivo. A lib transformers.js é carregada LAZY de um CDN
// dentro de um Web Worker (não entra no bundle nem nos package.json dos apps —
// respeita o monorepo: cada app é autossuficiente, sem inflar 4 lockfiles).
//
// Fluxo: decodifica o blob → PCM mono 16 kHz (Web Audio) na thread principal e
// manda o Float32Array pro worker, que roda o modelo e devolve o texto.

const CDN = "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.3.3";
const MODEL = "Xenova/whisper-base"; // multilíngue; bom p/ recado curto em PT-BR

let worker: Worker | null = null;
let seq = 0;
const pending = new Map<number, { resolve: (t: string) => void; reject: (e: Error) => void }>();

function getWorker(): Worker {
  if (worker) return worker;
  // Worker autocontido (Blob) → sem arquivo .worker que o Vite de cada app teria
  // que processar. Importa o transformers.js do CDN só na 1ª transcrição.
  const code = `
    let asr = null;
    self.onmessage = async (e) => {
      const { id, audio } = e.data;
      try {
        if (!asr) {
          const mod = await import(${JSON.stringify(CDN)});
          asr = await mod.pipeline('automatic-speech-recognition', ${JSON.stringify(MODEL)});
        }
        const out = await asr(audio, { language: 'portuguese', task: 'transcribe', chunk_length_s: 30, stride_length_s: 5 });
        const text = (out && out.text ? String(out.text) : '').trim();
        self.postMessage({ id, text });
      } catch (err) {
        self.postMessage({ id, error: String((err && err.message) || err) });
      }
    };
  `;
  const url = URL.createObjectURL(new Blob([code], { type: "text/javascript" }));
  worker = new Worker(url, { type: "module" });
  worker.onmessage = (e: MessageEvent) => {
    const { id, text, error } = e.data as { id: number; text?: string; error?: string };
    const p = pending.get(id);
    if (!p) return;
    pending.delete(id);
    if (error) p.reject(new Error(error));
    else p.resolve(text ?? "");
  };
  worker.onerror = (e) => {
    // Falha ao carregar/rodar o worker (ex.: CSP bloqueia o CDN) → rejeita tudo.
    for (const [, p] of pending) p.reject(new Error(e.message || "worker error"));
    pending.clear();
  };
  return worker;
}

// Decodifica qualquer áudio suportado pelo navegador → Float32 mono 16 kHz.
async function decodeToMono16k(blob: Blob): Promise<Float32Array> {
  const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new AC();
  try {
    const decoded = await ctx.decodeAudioData(await blob.arrayBuffer());
    const rate = 16000;
    const off = new OfflineAudioContext(1, Math.max(1, Math.ceil(decoded.duration * rate)), rate);
    const src = off.createBufferSource();
    src.buffer = decoded;
    src.connect(off.destination);
    src.start();
    const rendered = await off.startRendering();
    return rendered.getChannelData(0);
  } finally {
    ctx.close?.();
  }
}

// Transcreve um blob de áudio; resolve com o texto (pode ser "" se vazio).
// Lança se o navegador não decodifica o formato ou o modelo/worker falha.
export async function transcribeAudio(blob: Blob): Promise<string> {
  const audio = await decodeToMono16k(blob);
  const id = ++seq;
  const w = getWorker();
  return new Promise<string>((resolve, reject) => {
    pending.set(id, { resolve, reject });
    w.postMessage({ id, audio }, [audio.buffer]);
  });
}

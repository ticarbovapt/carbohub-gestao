import { Upload } from "tus-js-client";
import { supabase, SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "@/integrations/supabase/client";

// ─────────────────────────────────────────────────────────────────────────────
// Arquivos dos cartões do Marketing: enviar, gerar CAPA, saber o tipo.
//
// ⚠️ O ORIGINAL é guardado como veio. Quem sobe é designer, e o arquivo é a
// entrega: recomprimir o vídeo no navegador o pioraria (e levaria minutos num
// arquivo de 200 MB). O que fica LEVE é o que a tela carrega:
//   • a lista mostra só a CAPA (jpeg de ~480 px, dezenas de KB);
//   • o vídeo só é baixado quando alguém clica para assistir, e vem em pedaços
//     (o navegador pede por faixa de bytes) — não precisa baixar inteiro.
// ─────────────────────────────────────────────────────────────────────────────

export const BUCKET = "mkt-anexos";

export type TipoArquivo = "video" | "audio" | "imagem" | "pdf" | "outro";

// Pelo mime e, na falta, pela extensão — o Trello nem sempre mandou `mimeType`.
export function tipoDoArquivo(mime: string | null | undefined, nome: string): TipoArquivo {
  const m = (mime ?? "").toLowerCase();
  const ext = (nome.split(".").pop() ?? "").toLowerCase();
  if (m.startsWith("video/") || ["mp4", "mov", "m4v", "webm", "avi", "mkv"].includes(ext)) return "video";
  if (m.startsWith("audio/") || ["mp3", "wav", "m4a", "ogg", "aac", "opus"].includes(ext)) return "audio";
  if (m.startsWith("image/") || ["jpg", "jpeg", "png", "gif", "webp", "svg", "avif"].includes(ext)) return "imagem";
  if (m === "application/pdf" || ext === "pdf") return "pdf";
  return "outro";
}

export const ROTULO_TIPO: Record<TipoArquivo, string> = { video: "Vídeo", audio: "Áudio", imagem: "Imagem", pdf: "PDF", outro: "Arquivo" };

export function tamanhoLegivel(b: number | null | undefined): string {
  if (b == null) return "";
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
  if (b < 1024 ** 3) return `${(b / 1024 / 1024).toFixed(b < 10 * 1024 * 1024 ? 1 : 0)} MB`;
  return `${(b / 1024 ** 3).toFixed(2)} GB`;
}

// Nome que o Storage aceita (sem acento, sem barra, sem espaço) — o nome de
// EXIBIÇÃO continua o original, na coluna `name`.
export function nomeSeguro(nome: string): string {
  const limpo = nome.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\w.-]+/g, "_").replace(/_+/g, "_");
  return limpo.slice(-120) || "arquivo";
}

export const caminhoDoArquivo = (cardId: string, nome: string) =>
  `cards/${cardId}/${crypto.randomUUID()}/${nomeSeguro(nome)}`;
export const caminhoDaCapa = (anexoId: string) => `capas/${anexoId}/${crypto.randomUUID()}.jpg`;

const PARTE = 6 * 1024 * 1024; // o Storage exige EXATAMENTE 6 MB por parte no TUS

/** Envia ao bucket. Até 6 MB vai de uma vez; acima, em partes (TUS), com progresso e retomada. */
export async function enviar(arquivo: Blob, caminho: string, contentType: string, onProgresso?: (frac: number) => void): Promise<void> {
  if (arquivo.size <= PARTE) {
    const { error } = await supabase.storage.from(BUCKET).upload(caminho, arquivo, { contentType, upsert: false, cacheControl: "31536000" });
    if (error) throw new Error(error.message);
    onProgresso?.(1);
    return;
  }
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Sessão expirada — entre de novo para enviar.");
  await new Promise<void>((ok, falha) => {
    const up = new Upload(arquivo, {
      endpoint: `${SUPABASE_URL}/storage/v1/upload/resumable`,
      retryDelays: [0, 2000, 5000, 10000],
      headers: { authorization: `Bearer ${token}`, apikey: SUPABASE_PUBLISHABLE_KEY, "x-upsert": "false" },
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      chunkSize: PARTE,
      metadata: { bucketName: BUCKET, objectName: caminho, contentType, cacheControl: "31536000" },
      onError: (e) => falha(new Error(e.message)),
      onProgress: (env, total) => onProgresso?.(total ? env / total : 0),
      onSuccess: () => ok(),
    });
    up.findPreviousUploads().then((ant) => { if (ant.length) up.resumeFromPreviousUpload(ant[0]); up.start(); });
  });
}

export async function urlAssinada(caminho: string, opts?: { baixar?: string }): Promise<string> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(caminho, 3600, opts?.baixar ? { download: opts.baixar } : undefined);
  if (error || !data) throw new Error(error?.message ?? "Arquivo indisponível");
  return data.signedUrl;
}

// ── CAPA ────────────────────────────────────────────────────────────────────
// Desenha um quadro num canvas de 480 px e devolve um jpeg. Falhar aqui NUNCA
// impede o envio: sem capa, a lista mostra o ícone do tipo.
const LADO = 480;

function quadroParaJpeg(fonte: CanvasImageSource, w: number, h: number): Promise<Blob | null> {
  if (!w || !h) return Promise.resolve(null);
  const k = Math.min(1, LADO / Math.max(w, h));
  const c = document.createElement("canvas");
  c.width = Math.round(w * k); c.height = Math.round(h * k);
  const ctx = c.getContext("2d");
  if (!ctx) return Promise.resolve(null);
  ctx.drawImage(fonte, 0, 0, c.width, c.height);
  return new Promise((r) => { try { c.toBlob((b) => r(b), "image/jpeg", 0.78); } catch { r(null); } });
}

/** Capa de imagem ou vídeo, a partir do arquivo LOCAL (na hora do envio) ou de uma URL (na primeira vez que alguém abre). */
export async function gerarCapa(fonte: Blob | string, tipo: TipoArquivo): Promise<Blob | null> {
  try {
    const url = typeof fonte === "string" ? fonte : URL.createObjectURL(fonte);
    const soltar = () => { if (typeof fonte !== "string") URL.revokeObjectURL(url); };
    if (tipo === "imagem") {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.src = url;
      await img.decode();
      const b = await quadroParaJpeg(img, img.naturalWidth, img.naturalHeight);
      soltar();
      return b;
    }
    if (tipo === "video") {
      const v = document.createElement("video");
      v.crossOrigin = "anonymous"; v.muted = true; v.playsInline = true; v.preload = "metadata"; v.src = url;
      await new Promise<void>((ok, falha) => {
        const t = setTimeout(() => falha(new Error("tempo")), 20000);
        v.onloadedmetadata = () => { v.currentTime = Math.min(1, (v.duration || 2) / 10); };
        v.onseeked = () => { clearTimeout(t); ok(); };
        v.onerror = () => { clearTimeout(t); falha(new Error("codec")); };
      });
      const b = await quadroParaJpeg(v, v.videoWidth, v.videoHeight);
      v.removeAttribute("src"); v.load();
      soltar();
      return b;
    }
  } catch (e) {
    console.warn("[mkt] capa não gerada:", e);
  }
  return null;
}

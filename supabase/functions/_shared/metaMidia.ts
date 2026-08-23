// ─────────────────────────────────────────────────────────────────────────────
// metaMidia — o que a Meta aceita, e como ela chama cada coisa
//
// Módulo PURO. O envio de mídia tem dois passos (subir o arquivo para pegar um
// `media_id`, depois mandar a mensagem com ele), e o que dá errado quase sempre
// dá errado ANTES do primeiro: tipo que ela não aceita, arquivo grande demais.
//
// Recusar aqui é recusar com uma frase que a pessoa entende. Deixar chegar na
// Meta é recusar com um código.
// ─────────────────────────────────────────────────────────────────────────────

/** Como a Meta chama cada família de arquivo no `type` da mensagem. */
export type TipoMidia = "image" | "document" | "audio" | "video" | "sticker";

interface Regra {
  tipo: TipoMidia;
  /** Teto em bytes, o da própria Meta. */
  limite: number;
  rotulo: string;
}

const MB = 1024 * 1024;

/**
 * ⚠️ Lista fechada, e ela é a da Meta — não a do que o navegador consegue
 * abrir. `image/webp` só vale como figurinha; `audio/ogg` só com codec OPUS;
 * `image/gif` ela simplesmente não aceita, por mais comum que seja.
 *
 * O que não está aqui é recusado com nome e tamanho na mensagem, em vez de
 * virar um 400 genérico depois do upload.
 */
const REGRAS: Record<string, Regra> = {
  "image/jpeg": { tipo: "image", limite: 5 * MB, rotulo: "imagem" },
  "image/png":  { tipo: "image", limite: 5 * MB, rotulo: "imagem" },

  "application/pdf": { tipo: "document", limite: 100 * MB, rotulo: "documento" },
  "application/msword": { tipo: "document", limite: 100 * MB, rotulo: "documento" },
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
    { tipo: "document", limite: 100 * MB, rotulo: "documento" },
  "application/vnd.ms-excel": { tipo: "document", limite: 100 * MB, rotulo: "documento" },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
    { tipo: "document", limite: 100 * MB, rotulo: "documento" },
  "text/plain": { tipo: "document", limite: 100 * MB, rotulo: "documento" },

  // ⚠️ `audio/ogg` a Meta aceita SÓ com codec opus. O `MediaRecorder` do Chrome
  // grava `audio/webm;codecs=opus` — mesmo codec, contêiner diferente —, e o
  // Firefox grava ogg. O webm NÃO está na lista dela; se ele chegar aqui, é
  // recusado com essa explicação em vez de virar um erro cru da Meta.
  "audio/ogg":  { tipo: "audio", limite: 16 * MB, rotulo: "áudio" },
  "audio/mpeg": { tipo: "audio", limite: 16 * MB, rotulo: "áudio" },
  "audio/mp4":  { tipo: "audio", limite: 16 * MB, rotulo: "áudio" },
  "audio/aac":  { tipo: "audio", limite: 16 * MB, rotulo: "áudio" },
  "audio/amr":  { tipo: "audio", limite: 16 * MB, rotulo: "áudio" },

  "video/mp4":  { tipo: "video", limite: 16 * MB, rotulo: "vídeo" },
  "video/3gpp": { tipo: "video", limite: 16 * MB, rotulo: "vídeo" },
};

export interface Veredito {
  ok: boolean;
  tipo?: TipoMidia;
  /** Mime já normalizado — sem o `;codecs=...` que o navegador acrescenta. */
  mime?: string;
  erro?: string;
}

/**
 * O mime que o navegador manda vem com parâmetros: `audio/ogg;codecs=opus`.
 * A Meta quer só a família, e comparar a string inteira não casaria com nada.
 */
export function mimeBase(mime: string): string {
  return String(mime ?? "").split(";")[0].trim().toLowerCase();
}

const humano = (bytes: number) =>
  bytes >= MB ? `${(bytes / MB).toFixed(0)} MB` : `${Math.ceil(bytes / 1024)} KB`;

export function conferirMidia(mime: string, tamanho: number, nome?: string): Veredito {
  const base = mimeBase(mime);
  const regra = REGRAS[base];

  if (!regra) {
    // ⚠️ O webm merece frase própria: é o que o Chrome grava por padrão, então
    // é o erro que mais vai aparecer, e "tipo não suportado" não diria o que
    // fazer com ele.
    if (base === "audio/webm" || base === "video/webm") {
      return {
        ok: false,
        erro: "O WhatsApp não aceita webm. Grave em ogg/opus ou envie um mp3.",
      };
    }
    return {
      ok: false,
      erro: `O WhatsApp não aceita arquivos ${base || "sem tipo"}${nome ? ` (${nome})` : ""}.`,
    };
  }

  if (!Number.isFinite(tamanho) || tamanho <= 0) {
    return { ok: false, erro: "Arquivo vazio." };
  }
  if (tamanho > regra.limite) {
    return {
      ok: false,
      erro: `O limite do WhatsApp para ${regra.rotulo} é ${humano(regra.limite)}`
          + ` e este arquivo tem ${humano(tamanho)}.`,
    };
  }

  return { ok: true, tipo: regra.tipo, mime: base };
}

/**
 * O corpo da mensagem de mídia.
 *
 * ⚠️ Legenda só existe em imagem, vídeo e documento. Em áudio a Meta IGNORA em
 * silêncio — e uma legenda que some sem avisar faz quem atende achar que disse
 * algo que o cliente nunca leu. Por isso ela não é montada aqui, e a tela avisa.
 */
export function corpoDaMidia(
  to: string, tipo: TipoMidia, mediaId: string,
  legenda?: string | null, nomeArquivo?: string | null,
): Record<string, unknown> {
  const conteudo: Record<string, unknown> = { id: mediaId };
  if (tipo !== "audio" && tipo !== "sticker" && legenda?.trim()) {
    conteudo.caption = legenda.trim();
  }
  // O nome só vale no documento — é o que o cliente vê na conversa.
  if (tipo === "document" && nomeArquivo) conteudo.filename = nomeArquivo;

  return {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
    type: tipo,
    [tipo]: conteudo,
  };
}

/** Áudio aceita legenda? Não — e a tela precisa saber para não oferecer. */
export const aceitaLegenda = (tipo: TipoMidia) =>
  tipo !== "audio" && tipo !== "sticker";

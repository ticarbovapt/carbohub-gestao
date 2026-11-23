// ─────────────────────────────────────────────────────────────────────────────
// Foto pronta para o WhatsApp, ANTES de subir (23/11/2026).
//
// A Meta aceita imagem só em JPEG ou PNG, até 5 MB. O print colado e a foto
// escolhida chegavam às vezes como webp/gif (copiar imagem de um site), com
// tipo apelidado (`image/jpg`) ou acima de 5 MB (foto de celular) — e eram
// recusados depois do clique. Aqui:
//   · JPEG/PNG até 5 MB passam como estão (só o tipo é corrigido);
//   · o resto vira JPEG pelo navegador, reduzido até caber.
// O que o navegador não consegue abrir (HEIC, por exemplo) segue como veio, e
// o servidor recusa com a frase certa. Documento e áudio não passam por aqui.
// ─────────────────────────────────────────────────────────────────────────────

const LIMITE = 5 * 1024 * 1024;
const LADO_MAX = 2560;

const PELA_EXTENSAO: Record<string, string> = {
  jpg: "image/jpeg", jpeg: "image/jpeg", jfif: "image/jpeg", png: "image/png",
  webp: "image/webp", gif: "image/gif", bmp: "image/bmp",
};
const APELIDOS: Record<string, string> = {
  "image/jpg": "image/jpeg", "image/pjpeg": "image/jpeg", "image/x-png": "image/png",
};

/** O tipo de verdade: apelido corrigido; sem tipo, pela extensão. */
export function tipoDaImagem(tipo: string, nome: string): string {
  const t = (tipo || "").split(";")[0].trim().toLowerCase();
  if (APELIDOS[t]) return APELIDOS[t];
  if (t && t !== "application/octet-stream") return t;
  return PELA_EXTENSAO[nome.split(".").pop()?.toLowerCase() ?? ""] ?? t;
}

export function ehImagem(f: File): boolean {
  return tipoDaImagem(f.type, f.name).startsWith("image/");
}

/** O que precisa ser feito com ela — puro, para dar para testar. */
export function decisaoDaImagem(tipo: string, tamanho: number): "passa" | "converte" {
  return (tipo === "image/jpeg" || tipo === "image/png") && tamanho <= LIMITE ? "passa" : "converte";
}

const semExtensao = (nome: string) => nome.replace(/\.[^.]+$/, "") || "imagem";

export async function prepararImagem(f: File): Promise<File> {
  const tipo = tipoDaImagem(f.type, f.name);
  if (!tipo.startsWith("image/")) return f;
  if (decisaoDaImagem(tipo, f.size) === "passa") {
    return tipo === f.type ? f : new File([f], f.name, { type: tipo });
  }
  let bitmap: ImageBitmap;
  try { bitmap = await createImageBitmap(f); } catch { return f; }
  let escala = Math.min(1, LADO_MAX / Math.max(bitmap.width, bitmap.height));
  for (let tentativa = 0; tentativa < 5; tentativa++) {
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * escala));
    canvas.height = Math.max(1, Math.round(bitmap.height * escala));
    const ctx = canvas.getContext("2d");
    if (!ctx) return f;
    // Fundo branco: PNG/GIF transparente viraria fundo PRETO no JPEG.
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.85));
    if (blob && blob.size <= LIMITE) {
      return new File([blob], `${semExtensao(f.name)}.jpg`, { type: "image/jpeg" });
    }
    escala *= 0.7;
  }
  return f;
}

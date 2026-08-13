// ─────────────────────────────────────────────────────────────────────────────
// RTM — preparar a foto antes de guardar
//
// ⚠️ Foto de celular hoje sai com 3 a 6 MB. Três fotos por visita, doze visitas
// no dia, num aparelho que passou a manhã sem sinal: é meio giga esperando na
// fila do IndexedDB, para subir depois por uma rede de interior. O upload
// falharia por timeout, a fila tentaria de novo, e o vendedor veria "enviando"
// para sempre.
//
// 1600px no maior lado e JPEG 0.7 resolve o problema sem tocar no que importa:
// a foto existe para provar que o expositor estava lá e em que estado. Isso se
// enxerga com folga nessa resolução — normalmente 200 a 400 KB.
//
// A compressão acontece no MOMENTO DA CAPTURA, não no envio. Guardar o
// original e comprimir depois só empurraria o problema de armazenamento para
// o aparelho, que é justamente onde ele dói.
// ─────────────────────────────────────────────────────────────────────────────

const LADO_MAX = 1600;
const QUALIDADE = 0.7;

export async function prepararFoto(arquivo: File | Blob): Promise<Blob> {
  try {
    const bitmap = await carregar(arquivo);
    const escala = Math.min(1, LADO_MAX / Math.max(bitmap.width, bitmap.height));
    const w = Math.round(bitmap.width * escala);
    const h = Math.round(bitmap.height * escala);

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return arquivo;
    ctx.drawImage(bitmap as CanvasImageSource, 0, 0, w, h);
    if ("close" in bitmap && typeof bitmap.close === "function") bitmap.close();

    const blob = await new Promise<Blob | null>((r) =>
      canvas.toBlob(r, "image/jpeg", QUALIDADE));

    // Se a compressão não ajudou (foto já pequena, PNG de print), fica o
    // original: nunca vale a pena trocar por um arquivo MAIOR.
    return blob && blob.size < arquivo.size ? blob : arquivo;
  } catch {
    // Canvas bloqueado, formato exótico, memória: guarda como veio. Foto
    // grande é ruim; foto perdida é pior.
    return arquivo;
  }
}

async function carregar(arquivo: File | Blob): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === "function") {
    // `imageOrientation` importa: sem ele o retrato tirado no celular chega
    // deitado, porque o EXIF de rotação some no canvas.
    return await createImageBitmap(arquivo, { imageOrientation: "from-image" });
  }
  const url = URL.createObjectURL(arquivo);
  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Preparo de imagem antes do upload.
//
// O problema que isto resolve: print de tela em PNG de monitor 4K passa de
// 8 MB. Sem tratamento, isso é enviado inteiro, guardado inteiro no Storage e
// BAIXADO INTEIRO por todo mundo que abrir a conversa — inclusive no celular,
// no 4G. Uma conversa com vinte prints vira 160 MB de download.
//
// A conta que importa não é o upload de quem manda (uma vez), é o download de
// quem lê (toda vez, por pessoa).
// ─────────────────────────────────────────────────────────────────────────────

/** Maior lado da imagem depois do tratamento. 1920 cobre tela cheia em
 *  qualquer monitor comum sem guardar pixel que ninguém vai ver. */
export const LADO_MAXIMO = 1920;

/** Alvo de tamanho depois de comprimir. A qualidade cai em degraus até
 *  chegar aqui — ver `comprimirImagem`. */
export const ALVO_BYTES = 900 * 1024;

/** Abaixo disto não vale a pena reprocessar: recomprimir imagem pequena
 *  costuma PIORAR o tamanho e sempre piora a qualidade. */
export const MINIMO_PARA_TRATAR = 200 * 1024;

/** Teto de entrada. Acima disso o navegador trava ao decodificar para o
 *  canvas — é recusa, não compressão. */
export const ENTRADA_MAXIMA = 30 * 1024 * 1024;

/** Degraus de qualidade. Para no primeiro que couber no alvo. */
const QUALIDADES = [0.85, 0.72, 0.6, 0.5];

export const formatarBytes = (b: number) =>
  b >= 1024 * 1024 ? `${(b / (1024 * 1024)).toFixed(1)} MB` : `${Math.round(b / 1024)} KB`;

/** Carrega o arquivo num <img> decodificado, pronto para o canvas. */
export function carregarImagem(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Não foi possível ler a imagem."));
    img.src = src;
  });
}

const paraBlob = (canvas: HTMLCanvasElement, tipo: string, q: number): Promise<Blob> =>
  new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Falha ao gerar a imagem."))), tipo, q));

export interface ResultadoImagem {
  arquivo: File;
  bytesAntes: number;
  bytesDepois: number;
  largura: number;
  altura: number;
  /** true quando o arquivo saiu igual ao que entrou. */
  intacto: boolean;
}

export interface OpcoesImagem {
  /** Recorte em pixels da imagem ORIGINAL. Sem isto, usa a imagem inteira. */
  recorte?: { x: number; y: number; width: number; height: number } | null;
}

/**
 * Redimensiona, recorta e recomprime. Devolve o arquivo pronto para envio.
 *
 * ⚠️ GIF passa direto, sem tocar. Redesenhar um GIF no canvas devolve só o
 * primeiro quadro — a animação morre e ninguém entende por quê.
 */
export async function comprimirImagem(file: File, opcoes: OpcoesImagem = {}): Promise<ResultadoImagem> {
  const bytesAntes = file.size;
  const semTratar = (largura = 0, altura = 0): ResultadoImagem => ({
    arquivo: file, bytesAntes, bytesDepois: bytesAntes, largura, altura, intacto: true,
  });

  if (bytesAntes > ENTRADA_MAXIMA) {
    throw new Error(`Imagem muito grande (${formatarBytes(bytesAntes)}). O limite é ${formatarBytes(ENTRADA_MAXIMA)}.`);
  }
  if (file.type === "image/gif") return semTratar();

  const url = URL.createObjectURL(file);
  try {
    const img = await carregarImagem(url);
    const oLargura = img.naturalWidth, oAltura = img.naturalHeight;

    const r = opcoes.recorte ?? { x: 0, y: 0, width: oLargura, height: oAltura };
    const recortou = r.width !== oLargura || r.height !== oAltura;

    // Nada a fazer: sem recorte, dentro do lado máximo e já pequeno.
    if (!recortou && Math.max(r.width, r.height) <= LADO_MAXIMO && bytesAntes <= MINIMO_PARA_TRATAR) {
      return semTratar(oLargura, oAltura);
    }

    const escala = Math.min(1, LADO_MAXIMO / Math.max(r.width, r.height));
    const largura = Math.max(1, Math.round(r.width * escala));
    const altura = Math.max(1, Math.round(r.height * escala));

    const canvas = document.createElement("canvas");
    canvas.width = largura; canvas.height = altura;
    const ctx = canvas.getContext("2d");
    if (!ctx) return semTratar(oLargura, oAltura);
    // Fundo branco: JPEG não tem transparência e sem isto o canal alfa
    // vira PRETO — print com fundo transparente sairia com tarjas pretas.
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, largura, altura);
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, r.x, r.y, r.width, r.height, 0, 0, largura, altura);

    // JPEG sempre: PNG de print não comprime (é sem perdas) e é justamente
    // ele o vilão de tamanho.
    let blob: Blob | null = null;
    for (const q of QUALIDADES) {
      blob = await paraBlob(canvas, "image/jpeg", q);
      if (blob.size <= ALVO_BYTES) break;
    }
    if (!blob) return semTratar(oLargura, oAltura);

    // Se comprimir não ajudou e não houve recorte, fica com o original —
    // reprocessar por reprocessar só perde qualidade.
    if (!recortou && blob.size >= bytesAntes) return semTratar(oLargura, oAltura);

    const nome = file.name.replace(/\.[^.]+$/, "") + ".jpg";
    return {
      arquivo: new File([blob], nome, { type: "image/jpeg" }),
      bytesAntes, bytesDepois: blob.size, largura, altura, intacto: false,
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}

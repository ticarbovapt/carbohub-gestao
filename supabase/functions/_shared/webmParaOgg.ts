// ─────────────────────────────────────────────────────────────────────────────
// webmParaOgg — trocar a embalagem do áudio, sem tocar no áudio
//
// A Meta aceita `audio/ogg` SÓ com codec Opus. O `MediaRecorder` do navegador
// não grava ogg em nenhum Chrome; grava `audio/webm;codecs=opus` — que é o
// MESMO codec dentro de outro contêiner — ou `audio/mp4`, que ela recusa com
//
//   131053: uploaded with mimetype as audio/mp4, however on processing it is
//           of type application/octet-stream
//
// (medido em produção: o mp4 do Chrome é fragmentado e ela não o identifica).
//
// ⚠️ Isto NÃO é conversão. Os pacotes Opus saem do WebM e entram no Ogg byte a
// byte iguais. Converter exigiria decodificar e recodificar — ffmpeg, que não
// existe no runtime de edge function, e perda de qualidade em cima. Reempacotar
// é o trabalho todo, e é exato.
//
// ── O que é preciso saber dos dois formatos ─────────────────────────────────
//
// WebM é Matroska: elementos aninhados, cada um com um ID e um tamanho em
// tamanho-variável. Os pacotes de áudio moram nos `SimpleBlock` dos `Cluster`.
// ⚠️ O `MediaRecorder` grava com tamanho DESCONHECIDO no Segment e nos Clusters
// (ele não sabe o fim quando começa a escrever) — quem assume tamanho conhecido
// lê lixo no primeiro cluster.
//
// Ogg é uma sequência de páginas com CRC próprio, e a duração é declarada em
// `granule position`: amostras a 48 kHz acumuladas. Ela não é decorativa — é
// dela que sai a duração que o WhatsApp mostra na bolinha do áudio, e um
// granule errado dá áudio que "termina" antes ou barra que não anda.
// ─────────────────────────────────────────────────────────────────────────────

/** Um pacote Opus como saiu do WebM. */
export interface PacoteOpus {
  dados: Uint8Array;
  /** Amostras a 48 kHz que este pacote representa. */
  amostras: number;
}

export interface AudioExtraido {
  pacotes: PacoteOpus[];
  canais: number;
  /** O `OpusHead` original, quando o arquivo trouxe um (CodecPrivate). */
  cabecalho: Uint8Array | null;
  preSkip: number;
}

// ─── EBML: os tamanhos-variáveis ─────────────────────────────────────────────

/**
 * Lê um inteiro de tamanho variável.
 *
 * O primeiro bit 1 diz quantos bytes o número ocupa. Para IDs o valor inclui o
 * marcador (é assim que o ID é escrito na especificação); para tamanhos ele é
 * removido.
 *
 * ⚠️ `desconhecido` é o caso que derruba parser ingênuo: todos os bits de valor
 * em 1 significa "não sei onde termina", e o MediaRecorder usa isso no Segment
 * e em cada Cluster.
 */
export function leVint(b: Uint8Array, pos: number, manterMarcador: boolean):
  { valor: number; tamanho: number; desconhecido: boolean } {
  if (pos >= b.length) return { valor: 0, tamanho: 0, desconhecido: false };
  const primeiro = b[pos];
  if (primeiro === 0) return { valor: 0, tamanho: 0, desconhecido: false };

  let tamanho = 1;
  let mascara = 0x80;
  while (!(primeiro & mascara) && tamanho < 8) { tamanho++; mascara >>= 1; }

  let valor = manterMarcador ? primeiro : (primeiro & (mascara - 1));
  let todosUns = (primeiro & (mascara - 1)) === (mascara - 1);
  for (let i = 1; i < tamanho; i++) {
    const byte = b[pos + i] ?? 0;
    valor = valor * 256 + byte;
    if (byte !== 0xff) todosUns = false;
  }
  return { valor, tamanho, desconhecido: !manterMarcador && todosUns };
}

// IDs que interessam. Os "mestres" a gente desce; o resto se pula.
const SEGMENT     = 0x18538067;
const TRACKS      = 0x1654ae6b;
const TRACK_ENTRY = 0xae;
const AUDIO       = 0xe1;
const CLUSTER     = 0x1f43b675;
const BLOCK_GROUP = 0xa0;
const CODEC_PRIV  = 0x63a2;
const CANAIS      = 0x9f;
const SIMPLE_BLOCK = 0xa3;
const BLOCK        = 0xa1;

const MESTRES = new Set([SEGMENT, TRACKS, TRACK_ENTRY, AUDIO, CLUSTER, BLOCK_GROUP]);

/**
 * A duração de um pacote Opus, em amostras de 48 kHz, lida do byte TOC.
 *
 * ⚠️ Sem isto o granule do Ogg seria um chute. A tabela é a da RFC 6716: os
 * cinco bits de configuração dizem o modo e o tamanho do quadro, e os dois
 * últimos bits dizem quantos quadros vêm no pacote.
 */
export function amostrasDoPacote(p: Uint8Array): number {
  if (!p.length) return 0;
  const toc = p[0];
  const config = toc >> 3;
  const ms = config < 12
    ? [10, 20, 40, 60][config & 3]                 // SILK e híbrido
    : config < 16
      ? [10, 20][config & 1]                       // híbrido SWB/FB
      : [2.5, 5, 10, 20][config & 3];              // CELT
  const c = toc & 3;
  const quadros = c === 0 ? 1
    : c === 1 || c === 2 ? 2
    // Pacote de código 3 traz a contagem no byte seguinte (6 bits baixos).
    : (p.length > 1 ? (p[1] & 0x3f) : 1);
  return Math.round(ms * 48 * Math.max(1, quadros));
}

/** Os quadros de um bloco, respeitando o lacing. */
function quadrosDoBloco(b: Uint8Array, inicio: number, fim: number): Uint8Array[] {
  let p = inicio;
  const faixa = leVint(b, p, false);            // número da trilha
  p += faixa.tamanho;
  p += 2;                                       // timecode relativo (int16)
  const flags = b[p]; p += 1;
  const lacing = (flags >> 1) & 0x03;

  if (lacing === 0) return [b.subarray(p, fim)];

  const quantos = b[p] + 1; p += 1;
  const tamanhos: number[] = [];

  if (lacing === 2) {                            // fixo
    const cada = Math.floor((fim - p) / quantos);
    for (let i = 0; i < quantos; i++) tamanhos.push(cada);
  } else if (lacing === 1) {                     // Xiph
    for (let i = 0; i < quantos - 1; i++) {
      let t = 0;
      while (b[p] === 0xff) { t += 255; p++; }
      t += b[p]; p++;
      tamanhos.push(t);
    }
  } else {                                       // EBML
    const primeiro = leVint(b, p, false);
    p += primeiro.tamanho;
    tamanhos.push(primeiro.valor);
    let anterior = primeiro.valor;
    for (let i = 1; i < quantos - 1; i++) {
      const d = leVint(b, p, false);
      p += d.tamanho;
      // Diferença com sinal: o meio da faixa é o zero.
      const meio = Math.pow(2, 7 * d.tamanho - 1) - 1;
      anterior += d.valor - meio;
      tamanhos.push(anterior);
    }
  }

  const quadros: Uint8Array[] = [];
  let somados = 0;
  for (const t of tamanhos) { quadros.push(b.subarray(p + somados, p + somados + t)); somados += t; }
  if (lacing !== 2) quadros.push(b.subarray(p + somados, fim));   // o último leva o resto
  return quadros.filter((q) => q.length > 0);
}

/**
 * Varre o WebM e junta os pacotes Opus.
 *
 * ⚠️ Tamanho desconhecido em elemento mestre vale "até o fim do pai". É o caso
 * normal aqui, não a exceção: gravação ao vivo não sabe o próprio tamanho.
 */
export function extrairOpus(webm: Uint8Array): AudioExtraido {
  const pacotes: PacoteOpus[] = [];
  let canais = 1;
  let cabecalho: Uint8Array | null = null;
  let preSkip = 3840;                            // 80 ms, o padrão do WebM/Opus

  const andar = (inicio: number, fim: number) => {
    let p = inicio;
    while (p < fim) {
      const id = leVint(webm, p, true);
      if (!id.tamanho) break;
      p += id.tamanho;
      const tam = leVint(webm, p, false);
      if (!tam.tamanho) break;
      p += tam.tamanho;

      const conteudoFim = tam.desconhecido ? fim : Math.min(fim, p + tam.valor);

      if (MESTRES.has(id.valor)) {
        andar(p, conteudoFim);
        // Mestre de tamanho desconhecido já consumiu o resto: parar aqui evita
        // reler os mesmos blocos e duplicar o áudio.
        if (tam.desconhecido) return;
      } else if (id.valor === CODEC_PRIV) {
        cabecalho = webm.subarray(p, conteudoFim);
        if (cabecalho.length >= 12) {
          canais = cabecalho[9];
          preSkip = cabecalho[10] | (cabecalho[11] << 8);
        }
      } else if (id.valor === CANAIS) {
        let v = 0;
        for (let i = p; i < conteudoFim; i++) v = v * 256 + webm[i];
        if (v > 0) canais = v;
      } else if (id.valor === SIMPLE_BLOCK || id.valor === BLOCK) {
        for (const q of quadrosDoBloco(webm, p, conteudoFim)) {
          pacotes.push({ dados: q, amostras: amostrasDoPacote(q) });
        }
      }
      p = conteudoFim;
    }
  };

  andar(0, webm.length);
  return { pacotes, canais, cabecalho, preSkip };
}

// ─── Ogg ─────────────────────────────────────────────────────────────────────

const TABELA_CRC = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let r = i << 24;
    for (let j = 0; j < 8; j++) r = (r & 0x80000000) ? ((r << 1) ^ 0x04c11db7) : (r << 1);
    t[i] = r >>> 0;
  }
  return t;
})();

/** ⚠️ O CRC do Ogg não é o do zip: polinômio 0x04c11db7, sem reflexão e sem
 *  inversão final. Errar isso dá arquivo que nenhum player abre. */
export function crcOgg(dados: Uint8Array): number {
  let crc = 0;
  for (let i = 0; i < dados.length; i++) {
    crc = ((crc << 8) ^ TABELA_CRC[((crc >>> 24) ^ dados[i]) & 0xff]) >>> 0;
  }
  return crc >>> 0;
}

function pagina(dados: Uint8Array, tabela: number[], tipo: number,
                granule: number, serial: number, sequencia: number): Uint8Array {
  const p = new Uint8Array(27 + tabela.length + dados.length);
  const v = new DataView(p.buffer);
  p.set([0x4f, 0x67, 0x67, 0x53], 0);            // "OggS"
  p[4] = 0;                                      // versão
  p[5] = tipo;
  // Granule é 64 bits; o áudio real cabe folgado em 53, então dois 32 bastam.
  v.setUint32(6, granule >>> 0, true);
  v.setUint32(10, Math.floor(granule / 4294967296), true);
  v.setUint32(14, serial, true);
  v.setUint32(18, sequencia, true);
  v.setUint32(22, 0, true);                      // CRC entra depois
  p[26] = tabela.length;
  p.set(tabela, 27);
  p.set(dados, 27 + tabela.length);
  v.setUint32(22, crcOgg(p), true);
  return p;
}

/** A tabela de segmentos: pacote picado em pedaços de 255 bytes. */
function segmentos(tamanho: number): number[] {
  const s: number[] = [];
  let resto = tamanho;
  while (resto >= 255) { s.push(255); resto -= 255; }
  s.push(resto);
  return s;
}

function opusHead(canais: number, preSkip: number): Uint8Array {
  const h = new Uint8Array(19);
  h.set([0x4f, 0x70, 0x75, 0x73, 0x48, 0x65, 0x61, 0x64], 0);   // "OpusHead"
  h[8] = 1;                                       // versão
  h[9] = canais;
  new DataView(h.buffer).setUint16(10, preSkip, true);
  new DataView(h.buffer).setUint32(12, 48000, true);
  return h;
}

function opusTags(): Uint8Array {
  const fornecedor = new TextEncoder().encode("carbohub");
  const t = new Uint8Array(8 + 4 + fornecedor.length + 4);
  t.set([0x4f, 0x70, 0x75, 0x73, 0x54, 0x61, 0x67, 0x73], 0);   // "OpusTags"
  const v = new DataView(t.buffer);
  v.setUint32(8, fornecedor.length, true);
  t.set(fornecedor, 12);
  v.setUint32(12 + fornecedor.length, 0, true);   // nenhum comentário
  return t;
}

/**
 * Monta o arquivo Ogg.
 *
 * ⚠️ Duas páginas de cabeçalho, cada uma sozinha na sua: a especificação do
 * Opus em Ogg exige que o OpusHead seja a única coisa na primeira página e o
 * OpusTags termine na sua. Empacotar junto com áudio produz arquivo que alguns
 * players abrem e outros não — o pior tipo de defeito.
 */
export function montarOgg(pacotes: PacoteOpus[], canais: number,
                          preSkip: number, serial = 0x43424855,
                          cabecalho?: Uint8Array | null): Uint8Array {
  const partes: Uint8Array[] = [];
  let seq = 0;

  const cab = cabecalho && cabecalho.length >= 19 ? cabecalho : opusHead(canais, preSkip);
  partes.push(pagina(cab, segmentos(cab.length), 0x02, 0, serial, seq++));   // BOS
  const tags = opusTags();
  partes.push(pagina(tags, segmentos(tags.length), 0x00, 0, serial, seq++));

  let granule = preSkip;
  let i = 0;
  while (i < pacotes.length) {
    const tabela: number[] = [];
    const dados: Uint8Array[] = [];
    let bytes = 0;

    // Enche a página até o teto de 255 segmentos, sem partir pacote entre
    // páginas: o Ogg permite, mas evitar simplifica e nada aqui é grande.
    while (i < pacotes.length) {
      const s = segmentos(pacotes[i].dados.length);
      if (tabela.length + s.length > 255) break;
      tabela.push(...s);
      dados.push(pacotes[i].dados);
      bytes += pacotes[i].dados.length;
      granule += pacotes[i].amostras;
      i++;
    }
    if (!dados.length) break;                     // pacote gigante: não trava

    const corpo = new Uint8Array(bytes);
    let off = 0;
    for (const d of dados) { corpo.set(d, off); off += d.length; }

    const ultima = i >= pacotes.length;
    partes.push(pagina(corpo, tabela, ultima ? 0x04 : 0x00, granule, serial, seq++));
  }

  const total = partes.reduce((s, p) => s + p.length, 0);
  const saida = new Uint8Array(total);
  let off = 0;
  for (const p of partes) { saida.set(p, off); off += p.length; }
  return saida;
}

export interface ResultadoRemux {
  ok: boolean;
  ogg?: Uint8Array;
  erro?: string;
  pacotes?: number;
  /** Duração em segundos — serve de conferência: zero é sinal de que a varredura
   *  não achou áudio, mesmo tendo produzido arquivo. */
  duracao?: number;
}

/**
 * WebM/Opus → Ogg/Opus.
 *
 * Devolve veredito em vez de lançar: quem chama precisa dizer ao atendimento o
 * que houve, e uma exceção viraria "erro interno" numa tela onde a pessoa
 * acabou de gravar a voz dela.
 */
export function webmParaOgg(webm: Uint8Array, serial?: number): ResultadoRemux {
  let extraido: AudioExtraido;
  try {
    extraido = extrairOpus(webm);
  } catch (e) {
    return { ok: false, erro: `não consegui ler o webm: ${(e as Error)?.message ?? e}` };
  }
  if (!extraido.pacotes.length) {
    return { ok: false, erro: "não encontrei áudio dentro do arquivo gravado." };
  }
  const amostras = extraido.pacotes.reduce((s, p) => s + p.amostras, 0);
  return {
    ok: true,
    ogg: montarOgg(extraido.pacotes, extraido.canais, extraido.preSkip,
                   serial, extraido.cabecalho),
    pacotes: extraido.pacotes.length,
    duracao: amostras / 48000,
  };
}

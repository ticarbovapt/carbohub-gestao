import { describe, it, expect } from "vitest";
import {
  leVint, amostrasDoPacote, crcOgg, montarOgg, extrairOpus, webmParaOgg,
} from "../../../supabase/functions/_shared/webmParaOgg.ts";

// ─── Um WebM de mentira, montado à mão ───────────────────────────────────────
//
// ⚠️ Vale mais que um arquivo gravado guardado no repo: aqui dá para forçar o
// caso que quebra parser ingênuo — Segment e Cluster com TAMANHO DESCONHECIDO,
// que é justamente como o MediaRecorder grava.

function tamanho(n: number): number[] {
  // 2 bytes chegam para tudo que se monta aqui (marcador 0x40).
  return [0x40 | ((n >> 8) & 0x3f), n & 0xff];
}

/** Um elemento EBML com tamanho declarado — o id já vem com marcador. */
function elem(id: number[], conteudo: number[]): number[] {
  return [...id, ...tamanho(conteudo.length), ...conteudo];
}

/** Um SimpleBlock sem lacing: trilha 1, timecode 0, flags 0. */
function bloco(pacote: number[]): number[] {
  return elem([0xa3], [0x81, 0x00, 0x00, 0x00, ...pacote]);
}

// TOC config 5 → SILK banda média, quadro de 20 ms. `c = 0` é um quadro só.
const TOC_20MS = (5 << 3);
const pacote20ms = (enchimento = 3) => [TOC_20MS, ...Array(enchimento).fill(0xaa)];

/**
 * ⚠️ O Cluster vai com tamanho DESCONHECIDO (0xff), que é como o MediaRecorder
 * grava — é justamente o caso que derruba parser ingênuo, e por isso o teste
 * usa ele em vez do caminho fácil.
 */
function webmDeMentira(quantosBlocos: number): Uint8Array {
  const canais = elem([0x9f], [0x01]);
  const audio  = elem([0xe1], canais);
  const trilha = elem([0xae], audio);
  const tracks = elem([0x16, 0x54, 0xae, 0x6b], trilha);

  const bytes: number[] = [...tracks, 0x1f, 0x43, 0xb6, 0x75, 0xff];
  for (let i = 0; i < quantosBlocos; i++) bytes.push(...bloco(pacote20ms()));
  return new Uint8Array(bytes);
}

describe("leVint", () => {
  it("lê tamanho de 1 e de 2 bytes", () => {
    expect(leVint(new Uint8Array([0x85]), 0, false)).toMatchObject({ valor: 5, tamanho: 1 });
    expect(leVint(new Uint8Array([0x40, 0x2e]), 0, false)).toMatchObject({ valor: 46, tamanho: 2 });
  });

  it("⚠️ reconhece o tamanho DESCONHECIDO — é assim que o MediaRecorder grava", () => {
    // Sem isto, o primeiro cluster é lido como se tivesse 2^56 bytes e o
    // parser sai do arquivo.
    expect(leVint(new Uint8Array([0xff]), 0, false).desconhecido).toBe(true);
    expect(leVint(new Uint8Array([0x85]), 0, false).desconhecido).toBe(false);
  });

  it("ID mantém o marcador, tamanho não", () => {
    const b = new Uint8Array([0xa3]);
    expect(leVint(b, 0, true).valor).toBe(0xa3);
    expect(leVint(b, 0, false).valor).toBe(0x23);
  });
});

describe("amostrasDoPacote — a duração que vira o granule", () => {
  it("20 ms a 48 kHz são 960 amostras", () => {
    // config 5 = SILK banda média, quadro de 20 ms.
    expect(amostrasDoPacote(new Uint8Array([5 << 3]))).toBe(960);
    // ⚠️ E config 4 é 10 ms, não 20: a tabela é por configuração, não por
    // "todo mundo grava 20 ms".
    expect(amostrasDoPacote(new Uint8Array([4 << 3]))).toBe(480);
  });

  it("10 ms dão 480, e 60 ms dão 2880", () => {
    expect(amostrasDoPacote(new Uint8Array([0x00]))).toBe(480);   // config 0 = 10ms
    expect(amostrasDoPacote(new Uint8Array([0x18]))).toBe(2880);  // config 3 = 60ms
  });

  it("dois quadros no pacote valem o dobro", () => {
    // c = 1 → dois quadros de 20 ms.
    expect(amostrasDoPacote(new Uint8Array([(5 << 3) | 1]))).toBe(1920);
  });

  it("pacote vazio não explode", () => {
    expect(amostrasDoPacote(new Uint8Array([]))).toBe(0);
  });
});

describe("crcOgg", () => {
  it("⚠️ é o CRC do Ogg, não o do zip", () => {
    // Valor de referência do polinômio 0x04c11db7 sem reflexão nem inversão.
    // Se alguém "simplificar" para o CRC32 comum, este número muda e nenhum
    // player abre o arquivo.
    // Referência calculada bit a bit, SEM tabela — se a construção da tabela
    // estiver errada (o erro provável), estes números não batem.
    expect(crcOgg(new Uint8Array([0x00]))).toBe(0);
    expect(crcOgg(new TextEncoder().encode("OggS"))).toBe(0x5fb0a94f);
    expect(crcOgg(new TextEncoder().encode("carbohub"))).toBe(0x6f2dce85);
  });
});

describe("extrairOpus", () => {
  it("acha os pacotes mesmo com cluster de tamanho desconhecido", () => {
    const r = extrairOpus(webmDeMentira(5));
    expect(r.pacotes).toHaveLength(5);
    expect(r.canais).toBe(1);
    expect(r.pacotes[0].amostras).toBe(960);
  });

  it("⚠️ não conta o mesmo bloco duas vezes", () => {
    // O mestre de tamanho desconhecido consome o resto do arquivo; se o laço
    // continuasse depois dele, cada pacote entraria de novo e o áudio sairia
    // dobrado — defeito que produz arquivo VÁLIDO, com o dobro da duração.
    const r = extrairOpus(webmDeMentira(3));
    expect(r.pacotes).toHaveLength(3);
  });

  it("arquivo sem áudio devolve lista vazia, sem lançar", () => {
    expect(extrairOpus(new Uint8Array([0x1a, 0x45, 0xdf, 0xa3])).pacotes).toHaveLength(0);
  });
});

describe("montarOgg", () => {
  const pacotes = Array.from({ length: 4 }, () => ({
    dados: new Uint8Array(pacote20ms()), amostras: 960,
  }));

  it("começa com OggS e traz OpusHead na primeira página", () => {
    const ogg = montarOgg(pacotes, 1, 312);
    const txt = new TextDecoder("latin1").decode(ogg);
    expect(txt.slice(0, 4)).toBe("OggS");
    expect(txt.slice(28, 36)).toBe("OpusHead");
    expect(txt).toContain("OpusTags");
  });

  it("⚠️ OpusHead sozinho na sua página — a especificação exige", () => {
    const ogg = montarOgg(pacotes, 1, 312);
    // page_segments da primeira página, e o único segmento tem 19 bytes.
    expect(ogg[26]).toBe(1);
    expect(ogg[27]).toBe(19);
  });

  it("a primeira página é BOS e a última é EOS", () => {
    const ogg = montarOgg(pacotes, 1, 312);
    expect(ogg[5]).toBe(0x02);
    const ultima = ogg.lastIndexOf(0x53, ogg.length - 1); // ...S de OggS
    // Procura o último cabeçalho pela assinatura, em vez de calcular offsets.
    let pos = -1;
    for (let i = ogg.length - 4; i >= 0; i--) {
      if (ogg[i] === 0x4f && ogg[i+1] === 0x67 && ogg[i+2] === 0x67 && ogg[i+3] === 0x53) { pos = i; break; }
    }
    expect(ultima).toBeGreaterThan(0);
    expect(ogg[pos + 5]).toBe(0x04);
  });

  it("⚠️ o granule inclui o pre-skip e cresce com o áudio", () => {
    // Granule errado dá barra que não anda e duração mentirosa na bolinha.
    const ogg = montarOgg(pacotes, 1, 312);
    let pos = -1;
    for (let i = ogg.length - 4; i >= 0; i--) {
      if (ogg[i] === 0x4f && ogg[i+1] === 0x67 && ogg[i+2] === 0x67 && ogg[i+3] === 0x53) { pos = i; break; }
    }
    const granule = new DataView(ogg.buffer, ogg.byteOffset + pos + 6, 4).getUint32(0, true);
    expect(granule).toBe(312 + 4 * 960);
  });
});

describe("webmParaOgg — a ponta a ponta", () => {
  it("converte de contêiner e informa a duração", () => {
    const r = webmParaOgg(webmDeMentira(50));
    expect(r.ok).toBe(true);
    expect(r.pacotes).toBe(50);
    expect(r.duracao).toBeCloseTo(1.0, 3);   // 50 × 20 ms
    expect(new TextDecoder("latin1").decode(r.ogg!.slice(0, 4))).toBe("OggS");
  });

  it("⚠️ arquivo sem áudio RECUSA em vez de devolver ogg vazio", () => {
    // Um ogg de 0 s sobe, é aceito pela Meta e chega ao cliente como silêncio —
    // o defeito que passa por sucesso.
    const r = webmParaOgg(new Uint8Array([0x1a, 0x45, 0xdf, 0xa3]));
    expect(r.ok).toBe(false);
    expect(r.erro).toContain("áudio");
  });

  it("mais de 255 segmentos quebram em várias páginas", () => {
    // 300 pacotes não cabem numa página só; o teto é 255 segmentos.
    const r = webmParaOgg(webmDeMentira(300));
    expect(r.ok).toBe(true);
    let paginas = 0;
    const b = r.ogg!;
    for (let i = 0; i + 3 < b.length; i++) {
      if (b[i] === 0x4f && b[i+1] === 0x67 && b[i+2] === 0x67 && b[i+3] === 0x53) paginas++;
    }
    expect(paginas).toBeGreaterThan(3);   // 2 de cabeçalho + várias de áudio
  });
});

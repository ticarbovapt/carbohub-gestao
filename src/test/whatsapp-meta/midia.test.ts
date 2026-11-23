import { describe, it, expect } from "vitest";
import {
  conferirMidia, corpoDaMidia, mimeBase, aceitaLegenda, mimeDoArquivo,
} from "../../../supabase/functions/_shared/metaMidia.ts";

const MB = 1024 * 1024;

describe("mimeBase", () => {
  it("tira os parâmetros que o navegador acrescenta", () => {
    // ⚠️ É o caso real: o MediaRecorder devolve o codec junto, e comparar a
    // string inteira não casaria com nada.
    expect(mimeBase("audio/ogg;codecs=opus")).toBe("audio/ogg");
    expect(mimeBase("audio/webm; codecs=opus")).toBe("audio/webm");
    expect(mimeBase("IMAGE/JPEG")).toBe("image/jpeg");
  });

  it("mime vazio não explode", () => {
    expect(mimeBase("")).toBe("");
  });
});

describe("conferirMidia — o que a Meta aceita", () => {
  it("aceita jpeg e png", () => {
    expect(conferirMidia("image/jpeg", 2 * MB)).toMatchObject({ ok: true, tipo: "image" });
    expect(conferirMidia("image/png", 100_000)).toMatchObject({ ok: true, tipo: "image" });
  });

  it("aceita pdf como documento", () => {
    expect(conferirMidia("application/pdf", 3 * MB, "nota.pdf"))
      .toMatchObject({ ok: true, tipo: "document" });
  });

  it("aceita ogg e reconhece o codec no mime", () => {
    expect(conferirMidia("audio/ogg;codecs=opus", 200_000))
      .toMatchObject({ ok: true, tipo: "audio", mime: "audio/ogg" });
  });

  it("⚠️ ACEITA webm de áudio, mas marcado para remux — e o mime já sai ogg", () => {
    // Mudou por medição: antes recusávamos, e o Chrome caía no `audio/mp4`, que
    // a Meta aceita no upload e depois recusa na entrega com 131053. Como
    // webm/opus e ogg/opus carregam o MESMO codec, o servidor troca só o
    // contêiner (`webmParaOgg.ts`).
    //
    // ⚠️ O `mime` tem de sair `audio/ogg`: declarar webm à Meta é o 131053 de
    // volta, agora com outro nome.
    const r = conferirMidia("audio/webm;codecs=opus", 200_000);
    expect(r).toMatchObject({ ok: true, tipo: "audio", mime: "audio/ogg", remuxar: true });
  });

  it("⚠️ vídeo webm continua RECUSADO — ali trocar de contêiner não resolve", () => {
    // O codec é VP8/VP9; aceitar seria prometer uma conversão que não existe.
    const r = conferirMidia("video/webm", 2 * MB);
    expect(r.ok).toBe(false);
    expect(r.erro).toContain("mp4");
  });

  it("webm gigante é recusado pelo tamanho, não pelo tipo", () => {
    expect(conferirMidia("audio/webm;codecs=opus", 20 * MB).ok).toBe(false);
  });

  it("⚠️ recusa gif: comum no mundo, fora da lista dela", () => {
    expect(conferirMidia("image/gif", 100_000).ok).toBe(false);
  });

  it("recusa arquivo sem tipo", () => {
    expect(conferirMidia("", 100_000, "coisa").ok).toBe(false);
  });

  it("recusa arquivo vazio", () => {
    expect(conferirMidia("image/jpeg", 0).ok).toBe(false);
  });

  it("⚠️ o limite é o da Meta, e a frase diz os dois tamanhos", () => {
    const r = conferirMidia("image/jpeg", 6 * MB);
    expect(r.ok).toBe(false);
    expect(r.erro).toContain("5 MB");
    expect(r.erro).toContain("6 MB");
  });

  it("cada família tem o seu limite", () => {
    // Documento vai a 100 MB; áudio para em 16.
    expect(conferirMidia("application/pdf", 50 * MB).ok).toBe(true);
    expect(conferirMidia("audio/mpeg", 50 * MB).ok).toBe(false);
  });
});

describe("corpoDaMidia", () => {
  it("monta o corpo com o id, na chave do tipo", () => {
    const b = corpoDaMidia("5584987346304", "image", "media-1", "olha só");
    expect(b).toMatchObject({
      messaging_product: "whatsapp", to: "5584987346304", type: "image",
      image: { id: "media-1", caption: "olha só" },
    });
  });

  it("documento leva o nome do arquivo — é o que o cliente vê", () => {
    const b = corpoDaMidia("55849", "document", "m2", null, "NF-000515.pdf") as any;
    expect(b.document.filename).toBe("NF-000515.pdf");
  });

  it("⚠️ áudio NÃO leva legenda: a Meta ignora em silêncio", () => {
    // Uma legenda que some sem avisar faz quem atende achar que disse algo que
    // o cliente nunca leu.
    const b = corpoDaMidia("55849", "audio", "m3", "escuta isso") as any;
    expect(b.audio.caption).toBeUndefined();
    expect(aceitaLegenda("audio")).toBe(false);
    expect(aceitaLegenda("image")).toBe(true);
  });

  it("legenda em branco não vira caption vazio", () => {
    const b = corpoDaMidia("55849", "image", "m4", "   ") as any;
    expect(b.image.caption).toBeUndefined();
  });

  it("imagem não leva filename — só documento", () => {
    const b = corpoDaMidia("55849", "image", "m5", null, "foto.jpg") as any;
    expect(b.image.filename).toBeUndefined();
  });
});

describe("mimeDoArquivo — foto que o sistema chama de outro jeito (23/11/2026)", () => {
  it("image/jpg, image/pjpeg e image/x-png viram o nome certo", () => {
    expect(mimeDoArquivo("image/jpg")).toBe("image/jpeg");
    expect(mimeDoArquivo("image/pjpeg")).toBe("image/jpeg");
    expect(mimeDoArquivo("image/x-png")).toBe("image/png");
  });

  it("sem tipo ou genérico: vale a extensão", () => {
    expect(mimeDoArquivo("", "Foto 01.JPG")).toBe("image/jpeg");
    expect(mimeDoArquivo("application/octet-stream", "print.png")).toBe("image/png");
    expect(mimeDoArquivo("", "comprovante.pdf")).toBe("application/pdf");
  });

  it("tipo conhecido manda mais que a extensão", () => {
    expect(mimeDoArquivo("image/png", "foto.jpg")).toBe("image/png");
  });

  it("extensão desconhecida continua sem tipo — e é recusada com frase", () => {
    expect(mimeDoArquivo("", "foto.heic")).toBe("");
    expect(conferirMidia("", 100_000, "foto.heic")).toMatchObject({ ok: false });
  });

  it("conferirMidia aceita a foto com apelido", () => {
    expect(conferirMidia("image/jpg", 2 * MB, "foto.jpg"))
      .toMatchObject({ ok: true, tipo: "image", mime: "image/jpeg" });
    expect(conferirMidia("", 2 * MB, "foto.jpeg"))
      .toMatchObject({ ok: true, tipo: "image", mime: "image/jpeg" });
  });
});

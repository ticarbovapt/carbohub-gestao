import { describe, it, expect } from "vitest";
import {
  conversaAvulsa, type MensagemConversa,
} from "../../../apps/atendimento/src/lib/conversas";
import {
  tipoDaImagem, decisaoDaImagem,
} from "../../../apps/atendimento/src/lib/imagemParaEnvio";

const msg = (p: Partial<MensagemConversa>): MensagemConversa => ({
  wamid: "wamid.X", wa_id: "5511900000001", cliente: null,
  direcao: "entrada", tipo: "text", texto: "oi", midia_id: null,
  ocorrido_em: "2026-08-23T11:00:00Z", bling_id: null, sobre_a_etapa: null,
  vinculo_exato: false, botao_rastreio: null, numero_id: "1255756280958635",
  cliente_pedido: null, nome_whatsapp: "Cliente Teste", ...p,
});

describe("conversaAvulsa — ?de= fora da caixa abre ESSA conversa", () => {
  it("sem mensagens não inventa conversa", () => {
    expect(conversaAvulsa([])).toBeNull();
  });

  it("monta a conversa da pessoa certa, com a janela da última mensagem dela", () => {
    const c = conversaAvulsa([
      msg({ wamid: "a", ocorrido_em: "2026-08-01T10:00:00Z" }),
      msg({ wamid: "b", direcao: "saida", ocorrido_em: "2026-08-01T10:05:00Z", texto: "resposta" }),
      msg({ wamid: "c", ocorrido_em: "2026-08-02T09:00:00Z" }),
    ])!;
    expect(c.wa_id).toBe("5511900000001");
    expect(c.numero_id).toBe("1255756280958635");
    expect(c.janela_ate).toBe("2026-08-03T09:00:00.000Z");
    expect(c.mensagens).toHaveLength(3);
  });

  it("cliente que nunca escreveu: janela fechada (nula), nunca aberta", () => {
    const c = conversaAvulsa([msg({ direcao: "saida", tipo: "template", texto: "aviso" })])!;
    expect(c.janela_ate).toBeNull();
  });
});

describe("imagem para o WhatsApp", () => {
  it("corrige o apelido e usa a extensão quando falta o tipo", () => {
    expect(tipoDaImagem("image/jpg", "a.jpg")).toBe("image/jpeg");
    expect(tipoDaImagem("", "Foto.JPEG")).toBe("image/jpeg");
    expect(tipoDaImagem("application/octet-stream", "print.png")).toBe("image/png");
    expect(tipoDaImagem("image/webp", "x.webp")).toBe("image/webp");
  });

  it("JPEG/PNG até 5 MB passam; o resto é convertido", () => {
    expect(decisaoDaImagem("image/jpeg", 4_000_000)).toBe("passa");
    expect(decisaoDaImagem("image/png", 5 * 1024 * 1024)).toBe("passa");
    expect(decisaoDaImagem("image/jpeg", 6_000_000)).toBe("converte");
    expect(decisaoDaImagem("image/webp", 100_000)).toBe("converte");
    expect(decisaoDaImagem("image/gif", 100_000)).toBe("converte");
  });
});

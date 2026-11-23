import { describe, it, expect } from "vitest";
import {
  conversaAvulsa, agruparConversas, pareceRespostaAutomatica, aplicarFiltrosDaCaixa,
  FILTROS_VAZIOS, quantosFiltrosAtivos, type MensagemConversa,
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

describe("fase 2 — aviso automático não responde o cliente", () => {
  it("pergunta seguida de aviso automático continua esperando resposta", () => {
    const [c] = agruparConversas([
      msg({ wamid: "a", ocorrido_em: "2026-11-23T10:00:00Z", texto: "cadê meu pedido?" }),
      msg({ wamid: "b", direcao: "saida", tipo: "template", texto: "NF emitida",
            ocorrido_em: "2026-11-23T10:05:00Z", enviado_por_nome: null }),
    ], {});
    expect(c.aguardando).toBe(1);
    expect(c.status).toBe("aberto");
    expect(c.aguardando_desde).toBe("2026-11-23T10:00:00Z");
  });

  it("resposta de gente encerra a espera; modelo mandado por PESSOA também", () => {
    const [c1] = agruparConversas([
      msg({ wamid: "a", ocorrido_em: "2026-11-23T10:00:00Z" }),
      msg({ wamid: "b", direcao: "saida", tipo: "text", texto: "oi!", enviado_por_nome: "Ana",
            ocorrido_em: "2026-11-23T10:05:00Z" }),
    ], {});
    expect(c1.aguardando).toBe(0);
    expect(c1.status).toBe("em_atendimento");
    const [c2] = agruparConversas([
      msg({ wamid: "a", ocorrido_em: "2026-11-23T10:00:00Z" }),
      msg({ wamid: "b", direcao: "saida", tipo: "template", texto: "retomada", enviado_por_nome: "Ana",
            ocorrido_em: "2026-11-23T10:05:00Z" }),
    ], {});
    expect(c2.aguardando).toBe(0);
  });
});

describe("fase 2 — resposta automática do WhatsApp do cliente", () => {
  it("reconhece as que apareceram na tela", () => {
    expect(pareceRespostaAutomatica("ACAssistência agradece seu contato. Como podemos ajudar?")).toBe(true);
    expect(pareceRespostaAutomatica("Deixe seu nome e recado que retornamos")).toBe(true);
    expect(pareceRespostaAutomatica("Olá! Estamos fora do horário de atendimento.")).toBe(true);
    expect(pareceRespostaAutomatica("Mensagem automática: em breve retornaremos")).toBe(true);
  });
  it("não pega reclamação nem pergunta de cliente", () => {
    expect(pareceRespostaAutomatica("meu pedido não chegou, quero cancelar")).toBe(false);
    expect(pareceRespostaAutomatica("obrigada, chegou tudo certo")).toBe(false);
    expect(pareceRespostaAutomatica("qual o prazo de entrega?")).toBe(false);
  });
  it("vira sugestão na conversa, e vai para o fim da fila", () => {
    const lista = agruparConversas([
      msg({ wa_id: "1", wamid: "a", ocorrido_em: "2026-11-23T09:00:00Z",
            texto: "Fulano Advocacia agradece seu contato." }),
      msg({ wa_id: "2", wamid: "b", ocorrido_em: "2026-11-23T10:00:00Z", texto: "cadê meu pedido?" }),
    ], {});
    const ordenada = aplicarFiltrosDaCaixa(lista, FILTROS_VAZIOS);
    expect(ordenada.map((c) => c.wa_id)).toEqual(["2", "1"]);
    expect(ordenada[1].sugestao).toBe("automatica");
  });
});

describe("fase 2 — ordem padrão: esperando há mais tempo", () => {
  it("quem perguntou primeiro vem primeiro; sem espera vai para o fim", () => {
    const lista = agruparConversas([
      msg({ wa_id: "novo", wamid: "a", ocorrido_em: "2026-11-23T12:00:00Z", texto: "pergunta nova?" }),
      msg({ wa_id: "velho", wamid: "b", ocorrido_em: "2026-11-21T08:00:00Z", texto: "não recebi" }),
      msg({ wa_id: "velho", wamid: "c", ocorrido_em: "2026-11-23T12:30:00Z", texto: "e aí??" }),
      msg({ wa_id: "ok", wamid: "d", ocorrido_em: "2026-11-23T13:00:00Z", texto: "pergunta" }),
      msg({ wa_id: "ok", wamid: "e", direcao: "saida", tipo: "text", texto: "resp", enviado_por_nome: "Ana",
            ocorrido_em: "2026-11-23T13:05:00Z" }),
    ], {});
    expect(aplicarFiltrosDaCaixa(lista, FILTROS_VAZIOS).map((c) => c.wa_id))
      .toEqual(["velho", "novo", "ok"]);
    expect(quantosFiltrosAtivos(FILTROS_VAZIOS)).toBe(0);
  });
});

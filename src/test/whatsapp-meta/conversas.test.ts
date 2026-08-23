import { describe, it, expect, vi, afterEach } from "vitest";
import {
  agruparConversas, janelaAberta, faltaDaJanela, nivelDaJanela, fracaoDaJanela,
  pareceEncerramento,
  type MensagemConversa,
} from "../../../apps/admin/src/lib/conversas";

const AGORA = new Date("2026-08-23T12:00:00Z").getTime();

afterEach(() => vi.useRealTimers());
function congelar() {
  vi.useFakeTimers();
  vi.setSystemTime(AGORA);
}

const msg = (p: Partial<MensagemConversa>): MensagemConversa => ({
  wamid: "wamid.X", wa_id: "5584987346304", cliente: "Padilha",
  direcao: "entrada", tipo: "text", texto: "oi", midia_id: null,
  ocorrido_em: "2026-08-23T11:00:00Z", bling_id: null, sobre_a_etapa: null,
  vinculo_exato: false, botao_rastreio: null,
  cliente_pedido: null, nome_whatsapp: null, ...p,
});

describe("janelaAberta / faltaDaJanela", () => {
  it("aberta enquanto o fim está no futuro", () => {
    congelar();
    expect(janelaAberta("2026-08-23T13:00:00Z")).toBe(true);
    expect(janelaAberta("2026-08-23T11:59:59Z")).toBe(false);
  });

  it("⚠️ nunca escreveu = fechada, não aberta", () => {
    // O padrão precisa ser FECHADO: um null lido como aberto poria o campo de
    // resposta na tela para alguém escrever e levar 131047.
    expect(janelaAberta(null)).toBe(false);
    expect(faltaDaJanela(null)).toBe("");
  });

  it("mostra horas e minutos", () => {
    congelar();
    expect(faltaDaJanela("2026-08-23T14:30:00Z")).toBe("2h30");
    expect(faltaDaJanela("2026-08-23T12:45:00Z")).toBe("45 min");
  });

  it("já fechada devolve vazio em vez de tempo negativo", () => {
    congelar();
    expect(faltaDaJanela("2026-08-23T10:00:00Z")).toBe("");
  });
});

describe("agruparConversas", () => {
  it("agrupa por pessoa, não por pedido — a janela é da PESSOA", () => {
    congelar();
    const linhas = [
      msg({ wamid: "a", bling_id: 111, ocorrido_em: "2026-08-23T10:00:00Z" }),
      msg({ wamid: "b", bling_id: 222, ocorrido_em: "2026-08-23T11:00:00Z" }),
    ];
    const r = agruparConversas(linhas, { "5584987346304": "2026-08-23T13:00:00Z" });
    expect(r).toHaveLength(1);
    expect(r[0].mensagens).toHaveLength(2);
    // O assunto é o do contato mais recente.
    expect(r[0].bling_id).toBe(222);
  });

  it("ordena as mensagens da mais antiga para a mais nova", () => {
    const r = agruparConversas([
      msg({ wamid: "novo", ocorrido_em: "2026-08-23T11:00:00Z" }),
      msg({ wamid: "velho", ocorrido_em: "2026-08-23T09:00:00Z" }),
    ], {});
    expect(r[0].mensagens.map((m) => m.wamid)).toEqual(["velho", "novo"]);
  });

  it("conta como aguardando só o que veio DEPOIS da nossa última resposta", () => {
    const r = agruparConversas([
      msg({ wamid: "1", direcao: "entrada", ocorrido_em: "2026-08-23T09:00:00Z" }),
      msg({ wamid: "2", direcao: "saida",   ocorrido_em: "2026-08-23T09:30:00Z" }),
      msg({ wamid: "3", direcao: "entrada", ocorrido_em: "2026-08-23T10:00:00Z" }),
      msg({ wamid: "4", direcao: "entrada", ocorrido_em: "2026-08-23T10:05:00Z" }),
    ], {});
    expect(r[0].aguardando).toBe(2);
  });

  it("nossa palavra por último = nada aguardando", () => {
    const r = agruparConversas([
      msg({ wamid: "1", direcao: "entrada", ocorrido_em: "2026-08-23T09:00:00Z" }),
      msg({ wamid: "2", direcao: "saida",   ocorrido_em: "2026-08-23T09:30:00Z" }),
    ], {});
    expect(r[0].aguardando).toBe(0);
  });

  it("nunca respondemos: tudo do cliente está aguardando", () => {
    const r = agruparConversas([
      msg({ wamid: "1", ocorrido_em: "2026-08-23T09:00:00Z" }),
      msg({ wamid: "2", ocorrido_em: "2026-08-23T09:05:00Z" }),
    ], {});
    expect(r[0].aguardando).toBe(2);
  });

  it("⚠️ quem espera resposta vem primeiro, mesmo sendo mais antigo", () => {
    // Ordenar só por data deixaria uma pergunta de ontem com a janela quase
    // fechando ABAIXO de uma conversa já resolvida de agora.
    congelar();
    const r = agruparConversas([
      msg({ wamid: "a", wa_id: "111", direcao: "entrada", ocorrido_em: "2026-08-23T08:00:00Z" }),
      msg({ wamid: "b", wa_id: "222", direcao: "saida",   ocorrido_em: "2026-08-23T11:59:00Z" }),
    ], {});
    expect(r.map((c) => c.wa_id)).toEqual(["111", "222"]);
  });

  it("entre duas que esperam, a mais recente primeiro", () => {
    const r = agruparConversas([
      msg({ wamid: "a", wa_id: "111", ocorrido_em: "2026-08-23T08:00:00Z" }),
      msg({ wamid: "b", wa_id: "222", ocorrido_em: "2026-08-23T10:00:00Z" }),
    ], {});
    expect(r.map((c) => c.wa_id)).toEqual(["222", "111"]);
  });

  it("a janela vem do mapa de contatos, não das mensagens", () => {
    const r = agruparConversas([msg({})], {
      "5584987346304": "2026-08-24T00:00:00Z",
    });
    expect(r[0].janela_ate).toBe("2026-08-24T00:00:00Z");
  });

  it("pessoa sem entrada em contatos fica com janela nula — e fechada", () => {
    const r = agruparConversas([msg({ wa_id: "999" })], {});
    expect(r[0].janela_ate).toBeNull();
    expect(janelaAberta(r[0].janela_ate)).toBe(false);
  });

  it("o nome vem da primeira mensagem que tiver um", () => {
    // ⚠️ Passou a ler `nome_whatsapp`/`cliente_pedido` em vez do antigo campo
    // `cliente` da mensagem: agora são dois nomes com significados diferentes,
    // e "o nome" sozinho deixou de existir.
    const r = agruparConversas([
      msg({ wamid: "a", nome_whatsapp: null, ocorrido_em: "2026-08-23T09:00:00Z" }),
      msg({ wamid: "b", nome_whatsapp: "Padilha", ocorrido_em: "2026-08-23T10:00:00Z" }),
    ], {});
    expect(r[0].cliente).toBe("Padilha");
  });

  it("mensagem de mídia entra na conversa mesmo sem texto", () => {
    const r = agruparConversas([
      msg({ wamid: "img", tipo: "image", texto: null, midia_id: "1234" }),
    ], {});
    expect(r[0].mensagens).toHaveLength(1);
    expect(r[0].ultima_texto).toBeNull();
  });

  it("lista vazia não explode", () => {
    expect(agruparConversas([], {})).toEqual([]);
  });
});

describe("nivelDaJanela / fracaoDaJanela", () => {
  it("os cortes são de operação: 6h e 1h", () => {
    congelar();
    // Acima de 6 h dá para responder depois do almoço.
    expect(nivelDaJanela("2026-08-23T20:00:00Z")).toBe("folgada");
    // Entre 1 h e 6 h: aperta.
    expect(nivelDaJanela("2026-08-23T16:00:00Z")).toBe("apertando");
    // Menos de 1 h é agora.
    expect(nivelDaJanela("2026-08-23T12:30:00Z")).toBe("urgente");
    expect(nivelDaJanela("2026-08-23T11:00:00Z")).toBe("fechada");
  });

  it("⚠️ nunca escreveu é FECHADA, não folgada", () => {
    // Um null lido como folgada pintaria de verde uma conversa em que não dá
    // para responder — o oposto exato do que o sinal serve para dizer.
    expect(nivelDaJanela(null)).toBe("fechada");
  });

  it("a fração fica presa em [0,1] mesmo com relógio adiantado", () => {
    congelar();
    // Janela terminando daqui a 48 h: impossível, mas um relógio errado no
    // navegador produz isso — e a barra não pode passar da caixa.
    expect(fracaoDaJanela("2026-08-25T12:00:00Z")).toBe(1);
    expect(fracaoDaJanela("2026-08-22T12:00:00Z")).toBe(0);
    expect(fracaoDaJanela(null)).toBe(0);
  });

  it("metade da janela dá meia barra", () => {
    congelar();
    expect(fracaoDaJanela("2026-08-24T00:00:00Z")).toBeCloseTo(0.5, 2);
  });

  it("o nível concorda com janelaAberta — uma régua só", () => {
    congelar();
    for (const t of ["2026-08-23T20:00:00Z", "2026-08-23T12:30:00Z",
                     "2026-08-23T11:00:00Z", null]) {
      expect(nivelDaJanela(t) === "fechada").toBe(!janelaAberta(t));
    }
  });
});

describe("pareceEncerramento", () => {
  it("reconhece os 'ok' mais comuns", () => {
    for (const t of ["ok", "Ok", "OK!", "blz", "beleza", "obrigado", "Obg",
                     "vlw", "valeu", "certo", "entendi", "perfeito",
                     "Ok recebido", "Ok obrigado", "recebi obrigado",
                     "tudo certo", "show", "top", "👍", "ok 👍", "de nada"]) {
      expect(pareceEncerramento(t)).toBe(true);
    }
  });

  it("⚠️ agradecimento COM pergunta grudada nunca é encerramento", () => {
    // É o erro que não se pode cometer: sumir com uma pergunta de verdade.
    expect(pareceEncerramento("Ok mas não chegou")).toBe(false);
    expect(pareceEncerramento("obrigado, e o prazo?")).toBe(false);
    expect(pareceEncerramento("ok?")).toBe(false);
  });

  it("pergunta explícita nunca passa, por mais curta que seja", () => {
    expect(pareceEncerramento("?")).toBe(false);
    expect(pareceEncerramento("blz?")).toBe(false);
  });

  it("texto longo não vira sugestão de fechar", () => {
    // Uma reclamação de três linhas pode até começar com "ok".
    expect(pareceEncerramento(
      "ok, mas eu queria entender por que demorou tanto para postar, "
      + "porque eu comprei faz mais de uma semana")).toBe(false);
  });

  it("reclamação curta não é encerramento", () => {
    expect(pareceEncerramento("não chegou")).toBe(false);
    expect(pareceEncerramento("veio quebrado")).toBe(false);
    expect(pareceEncerramento("quero cancelar")).toBe(false);
  });

  it("vazio e nulo não são encerramento", () => {
    expect(pareceEncerramento(null)).toBe(false);
    expect(pareceEncerramento("")).toBe(false);
    // Só emoji desconhecido: sobrou nada de texto, mas também não há palavra
    // conhecida — não sugere.
    expect(pareceEncerramento("🤔")).toBe(false);
  });
});

describe("agruparConversas — o estado da conversa", () => {
  it("mensagem do cliente sem resposta nossa: precisa_resposta", () => {
    const r = agruparConversas([msg({ wamid: "1" })], {});
    expect(r[0].estado).toBe("precisa_resposta");
  });

  it("nossa palavra por último: sem_pendencia", () => {
    const r = agruparConversas([
      msg({ wamid: "1", direcao: "entrada", ocorrido_em: "2026-08-23T09:00:00Z" }),
      msg({ wamid: "2", direcao: "saida",   ocorrido_em: "2026-08-23T09:30:00Z" }),
    ], {});
    expect(r[0].estado).toBe("sem_pendencia");
  });

  it("⚠️ marcar resolvida zera a pendência SEM precisar responder o cliente", () => {
    // É o caso do "Ok obrigado": sem isto, a única forma de tirar da fila seria
    // mandar um "de nada".
    const r = agruparConversas(
      [msg({ wamid: "1", texto: "Ok obrigado", ocorrido_em: "2026-08-23T09:00:00Z" })],
      {}, { "5584987346304": "2026-08-23T09:30:00Z" });
    expect(r[0].aguardando).toBe(0);
    expect(r[0].estado).toBe("resolvida");
  });

  it("⚠️ mensagem DEPOIS da marca reabre sozinha", () => {
    // É por isso que a marca é uma data e não um booleano.
    const r = agruparConversas([
      msg({ wamid: "1", ocorrido_em: "2026-08-23T09:00:00Z" }),
      msg({ wamid: "2", ocorrido_em: "2026-08-23T11:00:00Z", texto: "e o prazo?" }),
    ], {}, { "5584987346304": "2026-08-23T10:00:00Z" });
    expect(r[0].aguardando).toBe(1);
    expect(r[0].estado).toBe("precisa_resposta");
  });

  it("vale o corte mais recente entre resposta e marca", () => {
    const r = agruparConversas([
      msg({ wamid: "1", direcao: "entrada", ocorrido_em: "2026-08-23T09:00:00Z" }),
      msg({ wamid: "2", direcao: "saida",   ocorrido_em: "2026-08-23T11:00:00Z" }),
    ], {}, { "5584987346304": "2026-08-23T10:00:00Z" });
    // A resposta é mais recente que a marca: sem pendência de qualquer jeito.
    expect(r[0].estado).toBe("sem_pendencia");
  });

  it("a sugestão olha a ÚLTIMA pendente, não a primeira", () => {
    const r = agruparConversas([
      msg({ wamid: "1", texto: "e o meu pedido?", ocorrido_em: "2026-08-23T09:00:00Z" }),
      msg({ wamid: "2", texto: "ok obrigado",    ocorrido_em: "2026-08-23T09:05:00Z" }),
    ], {});
    expect(r[0].parece_encerrada).toBe(true);
  });

  it("sem pendência não sugere nada", () => {
    const r = agruparConversas([
      msg({ wamid: "1", direcao: "entrada", texto: "ok", ocorrido_em: "2026-08-23T09:00:00Z" }),
      msg({ wamid: "2", direcao: "saida",   ocorrido_em: "2026-08-23T09:30:00Z" }),
    ], {});
    expect(r[0].parece_encerrada).toBe(false);
  });
});

describe("agruparConversas — os dois nomes", () => {
  it("⚠️ o nome do PEDIDO vem na frente: existe antes de a pessoa responder", () => {
    const r = agruparConversas([
      msg({ cliente_pedido: "Ataide Ferreira", nome_whatsapp: null }),
    ], {});
    expect(r[0].cliente).toBe("Ataide Ferreira");
    // Sem nome de WhatsApp não há segunda linha para mostrar.
    expect(r[0].nome_whatsapp).toBeNull();
  });

  it("nomes diferentes: o do WhatsApp vira a linha discreta", () => {
    const r = agruparConversas([
      msg({ cliente_pedido: "Mauro Silva", nome_whatsapp: "advmauro166" }),
    ], {});
    expect(r[0].cliente).toBe("Mauro Silva");
    expect(r[0].nome_whatsapp).toBe("advmauro166");
  });

  it("⚠️ nomes iguais NÃO repetem a linha — seria ruído", () => {
    const r = agruparConversas([
      msg({ cliente_pedido: "Ricardo Benvenuto", nome_whatsapp: "ricardo benvenuto" }),
    ], {});
    expect(r[0].cliente).toBe("Ricardo Benvenuto");
    expect(r[0].nome_whatsapp).toBeNull();
  });

  it("só o do WhatsApp: ele vira o principal, sem segunda linha", () => {
    // Quem escreveu sem nunca ter comprado — o número vira canal de entrada.
    const r = agruparConversas([
      msg({ cliente_pedido: null, nome_whatsapp: "Padilha" }),
    ], {});
    expect(r[0].cliente).toBe("Padilha");
    expect(r[0].nome_whatsapp).toBeNull();
  });

  it("sem nome nenhum continua nulo — a tela cai no número", () => {
    const r = agruparConversas([msg({})], {});
    expect(r[0].cliente).toBeNull();
  });

  it("pega o nome da primeira mensagem que tiver, não da última", () => {
    const r = agruparConversas([
      msg({ wamid: "a", cliente_pedido: null, ocorrido_em: "2026-08-23T09:00:00Z" }),
      msg({ wamid: "b", cliente_pedido: "Ataide", ocorrido_em: "2026-08-23T10:00:00Z" }),
    ], {});
    expect(r[0].cliente).toBe("Ataide");
  });
});

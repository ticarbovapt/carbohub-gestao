import { describe, it, expect, vi, afterEach } from "vitest";
import {
  agruparConversas, janelaAberta, faltaDaJanela,
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
  vinculo_exato: false, ...p,
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
    const r = agruparConversas([
      msg({ wamid: "a", cliente: null, ocorrido_em: "2026-08-23T09:00:00Z" }),
      msg({ wamid: "b", cliente: "Padilha", ocorrido_em: "2026-08-23T10:00:00Z" }),
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

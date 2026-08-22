import { describe, it, expect } from "vitest";
import {
  normalizarBR, limparParametro, formatarValor, montarPayload,
  ehTransitorio, detalheDoErro,
} from "../../../supabase/functions/_shared/metaTemplate.ts";

// As variáveis reais dos seis templates aprovados, copiadas do banco.
const VARS_ETIQUETA = [
  { nome: "primeiro_nome", de: "primeiro_nome", fallback: "tudo bem" },
  { nome: "pedido", de: "pedido" },
  { nome: "transportadora", de: "transportadora", fallback: "transportadora" },
  { nome: "rastreio", de: "rastreio" },
];

const VARS_A_CAMINHO = [
  ...VARS_ETIQUETA,
  { nome: "previsao", de: "previsao", fallback: "a confirmar" },
];

const LINHA = {
  primeiro_nome: "Ricardo",
  pedido: "CZ2026080042",
  transportadora: "Jadlog",
  rastreio: "AA123456789BR",
  previsao: "2026-08-26",
};

describe("normalizarBR", () => {
  it("aceita celular com DDD e prefixa o 55", () => {
    expect(normalizarBR("84987346304")).toBe("5584987346304");
  });

  it("aceita fixo de 10 dígitos", () => {
    expect(normalizarBR("8433334444")).toBe("558433334444");
  });

  it("tira máscara e espaços", () => {
    expect(normalizarBR(" (84) 98734-6304 ")).toBe("5584987346304");
  });

  it("não duplica o DDI quando ele já veio", () => {
    expect(normalizarBR("+55 84 98734-6304")).toBe("5584987346304");
  });

  it("tira zeros à esquerda do DDD", () => {
    expect(normalizarBR("084987346304")).toBe("5584987346304");
  });

  it("recusa número curto demais em vez de mandar torto", () => {
    expect(normalizarBR("98734")).toBeNull();
  });

  it("recusa número longo demais", () => {
    expect(normalizarBR("5584987346304999")).toBeNull();
  });

  it("recusa vazio e nulo", () => {
    expect(normalizarBR("")).toBeNull();
    expect(normalizarBR(null)).toBeNull();
    expect(normalizarBR(undefined)).toBeNull();
  });

  it("não confunde um fixo de SP começando com 55 com o DDI", () => {
    // (11) 5512-3456 → 1155123456. Começa com "11", não com "55": sem risco.
    // Mas 5551234567 (DDD 55, Santa Maria/RS) tem 10 dígitos e começa com 55 —
    // cortar o DDI aqui deixaria um número de 8 dígitos. O `length > 11` é o
    // que protege.
    expect(normalizarBR("5551234567")).toBe("555551234567");
  });
});

describe("limparParametro", () => {
  it("troca quebra de linha por espaço — 132007", () => {
    expect(limparParametro("Jadlog\n.Package")).toBe("Jadlog .Package");
  });

  it("colapsa espaços múltiplos", () => {
    expect(limparParametro("Correios     PAC")).toBe("Correios PAC");
  });

  it("tira tab", () => {
    expect(limparParametro("a\tb")).toBe("a b");
  });

  it("nulo vira string vazia, não 'null'", () => {
    expect(limparParametro(null)).toBe("");
    expect(limparParametro(undefined)).toBe("");
  });
});

describe("formatarValor", () => {
  it("data ISO vira DD/MM/AAAA", () => {
    expect(formatarValor("2026-08-26")).toBe("26/08/2026");
  });

  it("timestamp também, pelo prefixo", () => {
    expect(formatarValor("2026-08-26T15:00:00+00:00")).toBe("26/08/2026");
  });

  it("⚠️ não volta um dia: é troca de texto, não conversão de fuso", () => {
    // Com `new Date('2026-08-26')` + exibição em Brasília, sairia 25/08.
    expect(formatarValor("2026-08-26")).toBe("26/08/2026");
    expect(formatarValor("2026-01-01")).toBe("01/01/2026");
  });

  it("não mexe no que não é data", () => {
    expect(formatarValor("AA123456789BR")).toBe("AA123456789BR");
    expect(formatarValor("CZ2026080042")).toBe("CZ2026080042");
  });
});

describe("montarPayload — o caminho feliz", () => {
  it("monta o corpo com parameter_name na ordem do template", () => {
    const r = montarPayload("5584987346304", "pedido_aguardando_coleta", "pt_BR",
      VARS_ETIQUETA, LINHA, "rastreio");
    expect(r.faltando).toEqual([]);
    const t = r.body!.template as any;
    expect(t.name).toBe("pedido_aguardando_coleta");
    expect(t.language.code).toBe("pt_BR");
    expect(t.components[0].parameters.map((p: any) => p.parameter_name))
      .toEqual(["primeiro_nome", "pedido", "transportadora", "rastreio"]);
  });

  it("o botão é posicional (index 0) e leva SÓ o sufixo", () => {
    const r = montarPayload("5584987346304", "pedido_aguardando_coleta", "pt_BR",
      VARS_ETIQUETA, LINHA, "rastreio");
    const botao = (r.body!.template as any).components[1];
    expect(botao).toEqual({
      type: "button", sub_type: "url", index: "0",
      parameters: [{ type: "text", text: "AA123456789BR" }],
    });
  });

  it("⚠️ o botão NUNCA leva a URL inteira", () => {
    const r = montarPayload("5584987346304", "pedido_a_caminho", "pt_BR",
      VARS_A_CAMINHO,
      { ...LINHA, rastreio: "AA123456789BR",
        link_rastreio: "https://rastreio.carboze.com.br/rastreio/AA123456789BR" },
      "rastreio");
    const botao = (r.body!.template as any).components[1];
    expect(botao.parameters[0].text).toBe("AA123456789BR");
    expect(botao.parameters[0].text).not.toContain("http");
  });

  it("template sem botão não gera componente de botão", () => {
    const r = montarPayload("5584987346304", "pedido_entregue", "pt_BR",
      [{ nome: "primeiro_nome", de: "primeiro_nome", fallback: "tudo bem" },
       { nome: "pedido", de: "pedido" }],
      LINHA, null);
    expect((r.body!.template as any).components).toHaveLength(1);
  });

  it("formata a previsão dentro do payload", () => {
    const r = montarPayload("5584987346304", "pedido_a_caminho", "pt_BR",
      VARS_A_CAMINHO, LINHA, "rastreio");
    expect(r.valores.previsao).toBe("26/08/2026");
  });
});

describe("montarPayload — a regra que substituiu 'apaga a linha'", () => {
  it("sem fallback e sem valor: SEGURA, não manda vazio (132000)", () => {
    const r = montarPayload("5584987346304", "pedido_aguardando_coleta", "pt_BR",
      VARS_ETIQUETA, { ...LINHA, rastreio: null }, "rastreio");
    expect(r.body).toBeNull();
    expect(r.faltando).toContain("rastreio");
  });

  it("com fallback e sem valor: manda a reserva", () => {
    const r = montarPayload("5584987346304", "pedido_aguardando_coleta", "pt_BR",
      VARS_ETIQUETA, { ...LINHA, transportadora: null }, "rastreio");
    expect(r.faltando).toEqual([]);
    expect(r.valores.transportadora).toBe("transportadora");
  });

  it("previsão ausente NÃO segura o aviso de a caminho", () => {
    const r = montarPayload("5584987346304", "pedido_a_caminho", "pt_BR",
      VARS_A_CAMINHO, { ...LINHA, previsao: null }, "rastreio");
    expect(r.body).not.toBeNull();
    expect(r.valores.previsao).toBe("a confirmar");
  });

  it("⚠️ botão sem sufixo segura o envio: URL truncada é página de erro", () => {
    const r = montarPayload("5584987346304", "pedido_saiu_para_entrega", "pt_BR",
      [{ nome: "primeiro_nome", de: "primeiro_nome", fallback: "tudo bem" },
       { nome: "pedido", de: "pedido" },
       { nome: "rastreio", de: "rastreio" }],
      { ...LINHA, rastreio: "" }, "rastreio");
    expect(r.body).toBeNull();
    expect(r.faltando).toContain("rastreio");
    expect(r.faltando).toContain("botao:rastreio");
  });

  it("string em branco conta como vazia, não como valor", () => {
    const r = montarPayload("5584987346304", "nota_fiscal_emitida", "pt_BR",
      [{ nome: "nf", de: "nf" }], { nf: "   " }, null);
    expect(r.body).toBeNull();
    expect(r.faltando).toEqual(["nf"]);
  });

  it("⚠️ fallback em branco no banco não salva: reproduziria o 132000", () => {
    const r = montarPayload("5584987346304", "x", "pt_BR",
      [{ nome: "transportadora", de: "transportadora", fallback: "  " }],
      { transportadora: null }, null);
    expect(r.body).toBeNull();
    expect(r.faltando).toEqual(["transportadora"]);
  });

  it("lista TODAS as que faltam, não só a primeira", () => {
    const r = montarPayload("5584987346304", "pedido_aguardando_coleta", "pt_BR",
      VARS_ETIQUETA, { primeiro_nome: null, pedido: null, rastreio: null }, "rastreio");
    expect(r.faltando).toEqual(["pedido", "rastreio", "botao:rastreio"]);
  });

  it("nome vazio cai no fallback 'tudo bem' e não segura nada", () => {
    const r = montarPayload("5584987346304", "pedido_entregue", "pt_BR",
      [{ nome: "primeiro_nome", de: "primeiro_nome", fallback: "tudo bem" },
       { nome: "pedido", de: "pedido" }],
      { primeiro_nome: "", pedido: "CZ2026080042" }, null);
    expect(r.valores.primeiro_nome).toBe("tudo bem");
  });

  it("limpa o parâmetro antes de mandar — transportadora com quebra de linha", () => {
    const r = montarPayload("5584987346304", "pedido_aguardando_coleta", "pt_BR",
      VARS_ETIQUETA, { ...LINHA, transportadora: "Jadlog\n.Package  Centralizado" },
      "rastreio");
    expect(r.valores.transportadora).toBe("Jadlog .Package Centralizado");
    expect(r.valores.transportadora).not.toContain("\n");
  });

  it("lista de variáveis vazia produz template sem components", () => {
    const r = montarPayload("5584987346304", "hello_world", "en_US", [], {}, null);
    expect((r.body!.template as any).components).toBeUndefined();
  });
});

describe("ehTransitorio", () => {
  it("5xx e 429 valem repetir", () => {
    expect(ehTransitorio(500)).toBe(true);
    expect(ehTransitorio(503)).toBe(true);
    expect(ehTransitorio(429)).toBe(true);
  });

  it("rate limit da Cloud API vale repetir", () => {
    expect(ehTransitorio(400, 130429)).toBe(true);
    expect(ehTransitorio(400, 131056)).toBe(true);
  });

  it("⚠️ parâmetro errado NÃO vale repetir: repetir manda a mesma coisa torta", () => {
    expect(ehTransitorio(400, 132000)).toBe(false);
    expect(ehTransitorio(400, 132007)).toBe(false);
  });

  it("número sem WhatsApp não vale repetir", () => {
    expect(ehTransitorio(400, 131026)).toBe(false);
  });

  it("token revogado não vale repetir", () => {
    expect(ehTransitorio(401, 190)).toBe(false);
  });
});

describe("detalheDoErro", () => {
  it("prefere error_data.details, que é quem diz o campo", () => {
    expect(detalheDoErro({
      error: {
        message: "Parameter value is not valid",
        code: 132000,
        error_data: { details: "body: number of localizable_params (3) does not match" },
      },
    })).toContain("localizable_params");
  });

  it("cai no message quando não há details", () => {
    expect(detalheDoErro({ error: { message: "Invalid OAuth token", code: 190 } }))
      .toBe("Invalid OAuth token");
  });

  it("resposta sem erro devolve vazio", () => {
    expect(detalheDoErro({ messages: [{ id: "wamid.X" }] })).toBe("");
    expect(detalheDoErro(null)).toBe("");
  });
});

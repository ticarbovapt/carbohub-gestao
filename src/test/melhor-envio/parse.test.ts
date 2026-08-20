import { describe, it, expect } from "vitest";
import {
  paraLinha, pedidoDaLoja, destinatario, digitos, data, num, situacaoME,
  blingIdDoLink, urlRastreio,
} from "../../../supabase/functions/_shared/melhorEnvioParse";

/**
 * Testes da leitura do envio do Melhor Envio.
 *
 * ⚠️ O que está aqui é exatamente o que eu NÃO confirmei contra a API: o
 * caminho do destinatário, do CPF, do valor e do número do pedido da loja. É a
 * parte do código que pode estar errada sem dar erro nenhum — grava nulo e
 * segue.
 *
 * Os casos abaixo não são inventados. Os nomes são os reais desta base
 * ("Perivaldo, Silva Neves", "Leomir Da Motta Lopes Oliveira Lopes Oliveira"),
 * e a etiqueta "CarboZé #471" é a que aparece no painel na aba
 * "Aguardando envio".
 */

const envioBase = {
  id: 991,
  status: "released",
  created_at: "2026-08-10 09:15:00",
  paid_at: "2026-08-10 09:20:00",
  generated_at: "2026-08-10 10:02:00",
  tracking: "ap365371065br",
  self_tracking: null,
  protocol: "ORD-991",
  service: { name: ".Package", company: { name: "Jadlog", tracking_link: "https://x/y" } },
  delivery_max: 6,
  insurance_value: 209.4,
  price: 24.9,
  to: { name: "Perivaldo, Silva Neves", document: "123.456.789-09", postal_code: "59015-000" },
  tags: [{ tag: "CarboZé #419" }],
  invoice: { key: "3526081234567890001550010000002141000002140", number: "000214" },
};

describe("pedidoDaLoja", () => {
  it("extrai o número da tag do Minhas Vendas", () => {
    expect(pedidoDaLoja({ tags: [{ tag: "CarboZé #471" }] }).numero).toBe("471");
  });

  it("aceita tag como string pura", () => {
    expect(pedidoDaLoja({ tags: ["CarboZé #305"] }).numero).toBe("305");
  });

  it("aceita espaço depois do #", () => {
    expect(pedidoDaLoja({ tags: [{ tag: "Pedido # 287" }] }).numero).toBe("287");
  });

  it("aceita tag que é só o número", () => {
    expect(pedidoDaLoja({ tags: [{ tag: "362" }] }).numero).toBe("362");
  });

  /** ⚠️ Etiqueta avulsa — o caso das ~13 geradas fora do "Minhas Vendas".
   *  Tem que devolver null, nunca chutar. */
  it("devolve null quando não há tag nenhuma", () => {
    const r = pedidoDaLoja({ id: 1 });
    expect(r.numero).toBeNull();
    expect(r.cru).toBeNull();
  });

  /** O cru é o que salva quando o formato foge do regex: o dado fica visível
   *  para alguém ajustar a extração, em vez de virar coluna vazia sem pista. */
  it("guarda o texto cru mesmo sem conseguir extrair número", () => {
    const r = pedidoDaLoja({ tags: [{ tag: "reenvio garantia" }] });
    expect(r.numero).toBeNull();
    expect(r.cru).toBe("reenvio garantia");
  });

  it("não confunde outro número da tag com o pedido", () => {
    // Sem `#`, e com mais de 10 dígitos, não é número de pedido.
    expect(pedidoDaLoja({ tags: [{ tag: "12345678901234" }] }).numero).toBeNull();
  });
});

describe("destinatario", () => {
  it("normaliza CPF para só dígitos", () => {
    expect(destinatario({ to: { document: "123.456.789-09" } }).doc).toBe("12345678909");
  });

  it("normaliza CEP para só dígitos", () => {
    expect(destinatario({ to: { postal_code: "59015-000" } }).cep).toBe("59015000");
  });

  /** ⚠️ O nome real desta base. Guardamos como veio — casar por nome é que
   *  está proibido, e é por isso que o CPF existe. */
  it("preserva o nome bagunçado sem tentar limpar", () => {
    const n = "Leomir Da Motta Lopes Oliveira Lopes Oliveira";
    expect(destinatario({ to: { name: n } }).nome).toBe(n);
  });

  it("aceita CNPJ no lugar do CPF", () => {
    expect(destinatario({ to: { cnpj: "12.345.678/0001-95" } }).doc).toBe("12345678000195");
  });

  it("devolve null quando o destinatário não vem", () => {
    expect(destinatario({ id: 1 })).toEqual({ nome: null, doc: null, cep: null });
  });
});

describe("paraLinha", () => {
  it("lê o envio completo", () => {
    const l = paraLinha(envioBase);
    expect(l.me_id).toBe("991");
    expect(l.destinatario_doc).toBe("12345678909");
    expect(l.pedido_loja).toBe("419");
    expect(l.nf_numero).toBe("000214");
    expect(l.transportadora).toBe("Jadlog");
    expect(l.servico).toBe(".Package");
    expect(l.prazo_dias).toBe(6);
  });

  /** ⚠️ O erro mais caro possível nesta extração: `price` é o custo do FRETE.
   *  Usá-lo como valor faria a conciliação por valor errar em 100% dos casos,
   *  sem dar erro nenhum. */
  it("usa o valor declarado do conteúdo, não o preço do frete", () => {
    expect(paraLinha(envioBase).valor).toBe(209.4);
  });

  it("normaliza os códigos para maiúscula", () => {
    // O Bling grava um formato e o ME lista outro; a comparação tem que ser
    // insensível à caixa, e normalizar na gravação resolve de uma vez.
    expect(paraLinha(envioBase).tracking).toBe("AP365371065BR");
  });

  it("converte a data sem T nem fuso", () => {
    expect(paraLinha(envioBase).gerado_em).toBe(new Date("2026-08-10T10:02:00").toISOString());
  });

  it("não inventa carimbo que não veio", () => {
    const l = paraLinha(envioBase);
    expect(l.postado_em).toBeNull();
    expect(l.entregue_em).toBeNull();
    expect(l.cancelado_em).toBeNull();
  });

  /** Etiqueta gerada e ainda sem código — o estado dos 19 que motivaram a
   *  tabela ser chaveada por `me_id` e não por `codigo`. */
  it("aceita envio sem código de rastreio nenhum", () => {
    const l = paraLinha({ id: 7, generated_at: "2026-08-18 08:00:00" });
    expect(l.me_id).toBe("7");
    expect(l.tracking).toBeNull();
    expect(l.self_tracking).toBeNull();
    expect(l.gerado_em).not.toBeNull();
  });
});

describe("situacaoME", () => {
  it("cancelado ganha de todo o resto", () => {
    expect(situacaoME({
      cancelado_em: "x", entregue_em: "x", postado_em: "x", gerado_em: "x",
    })).toBe("cancelado");
  });

  /** ⚠️ Etiqueta vencida CONTINUA tendo generated_at. Chamá-la de "gerada"
   *  faria a esteira prometer um envio que não vai acontecer. */
  it("vencido ganha de gerado", () => {
    expect(situacaoME({ expirado_em: "x", gerado_em: "x" })).toBe("vencido");
  });

  it("entregue ganha de postado", () => {
    expect(situacaoME({ entregue_em: "x", postado_em: "x" })).toBe("entregue");
  });

  it("sem carimbo nenhum é rascunho", () => {
    expect(situacaoME({})).toBe("rascunho");
  });
});

describe("helpers", () => {
  it("digitos devolve null para string sem dígito", () => {
    expect(digitos("—")).toBeNull();
    expect(digitos(null)).toBeNull();
  });

  it("data devolve null para lixo", () => {
    expect(data("não é data")).toBeNull();
    expect(data(null)).toBeNull();
  });

  /** ⚠️ Zero é valor, string vazia não é. `Number("")` é 0, e sem este
   *  cuidado um campo vazio viraria "valor zero" — que passaria por dado. */
  it("num distingue zero de vazio", () => {
    expect(num(0)).toBe(0);
    expect(num("")).toBeNull();
    expect(num(null)).toBeNull();
    expect(num("209.40")).toBe(209.4);
  });
});

/**
 * ⚠️ REGRESSÃO — o bug que derrubou a função em produção.
 *
 * `brutos.map(paraLinha)` entrega TRÊS argumentos: (valor, índice, array). O
 * índice caía no segundo parâmetro, que era `agora = new Date()`. O primeiro
 * elemento recebia `0`, e `agora.toISOString()` estourava — a promessa
 * rejeitava fora do try, e o runtime devolvia "Internal Server Error" sem
 * corpo. Parecia função que não subiu.
 *
 * Os testes acima não pegaram porque todos chamam `paraLinha(envio)` com um
 * argumento só. Este chama do jeito errado de propósito.
 */
describe("paraLinha via Array.map (regressão)", () => {
  it("sobrevive ao índice caindo no segundo argumento", () => {
    const linhas = [envioBase, { ...envioBase, id: 992 }].map(paraLinha);
    expect(linhas).toHaveLength(2);
    expect(linhas[0].me_id).toBe("991");
    expect(() => new Date(linhas[0].atualizado_em).toISOString()).not.toThrow();
    expect(new Date(linhas[0].atualizado_em).getFullYear()).toBeGreaterThan(2000);
  });

  it("aceita a data injetada quando ela é mesmo uma Date", () => {
    const d = new Date("2026-01-02T03:04:05.000Z");
    expect(paraLinha(envioBase, d).atualizado_em).toBe(d.toISOString());
  });
});

/**
 * ⚠️ O formato REAL das tags, medido em produção.
 *
 * O valor está em `url`, não em `tag`. A primeira versão lia a CHAVE e
 * devolvia "mi:reference_code" como se fosse o número do pedido — e o nome do
 * campo é o que enganou: só uma das quatro entradas contém uma URL de verdade.
 */
const TAGS_REAIS = [
  { tag: "mi:reference_code",   url: "423" },
  { tag: "mi:reference_link",   url: "https://www.bling.com.br/vendas.php#edit/26653104669" },
  { tag: "mi:marketplace_code", url: "486" },
  { tag: "mi:client_id",        url: "489" },
];

describe("tags da integração (formato real)", () => {
  it("lê o número da loja de mi:marketplace_code", () => {
    expect(pedidoDaLoja({ tags: TAGS_REAIS }).numero).toBe("486");
  });

  it("extrai o id interno do Bling do link", () => {
    expect(blingIdDoLink("https://www.bling.com.br/vendas.php#edit/26653104669"))
      .toBe("26653104669");
  });

  it("não confunde o link com número de pedido", () => {
    // O link tem "#edit/26653104669": o `#` está lá, e a heurística do "#NNN"
    // NÃO pode capturá-lo — daria um número de pedido que não existe.
    expect(pedidoDaLoja({ tags: TAGS_REAIS }).numero).not.toBe("26653104669");
  });

  it("guarda as três portas no mesmo envio", () => {
    const l = paraLinha({ ...envioBase, tags: TAGS_REAIS });
    expect(l.pedido_loja).toBe("486");
    expect(l.bling_numero).toBe("423");
    expect(l.bling_id_ref).toBe("26653104669");
  });

  it("ainda aceita o #471 de quem gera pelo Minhas Vendas", () => {
    expect(pedidoDaLoja({ tags: [{ tag: "CarboZé #471", url: null }] }).numero).toBe("471");
  });

  it("devolve null sem tag nenhuma", () => {
    expect(pedidoDaLoja({ id: 1 }).numero).toBeNull();
  });
});

describe("urlRastreio", () => {
  /** ⚠️ O `tracking_link` vem SEM o código. Guardar como veio daria um link
   *  para página vazia na mão do cliente. */
  it("junta a base com o código", () => {
    expect(urlRastreio("https://www.melhorrastreio.com.br/rastreio/", "AD820288115BR"))
      .toBe("https://www.melhorrastreio.com.br/rastreio/AD820288115BR");
  });

  it("acrescenta a barra quando falta", () => {
    expect(urlRastreio("https://x/r", "AB1")).toBe("https://x/r/AB1");
  });

  it("meio link é pior que link nenhum", () => {
    expect(urlRastreio("https://x/r/", null)).toBeNull();
    expect(urlRastreio(null, "AB1")).toBeNull();
  });

  it("usa o self_tracking quando não há tracking", () => {
    const l = paraLinha({
      tracking: null, self_tracking: "ME262CFVP55BR",
      service: { company: { tracking_link: "https://x/r/" } },
    });
    expect(l.url_rastreio).toBe("https://x/r/ME262CFVP55BR");
  });
});

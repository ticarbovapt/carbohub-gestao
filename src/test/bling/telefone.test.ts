import { describe, it, expect } from "vitest";
import { telefoneParaBling } from "../../../supabase/functions/_shared/telefoneBling";

/**
 * ⚠️ O caso que originou o arquivo está no primeiro teste, com o número real.
 * Cliente BILL AUTOPECAS, pedido de R$ 15.200, 25/08/2026: o Bling recusou o
 * CONTATO por causa do telefone, e sem contato não há pedido. Um campo sem
 * efeito fiscal nenhum travava o faturamento.
 */

describe("o caso real que travou o financeiro", () => {
  it("0843215585 é recusado, com aviso — e NÃO inventa o dígito que falta", () => {
    const r = telefoneParaBling("0843215585");
    // Tirando o 0 de interurbano sobram 9 dígitos: DDD 84 + 7. Fixo tem 8.
    expect(r.valor).toBeNull();
    expect(r.aviso).toContain("9 dígito(s)");
    expect(r.aviso).toContain("SEM telefone");
  });
});

describe("conserta o que dá para consertar", () => {
  it("tira o 0 de interurbano de um número completo", () => {
    expect(telefoneParaBling("08432155585").valor).toBe("(84) 3215-5585");
  });

  it("tira o 55 do país", () => {
    expect(telefoneParaBling("558432155585").valor).toBe("(84) 3215-5585");
  });

  it("⚠️ 55 sai ANTES do 0 — senão o DDD viraria 55 (Santa Maria)", () => {
    // "55" + "0" + "84..." : na ordem inversa sobraria "5584..." e o DDD lido
    // seria 55, mandando o contato para outra cidade.
    expect(telefoneParaBling("5508432155585").valor).toBe("(84) 3215-5585");
  });

  it("ignora pontuação de qualquer formato", () => {
    expect(telefoneParaBling("(84) 3215-5585").valor).toBe("(84) 3215-5585");
    expect(telefoneParaBling("84.3215.5585").valor).toBe("(84) 3215-5585");
    expect(telefoneParaBling(" 84 3215 5585 ").valor).toBe("(84) 3215-5585");
  });

  it("celular de 11 dígitos", () => {
    expect(telefoneParaBling("84991234567").valor).toBe("(84) 99123-4567");
  });

  it("fixo de 10 dígitos", () => {
    expect(telefoneParaBling("1132155585").valor).toBe("(11) 3215-5585");
  });
});

describe("recusa o que não dá, e diz por quê", () => {
  it("vazio não é erro — não vira aviso", () => {
    expect(telefoneParaBling("")).toEqual({ valor: null, aviso: null });
    expect(telefoneParaBling(null)).toEqual({ valor: null, aviso: null });
    expect(telefoneParaBling(undefined)).toEqual({ valor: null, aviso: null });
  });

  it("curto demais", () => {
    const r = telefoneParaBling("32155585");
    expect(r.valor).toBeNull();
    expect(r.aviso).toContain("8 dígito(s)");
  });

  it("DDD que não existe", () => {
    const r = telefoneParaBling("2032155585");   // 20 não é DDD
    expect(r.valor).toBeNull();
    expect(r.aviso).toContain("DDD 20");
  });

  it("⚠️ 11 dígitos sem o 9 na frente não é celular", () => {
    const r = telefoneParaBling("84812345678");
    expect(r.valor).toBeNull();
    expect(r.aviso).toContain("nono não é 9");
  });

  it("sequência repetida é placeholder, não telefone", () => {
    expect(telefoneParaBling("8400000000").valor).toBeNull();
    expect(telefoneParaBling("8499999999").valor).toBeNull();
  });

  it("texto sem dígito", () => {
    const r = telefoneParaBling("não tem");
    expect(r.valor).toBeNull();
    expect(r.aviso).toContain("não tem dígito");
  });
});

describe("⚠️ nunca inventa número", () => {
  it("não completa dígito que falta", () => {
    // Se completasse com zero, sairia "(84) 3215-5850" — um telefone VÁLIDO no
    // formato e de outra pessoa na vida real. Alguém ligaria para um estranho
    // achando que era o cliente.
    for (const n of ["0843215585", "843215585", "8432155"]) {
      expect(telefoneParaBling(n).valor).toBeNull();
    }
  });

  it("o que sai é sempre um recorte do que entrou", () => {
    const saida = telefoneParaBling("08432155585").valor!;
    expect(saida.replace(/\D/g, "")).toBe("8432155585");
  });
});

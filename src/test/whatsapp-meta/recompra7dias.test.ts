import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { montarPayload } from "../../../supabase/functions/_shared/metaTemplate.ts";
// @ts-expect-error — módulo .mjs sem tipos (a fonte única dos textos)
import { TEXTOS, RODAPE, nomeMeta, etapa } from "../../../docs/whatsapp/recompra/textos.mjs";

const MIGRACAO = readFileSync("supabase/migrations/20261177000000_recompra_regua_de_7_dias.sql", "utf8");
const API = JSON.parse(readFileSync("docs/whatsapp/recompra/templates-meta-recompra.json", "utf8"));
const PROMPT = readFileSync("docs/whatsapp/recompra/PROMPT-CLAUDE-NAVEGADOR.md", "utf8");

// As variáveis como a migração as grava (o link entra pela reserva depois).
const VARS = [
  { nome: "primeiro_nome", de: "primeiro_nome", fallback: "amigo" },
  { nome: "link_checkout", de: "link_checkout" },
];

describe("régua de recompra de 7 dias", () => {
  it("são 14: sete de sachê, sete de frasco, um por dia", () => {
    expect(TEXTOS).toHaveLength(14);
    for (const f of ["sache", "frasco"]) {
      expect(TEXTOS.filter((t: unknown[]) => t[0] === f).map((t: unknown[]) => t[1])).toEqual([1, 2, 3, 4, 5, 6, 7]);
    }
  });

  it("o JSON da Meta, o prompt e o espelho no banco carregam o MESMO texto", () => {
    for (const [f, d, , corpo] of TEXTOS) {
      const t = API.find((x: { name: string }) => x.name === nomeMeta(f, d));
      expect(t, nomeMeta(f, d)).toBeTruthy();
      expect(t.category).toBe("MARKETING");
      expect(t.language).toBe("pt_BR");
      expect(t.parameter_format).toBe("NAMED");
      expect(t.components[0].text).toBe(corpo);
      expect(t.components[1]).toEqual({ type: "FOOTER", text: RODAPE });
      expect(t.components.some((c: { type: string }) => c.type === "BUTTONS")).toBe(false);
      expect(PROMPT).toContain(corpo);
      expect(MIGRACAO).toContain(`('${etapa(f, d)}', '${nomeMeta(f, d)}'`);
      expect(MIGRACAO).toContain(`$t$${corpo}\n\n${RODAPE}$t$`);
    }
  });

  it("o rodapé é o do PDF e cabe nos 60 caracteres da Meta", () => {
    expect(RODAPE).toBe("Zé, do CarboZé 💚");
    expect([...RODAPE].length).toBeLessThanOrEqual(60);
  });

  it("cada corpo respeita as regras da Meta (1024, sem 4 espaços, variável fora das pontas)", () => {
    for (const [, , , corpo] of TEXTOS) {
      expect([...corpo].length).toBeLessThanOrEqual(1024);
      expect(corpo).not.toMatch(/ {4,}|\t/);
      expect(corpo).not.toMatch(/^\s*\{\{|\}\}\s*$/);
      // a ordem dos parâmetros nomeados segue a ordem em que aparecem
      expect(corpo.indexOf("{{primeiro_nome}}")).toBeLessThan(corpo.indexOf("{{link_checkout}}"));
    }
  });

  it("sem o link cadastrado, a mensagem ESPERA em vez de sair sem link", () => {
    const m = montarPayload("5500900000001", "carboze_recompra_sache_d1", "pt_BR", VARS, { primeiro_nome: "Ana" });
    expect(m.body).toBeNull();
    expect(m.faltando).toEqual(["link_checkout"]);
  });

  it("com o link na reserva, sai com os dois parâmetros nomeados; sem nome, 'amigo'", () => {
    const vars = [VARS[0], { ...VARS[1], fallback: "https://checkout.exemplo/sache" }];
    const m = montarPayload("5500900000001", "carboze_recompra_sache_d3", "pt_BR", vars, { primeiro_nome: "" });
    expect(m.faltando).toEqual([]);
    const params = (m.body as any).template.components[0].parameters;
    expect(params).toEqual([
      { type: "text", parameter_name: "primeiro_nome", text: "amigo" },
      { type: "text", parameter_name: "link_checkout", text: "https://checkout.exemplo/sache" },
    ]);
  });
});

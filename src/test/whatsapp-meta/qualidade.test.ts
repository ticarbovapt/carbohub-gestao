import { describe, it, expect } from "vitest";
import {
  comercialPausado, conferirTemplate, variaveisDoTexto,
  type TemplateMeta, type TemplateNosso,
} from "../../../supabase/functions/_shared/metaQualidade.ts";
// @ts-expect-error — módulo .mjs sem tipos (a fonte única dos textos)
import { TEXTOS, nomeMeta, etapa } from "../../../docs/whatsapp/recompra/textos.mjs";

describe("qualidade do número pausa o comercial", () => {
  it("limiar AMARELO pausa no amarelo e no vermelho, não no verde", () => {
    expect(comercialPausado("GREEN", "YELLOW", false).pausado).toBe(false);
    expect(comercialPausado("YELLOW", "YELLOW", false).pausado).toBe(true);
    expect(comercialPausado("RED", "YELLOW", false).pausado).toBe(true);
  });
  it("limiar VERMELHO só pausa no vermelho; sem limiar, nunca", () => {
    expect(comercialPausado("YELLOW", "RED", false).pausado).toBe(false);
    expect(comercialPausado("RED", "RED", false).pausado).toBe(true);
    expect(comercialPausado("RED", null, false).pausado).toBe(false);
  });
  it("nota desconhecida (leitura falhou, NA) NÃO pausa", () => {
    expect(comercialPausado(null, "YELLOW", false).pausado).toBe(false);
    expect(comercialPausado("NA", "YELLOW", false).pausado).toBe(false);
  });
  it("a pausa manual vence tudo", () => {
    expect(comercialPausado("GREEN", null, true)).toEqual({ pausado: true, motivo: "pausa manual (comercial_pausado)" });
  });
});

// O modelo como a Meta o devolve, montado a partir do MESMO texto do PDF.
const [f, d, , corpo] = TEXTOS[0];
const nosso: TemplateNosso = {
  etapa: etapa(f, d), meta_template_nome: nomeMeta(f, d), meta_idioma: "pt_BR",
  meta_variaveis: [{ nome: "primeiro_nome", fallback: "amigo" }, { nome: "link_checkout", fallback: "https://payt.site/x" }],
  meta_botao_url_de: null, meta_status: "APPROVED", texto: corpo,
};
const aprovado = (extra: Partial<TemplateMeta> = {}, comps?: TemplateMeta["components"]): TemplateMeta => ({
  name: nomeMeta(f, d), status: "APPROVED", language: "pt_BR", category: "MARKETING",
  parameter_format: "NAMED", quality_score: { score: "GREEN" },
  components: comps ?? [{ type: "BODY", text: corpo.replace(/\n/g, "\r\n") }], ...extra,
});

describe("conferência do modelo contra a Meta", () => {
  it("o aprovado igual ao nosso passa limpo (\\r\\n da Meta não conta)", () => {
    const c = conferirTemplate(nosso, aprovado());
    expect(c.problemas).toEqual([]);
    expect(c.avisos).toEqual([]);
    expect(c.ok).toBe(true);
  });
  it("modelo inexistente, recusado ou noutro idioma é PROBLEMA", () => {
    expect(conferirTemplate(nosso, null).ok).toBe(false);
    expect(conferirTemplate(nosso, aprovado({ status: "REJECTED" })).problemas[0]).toMatch(/REJECTED/);
    expect(conferirTemplate(nosso, aprovado({ language: "pt_PT" })).ok).toBe(false);
  });
  it("aprovado com variável por NÚMERO recusa o envio por nome", () => {
    const c = conferirTemplate(nosso, aprovado({ parameter_format: "POSITIONAL" },
      [{ type: "BODY", text: "Ei {{1}}, compre aqui {{2}} hoje" }]));
    expect(c.ok).toBe(false);
    expect(c.problemas.join()).toMatch(/NÚMERO/);
  });
  it("variável com nome diferente na Meta é problema", () => {
    const c = conferirTemplate(nosso, aprovado({}, [{ type: "BODY", text: corpo.replace("{{link_checkout}}", "{{link}}") }]));
    expect(c.ok).toBe(false);
    expect(c.problemas.join(" | ")).toMatch(/\{\{link\}\}.*não manda/);
  });
  it("rodapé e nota não-verde do modelo são AVISO, não problema", () => {
    const c = conferirTemplate(nosso, aprovado({ quality_score: { score: "YELLOW" } },
      [{ type: "BODY", text: corpo }, { type: "FOOTER", text: "Zé, do CarboZé 💚" }]));
    expect(c.ok).toBe(true);
    expect(c.rodape_na_meta).toBe("Zé, do CarboZé 💚");
    expect(c.avisos.join()).toMatch(/AMARELA/);
  });
  it("botão de link com variável sem parâmetro no envio é problema", () => {
    const c = conferirTemplate(nosso, aprovado({}, [{ type: "BODY", text: corpo },
      { type: "BUTTONS", buttons: [{ type: "URL", text: "Comprar", url: "https://payt.site/{{1}}" }] }]));
    expect(c.ok).toBe(false);
  });
  it("texto do espelho diferente do aprovado vira aviso dizendo onde", () => {
    const c = conferirTemplate({ ...nosso, texto: corpo.replace("10 sachês", "dez sachês") }, aprovado());
    expect(c.ok).toBe(true);
    expect(c.avisos.join()).toMatch(/difere/);
  });
  it("os 14 textos têm as duas variáveis, nesta ordem", () => {
    for (const [, , , t] of TEXTOS) expect(variaveisDoTexto(t)).toEqual(["primeiro_nome", "link_checkout"]);
  });
});

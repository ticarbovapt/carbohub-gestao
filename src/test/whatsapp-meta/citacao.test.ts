import { describe, it, expect } from "vitest";
import {
  comCitacao, corpoDaReacao, emojiValido, alvoDaConversa,
} from "../../../supabase/functions/_shared/waCitacao.ts";
import {
  reacoesDoCliente, resumoDaCitada, podeCitar, podeReagir, REACOES,
} from "../../../apps/atendimento/src/lib/conversas";

describe("comCitacao", () => {
  const texto = { messaging_product: "whatsapp", to: "5584999990000", type: "text", text: { body: "oi" } };

  it("põe o context.message_id que a Cloud API usa para citar", () => {
    expect(comCitacao(texto, "wamid.ABC")).toEqual({ ...texto, context: { message_id: "wamid.ABC" } });
  });
  it("sem citação, o envio sai exatamente como era", () => {
    expect(comCitacao(texto, null)).toBe(texto);
    expect(comCitacao(texto, "  ")).toBe(texto);
  });
});

describe("corpoDaReacao", () => {
  it("é a mensagem type=reaction com o alvo e o emoji", () => {
    expect(corpoDaReacao("5584", "wamid.X", "👍")).toEqual({
      messaging_product: "whatsapp", recipient_type: "individual", to: "5584",
      type: "reaction", reaction: { message_id: "wamid.X", emoji: "👍" },
    });
  });
  it("emoji vazio TIRA a reação (é o formato da Meta)", () => {
    expect((corpoDaReacao("5584", "wamid.X", "") as any).reaction.emoji).toBe("");
  });
});

describe("emojiValido", () => {
  it("aceita os do seletor, emoji composto e o vazio", () => {
    for (const e of REACOES) expect(emojiValido(e)).toBe(true);
    expect(emojiValido("👍🏽")).toBe(true);
    expect(emojiValido("")).toBe(true);
  });
  it("recusa texto, número, espaço e o que não é string", () => {
    expect(emojiValido("ok")).toBe(false);
    expect(emojiValido("👍 ok")).toBe(false);
    expect(emojiValido("1")).toBe(false);
    expect(emojiValido(":)")).toBe(false);
    expect(emojiValido(null)).toBe(false);
    expect(emojiValido("👍".repeat(9))).toBe(false);
  });
});

/** Um supabase de mentira: cada tabela devolve o que o teste mandar. */
function banco(tabelas: Record<string, { data?: unknown; error?: { message: string } | null }>) {
  const filtros: Record<string, Record<string, unknown>> = {};
  return {
    filtros,
    from(t: string) {
      filtros[t] = {};
      const r = tabelas[t] ?? { data: null };
      const q: any = {
        select: () => q,
        eq: (c: string, v: unknown) => { filtros[t][c] = v; return q; },
        limit: () => Promise.resolve({ data: r.data ?? [], error: r.error ?? null }),
        maybeSingle: () => Promise.resolve({ data: r.data ?? null, error: r.error ?? null }),
      };
      return q;
    },
  };
}

describe("alvoDaConversa", () => {
  it("acha a mensagem do cliente filtrando pelos TRÊS (wamid, número, cliente)", async () => {
    const sb = banco({ carbo_wa_mensagens: { data: { direcao: "entrada", tipo: "text" } } });
    expect(await alvoDaConversa(sb, "N1", "5584", "w1")).toEqual({ ok: true, direcao: "entrada", tipo: "text" });
    expect(sb.filtros.carbo_wa_mensagens).toEqual({ wamid: "w1", numero_id: "N1", wa_id: "5584" });
  });
  it("acha o aviso automático em carbo_msg_envios", async () => {
    const sb = banco({ carbo_wa_mensagens: { data: null }, carbo_msg_envios: { data: [{ wamid: "w2" }] } });
    expect(await alvoDaConversa(sb, "N1", "5584", "w2")).toEqual({ ok: true, direcao: "saida", tipo: "template" });
    expect(sb.filtros.carbo_msg_envios).toEqual({ wamid: "w2", numero_id: "N1", wa_id: "5584" });
  });
  it("de outra conversa, recusa", async () => {
    const sb = banco({ carbo_wa_mensagens: { data: null }, carbo_msg_envios: { data: [] } });
    const r = await alvoDaConversa(sb, "N1", "5584", "w3");
    expect(r.ok).toBe(false);
  });
  it("erro do banco é ERRO, não 'não é desta conversa'", async () => {
    const sb = banco({ carbo_wa_mensagens: { error: { message: "timeout" } } });
    const r = await alvoDaConversa(sb, "N1", "5584", "w1");
    expect(r).toEqual({ ok: false, erro: expect.stringContaining("timeout") });
  });
});

describe("reacoesDoCliente", () => {
  const r = (alvo: string, emoji: string | null, em: string) =>
    ({ direcao: "entrada" as const, tipo: "reaction", texto: emoji, reage_a: alvo, ocorrido_em: em });

  it("vale a ÚLTIMA reação do cliente em cada mensagem", () => {
    const m = reacoesDoCliente([r("a", "👍", "2026-11-26T10:00:00Z"), r("a", "❤️", "2026-11-26T10:05:00Z"),
                                r("b", "😂", "2026-11-26T10:01:00Z")]);
    expect(m.get("a")).toBe("❤️");
    expect(m.get("b")).toBe("😂");
  });
  it("reação TIRADA (sem emoji) apaga a anterior, mesmo fora de ordem na lista", () => {
    const m = reacoesDoCliente([r("a", null, "2026-11-26T10:05:00Z"), r("a", "👍", "2026-11-26T10:00:00Z")]);
    expect(m.has("a")).toBe(false);
  });
  it("ignora o que não é reação do cliente", () => {
    const m = reacoesDoCliente([
      { direcao: "saida", tipo: "reaction", texto: "👍", reage_a: "a", ocorrido_em: "2026-11-26T10:00:00Z" },
      { direcao: "entrada", tipo: "text", texto: "👍", reage_a: null, ocorrido_em: "2026-11-26T10:00:00Z" },
    ]);
    expect(m.size).toBe(0);
  });
});

describe("resumoDaCitada", () => {
  it("cliente pelo nome; aviso sem autor é 'Aviso automático'; nossa resposta pelo autor", () => {
    expect(resumoDaCitada({ direcao: "entrada", tipo: "text", texto: "Chegou quebrado", enviado_por_nome: null }, "Ana Teste"))
      .toEqual({ autor: "Ana Teste", trecho: "Chegou quebrado" });
    expect(resumoDaCitada({ direcao: "saida", tipo: "template", texto: "Saiu para entrega", enviado_por_nome: null }).autor)
      .toBe("Aviso automático");
    expect(resumoDaCitada({ direcao: "saida", tipo: "text", texto: "ok", enviado_por_nome: "Bia" }).autor).toBe("Bia");
  });
  it("mídia sem legenda vira o nome do tipo, e o nome de arquivo nosso não aparece", () => {
    expect(resumoDaCitada({ direcao: "entrada", tipo: "image", texto: null, enviado_por_nome: null }).trecho).toBe("Foto");
    expect(resumoDaCitada({ direcao: "saida", tipo: "audio", texto: "audio-1787495498124.ogg", enviado_por_nome: "Bia" }).trecho)
      .toBe("Áudio");
  });
  it("texto longo é cortado com reticências", () => {
    const t = resumoDaCitada({ direcao: "entrada", tipo: "text", texto: "x".repeat(300), enviado_por_nome: null }).trecho;
    expect(t.length).toBe(120);
    expect(t.endsWith("…")).toBe(true);
  });
});

describe("podeCitar / podeReagir", () => {
  it("não cita o que não chegou ao cliente", () => {
    expect(podeCitar({ wamid: "a", tipo: "text", status: "falhou" })).toBe(false);
    expect(podeCitar({ wamid: "a", tipo: "reaction", status: null })).toBe(false);
    expect(podeCitar({ wamid: "a", tipo: "template", status: "lido" })).toBe(true);
  });
  it("reage só à mensagem do CLIENTE", () => {
    expect(podeReagir({ wamid: "a", direcao: "entrada", tipo: "text" })).toBe(true);
    expect(podeReagir({ wamid: "a", direcao: "saida", tipo: "text" })).toBe(false);
    expect(podeReagir({ wamid: "a", direcao: "entrada", tipo: "reaction" })).toBe(false);
  });
});

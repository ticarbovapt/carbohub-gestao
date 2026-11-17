import { describe, it, expect } from "vitest";
import {
  FLUXOS, FLUXO, DESFECHOS, passoDe, faltando, lerValor, preencherMensagem, prazoDoCaso, proximosDe, etapaDoReembolso,
} from "../../../apps/atendimento/src/lib/posvendaCasos";

// Os desfechos que o banco aceita (CHECK de carbo_posvenda_casos, 20261173).
const DESFECHOS_DO_BANCO = [
  "troca", "reenvio", "reembolso_integral", "reembolso_parcial",
  "resolvido", "recusado", "sem_retorno", "sem_solucao", "cancelado",
];

describe("roteiros do pós-venda", () => {
  it("todo tipo e todo id respeitam o formato que o banco aceita", () => {
    for (const f of FLUXOS) {
      expect(f.tipo).toMatch(/^[a-z_]{2,40}$/);
      for (const p of f.passos) expect(p.id).toMatch(/^[a-z0-9_]{1,60}$/);
    }
  });

  it("os desfechos do código são os do banco", () => {
    expect(Object.keys(DESFECHOS).sort()).toEqual([...DESFECHOS_DO_BANCO].sort());
  });

  for (const f of FLUXOS) {
    describe(f.rotulo, () => {
      const ids = new Set(f.passos.map((p) => p.id));

      it("ids de passo únicos e início existente", () => {
        expect(ids.size).toBe(f.passos.length);
        expect(ids.has(f.inicio)).toBe(true);
      });

      it("toda opção leva a algum lugar, e a um só", () => {
        for (const p of f.passos) {
          // Só o passo do Financeiro não tem opção: quem o move é o banco.
          if (p.financeiro) expect(p.opcoes).toHaveLength(0);
          else expect(p.opcoes.length).toBeGreaterThan(0);
          for (const o of p.opcoes) {
            const destinos = [o.proximo, o.desfecho, o.mudaPara].filter(Boolean);
            expect(destinos, `${f.tipo}.${p.id}.${o.id}`).toHaveLength(1);
            if (o.proximo) expect(ids.has(o.proximo), `${f.tipo}.${p.id} → ${o.proximo}`).toBe(true);
            if (o.mudaPara) {
              expect(FLUXO[o.mudaPara]).toBeDefined();
              expect(o.mudaPara).not.toBe(f.tipo);
            }
          }
          expect(new Set(p.opcoes.map((o) => o.id)).size).toBe(p.opcoes.length);
        }
      });

      it("todo passo é alcançável a partir do início", () => {
        const vistos = new Set<string>();
        const fila = [f.inicio];
        while (fila.length) {
          const id = fila.pop()!;
          if (vistos.has(id)) continue;
          vistos.add(id);
          fila.push(...proximosDe(passoDe(f.tipo, id)!));
        }
        expect([...ids].filter((i) => !vistos.has(i))).toEqual([]);
      });

      it("de todo passo dá para chegar a um fim (desfecho ou outro roteiro)", () => {
        const termina = new Map<string, boolean>();
        const chega = (id: string, pilha: Set<string>): boolean => {
          if (termina.has(id)) return termina.get(id)!;
          if (pilha.has(id)) return false;
          pilha.add(id);
          const p = passoDe(f.tipo, id)!;
          const ok = p.opcoes.some((o) => o.desfecho || o.mudaPara || (o.proximo && chega(o.proximo, pilha)))
            || (!!p.financeiro && chega(p.financeiro.pago, pilha));
          pilha.delete(id);
          termina.set(id, ok);
          return ok;
        };
        for (const id of ids) expect(chega(id, new Set()), `${f.tipo}.${id}`).toBe(true);
      });
    });
  }
});

describe("reembolso pelo Financeiro (20261175)", () => {
  it("todo reembolso é pedir → esperar o Financeiro → mandar o comprovante, com ids fixos", () => {
    let n = 0;
    for (const f of FLUXOS) {
      for (const p of f.passos.filter((x) => x.reembolso)) {
        n++;
        const r = p.reembolso!;
        expect(p.id).toBe(`reembolso_${r.tipo}`);
        expect(r.aguarda).toBe(`${p.id}_financeiro`);
        expect(r.depois).toBe(`${p.id}_comprovante`);
        // Uma opção só, e ela leva ao passo de espera (é ele que o banco guarda).
        expect(p.opcoes.map((o) => o.proximo)).toEqual([r.aguarda]);
        const aguarda = passoDe(f.tipo, r.aguarda)!;
        expect(aguarda.financeiro).toEqual({ pago: r.depois, volta: p.id });
        const comp = passoDe(f.tipo, r.depois)!;
        expect(comp.comprovante).toBe(true);
        expect(comp.opcoes.every((o) => o.desfecho === `reembolso_${r.tipo}`)).toBe(true);
        expect(etapaDoReembolso(f.tipo, r.aguarda)).toBe("financeiro");
        expect(etapaDoReembolso(f.tipo, r.depois)).toBe("comprovante");
      }
    }
    expect(n).toBeGreaterThanOrEqual(10);
  });

  it("nenhum passo fora do roteiro do Financeiro encerra como reembolso", () => {
    for (const f of FLUXOS) for (const p of f.passos) for (const o of p.opcoes) {
      if (o.desfecho === "reembolso_parcial" || o.desfecho === "reembolso_integral") {
        expect(p.comprovante, `${f.tipo}.${p.id}`).toBe(true);
      }
    }
  });

  it("os campos do pedido de reembolso", () => {
    const p = passoDe("faltante", "reembolso_parcial")!;
    expect(faltando(p, {})).toEqual(["Valor a devolver (R$)", "Como devolver"]);
    expect(faltando(p, { valor: "12,30", forma: "pix" })).toEqual(["Chave Pix ou dados bancários"]);
    expect(faltando(p, { valor: "12,30", forma: "pix", dados: "chave@x.com" })).toEqual([]);
    expect(faltando(p, { valor: "12,30", forma: "estorno" })).toEqual([]);
  });
});

describe("ajudantes", () => {
  it("campos obrigatórios faltando", () => {
    const p = passoDe("faltante", "conferir")!;
    expect(faltando(p, {})).toEqual([]);
    expect(faltando(passoDe("faltante", "transportadora")!, {})).toEqual(["Protocolo da reclamação"]);
  });

  it("valor em reais", () => {
    expect(lerValor("13,50")).toBe(13.5);
    expect(lerValor("1.234,56")).toBe(1234.56);
    expect(lerValor("13.50")).toBe(13.5);
    expect(lerValor("R$ 149,00")).toBe(149);
    expect(lerValor("abc")).toBeNull();
    expect(lerValor("")).toBeNull();
    expect(lerValor("-3")).toBeNull();
  });

  it("mensagem com e sem nome", () => {
    const m = passoDe("faltante", "fotos")!.mensagem!;
    const cheia = preencherMensagem(m, { nome: "MARIA da silva", pedido: "CZ123" });
    expect(cheia.startsWith("Olá, Maria!")).toBe(true);
    expect(cheia).toContain("pedido CZ123");
    expect(preencherMensagem(m, { nome: null, pedido: "CZ1" }).startsWith("Olá! ")).toBe(true);
    expect(preencherMensagem(passoDe("nao_recebido", "vizinhos")!.mensagem!, { nome: "Ana" }))
      .toContain("entregue em [data da entrega]");
  });

  it("prazo de 30 dias só nos vícios", () => {
    const aberto = "2026-11-01T12:00:00Z";
    const p = prazoDoCaso("defeito", aberto, new Date("2026-11-21T12:00:00Z").getTime())!;
    expect(p.restam).toBe(10);
    expect(p.vencido).toBe(false);
    expect(prazoDoCaso("defeito", aberto, new Date("2026-12-05T12:00:00Z").getTime())!.vencido).toBe(true);
    expect(prazoDoCaso("arrependimento", aberto)).toBeNull();
  });
});

describe("assunto do WhatsApp → tipo sugerido", () => {
  it("todo tipo sugerido existe", async () => {
    const { TIPO_DO_ASSUNTO } = await import("../../../apps/atendimento/src/lib/posvendaCasos");
    for (const t of Object.values(TIPO_DO_ASSUNTO)) expect(FLUXO[t]).toBeDefined();
  });
  it("sem repetir e na ordem", async () => {
    const { tiposSugeridos } = await import("../../../apps/atendimento/src/lib/posvendaCasos");
    expect(tiposSugeridos(["avaria", "embalagem", "ameaca", "faltou_item"])).toEqual(["avaria", "faltante"]);
    expect(tiposSugeridos(["ameaca"])).toEqual([]);
  });
});

import { describe, it, expect } from "vitest";
import {
  FLUXOS, FLUXO, DESFECHOS, passoDe, faltando, lerValor, preencherMensagem, prazoDoCaso,
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
          expect(p.opcoes.length).toBeGreaterThan(0);
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
          for (const o of passoDe(f.tipo, id)!.opcoes) if (o.proximo) fila.push(o.proximo);
        }
        expect([...ids].filter((i) => !vistos.has(i))).toEqual([]);
      });

      it("de todo passo dá para chegar a um fim (desfecho ou outro roteiro)", () => {
        const termina = new Map<string, boolean>();
        const chega = (id: string, pilha: Set<string>): boolean => {
          if (termina.has(id)) return termina.get(id)!;
          if (pilha.has(id)) return false;
          pilha.add(id);
          const ok = passoDe(f.tipo, id)!.opcoes.some((o) => o.desfecho || o.mudaPara || (o.proximo && chega(o.proximo, pilha)));
          pilha.delete(id);
          termina.set(id, ok);
          return ok;
        };
        for (const id of ids) expect(chega(id, new Set()), `${f.tipo}.${id}`).toBe(true);
      });
    });
  }
});

describe("ajudantes", () => {
  it("campos obrigatórios faltando", () => {
    const p = passoDe("faltante", "reembolso_parcial")!;
    expect(faltando(p, {})).toEqual(["Valor devolvido (R$)"]);
    expect(faltando(p, { valor: " 12,30 " })).toEqual([]);
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

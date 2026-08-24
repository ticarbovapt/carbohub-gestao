import { describe, it, expect } from "vitest";
import {
  chaveDia, doDia, contar, aderenciaDe, resumirMes, agruparJanela, PESO_SITUACAO,
} from "../../../apps/crm/src/lib/rtmAgenda";

const linha = (data: string, situacao: string) =>
  ({ data_prevista: data, situacao }) as never;

describe("chaveDia / doDia — o dia é o de Brasília", () => {
  it("⚠️ não vira o dia, nem às 21h", () => {
    // `new Date("2026-08-24")` é meia-noite UTC e no Brasil volta como dia 23.
    // É o mesmo erro que jogava o faturamento do dia 31 para o mês seguinte.
    expect(chaveDia(doDia("2026-08-24"))).toBe("2026-08-24");
    expect(doDia("2026-08-24").getDate()).toBe(24);
  });

  it("chaveDia usa a data LOCAL, nunca toISOString", () => {
    const d = new Date(2026, 7, 24, 21, 30);   // 24/08 às 21h30 em Brasília
    expect(chaveDia(d)).toBe("2026-08-24");    // toISOString diria 2026-08-25
  });
});

describe("aderenciaDe — cancelada sai do denominador", () => {
  it("visita cancelada com motivo não é falha de execução", () => {
    const c = contar([linha("d", "concluida"), linha("d", "cancelada"), linha("d", "pendente")]);
    // 1 concluída ÷ (3 − 1 cancelada) = 50%
    expect(aderenciaDe(c, 3)).toBe(50);
  });

  it("⚠️ sem denominador devolve NULL, não zero", () => {
    // Zero planejadas não é 0% de aderência — é ausência de medida. Mostrar 0%
    // acusaria alguém de não cumprir um plano que não existe.
    expect(aderenciaDe(contar([]), 0)).toBe(null);
    expect(aderenciaDe(contar([linha("d", "cancelada")]), 1)).toBe(null);
  });

  it("tudo cumprido dá 100%", () => {
    const c = contar([linha("d", "concluida"), linha("d", "concluida")]);
    expect(aderenciaDe(c, 2)).toBe(100);
  });
});

describe("resumirMes", () => {
  const doMes = (d: string) => d.startsWith("2026-08");
  const dia = (planejadas: number, concluidas: number, canceladas = 0) =>
    ({ planejadas, pendentes: 0, em_andamento: 0, concluidas,
       nao_cumpridas: planejadas - concluidas - canceladas, canceladas });

  it("⚠️ a aderência do mês conta só os dias JÁ DECORRIDOS", () => {
    // Sobre o mês inteiro, no dia 3 ela diria 10% porque 27 dias não
    // aconteceram — e um indicador sempre vermelho ensina a ignorar a faixa.
    const m = new Map([
      ["2026-08-01", dia(2, 2)],
      ["2026-08-02", dia(2, 1)],
      ["2026-08-30", dia(10, 0)],   // futuro: entra na carga, não na aderência
    ]);
    const r = resumirMes(m, "2026-08-02", doMes);
    expect(r.planejadas).toBe(14);          // a carga do mês inteiro
    expect(r.aderencia).toBe(75);           // 3 de 4, só até o dia 2
  });

  it("⚠️ os dias vizinhos da grade não entram no indicador do mês", () => {
    // A grade de agosto começa em 27/jul: contá-lo inflaria a carga do mês.
    const m = new Map([["2026-07-27", dia(5, 5)], ["2026-08-03", dia(1, 1)]]);
    expect(resumirMes(m, "2026-08-31", doMes).planejadas).toBe(1);
  });
});

describe("agruparJanela", () => {
  const janela = [
    linha("2026-08-20", "nao_cumprida"),
    linha("2026-08-24", "concluida"),
    linha("2026-08-24", "pendente"),
    linha("2026-08-25", "pendente"),
    linha("2026-08-26", "pendente"),
    linha("2026-08-22", "concluida"),      // passado, mas cumprida: não é débito
  ];

  it("⚠️ atrasadas = não cumpridas de dias anteriores, e só elas", () => {
    const g = agruparJanela(janela, "2026-08-24", "2026-08-24");
    expect(g.atrasadas).toHaveLength(1);
    expect(g.atrasadas[0].data_prevista).toBe("2026-08-20");
  });

  it("⚠️ o dia âncora vem na ordem do polegar: o que dá para fazer primeiro", () => {
    const g = agruparJanela(janela, "2026-08-24", "2026-08-24");
    expect(g.doDia.map((l) => l.situacao)).toEqual(["pendente", "concluida"]);
    expect(PESO_SITUACAO.em_andamento).toBeLessThan(PESO_SITUACAO.pendente);
  });

  it("próximos dias agrupados e em ordem", () => {
    const g = agruparJanela(janela, "2026-08-24", "2026-08-24");
    expect(g.proximos.map(([d]) => d)).toEqual(["2026-08-25", "2026-08-26"]);
  });

  it("olhando um dia futuro, o passado não vira 'próximo'", () => {
    const g = agruparJanela(janela, "2026-08-26", "2026-08-24");
    expect(g.proximos).toHaveLength(0);
    expect(g.doDia).toHaveLength(1);
  });
});

import { describe, it, expect } from "vitest";
import {
  somarHorasUteis, horasUteisEntre, prazoResposta, textoPrazo, motivoDe, precisaDeAtencao, ehAntiga,
  compararPrioridade, estadoDoCaso, clienteRespondeu, passaFiltroCaso, MOTIVOS, tipoProvavel,
} from "../../../apps/atendimento/src/lib/posvendaFila";
import type { Pendencia } from "../../../apps/atendimento/src/hooks/usePendenciasEntrega";

// Instantes em Brasília (UTC−3), sem passar pelo fuso da máquina.
const br = (s: string) => new Date(`${s}-03:00`);

function pedido(over: Partial<Pendencia> = {}): Pendencia {
  return {
    bling_id: 1, pedido_numero: null, pedido_loja: null, pedido_codigo: "CZ1", canal: "PayT", data_pedido: "2026-11-10",
    total: 100, cliente: "Cliente Teste", cliente_fone: null, cidade: null, uf: null, etapa: "entregue", problema: null,
    desde: null, previsao: null, rastreio_status: null, transportadora: null, rastreio: null, url_rastreio: null,
    nf_numero: null, antes_do_corte: false, trato: null, caso: null, reclamacao: null, ...over,
  };
}
const rec = (over: Partial<NonNullable<Pendencia["reclamacao"]>> = {}) => ({
  n: 1, primeira_em: "2026-11-20T12:00:00Z", ultima_em: "2026-11-20T12:00:00Z",
  assuntos: [{ codigo: "atraso", rotulo: "Atraso" }], trecho: "cadê", wa_id: "5500", numero_id: "N1", pendente: true, ...over,
});

describe("prazo de 24 h úteis", () => {
  it("terça 10h vence quarta 10h", () => {
    expect(somarHorasUteis(br("2026-11-17T10:00:00")).toISOString()).toBe(br("2026-11-18T10:00:00").toISOString());
  });
  it("sexta 15h pula o fim de semana e vence segunda 15h", () => {
    expect(somarHorasUteis(br("2026-11-20T15:00:00")).toISOString()).toBe(br("2026-11-23T15:00:00").toISOString());
  });
  it("sábado 10h só começa a contar segunda 00h e vence terça 00h", () => {
    expect(somarHorasUteis(br("2026-11-21T10:00:00")).toISOString()).toBe(br("2026-11-24T00:00:00").toISOString());
  });
  it("horas úteis entre sexta 20h e segunda 02h são 6", () => {
    expect(horasUteisEntre(br("2026-11-20T20:00:00"), br("2026-11-23T02:00:00"))).toBe(6);
    expect(horasUteisEntre(br("2026-11-23T02:00:00"), br("2026-11-20T20:00:00"))).toBe(-6);
  });
  it("respondida, no prazo, vence logo e atrasada", () => {
    const agora = br("2026-11-18T08:00:00");
    expect(prazoResposta(pedido({ reclamacao: rec({ respondida_em: "2026-11-18T09:00:00Z" }) }), agora)?.situacao).toBe("respondida");
    expect(prazoResposta(pedido({ reclamacao: rec({ aguarda_desde: br("2026-11-17T20:00:00").toISOString() }) }), agora)?.situacao).toBe("no_prazo");
    expect(prazoResposta(pedido({ reclamacao: rec({ aguarda_desde: br("2026-11-17T12:00:00").toISOString() }) }), agora)?.situacao).toBe("vence_logo");
    const atr = prazoResposta(pedido({ reclamacao: rec({ aguarda_desde: br("2026-11-16T07:00:00").toISOString() }) }), agora)!;
    expect(atr.situacao).toBe("atrasada");
    expect(textoPrazo(atr)).toBe("atrasada 1d");
  });
  it("sem reclamação não há prazo", () => {
    expect(prazoResposta(pedido())).toBeNull();
  });
});

describe("a fila", () => {
  it("motivo: risco vence os outros assuntos; problema sem reclamação vira atraso ou entrega parada", () => {
    expect(motivoDe(pedido({ reclamacao: rec({ assuntos: [{ codigo: "atraso", rotulo: "" }, { codigo: "ameaca", rotulo: "" }] }) }))).toBe("risco");
    expect(motivoDe(pedido({ problema: "atrasado" }))).toBe("atraso");
    expect(motivoDe(pedido({ problema: "vencida" }))).toBe("parada");
    expect(motivoDe(pedido({ reclamacao: rec({ assuntos: [{ codigo: "outra_reclamacao", rotulo: "" }] }) }))).toBe("outro");
    expect(MOTIVOS.map((m) => m.id)).toContain("outro");
  });
  it("tipo provável: do assunto (o do motivo primeiro), do atraso na entrega, e nenhum para problema nosso", () => {
    expect(tipoProvavel(pedido({ reclamacao: rec({ assuntos: [{ codigo: "faltou_item", rotulo: "a" }, { codigo: "ameaca", rotulo: "b" }] }) }))).toBe("faltante");
    expect(tipoProvavel(pedido({ reclamacao: rec({ assuntos: [{ codigo: "atraso", rotulo: "a" }, { codigo: "avaria", rotulo: "b" }] }) }))).toBe("avaria");
    expect(tipoProvavel(pedido({ problema: "atrasado" }))).toBe("atraso");
    expect(tipoProvavel(pedido({ problema: "vencida" }))).toBeNull();
    expect(tipoProvavel(pedido({ reclamacao: rec({ assuntos: [{ codigo: "ameaca", rotulo: "a" }] }) }))).toBeNull();
  });
  it("precisa de atenção = a condição do banco", () => {
    expect(precisaDeAtencao(pedido({ reclamacao: rec() }))).toBe(true);
    expect(precisaDeAtencao(pedido({ reclamacao: rec({ pendente: false }) }))).toBe(false);
    expect(precisaDeAtencao(pedido({ problema: "atrasado" }))).toBe(true);
    expect(precisaDeAtencao(pedido({ problema: "atrasado", trato: { situacao: "resolvido", observacao: null, em: "", por: null } }))).toBe(false);
    expect(precisaDeAtencao(pedido({ problema: "atrasado", caso: {
      id: "c", tipo: "atraso", passo: "x", status: "aberto", desfecho: null, valor: null, aberto_em: "", atualizado_em: "" } }))).toBe(false);
  });
  it("antiga: só a reclamação de mais de 30 dias, e nunca quando há problema na entrega", () => {
    expect(ehAntiga(pedido({ reclamacao: rec({ antiga: true }) }))).toBe(true);
    expect(ehAntiga(pedido({ reclamacao: rec({ antiga: true }), problema: "atrasado" }))).toBe(false);
    expect(ehAntiga(pedido({ reclamacao: rec({ antiga: false }) }))).toBe(false);
  });
  it("prioridade: risco, depois o prazo que vence primeiro, depois o mais antigo", () => {
    const agora = br("2026-11-23T12:00:00");
    const risco = pedido({ bling_id: 1, reclamacao: rec({ assuntos: [{ codigo: "ameaca", rotulo: "" }], aguarda_desde: br("2026-11-23T11:00:00").toISOString() }) });
    const vence = pedido({ bling_id: 2, reclamacao: rec({ aguarda_desde: br("2026-11-20T10:00:00").toISOString() }) });
    const depois = pedido({ bling_id: 3, reclamacao: rec({ aguarda_desde: br("2026-11-23T10:00:00").toISOString() }) });
    const entrega = pedido({ bling_id: 4, problema: "vencida", desde: "2026-11-01T00:00:00Z" });
    const ordem = [entrega, depois, vence, risco].sort((a, b) => compararPrioridade(a, b, agora)).map((p) => p.bling_id);
    expect(ordem).toEqual([1, 2, 3, 4]);
  });
});

describe("os casos", () => {
  const caso = (over = {}) => ({
    id: "c", tipo: "atraso", passo: "rastreio", status: "aberto" as const, desfecho: null, valor: null,
    aberto_em: "2026-11-20T00:00:00Z", atualizado_em: "2026-11-20T00:00:00Z", ...over,
  });
  it("esperando o Financeiro manda sobre o estado gravado", () => {
    expect(estadoDoCaso({ tipo: "avaria", passo: "reembolso_integral_financeiro", estado: "aguardando_cliente" })).toBe("aguardando_financeiro");
    expect(estadoDoCaso({ tipo: "atraso", passo: "rastreio", estado: null })).toBe("em_atendimento");
  });
  it("cliente respondeu depois de o caso esperar por ele", () => {
    const p = pedido({
      caso: caso({ estado: "aguardando_cliente", estado_em: "2026-11-21T10:00:00Z" }),
      reclamacao: rec({ pendente: false, ultima_entrada_em: "2026-11-22T10:00:00Z" }),
    });
    expect(clienteRespondeu(p)).toBe(true);
    expect(clienteRespondeu({ ...p, reclamacao: rec({ ultima_entrada_em: "2026-11-20T10:00:00Z" }) })).toBe(false);
  });
  it("filtros: comigo, sem responsável", () => {
    const meu = pedido({ caso: caso({ responsavel: "eu" }) });
    const semDono = pedido({ caso: caso({ responsavel: null }) });
    expect(passaFiltroCaso(meu, "comigo", "eu")).toBe(true);
    expect(passaFiltroCaso(semDono, "comigo", "eu")).toBe(false);
    expect(passaFiltroCaso(semDono, "sem_dono", "eu")).toBe(true);
  });
});

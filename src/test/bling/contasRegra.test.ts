import { describe, it, expect } from "vitest";
import {
  censoBorderos, ultimoBordero,
  decidirBaixa, dataDaBaixa, planejarEspelho, idsDeBordero, diaBrasilia, conferirBaixa, lerAjustes,
  type LocalConta, type ListadaConta,
} from "../../../supabase/functions/_shared/blingContasRegra";

/**
 * ⚠️ O primeiro caso é o do ENSAIO real de 22/10/2026 (Bling 1, título a
 * receber 27180852028, R$ 832): o corpo que o ensaio mostrou é o que esta regra
 * tem de continuar produzindo — a mesma função serve à matriz e à filial.
 */
describe("decidirBaixa — a mesma regra para matriz e filial", () => {
  it("título em aberto com portador próprio: o corpo que o ensaio de 22/10 mostrou", () => {
    const d = { situacao: 1, valor: 832, saldo: 832, portador: { id: 14890150954 }, categoria: { id: 0 } };
    expect(decidirBaixa("receber", d, null, "2026-10-22", "nome de quem baixou")).toEqual({
      decisao: "enviar",
      corpo: {
        data: "2026-10-22",
        usarDataVencimento: false,
        portador: { id: 14890150954 },
        historico: "Baixa pelo CarboHub Finanças (nome de quem baixou)",
      },
      esperado: { saldoAntes: 832, principal: 832, valor: 832, parcial: false, saldoDepois: 0 },
    });
  });

  it("já pago no Bling: NÃO envia (borderô em dobro é o erro a evitar)", () => {
    expect(decidirBaixa("pagar", { situacao: 2 }, 1, "2026-10-22", null).decisao).toBe("ja_pago_no_bling");
  });

  it("devolvido ou cancelado: recusa", () => {
    expect(decidirBaixa("pagar", { situacao: 4, portador: { id: 1 } }, null, "2026-10-22", null).decisao).toBe("cancelado_no_bling");
    expect(decidirBaixa("pagar", { situacao: "5", portador: { id: 1 } }, null, "2026-10-22", null).decisao).toBe("cancelado_no_bling");
  });

  it("sem portador no título nem padrão: recusa dizendo o que falta", () => {
    const r = decidirBaixa("receber", { situacao: 1 }, null, "2026-10-22", null);
    expect(r.decisao).toBe("sem_portador");
  });

  it("sem portador no título usa o padrão da configuração", () => {
    const r = decidirBaixa("receber", { situacao: 1 }, 777, "2026-10-22", null);
    expect(r.decisao === "enviar" && r.corpo.portador).toEqual({ id: 777 });
  });

  it("parcial manda o SALDO, com o nome de campo do tipo", () => {
    const rec = decidirBaixa("receber", { situacao: 3, saldo: 100, portador: { id: 1 } }, null, "2026-10-22", null);
    const pag = decidirBaixa("pagar", { situacao: 3, saldo: 50, portador: { id: 1 } }, null, "2026-10-22", null);
    expect(rec.decisao === "enviar" && rec.corpo.valorRecebido).toBe(100);
    expect(pag.decisao === "enviar" && pag.corpo.valorPago).toBe(50);
  });

  it("categoria só a do próprio título", () => {
    const r = decidirBaixa("pagar", { situacao: 1, portador: { id: 1 }, categoria: { id: 9 } }, null, "2026-10-22", null);
    expect(r.decisao === "enviar" && r.corpo.categoria).toEqual({ id: 9 });
  });
});

describe("decidirBaixa com o que a pessoa escolheu no diálogo", () => {
  const aberto = { situacao: 1, valor: 250, saldo: 250, portador: { id: 1 } };

  it("a conta escolhida na tela vence a do título", () => {
    const r = decidirBaixa("pagar", aberto, 9, "2026-10-22", null, { portadorId: 55 });
    expect(r.decisao === "enviar" && r.corpo.portador).toEqual({ id: 55 });
  });

  it("juros e multa somam no valor pago e vão nos campos do Bling (multa = acrescimo)", () => {
    const r = decidirBaixa("pagar", aberto, null, "2026-10-22", null, { juros: 5, multa: 2.5 });
    expect(r.decisao).toBe("enviar");
    if (r.decisao !== "enviar") return;
    expect(r.corpo).toMatchObject({ juros: 5, acrescimo: 2.5, valorPago: 257.5 });
    expect(r.esperado).toEqual({ saldoAntes: 250, principal: 250, valor: 257.5, parcial: false, saldoDepois: 0 });
  });

  it("desconto abate do valor recebido e quita o título", () => {
    const r = decidirBaixa("receber", aberto, null, "2026-10-22", null, { desconto: 10 });
    expect(r.decisao === "enviar" && r.corpo).toMatchObject({ desconto: 10, valorRecebido: 240 });
    expect(r.decisao === "enviar" && r.esperado.parcial).toBe(false);
  });

  it("tarifa é o que foi RETIDO: abate do valor recebido e ainda quita (borderô real do ML)", () => {
    const ml = { situacao: 1, valor: 39.9, saldo: 39.9, portador: { id: 1 } };
    const r = decidirBaixa("receber", ml, null, "2026-10-19", null, { tarifa: 11.64 });
    expect(r.decisao === "enviar" && r.corpo).toMatchObject({ tarifa: 11.64, valorPago: 28.26, valorRecebido: 28.26 });
    expect(r.decisao === "enviar" && r.esperado).toEqual({ saldoAntes: 39.9, principal: 39.9, valor: 28.26, parcial: false, saldoDepois: 0 });
    // Informando o valor que entrou (28,26) com a tarifa, também quita.
    const r2 = decidirBaixa("receber", ml, null, "2026-10-19", null, { tarifa: 11.64, valor: 28.26 });
    expect(r2.decisao === "enviar" && r2.esperado.parcial).toBe(false);
  });

  it("tarifa no pagamento é recusada (o sentido dela ali não foi medido)", () => {
    expect(decidirBaixa("pagar", aberto, null, "2026-10-22", null, { tarifa: 2 }).decisao).toBe("ajuste_invalido");
  });

  it("juros no pagamento como no borderô real: 534,87 pagos quitam 520 com 14,87 de juros", () => {
    const t = { situacao: 1, valor: 520, saldo: 520, portador: { id: 1 } };
    const r = decidirBaixa("pagar", t, null, "2026-10-19", null, { juros: 14.87 });
    expect(r.decisao === "enviar" && r.corpo).toMatchObject({ juros: 14.87, valorPago: 534.87 });
    expect(r.decisao === "enviar" && r.corpo.valorRecebido).toBeUndefined();
  });

  it("valor menor que o saldo é PARCIAL, e o esperado diz quanto fica em aberto", () => {
    const r = decidirBaixa("receber", aberto, null, "2026-10-22", null, { valor: 100 });
    expect(r.decisao === "enviar" && r.corpo.valorRecebido).toBe(100);
    expect(r.decisao === "enviar" && r.esperado).toEqual({ saldoAntes: 250, principal: 100, valor: 100, parcial: true, saldoDepois: 150 });
  });

  it("parcial sobre título JÁ parcial parte do saldo, não do valor original", () => {
    const r = decidirBaixa("pagar", { situacao: 3, valor: 250, saldo: 90, portador: { id: 1 } }, null, "2026-10-22", null, { valor: 40 });
    expect(r.decisao === "enviar" && r.esperado.saldoDepois).toBe(50);
  });

  it("recusa, nunca corrige: valor acima do saldo, valor que não cobre os juros, ajuste negativo", () => {
    expect(decidirBaixa("pagar", aberto, null, "2026-10-22", null, { valor: 300 }).decisao).toBe("ajuste_invalido");
    expect(decidirBaixa("pagar", aberto, null, "2026-10-22", null, { juros: 50, valor: 40 }).decisao).toBe("ajuste_invalido");
    expect(decidirBaixa("pagar", aberto, null, "2026-10-22", null, { desconto: -1 }).decisao).toBe("ajuste_invalido");
    expect(decidirBaixa("pagar", aberto, null, "2026-10-22", null, { juros: 1.005 }).decisao).toBe("ajuste_invalido");
  });

  it("lerAjustes aceita o JSON da tela e ignora o resto", () => {
    expect(lerAjustes({ portador_id: "77", juros: "1.5", lixo: 1 })).toEqual({ portadorId: 77, juros: 1.5, multa: null, desconto: null, tarifa: null, valor: null, historico: null });
    expect(lerAjustes(undefined)).toEqual({ portadorId: null, juros: null, multa: null, desconto: null, tarifa: null, valor: null, historico: null });
  });

  it("o histórico escrito na tela vai como está; vazio usa a marca padrão", () => {
    const com = decidirBaixa("receber", aberto, null, "2026-10-22", "Ana", { historico: "  Ref. ao pedido 219 | pix  " });
    const sem = decidirBaixa("receber", aberto, null, "2026-10-22", "Ana", { historico: "   " });
    expect(com.decisao === "enviar" && com.corpo.historico).toBe("Ref. ao pedido 219 | pix");
    expect(sem.decisao === "enviar" && sem.corpo.historico).toBe("Baixa pelo CarboHub Finanças (Ana)");
    const longo = decidirBaixa("pagar", aberto, null, "2026-10-22", null, { historico: "x".repeat(2100) });
    expect(longo.decisao === "enviar" && String(longo.corpo.historico).length).toBe(2000);
  });
});

describe("conferirBaixa — o Bling ignora campo que não conhece, então se confere", () => {
  const total = { saldoAntes: 250, principal: 250, valor: 250, parcial: false, saldoDepois: 0 };
  const parcial = { saldoAntes: 250, principal: 100, valor: 100, parcial: true, saldoDepois: 150 };
  it("quitou como esperado", () => expect(conferirBaixa(total, { situacao: 2, saldo: 0 })).toBeNull());
  it("parcial como esperado", () => expect(conferirBaixa(parcial, { situacao: "3", saldo: 150 })).toBeNull());
  it("⚠️ pediu parcial e o Bling quitou tudo: divergência", () => expect(conferirBaixa(parcial, { situacao: 2, saldo: 0 })).toMatch(/inteiro/));
  it("parcial com saldo diferente do esperado", () => expect(conferirBaixa(parcial, { situacao: 3, saldo: 200 })).toMatch(/esperado/));
  it("pediu quitar e o Bling deixou saldo", () => expect(conferirBaixa(total, { situacao: 3, saldo: 10 })).toMatch(/em aberto/));
  it("continuou em aberto", () => expect(conferirBaixa(total, { situacao: 1 })).toMatch(/não ficou baixado/));
});

describe("dataDaBaixa — a data escolhida na tela", () => {
  const hoje = "2026-10-22";
  it("vazia = hoje", () => { expect(dataDaBaixa(undefined, hoje)).toBe(hoje); expect(dataDaBaixa("", hoje)).toBe(hoje); });
  it("passada vale", () => expect(dataDaBaixa("2026-10-15", hoje)).toBe("2026-10-15"));
  it("futura é RECUSADA, nunca trocada por hoje", () => expect(dataDaBaixa("2026-10-23", hoje)).toBeNull());
  it("data impossível é recusada", () => { expect(dataDaBaixa("2026-02-30", hoje)).toBeNull(); expect(dataDaBaixa("15/10/2026", hoje)).toBeNull(); });
});

describe("diaBrasilia", () => {
  it("21h de Brasília ainda é o mesmo dia (não o UTC seguinte)", () => {
    expect(diaBrasilia("2026-10-23T00:30:00Z")).toBe("2026-10-22");
  });
});

describe("idsDeBordero", () => {
  it("aceita [{id}] e [id], ignora lixo", () => {
    expect(idsDeBordero([{ id: 5 }, 7, null, { id: "x" }])).toEqual([5, 7]);
    expect(idsDeBordero(undefined)).toEqual([]);
  });
});

describe("planejarEspelho — a rodada que só lê os ABERTOS", () => {
  const loc = (situacao: string, valor = 10, saldo: number | null = null, vencimento = "2026-11-01"): LocalConta =>
    ({ situacao, valor, saldo, vencimento });
  const lis = (bling_id: number, situacao: string, valor = 10, saldo: number | null = null, vencimento = "2026-11-01"): ListadaConta =>
    ({ bling_id, situacao, valor, saldo, vencimento });

  it("⚠️ o Bling IGNOROU o filtro: plano VAZIO, nunca 'todo o resto foi pago'", () => {
    const locais = new Map([[1, loc("1")], [2, loc("1")]]);
    const p = planejarEspelho(locais, [lis(1, "1"), lis(99, "2")]);
    expect(p).toEqual({ filtroIgnorado: true, novos: [], mudaram: [], sumiram: [] });
  });

  it("novo, mudou e sumiu, cada um no seu balde", () => {
    const locais = new Map([[1, loc("1")], [2, loc("1", 10)], [3, loc("3", 10, 4)]]);
    const p = planejarEspelho(locais, [lis(1, "1"), lis(2, "1", 12), lis(4, "1")]);
    expect(p.filtroIgnorado).toBe(false);
    expect(p.novos).toEqual([4]);
    expect(p.mudaram).toEqual([2]);
    expect(p.sumiram).toEqual([3]);
  });

  it("título quitado aqui que reaparece aberto (estornado no Bling) é MUDANÇA", () => {
    const p = planejarEspelho(new Map([[5, loc("2")]]), [lis(5, "1")]);
    expect(p.mudaram).toEqual([5]);
    expect(p.sumiram).toEqual([]);
  });

  it("⚠️ saldo/vencimento ausentes na listagem NÃO contam como mudança", () => {
    const p = planejarEspelho(new Map([[1, loc("3", 10, 4)]]), [{ bling_id: 1, situacao: "3", valor: 10, saldo: null, vencimento: null }]);
    expect(p.mudaram).toEqual([]);
  });

  it("quitado aqui que não está na lista de abertos não é 'sumiu'", () => {
    const p = planejarEspelho(new Map([[1, loc("2")]]), []);
    expect(p.sumiram).toEqual([]);
  });

  it("centavo de arredondamento não é mudança", () => {
    const p = planejarEspelho(new Map([[1, loc("1", 10.001)]]), [lis(1, "1", 10)]);
    expect(p.mudaram).toEqual([]);
  });
});

import { erroDaContaNova, corpoContaPagar, dividirEmParcelas } from "../../../supabase/functions/_shared/blingContasRegra";

describe("conta a pagar criada pelo sistema no Bling", () => {
  const base = { contatoId: 18466371935, portadorId: 14890756828, historico: "LOCAÇÃO", numeroDocumento: null,
                 parcelas: [{ vencimento: "2026-11-16", valor: 2500 }] };

  it("o corpo segue a forma de uma conta real que o Bling aceitou (ocorrência única)", () => {
    expect(corpoContaPagar(base, 0, "2026-10-22")).toEqual({
      vencimento: "2026-11-16", valor: 2500, contato: { id: 18466371935 }, portador: { id: 14890756828 },
      historico: "LOCAÇÃO", dataEmissao: "2026-10-22", competencia: "2026-10-22", ocorrencia: { tipo: 1 },
    });
  });

  it("sem portador o campo não vai (73 contas reais não têm); número só se preenchido", () => {
    const c = corpoContaPagar({ ...base, portadorId: null, numeroDocumento: " 123 " }, 0, "2026-10-22");
    expect(c.portador).toBeUndefined();
    expect(c.numeroDocumento).toBe("123");
  });

  it("parcelada: cada parcela diz qual é no histórico", () => {
    const c = { ...base, parcelas: dividirEmParcelas(1000, 3, "2026-11-10") };
    expect(corpoContaPagar(c, 1, "2026-10-22").historico).toBe("LOCAÇÃO — parcela 2/3");
  });

  it("dividir: a sobra de centavo vai na última, e a soma FECHA", () => {
    const p = dividirEmParcelas(100, 3, "2026-11-10");
    expect(p.map((x) => x.valor)).toEqual([33.33, 33.33, 33.34]);
    expect(Math.round(p.reduce((s, x) => s + x.valor, 0) * 100)).toBe(10000);
    expect(p.map((x) => x.vencimento)).toEqual(["2026-11-10", "2026-12-10", "2027-01-10"]);
  });

  it("dividir: dia 31 em mês curto vira o último dia DAQUELE mês", () => {
    expect(dividirEmParcelas(300, 3, "2027-01-31").map((x) => x.vencimento)).toEqual(["2027-01-31", "2027-02-28", "2027-03-31"]);
  });

  it("recusa, nunca corrige: sem fornecedor, sem histórico, valor zero, data impossível, parcelas demais", () => {
    const h = "2026-10-22";
    expect(erroDaContaNova(base, h)).toBeNull();
    expect(erroDaContaNova({ ...base, contatoId: 0 }, h)).toMatch(/fornecedor/);
    expect(erroDaContaNova({ ...base, historico: "  " }, h)).toMatch(/histórico/);
    expect(erroDaContaNova({ ...base, parcelas: [{ vencimento: "2026-11-16", valor: 0 }] }, h)).toMatch(/Valor/);
    expect(erroDaContaNova({ ...base, parcelas: [{ vencimento: "2026-02-30", valor: 1 }] }, h)).toMatch(/Vencimento/);
    expect(erroDaContaNova({ ...base, parcelas: dividirEmParcelas(370, 37, "2026-11-01") }, h)).toMatch(/máximo/);
    expect(erroDaContaNova({ ...base, parcelas: [{ vencimento: "2026-11-16", valor: 1.005 }] }, h)).toMatch(/2 casas/);
  });
});

describe("censoBorderos (raio-x do ensaio)", () => {
  it("conta os campos com valor e separa exemplos com ajuste e parciais", () => {
    const r = censoBorderos([
      { titulo: 1, situacao: "2", bordero: { id: 9, historico: "Baixa pelo CarboHub Finanças (Ana)", pagamentos: [{ valorPago: 100, juros: 2.5, desconto: 0 }] } },
      { titulo: 2, situacao: "3", bordero: { id: 8, historico: "pix", pagamentos: [{ valorPago: 40, juros: 0 }] } },
      { titulo: 3, situacao: "2", bordero: { id: 7, pagamentos: [{ valorPago: 10 }] } },
    ]);
    expect(r.campos_com_valor).toEqual({ valorPago: 3, juros: 1 });
    expect(r.historicos_do_carbohub).toBe(1);
    expect(r.exemplos_com_ajuste).toHaveLength(1);
    expect(r.exemplos_parcial).toHaveLength(1);
    expect(r.chaves_dos_pagamentos.juros).toBe(2);
  });
  it("último borderô = o maior id, aceitando objeto ou número", () => {
    expect(ultimoBordero([{ id: 5 }, { id: 12 }, 3])).toBe(12);
    expect(ultimoBordero(null)).toBeNull();
  });
});

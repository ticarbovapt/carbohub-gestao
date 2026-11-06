import { describe, it, expect } from "vitest";
import {
  jsonBancario, lerJsonBancario, linhaParaBarras, formatarLinha, negociacao11, partesCnpj,
  montarHibrido, multaEJuros, lerRegistroHibrido, errosDoBanco, faltasDoPagador, textoBanco,
  lerConsulta, dataDDMMAAAA, tituloInexistente, corpoConsulta, corpoBaixa, baixaAceita,
  enderecoDoXmlNfe, urlXmlConfiavel,
} from "../../../supabase/functions/_shared/bradescoCobranca";

// As linhas abaixo são as que o SANDBOX do Bradesco devolveu em 06/11/2026 —
// dado do banco, não inventado: se a conta do dígito estiver errada, falham.
const LINHA_COMUM = "23792.85600 96010.000006 66022.265202 5 16720000010000";
const LINHA_HIBRIDO = "23793.86101 90097.002126 36004.100008 1 99980000000000";

describe("inteiros grandes — o defeito medido no 1º teste", () => {
  it("jsonBancario manda a negociação de 18 dígitos intacta", () => {
    expect(jsonBancario({ cnegocCobr: 111111111111111111n, x: 1 })).toBe('{"cnegocCobr":111111111111111111,"x":1}');
  });
  it("lerJsonBancario não arredonda o que o banco devolve", () => {
    const r = lerJsonBancario('{"cnegocCobr": 386100000000041234, "nuTituloGerado": 60100000066}') as any;
    expect(r.cnegocCobr).toBe("386100000000041234");
    expect(r.nuTituloGerado).toBe(60100000066);
  });
  it("não mexe em número dentro de texto (EMV do Pix)", () => {
    const emv = "00020101021226930014BR.GOV.BCB.PIX2571qrpix";
    const r = lerJsonBancario(`{"wqrcdPdraoMercd":"${emv}","l":[12345678901234567]}`) as any;
    expect(r.wqrcdPdraoMercd).toBe(emv);
    expect(r.l[0]).toBe("12345678901234567");
  });
});

describe("linha digitável → código de barras", () => {
  it("boleto comum do sandbox", () => {
    const b = linhaParaBarras(LINHA_COMUM);
    expect(b).toHaveLength(44);
    expect(b.slice(0, 3)).toBe("237");
    expect(b.slice(5, 9)).toBe("1672");               // fator de vencimento
    expect(b.slice(9, 19)).toBe("0000010000");        // R$ 100,00
  });
  it("a linha do HÍBRIDO do sandbox é fictícia (R$ 0,00) e o dígito geral não fecha: recusa", () => {
    // Medido: dígito informado 1, calculado 2. Os três dígitos de campo fecham.
    expect(() => linhaParaBarras(LINHA_HIBRIDO)).toThrow("Dígito geral");
  });
  it("recusa linha com dígito trocado", () => {
    expect(() => linhaParaBarras(LINHA_COMUM.replace("85600", "85601"))).toThrow();
  });
  it("formata de volta", () => {
    expect(formatarLinha(LINHA_HIBRIDO.replace(/\D/g, ""))).toBe(LINHA_HIBRIDO);
  });
});

describe("negociação e CNPJ", () => {
  it("18 → 11 (agência + conta)", () => {
    expect(negociacao11("386100000000041000")).toBe("38610041000");
    expect(negociacao11("285600000000222652")).toBe("28560222652");
  });
  it("CNPJ em três pedaços", () => {
    expect(partesCnpj("36.060.692/0001-00")).toEqual({ raiz: 36060692, filial: 1, dv: 0 });
  });
});

describe("multa e juros em centavos", () => {
  it("2% de multa e 1% ao mês de juros sobre R$ 1.000,00", () => {
    expect(multaEJuros(100000, { multa_pct: 2, juros_mes_pct: 1 })).toEqual({ multa: 2000, jurosDia: 33 });
  });
  it("trunca o juro do dia (o banco trunca)", () => {
    expect(multaEJuros(15960, { multa_pct: 2, juros_mes_pct: 1 }).jurosDia).toBe(5);
  });
});

describe("montarHibrido", () => {
  const carteira = { cnpj: "36060692000100", carteira: 9, negociacao: "386100000000041000", especie: 2, multa_pct: 2, juros_mes_pct: 1 };
  const titulo = { nosso_numero: 123, seu_numero: "NF 450/1", emissao: "2026-11-06", vencimento: "2026-12-06", valor: 1234.56 };
  const pagador = {
    nome: "Posto São José Ltda", documento: "12.345.678/0001-90", cep: "59010-000",
    logradouro: "Av. Rio Branco", numero: "100", bairro: "Cidade Alta", cidade: "Natal", uf: "rn",
    email: "fin@posto.com", fone: "(84) 99999-1234",
  };
  const c = montarHibrido(carteira, titulo, pagador) as Record<string, any>;
  it("valor e datas no formato do banco", () => {
    expect(c.vnmnalTitloCobr).toBe(123456);
    expect(c.demisTitloCobr).toBe("06.11.2026");
    expect(c.dvctoTitloCobr).toBe("06.12.2026");
  });
  it("negociação vai como bigint e sai intacta no JSON", () => {
    expect(jsonBancario(c)).toContain('"cnegocCobr":386100000000041000');
  });
  it("beneficiário, pagador e Pix", () => {
    expect([c.nroCpfCnpjBenef, c.filCpfCnpjBenef, c.digCpfCnpjBenef]).toEqual([36060692, "1", 0]);
    expect(c.indCpfCnpjSacdo).toBe(2);
    expect(c.nroCpfCnpjSacdo).toBe(12345678000190);
    expect(c.isacdoTitloCobr).toBe("POSTO SAO JOSE LTDA");
    expect([c.ccepSacdoTitlo, c.ccomplCepSacdo]).toEqual([59010, 0]);
    expect(c.csglUfSacdo).toBe("RN");
    expect([c.cdddFoneSacdo, c.cfoneSacdoTitlo]).toEqual([84, 999991234]);
    expect([c.cindcdCobrMisto, c.fase]).toEqual(["S", "1"]);
  });
  it("multa e juros em valor, a partir do 1º dia", () => {
    expect([c.vmultaAtrsoPgto, c.qdiaInicMulta, c.vdiaJuroMora, c.qdiaInicJuro]).toEqual([2469, 1, 41, 1]);
  });
  it("recusa nosso número com mais de 11 dígitos", () => {
    expect(() => montarHibrido(carteira, { ...titulo, nosso_numero: 123456789012 }, pagador)).toThrow();
  });
});

describe("leitura da resposta", () => {
  it("o registro híbrido do sandbox", () => {
    const r = lerRegistroHibrido({
      ctitloCobrCdent: 970021236, linhaDig10: LINHA_HIBRIDO, status10: "A VENCER/VENCIDO",
      iconcPgtoSpi: "20250123237093861004100000970021236",
      ilinkGeracQrcd: "qrpix-h.bradesco.com.br/qr/v2/cobv/x",
      wqrcdPdraoMercd: "00020101021226930014BR.GOV.BCB.PIX",
    });
    expect(r.nosso_numero).toBe("970021236");
    expect(r.linha_digitavel).toHaveLength(47);
    expect(r.codigo_barras).toBeNull();               // linha fictícia do sandbox
    expect(r.txid).toHaveLength(35);
  });
  it("erros do sandbox: só o cenário Sucesso interessa", () => {
    const e = errosDoBanco({
      mensagem: "Nao foi possivel processar",
      errosValidacao: [
        { nomeDoArquivo: "erro-cadastro.json", erros: ["outro"] },
        { nomeDoArquivo: "200-Hib.json", erros: ["O argumento cnegocCobr não bateu"] },
      ],
    });
    expect(e).toEqual(["Nao foi possivel processar", "O argumento cnegocCobr não bateu"]);
  });
});

describe("pagador", () => {
  it("diz o que falta", () => {
    expect(faltasDoPagador({ nome: "X", documento: "123", cep: "59010000", logradouro: "R", bairro: "B", cidade: "C", uf: "R" }))
      .toEqual(["CPF/CNPJ do pagador", "UF"]);
  });
  it("texto do banco sem acento e cortado", () => {
    expect(textoBanco("  Ação   Çaí ", 5)).toBe("ACAO");
  });
});

describe("consulta e baixa", () => {
  const carteira = { cnpj: "68542653101838", carteira: 9, negociacao: "386100000000041000" };
  it("o corpo da consulta tem a forma do exemplo do manual", () => {
    expect(corpoConsulta(carteira, "970039324")).toEqual({
      cpfCnpjUsuario: 68542653, filialCnpjUsuario: 1018, controleCpfCnpjUsuario: 38,
      idProduto: 9, contaProduto: 38610041000, nomePersonalizado: "", nossoNumero: 970039324, seqTitulo: 0, status: 0,
    });
  });
  it("o corpo da baixa usa a negociação de 11 e o código 57", () => {
    expect(corpoBaixa(carteira, 42360000024)).toEqual({
      cpfCnpj: { cpfCnpj: 68542653, filial: 1018, controle: 38 },
      produto: 9, negociacao: 38610041000, nossoNumero: 42360000024, sequencia: 0, codigoBaixa: 57,
    });
  });
  it("data zerada é ausência, não 00/00/0000", () => {
    expect(dataDDMMAAAA("0")).toBeNull();
    expect(dataDDMMAAAA("06112026")).toBe("2026-11-06");
    expect(dataDDMMAAAA(6112026)).toBe("2026-11-06");
  });
  it("a vencer", () => {
    expect(lerConsulta({ codStatus: 1, status: "A VENCER/VENCIDO", dtPagto: "0", vlrPagto: 0 }).situacao).toBe("registrado");
  });
  it("pago (no topo ou dentro de `titulo`)", () => {
    const c = lerConsulta({ titulo: { codStatus: 61, status: "PAGO", dtPagto: "10112026", vlrPagto: 40000 } });
    expect(c).toMatchObject({ situacao: "pago", pago_em: "2026-11-10", valor_pago: 400 });
    expect(lerConsulta({ codStatus: 51 }).situacao).toBe("pago");
  });
  it("baixado por nós", () => {
    expect(lerConsulta({ codStatus: 57 }).situacao).toBe("cancelado");
  });
  it("título inexistente", () => {
    expect(tituloInexistente({ mensagem: "CBTT0552 - TITULO INEXISTENTE PARA O CONTRATO INFORMADO" })).toBe(true);
    expect(tituloInexistente({ mensagem: "CBTT0000 OK" })).toBe(false);
  });
  it("baixa aceita: o retorno do manual", () => {
    const r = { status: 200, transacao: "CBTTIAGQ", mensagem: "CBTT0532 - SOLICITACAO DE BAIXA EFETUADA", dados: { status: 57, statusAnterior: 1 } };
    expect(baixaAceita(200, r)).toBe(true);
    expect(baixaAceita(412, r)).toBe(false);
    expect(baixaAceita(200, { mensagem: "outra coisa" })).toBe(false);
  });
});

describe("endereço do pagador pelo XML da NF-e", () => {
  const xml = `<?xml version="1.0"?><nfeProc><NFe><infNFe><emit><enderEmit><xLgr>EMITENTE</xLgr><CEP>59000000</CEP></enderEmit></emit>
    <dest><CNPJ>48828205000196</CNPJ><xNome>CRF ALIMENTOS</xNome><enderDest><xLgr>RUA DAS FLORES &amp; CIA</xLgr><nro>120</nro>
    <xCpl>SALA 2</xCpl><xBairro>CENTRO</xBairro><cMun>2408102</cMun><xMun>Natal</xMun><UF>rn</UF><CEP>59025-000</CEP>
    <cPais>1058</cPais><fone>8432110000</fone></enderDest><indIEDest>9</indIEDest><email>fin@crf.com.br; outro@crf.com.br</email></dest>
    </infNFe></NFe></nfeProc>`;
  it("lê o DESTINATÁRIO, não o emitente", () => {
    expect(enderecoDoXmlNfe(xml)).toEqual({
      cep: "59025000", logradouro: "RUA DAS FLORES & CIA", numero: "120", complemento: "SALA 2",
      bairro: "CENTRO", cidade: "Natal", uf: "RN", email: "fin@crf.com.br", fone: "8432110000",
    });
  });
  it("sem CEP não devolve meio endereço", () => {
    expect(enderecoDoXmlNfe(xml.replace(/<CEP>59025-000<\/CEP>/, ""))).toBeNull();
  });
  it("só baixa XML do Bling, por https", () => {
    expect(urlXmlConfiavel("https://www.bling.com.br/relatorios/nfe.xml.php?chaveAcesso=1")).toBe(true);
    expect(urlXmlConfiavel("http://www.bling.com.br/x")).toBe(false);
    expect(urlXmlConfiavel("https://bling.com.br.evil.com/x")).toBe(false);
    expect(urlXmlConfiavel(null)).toBe(false);
  });
});

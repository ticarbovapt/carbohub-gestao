// ═══════════════════════════════════════════════════════════════════════════
// Os corpos que o SANDBOX do Bradesco aceita — cenário "Sucesso" das
// collections Postman do portal (docs/bradesco/sandbox-collections.md).
//
// ⚠️ O sandbox responde por CENÁRIO FIXO: qualquer dado nosso volta 422 "não
// atende aos cenários existentes". Por isso, no sandbox, a `bradesco-cobranca`
// manda ESTES corpos e guarda ao lado o que ela montou com o título real.
// Valores copiados como estão — inclusive datas de 2024/2025.
// ═══════════════════════════════════════════════════════════════════════════

export const SANDBOX_REGISTRO_HIBRIDO = {
  ctitloCobrCdent: 0, registrarTitulo: 1, nroCpfCnpjBenef: 68542653, codUsuario: "APISERVIC",
  filCpfCnpjBenef: "1018", tipoAcesso: 2, digCpfCnpjBenef: 38, cpssoaJuridContr: "", ctpoContrNegoc: "",
  cidtfdProdCobr: 9, nseqContrNegoc: "", cnegocCobr: 111111111111111111n, filler: "", eNseqContrNegoc: "",
  tipoRegistro: 1, codigoBanco: 237, cprodtServcOper: "", demisTitloCobr: "17.12.2024",
  ctitloCliCdent: "TESTEBIA", dvctoTitloCobr: "20.02.2025", cidtfdTpoVcto: "", vnmnalTitloCobr: 6000,
  cindcdEconmMoeda: 9, cespceTitloCobr: 2, qmoedaNegocTitlo: 0, ctpoProteTitlo: 0, cindcdAceitSacdo: "N",
  ctpoPrzProte: 0, ctpoPrzDecurs: 0, ctpoProteDecurs: 0, cctrlPartcTitlo: 0, cindcdPgtoParcial: "N",
  cformaEmisPplta: "02", qtdePgtoParcial: 0, qtdDecurPrz: "0", codNegativacao: "0", diasNegativacao: "0",
  ptxJuroVcto: 0, filler1: "", vdiaJuroMora: 0, pmultaAplicVcto: 0, qdiaInicJuro: 0, vmultaAtrsoPgto: 0,
  pdescBonifPgto01: 0, qdiaInicMulta: 0, vdescBonifPgto01: 0, pdescBonifPgto02: 0, dlimDescBonif1: "",
  vdescBonifPgto02: 0, pdescBonifPgto03: 0, dlimDescBonif2: "", vdescBonifPgto03: 0, ctpoPrzCobr: 0,
  dlimDescBonif3: "", pdescBonifPgto: 0, dlimBonifPgto: "", vdescBonifPgto: 0, vabtmtTitloCobr: 0,
  filler2: "", viofPgtoTitlo: 0, isacdoTitloCobr: "TESTE EMPRESA PGIT", enroLogdrSacdo: "TESTE",
  elogdrSacdoTitlo: "TESTE", ecomplLogdrSacdo: "TESTE", ccepSacdoTitlo: 6332, ebairoLogdrSacdo: "TESTE",
  ccomplCepSacdo: 130, imunSacdoTitlo: "TESTE", indCpfCnpjSacdo: 1, csglUfSacdo: "SP", renderEletrSacdo: "",
  cdddFoneSacdo: 0, nroCpfCnpjSacdo: 38453450803, bancoDeb: 0, cfoneSacdoTitlo: 0, agenciaDebDv: 0,
  agenciaDeb: 0, bancoCentProt: 0, contaDeb: 0, isacdrAvalsTitlo: "", agenciaDvCentPr: 0,
  enroLogdrSacdr: "0", elogdrSacdrAvals: "", ecomplLogdrSacdr: "", ccomplCepSacdr: 0, ebairoLogdrSacdr: "",
  csglUfSacdr: "", ccepSacdrTitlo: 0, imunSacdrAvals: "", indCpfCnpjSacdr: 0, renderEletrSacdr: "",
  nroCpfCnpjSacdr: 0, cdddFoneSacdr: 0, filler3: "0", cfoneSacdrTitlo: 0, iconcPgtoSpi: "", fase: "1",
  cindcdCobrMisto: "S", ialiasAdsaoCta: "", ilinkGeracQrcd: "", caliasAdsaoCta: "", wqrcdPdraoMercd: "",
  validadeAposVencimento: "", filler4: "", idLoc: "",
};

export const SANDBOX_CONSULTA_HIBRIDO = {
  contaProduto: 38610041000, controleCpfCnpjUsuario: 38, cpfCnpjUsuario: 68542653, filialCnpjUsuario: 1018,
  idProduto: 9, nomePersonalizado: "", nossoNumero: 970039324, seqTitulo: 0, status: 0,
};

export const SANDBOX_BAIXA = {
  cpfCnpj: { cpfCnpj: "1234567", filial: "1", controle: "99" },
  produto: 9, negociacao: 28560222654, nossoNumero: "50150001462", sequencia: 0, codigoBaixa: 57,
};

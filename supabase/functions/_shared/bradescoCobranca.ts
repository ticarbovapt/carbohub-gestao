// ═══════════════════════════════════════════════════════════════════════════
// Cobrança Bradesco — as REGRAS, puras (sem rede, sem banco). Testadas em
// src/test/bradesco/cobranca.test.ts. Quem fala com o banco é a edge function
// `bradesco-cobranca`; quem desenha o boleto é a tela (Finanças).
//
// Fonte: docs/bradesco/relatorio-apis-bradesco.md (manual do híbrido v1.8.3)
// e docs/bradesco/sandbox-collections.md (os corpos que o sandbox aceita).
// ═══════════════════════════════════════════════════════════════════════════

// ── JSON com inteiros GRANDES ────────────────────────────────────────────────
// ⚠️ A negociação (`cnegocCobr` = agência 4 + zeros 7 + conta 7) tem 18 dígitos
// e passa do maior inteiro exato do JavaScript (2^53 ≈ 9·10^15). Medido no 1º
// teste do sandbox (06/11/2026): `111111111111111111` saiu `111111111111111100`
// e voltou `386100000000041000` — sem erro nenhum, nos DOIS sentidos.

/** Serializa; `bigint` sai como NÚMERO, dígito a dígito. */
export function jsonBancario(v: unknown): string {
  return JSON.stringify(v, (_k, x) => (typeof x === "bigint" ? `__INT__${x}` : x))
    .replace(/"__INT__(-?\d+)"/g, "$1");
}

/**
 * Lê a resposta do banco SEM perder dígitos: número com 16+ dígitos vira TEXTO
 * antes do `JSON.parse`. Só toca número em posição de VALOR (depois de `:`, `[`
 * ou `,`), nunca dentro de string — o EMV do Pix e o código de barras são texto.
 */
export function lerJsonBancario(texto: string): unknown {
  const protegido = texto.replace(
    /("(?:[^"\\]|\\.)*")|([:\[,]\s*)(-?\d{16,})(?=\s*[,\}\]])/g,
    (m, str, pre, num) => (str ? m : `${pre}"${num}"`),
  );
  return JSON.parse(protegido);
}

// ── Formatos ─────────────────────────────────────────────────────────────────
/** "2026-11-06" → "06.11.2026" (o formato do registro híbrido). */
export function dataPonto(iso: string): string {
  const [a, m, d] = iso.split("-");
  return `${d}.${m}.${a}`;
}

/** Reais → centavos inteiros, sem erro de ponto flutuante. */
export function centavos(valor: number | string): number {
  const n = typeof valor === "string" ? Number(valor.replace(",", ".")) : valor;
  if (!Number.isFinite(n)) throw new Error(`Valor inválido: ${valor}`);
  return Math.round(n * 100);
}

/** Texto para o banco: sem acento, maiúsculo, sem caractere de controle, cortado. */
export function textoBanco(s: unknown, max: number): string {
  return String(s ?? "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^\x20-\x7E]/g, " ")
    .replace(/\s+/g, " ").trim().toUpperCase().slice(0, max).trimEnd();
}

export const soDigitos = (s: unknown) => String(s ?? "").replace(/\D/g, "");

// ── CNPJ do beneficiário em três pedaços (raiz 8 · filial 4 · dígito 2) ──────
export type CnpjPartes = { raiz: number; filial: number; dv: number };
export function partesCnpj(cnpj: string): CnpjPartes {
  const d = soDigitos(cnpj);
  if (d.length !== 14) throw new Error(`CNPJ do beneficiário precisa de 14 dígitos (veio ${d.length}).`);
  return { raiz: Number(d.slice(0, 8)), filial: Number(d.slice(8, 12)), dv: Number(d.slice(12)) };
}

/**
 * Negociação: o registro usa 18 posições (agência 4 + zeros 7 + conta 7) e a
 * consulta/baixa/lista usam 11 (agência 4 + conta 7). Uma só origem: a de 18.
 */
export function negociacao11(neg18: string): string {
  const d = soDigitos(neg18);
  if (d.length !== 18) throw new Error(`Negociação precisa de 18 dígitos (veio ${d.length}).`);
  return d.slice(0, 4) + d.slice(11);
}

// ── O corpo do REGISTRO HÍBRIDO ──────────────────────────────────────────────
export type Carteira = {
  cnpj: string;            // do beneficiário (a empresa)
  carteira: number;        // cidtfdProdCobr (9 = carteira 09)
  negociacao: string;      // 18 dígitos
  especie: number;         // cespceTitloCobr (2 = DM)
  multa_pct: number;       // 2 = 2%
  juros_mes_pct: number;   // 1 = 1% ao mês
};
export type Pagador = {
  nome: string;
  documento: string;       // CPF (11) ou CNPJ (14)
  cep: string;
  logradouro: string;
  numero: string;
  complemento?: string;
  bairro: string;
  cidade: string;
  uf: string;
  email?: string;
  fone?: string;           // com DDD
};
export type Titulo = {
  nosso_numero: number;    // 11 dígitos no máximo, gerado por nós
  seu_numero: string;      // ctitloCliCdent (25)
  emissao: string;         // ISO
  vencimento: string;      // ISO
  valor: number;           // reais
};

/**
 * Multa e juros vão em VALOR (centavos), nunca em percentual: o manual escreve
 * o formato do percentual de três jeitos diferentes (PARTE 6, item 4) e não diz
 * se `ptxJuroVcto` é ao mês ou ao dia. Valor em centavos não tem ambiguidade.
 *   multa = valor × multa_pct          (uma vez, a partir do 1º dia de atraso)
 *   juros = valor × juros_mes_pct / 30 (por dia, truncado — o banco trunca)
 */
export function multaEJuros(valorCent: number, c: Pick<Carteira, "multa_pct" | "juros_mes_pct">) {
  const multa = Math.round((valorCent * c.multa_pct) / 100);
  const jurosDia = Math.floor((valorCent * c.juros_mes_pct) / 100 / 30);
  return { multa, jurosDia };
}

/** Confere o que a tela mandou do pagador. Devolve a lista do que falta. */
export function faltasDoPagador(p: Partial<Pagador>): string[] {
  const f: string[] = [];
  const doc = soDigitos(p.documento);
  if (doc.length !== 11 && doc.length !== 14) f.push("CPF/CNPJ do pagador");
  if (!textoBanco(p.nome, 70)) f.push("nome do pagador");
  if (soDigitos(p.cep).length !== 8) f.push("CEP");
  if (!textoBanco(p.logradouro, 40)) f.push("logradouro");
  if (!textoBanco(p.bairro, 40)) f.push("bairro");
  if (!textoBanco(p.cidade, 30)) f.push("cidade");
  if (!/^[A-Z]{2}$/.test(String(p.uf ?? "").toUpperCase().trim())) f.push("UF");
  return f;
}

export function montarHibrido(c: Carteira, t: Titulo, p: Pagador): Record<string, unknown> {
  const benef = partesCnpj(c.cnpj);
  const doc = soDigitos(p.documento);
  const cep = soDigitos(p.cep);
  const fone = soDigitos(p.fone);
  const valorCent = centavos(t.valor);
  if (valorCent <= 0) throw new Error("Boleto sem valor.");
  if (!Number.isInteger(t.nosso_numero) || t.nosso_numero <= 0 || String(t.nosso_numero).length > 11) {
    throw new Error(`Nosso número inválido: ${t.nosso_numero}`);
  }
  const { multa, jurosDia } = multaEJuros(valorCent, c);

  return {
    registrarTitulo: 1,
    codUsuario: "APISERVIC",
    nroCpfCnpjBenef: benef.raiz,
    filCpfCnpjBenef: String(benef.filial),
    digCpfCnpjBenef: benef.dv,
    tipoAcesso: 2,
    cpssoaJuridContr: "", ctpoContrNegoc: "", nseqContrNegoc: "", eNseqContrNegoc: "",
    cidtfdProdCobr: c.carteira,
    cnegocCobr: BigInt(soDigitos(c.negociacao)),
    codigoBanco: 237,
    filler: "",
    tipoRegistro: 1,
    cprodtServcOper: "",
    ctitloCobrCdent: t.nosso_numero,
    ctitloCliCdent: textoBanco(t.seu_numero, 25),
    demisTitloCobr: dataPonto(t.emissao),
    dvctoTitloCobr: dataPonto(t.vencimento),
    cidtfdTpoVcto: "",
    vnmnalTitloCobr: valorCent,
    // ⚠️ 9 é o que o sandbox aceitou (e o código de moeda do Real no código de
    // barras); o manual atual escreve "Fixo = 00006". Conferir no 1º registro
    // de produção pela consulta, nunca supor.
    cindcdEconmMoeda: 9,
    cespceTitloCobr: c.especie,
    qmoedaNegocTitlo: 0,
    ctpoProteTitlo: 0, ctpoPrzProte: 0, ctpoPrzDecurs: 0, ctpoProteDecurs: 0,
    cctrlPartcTitlo: 0,
    cindcdAceitSacdo: "N",
    cindcdPgtoParcial: "N",
    cformaEmisPplta: "02",
    qtdePgtoParcial: 0,
    qtdDecurPrz: "0", codNegativacao: "0", diasNegativacao: "0",
    filler1: "",
    ptxJuroVcto: 0,
    vdiaJuroMora: jurosDia,
    qdiaInicJuro: jurosDia > 0 ? 1 : 0,
    pmultaAplicVcto: 0,
    vmultaAtrsoPgto: multa,
    qdiaInicMulta: multa > 0 ? 1 : 0,
    pdescBonifPgto01: 0, vdescBonifPgto01: 0, dlimDescBonif1: "",
    pdescBonifPgto02: 0, vdescBonifPgto02: 0, dlimDescBonif2: "",
    pdescBonifPgto03: 0, vdescBonifPgto03: 0, dlimDescBonif3: "",
    ctpoPrzCobr: 0,
    pdescBonifPgto: 0, vdescBonifPgto: 0, dlimBonifPgto: "",
    vabtmtTitloCobr: 0,
    filler2: "",
    viofPgtoTitlo: 0,
    isacdoTitloCobr: textoBanco(p.nome, 70),
    elogdrSacdoTitlo: textoBanco(p.logradouro, 40),
    enroLogdrSacdo: textoBanco(p.numero || "S/N", 10),
    ecomplLogdrSacdo: textoBanco(p.complemento, 15),
    ccepSacdoTitlo: Number(cep.slice(0, 5)),
    ccomplCepSacdo: Number(cep.slice(5)),
    ebairoLogdrSacdo: textoBanco(p.bairro, 40),
    imunSacdoTitlo: textoBanco(p.cidade, 30),
    csglUfSacdo: textoBanco(p.uf, 2),
    indCpfCnpjSacdo: doc.length === 11 ? 1 : 2,
    nroCpfCnpjSacdo: Number(doc),
    renderEletrSacdo: String(p.email ?? "").trim().slice(0, 70),
    cdddFoneSacdo: fone.length >= 10 ? Number(fone.slice(0, 2)) : 0,
    cfoneSacdoTitlo: fone.length >= 10 ? Number(fone.slice(2)) : 0,
    bancoDeb: 0, agenciaDebDv: 0, agenciaDeb: 0, contaDeb: 0,
    bancoCentProt: 0, agenciaDvCentPr: 0,
    isacdrAvalsTitlo: "", enroLogdrSacdr: "0", elogdrSacdrAvals: "", ecomplLogdrSacdr: "",
    ccomplCepSacdr: 0, ebairoLogdrSacdr: "", csglUfSacdr: "", ccepSacdrTitlo: 0,
    imunSacdrAvals: "", indCpfCnpjSacdr: 0, renderEletrSacdr: "", nroCpfCnpjSacdr: 0,
    cdddFoneSacdr: 0, cfoneSacdrTitlo: 0,
    filler3: "0",
    fase: "1",
    cindcdCobrMisto: "S",
    ialiasAdsaoCta: "", iconcPgtoSpi: "", caliasAdsaoCta: "", ilinkGeracQrcd: "",
    wqrcdPdraoMercd: "", validadeAposVencimento: "", filler4: "", idLoc: "",
  };
}

// ── A resposta do registro híbrido ───────────────────────────────────────────
export type Registro = {
  nosso_numero: string | null;
  linha_digitavel: string | null;   // só dígitos (47)
  codigo_barras: string | null;     // 44 dígitos, derivado da linha
  txid: string | null;
  pix_copia_cola: string | null;
  pix_location: string | null;
  status_banco: string | null;
};

export function lerRegistroHibrido(corpo: unknown): Registro {
  const r = (corpo ?? {}) as Record<string, unknown>;
  const s = (v: unknown) => (v === null || v === undefined || String(v).trim() === "" ? null : String(v).trim());
  const linha = soDigitos(r.linhaDig10);
  let barras: string | null = null;
  try { barras = linha.length === 47 ? linhaParaBarras(linha) : null; } catch { barras = null; }
  return {
    nosso_numero: s(r.ctitloCobrCdent),
    linha_digitavel: linha.length === 47 ? linha : null,
    codigo_barras: barras,
    txid: s(r.iconcPgtoSpi),
    pix_copia_cola: s(r.wqrcdPdraoMercd),
    pix_location: s(r.ilinkGeracQrcd),
    status_banco: s(r.status10),
  };
}

/** Mensagens de erro do banco, nos formatos que já vimos (422 do sandbox, 4xx CBTT). */
export function errosDoBanco(corpo: unknown): string[] {
  const r = (corpo ?? {}) as Record<string, any>;
  const out: string[] = [];
  if (typeof r.mensagem === "string") out.push(r.mensagem);
  if (typeof r.causa === "string") out.push(r.causa);
  if (Array.isArray(r.listaErros)) for (const e of r.listaErros) out.push([e?.codigoErro, e?.descricaoErro].filter(Boolean).join(" "));
  if (Array.isArray(r.errosValidacao)) {
    // Sandbox: um bloco por cenário; o que interessa é o do "Sucesso".
    const suc = r.errosValidacao.find((b: any) => /^200/.test(String(b?.nomeDoArquivo ?? "")));
    for (const e of (suc ?? r.errosValidacao[0])?.erros ?? []) out.push(String(e));
  }
  return out.filter(Boolean);
}

// ── Linha digitável ⇄ código de barras (FEBRABAN) ────────────────────────────
function mod10(num: string): number {
  let soma = 0, peso = 2;
  for (let i = num.length - 1; i >= 0; i--) {
    let p = Number(num[i]) * peso;
    if (p > 9) p = Math.floor(p / 10) + (p % 10);
    soma += p;
    peso = peso === 2 ? 1 : 2;
  }
  const r = soma % 10;
  return r === 0 ? 0 : 10 - r;
}
function dvGeral(barras43: string): number {
  let soma = 0, peso = 2;
  for (let i = barras43.length - 1; i >= 0; i--) {
    soma += Number(barras43[i]) * peso;
    peso = peso === 9 ? 2 : peso + 1;
  }
  const r = 11 - (soma % 11);
  return r === 0 || r === 10 || r === 11 ? 1 : r;
}

/**
 * Linha (47) → código de barras (44). ⚠️ O `cdBarras` que o Bradesco devolve
 * NÃO é este número: é a codificação das barras em "nNwW". Conferimos os três
 * dígitos de campo e o geral — linha com erro de digitação não vira barras.
 */
export function linhaParaBarras(linha: string): string {
  const l = soDigitos(linha);
  if (l.length !== 47) throw new Error(`Linha digitável precisa de 47 dígitos (veio ${l.length}).`);
  const c1 = l.slice(0, 10), c2 = l.slice(10, 21), c3 = l.slice(21, 32);
  if (mod10(c1.slice(0, 9)) !== Number(c1[9])) throw new Error("Dígito do 1º campo não confere.");
  if (mod10(c2.slice(0, 10)) !== Number(c2[10])) throw new Error("Dígito do 2º campo não confere.");
  if (mod10(c3.slice(0, 10)) !== Number(c3[10])) throw new Error("Dígito do 3º campo não confere.");
  const barras = l.slice(0, 4) + l[32] + l.slice(33, 47) + c1.slice(4, 9) + c2.slice(0, 10) + c3.slice(0, 10);
  if (dvGeral(barras.slice(0, 4) + barras.slice(5)) !== Number(barras[4])) {
    throw new Error("Dígito geral não confere.");
  }
  return barras;
}

/** "23793861019009700212636004100008199980000000000" → "23793.86101 90097.002126 36004.100008 1 99980000000000" */
export function formatarLinha(linha: string): string {
  const l = soDigitos(linha);
  if (l.length !== 47) return linha;
  return `${l.slice(0, 5)}.${l.slice(5, 10)} ${l.slice(10, 15)}.${l.slice(15, 21)} ${l.slice(21, 26)}.${l.slice(26, 32)} ${l[32]} ${l.slice(33)}`;
}

// ── Consulta (2ª via) e baixa ────────────────────────────────────────────────
/** Status do título que querem dizer PAGO (Tabela 1 do manual). */
export const STATUS_PAGO = new Set([13, 51, 61, 62]);
/** 57 = "conforme seu pedido" — a baixa que NÓS pedimos. */
export const STATUS_BAIXADO = new Set([57]);

/** "06112026" → "2026-11-06"; zerado ("0", "00000000") → null. */
export function dataDDMMAAAA(v: unknown): string | null {
  const d = soDigitos(v).padStart(8, "0");
  if (/^0+$/.test(d) || d.length !== 8) return null;
  return `${d.slice(4)}-${d.slice(2, 4)}-${d.slice(0, 2)}`;
}

export type Consulta = {
  cod_status: number | null;
  status_banco: string | null;
  linha_digitavel: string | null;
  pix_copia_cola: string | null;
  pago_em: string | null;
  /** ⚠️ unidade NÃO medida: inteiro = centavos (como no resto da API), com ponto = reais. */
  valor_pago: number | null;
  situacao: "registrado" | "pago" | "cancelado";
};

/** O título pode vir no topo ou dentro de `titulo`/`dados` — o manual não fixa. */
export function lerConsulta(corpo: unknown): Consulta {
  const raiz = (corpo ?? {}) as Record<string, any>;
  const t: Record<string, any> = [raiz, raiz.titulo, raiz.dados, raiz.retorno]
    .find((o) => o && typeof o === "object" && ("codStatus" in o || "linhaDig" in o || "dtPagto" in o)) ?? raiz;
  const cod = Number(t.codStatus ?? t.codigoStatus ?? NaN);
  const vp = t.vlrPagto;
  let valor: number | null = null;
  if (vp !== undefined && vp !== null && String(vp).trim() !== "" && Number(String(vp).replace(",", ".")) > 0) {
    const s = String(vp).replace(",", ".");
    valor = s.includes(".") ? Number(s) : Number(s) / 100;
  }
  const pago_em = dataDDMMAAAA(t.dtPagto);
  const linha = soDigitos(t.linhaDig);
  const codOk = Number.isFinite(cod) ? cod : null;
  const situacao = codOk !== null && STATUS_BAIXADO.has(codOk) ? "cancelado"
    : (codOk !== null && STATUS_PAGO.has(codOk)) || (pago_em && valor) ? "pago"
    : "registrado";
  return {
    cod_status: codOk,
    status_banco: t.status != null ? String(t.status) : null,
    linha_digitavel: linha.length === 47 ? linha : null,
    pix_copia_cola: t.semvQrcode ? String(t.semvQrcode) : null,
    pago_em, valor_pago: valor, situacao,
  };
}

/** O banco diz que o título NÃO existe (o único caso em que `indeterminado` vira `falha`). */
export function tituloInexistente(corpo: unknown): boolean {
  return errosDoBanco(corpo).some((m) => /CBTT0552|INEXISTENTE/i.test(m))
    || /CBTT0552/.test(JSON.stringify(corpo ?? ""));
}

/** Corpo da CONSULTA híbrida (2ª via) a partir da carteira e do nosso número. */
export function corpoConsulta(c: Pick<Carteira, "cnpj" | "carteira" | "negociacao">, nossoNumero: number | string) {
  const b = partesCnpj(c.cnpj);
  return {
    cpfCnpjUsuario: b.raiz, filialCnpjUsuario: b.filial, controleCpfCnpjUsuario: b.dv,
    idProduto: c.carteira, contaProduto: Number(negociacao11(c.negociacao)),
    nomePersonalizado: "", nossoNumero: Number(nossoNumero), seqTitulo: 0, status: 0,
  };
}

/** Corpo da BAIXA (cancelamento, código 57 "conforme seu pedido"). */
export function corpoBaixa(c: Pick<Carteira, "cnpj" | "carteira" | "negociacao">, nossoNumero: number | string) {
  const b = partesCnpj(c.cnpj);
  return {
    cpfCnpj: { cpfCnpj: b.raiz, filial: b.filial, controle: b.dv },
    produto: c.carteira, negociacao: Number(negociacao11(c.negociacao)),
    nossoNumero: Number(nossoNumero), sequencia: 0, codigoBaixa: 57,
  };
}

/** A baixa foi aceita? (CBTT0532 "SOLICITACAO DE BAIXA EFETUADA", ou status 57 nos dados) */
export function baixaAceita(http: number | null, corpo: unknown): boolean {
  const r = (corpo ?? {}) as Record<string, any>;
  return http !== null && http >= 200 && http < 300
    && (/CBTT0532/.test(String(r.mensagem ?? "")) || Number(r?.dados?.status) === 57);
}

// ── Endereço do pagador a partir da NF-e (o endereço FISCAL) ─────────────────
export type EnderecoPagador = {
  cep: string; logradouro: string; numero: string; complemento: string;
  bairro: string; cidade: string; uf: string; email: string; fone: string;
};

const ENTIDADES: Record<string, string> = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&apos;": "'", "&#39;": "'" };
const desXml = (s: string) => s.replace(/&(amp|lt|gt|quot|apos|#39);/g, (m) => ENTIDADES[m] ?? m).trim();

/**
 * `<dest>…<enderDest>` do XML da NF-e — layout nacional, obrigatório, o mesmo
 * nas duas contas Bling. Devolve null sem CEP (endereço sem CEP não registra
 * boleto, e devolver metade faria a tela parecer preenchida).
 */
export function enderecoDoXmlNfe(xml: string): EnderecoPagador | null {
  const dest = xml.match(/<dest>([\s\S]*?)<\/dest>/i)?.[1];
  if (!dest) return null;
  const end = dest.match(/<enderDest>([\s\S]*?)<\/enderDest>/i)?.[1] ?? "";
  const tag = (bloco: string, t: string) => desXml(bloco.match(new RegExp(`<${t}>([\\s\\S]*?)</${t}>`, "i"))?.[1] ?? "");
  const cep = soDigitos(tag(end, "CEP"));
  if (cep.length !== 8) return null;
  return {
    cep,
    logradouro: tag(end, "xLgr"),
    numero: tag(end, "nro"),
    complemento: tag(end, "xCpl"),
    bairro: tag(end, "xBairro"),
    cidade: tag(end, "xMun"),
    uf: tag(end, "UF").toUpperCase(),
    email: tag(dest, "email").split(/[;,\s]+/)[0] ?? "",
    fone: soDigitos(tag(end, "fone")),
  };
}

/** Só baixa XML do próprio Bling, por https — a URL vem do banco, mas a função não vira proxy. */
export function urlXmlConfiavel(u: string | null | undefined): boolean {
  try {
    const x = new URL(String(u ?? ""));
    return x.protocol === "https:" && (x.hostname === "bling.com.br" || x.hostname.endsWith(".bling.com.br"));
  } catch { return false; }
}

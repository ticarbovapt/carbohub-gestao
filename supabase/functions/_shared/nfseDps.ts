// ═══════════════════════════════════════════════════════════════════════════
// O DPS da NFS-e Nacional — montar, assinar, compactar. PURO (sem rede).
//
// Saiu da sonda `nfse-dps-teste`, que provou em 08/10/2026 que o SEFIN aceita
// este XML (201 com chave de acesso, sha256 e sha1). O que mudou aqui é só o
// TOMADOR, que lá era CNPJ fixo e aqui é CPF ou CNPJ, com fone e e-mail — e o
// indicador de operação (`cIndOp`), que lá era 050104 fixo e aqui é escolhido
// na tela, porque varia conforme o serviço.
//
// ⚠️ A ORDEM DOS ELEMENTOS VEM DO XSD e não é negociável. É a do gabarito que
// o ADN devolveu (o DPS original vem embutido na NFS-e). Elemento fora de
// ordem é rejeição de schema que não diz qual.
//
// ⚠️ O XML é gerado JÁ CANÔNICO (c14n INCLUSIVA): sem espaço entre tags, sem
// comentário, e o `xmlns` MATERIALIZADO no `infDPS`. É isso que dispensa uma
// implementação de C14N, que no Deno não existe pronta e erraria calada.
// ═══════════════════════════════════════════════════════════════════════════

export const NS_NFSE = "http://www.sped.fazenda.gov.br/nfse";
const NS_DSIG = "http://www.w3.org/2000/09/xmldsig#";

/** Os indicadores de operação que a tela oferece (os quatro do emissor web). */
export const C_IND_OP_VALIDOS = ["050101", "050102", "050103", "050104"] as const;

export function esc(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

/** Tira caractere de controle e espaço duplo, e corta no tamanho do campo do XSD. */
export function limpo(s: string | null | undefined, max: number): string {
  return String(s ?? "")
    // deno-lint-ignore no-control-regex
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim()
    .slice(0, max);
}

function b64(bytes: ArrayBuffer | Uint8Array): string {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = "";
  for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]);
  return btoa(s);
}
function pemParaBytes(pem: string): Uint8Array {
  return Uint8Array.from(atob(pemParaB64(pem)), (c) => c.charCodeAt(0));
}
function pemParaB64(pem: string): string {
  return pem.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
}

/** DPS + município(7) + 2(CNPJ) + CNPJ(14) + série(5) + nDPS(15) — conferido contra nota real. */
export function montarId(cLocEmi: string, cnpj: string, serie: string, nDPS: string): string {
  return "DPS" + cLocEmi.padStart(7, "0") + "2" +
    cnpj.replace(/\D/g, "").padStart(14, "0") + serie.padStart(5, "0") + nDPS.padStart(15, "0");
}

export interface Tomador {
  /** só dígitos: 11 = CPF, 14 = CNPJ */
  doc: string;
  nome: string;
  cMun: string; cep: string;
  lgr: string; nro: string; cpl?: string; bairro: string;
  fone?: string; email?: string;
}

export interface DadosDps {
  tpAmb: "1" | "2";
  cLocEmi: string; cnpjPrest: string; fonePrest: string; emailPrest: string;
  serie: string; nDPS: string; dhEmi: string; dCompet: string;
  toma: Tomador;
  descServ: string; infComp: string; valor: string;
  cIndOp: string;
}

function tomadorXml(t: Tomador): string {
  const doc = t.doc.replace(/\D/g, "");
  const id = doc.length === 11 ? `<CPF>${doc}</CPF>` : `<CNPJ>${doc}</CNPJ>`;
  const fone = (t.fone ?? "").replace(/\D/g, "");
  return `<toma>` + id +
    `<xNome>${esc(t.nome)}</xNome>` +
    `<end><endNac><cMun>${t.cMun}</cMun><CEP>${t.cep}</CEP></endNac>` +
      `<xLgr>${esc(t.lgr)}</xLgr><nro>${esc(t.nro)}</nro>` +
      (t.cpl ? `<xCpl>${esc(t.cpl)}</xCpl>` : "") +
      `<xBairro>${esc(t.bairro)}</xBairro></end>` +
    // ⚠️ fone/email são OPCIONAIS no schema; vazio vai AUSENTE, nunca `<fone></fone>`.
    (fone.length >= 6 ? `<fone>${fone.slice(0, 20)}</fone>` : "") +
    (t.email ? `<email>${esc(t.email)}</email>` : "") +
    `</toma>`;
}

export function montarInfDps(d: DadosDps, id: string): string {
  const infoCompl = d.infComp ? `<infoCompl><xInfComp>${esc(d.infComp)}</xInfComp></infoCompl>` : "";
  return `<infDPS xmlns="${NS_NFSE}" Id="${id}">` +
    `<tpAmb>${d.tpAmb}</tpAmb>` +
    `<dhEmi>${d.dhEmi}</dhEmi>` +
    `<verAplic>CarboHub_1.0.0</verAplic>` +
    `<serie>${esc(d.serie)}</serie>` +
    `<nDPS>${esc(d.nDPS)}</nDPS>` +
    `<dCompet>${d.dCompet}</dCompet>` +
    `<tpEmit>1</tpEmit>` +
    `<cLocEmi>${d.cLocEmi}</cLocEmi>` +
    `<prest>` +
      `<CNPJ>${d.cnpjPrest}</CNPJ>` +
      `<fone>${esc(d.fonePrest)}</fone>` +
      `<email>${esc(d.emailPrest)}</email>` +
      `<regTrib><opSimpNac>3</opSimpNac><regApTribSN>1</regApTribSN><regEspTrib>0</regEspTrib></regTrib>` +
    `</prest>` +
    tomadorXml(d.toma) +
    `<serv>` +
      `<locPrest><cLocPrestacao>${d.cLocEmi}</cLocPrestacao></locPrest>` +
      `<cServ><cTribNac>140101</cTribNac>` +
        `<xDescServ>${esc(d.descServ)}</xDescServ>` +
        `<cNBS>120013110</cNBS></cServ>` +
      infoCompl +
    `</serv>` +
    `<valores>` +
      `<vServPrest><vServ>${d.valor}</vServ></vServPrest>` +
      `<trib>` +
        `<tribMun><tribISSQN>1</tribISSQN><tpRetISSQN>1</tpRetISSQN></tribMun>` +
        `<tribFed><piscofins><CST>00</CST><tpRetPisCofins>0</tpRetPisCofins></piscofins></tribFed>` +
        `<totTrib><vTotTrib><vTotTribFed>0.00</vTotTribFed><vTotTribEst>0.00</vTotTribEst><vTotTribMun>0.00</vTotTribMun></vTotTrib></totTrib>` +
      `</trib>` +
    `</valores>` +
    // ⚠️ indFinal e indDest = 0: medido nas 15 notas mais recentes, CPF e CNPJ.
    // As alíquotas de IBS/CBS NÃO vão: o portal calcula (0,10% e 0,90% no modelo).
    `<IBSCBS><finNFSe>0</finNFSe><indFinal>0</indFinal>` +
      `<cIndOp>${d.cIndOp}</cIndOp><indDest>0</indDest>` +
      `<valores><trib><gIBSCBS><CST>000</CST><cClassTrib>000001</cClassTrib></gIBSCBS></trib></valores>` +
    `</IBSCBS>` +
  `</infDPS>`;
}

/** Assinatura rsa-sha256, c14n INCLUSIVA (manual do contribuinte). sha256 provado em 08/10. */
export async function assinar(infDps: string, id: string, certPem: string, keyPem: string): Promise<string> {
  const dv = b64(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(infDps)));
  const signedInfo =
    `<SignedInfo xmlns="${NS_DSIG}">` +
    `<CanonicalizationMethod Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"></CanonicalizationMethod>` +
    `<SignatureMethod Algorithm="http://www.w3.org/2001/04/xmldsig-more#rsa-sha256"></SignatureMethod>` +
    `<Reference URI="#${id}">` +
      `<Transforms>` +
        `<Transform Algorithm="http://www.w3.org/2000/09/xmldsig#enveloped-signature"></Transform>` +
        `<Transform Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"></Transform>` +
      `</Transforms>` +
      `<DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"></DigestMethod>` +
      `<DigestValue>${dv}</DigestValue>` +
    `</Reference>` +
    `</SignedInfo>`;
  const chave = await crypto.subtle.importKey(
    "pkcs8", pemParaBytes(keyPem), { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"],
  );
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", chave, new TextEncoder().encode(signedInfo));
  return `<Signature xmlns="${NS_DSIG}">` + signedInfo +
    `<SignatureValue>${b64(sig)}</SignatureValue>` +
    `<KeyInfo><X509Data><X509Certificate>${pemParaB64(certPem)}</X509Certificate></X509Data></KeyInfo>` +
    `</Signature>`;
}

export function dpsCompleto(infDps: string, signature: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?><DPS xmlns="${NS_NFSE}" versao="1.01">${infDps}${signature}</DPS>`;
}

export async function gzipB64(texto: string): Promise<string> {
  const fluxo = new Blob([new TextEncoder().encode(texto)]).stream().pipeThrough(new CompressionStream("gzip"));
  return b64(await new Response(fluxo).arrayBuffer());
}

export async function gunzipB64(dados: string): Promise<string> {
  const bytes = Uint8Array.from(atob(dados), (c) => c.charCodeAt(0));
  const fluxo = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
  return await new Response(fluxo).text();
}

/** Hora de Brasília com fuso declarado. ⚠️ -3h ANTES de formatar: o Deno roda em UTC. */
export function agoraBrasilia(): { dhEmi: string; hoje: string } {
  const b = new Date(Date.now() - 3 * 60 * 60 * 1000);
  return { dhEmi: b.toISOString().replace(/\.\d{3}Z$/, "-03:00"), hoje: b.toISOString().slice(0, 10) };
}

/**
 * Lê a resposta do SEFIN. ⚠️ Os códigos saem por REGEX no texto cru, não por
 * um caminho fixo do JSON: o formato do erro não está medido em todos os
 * casos, e caminho errado devolveria "sem erro" para uma rejeição.
 */
export function lerResposta(texto: string): { chave: string | null; nfseGz: string | null; codigos: string[]; mensagem: string } {
  let j: Record<string, unknown> | null = null;
  try { j = JSON.parse(texto); } catch { /* corpo não-JSON */ }
  const chave = typeof j?.chaveAcesso === "string" ? j.chaveAcesso : null;
  const nfseGz = typeof j?.nfseXmlGZipB64 === "string" ? j.nfseXmlGZipB64 : null;
  const codigos = [...new Set((texto.match(/\b[EL]\d{4}\b/g) ?? []))];
  const descs: string[] = [];
  const visitar = (v: unknown) => {
    if (Array.isArray(v)) v.forEach(visitar);
    else if (v && typeof v === "object") {
      const o = v as Record<string, unknown>;
      const cod = o.Codigo ?? o.codigo;
      const desc = o.Descricao ?? o.descricao ?? o.Mensagem ?? o.mensagem;
      if (desc) descs.push(`${cod ? `${cod}: ` : ""}${String(desc)}`);
      Object.values(o).forEach(visitar);
    }
  };
  visitar(j);
  return { chave, nfseGz, codigos, mensagem: [...new Set(descs)].join(" · ") || texto.slice(0, 600) };
}

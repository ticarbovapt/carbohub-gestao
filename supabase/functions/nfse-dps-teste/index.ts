// ═══════════════════════════════════════════════════════════════════════════
// nfse-dps-teste — FASE 1: provar que conseguimos ASSINAR um DPS que o ADN aceita
//
// Esta função NÃO emite nota de verdade e NÃO entra em cron nenhum. Ela existe
// para responder UMA pergunta binária, antes de qualquer tela ser escrita:
//
//     conseguimos montar + assinar um DPS que o Sistema Nacional aceita?
//
// Se a resposta for não, as fases seguintes não existem — e é melhor saber
// disso num dia do que em três semanas. Foi o dono do processo que apontou a
// ordem certa: *"não teríamos que validar se é possível a fase 4 antes de
// fazer o restante?"*.
//
// ── ⚠️ DUAS TRAVAS INDEPENDENTES CONTRA EMITIR DE VERDADE ────────────────
//
//   1. a URL é a de PRODUÇÃO RESTRITA (homologação do gov.br)
//   2. `tpAmb = 2` dentro do próprio XML
//
// São duas porque uma só não basta: errar a URL com `tpAmb=1` ou acertar a URL
// com `tpAmb=1` são enganos diferentes, e **DPS aceito em produção É NOTA
// FISCAL DE VERDADE**, com número, que só se desfaz com cancelamento. Mandar
// `producao: true` exige dizer isso explicitamente no corpo, e nem assim ela
// emite sozinha — ela recusa se o `tpAmb` não acompanhar.
//
// ── De onde veio a forma do DPS (medida, não suposta) ────────────────────
//
// O ADN embute o `infDPS` ORIGINAL dentro da NFS-e que devolve, então o
// `carbo_nfse_dfe` já tinha o gabarito: um DPS que o Sistema Nacional aceitou,
// do nosso CNPJ, para o serviço certo. Foi dele que saíram `cTribNac 140101`,
// `cNBS 120013110`, `cLocEmi 2408102`, o `regTrib` do Simples e — o que eu
// jamais teria adivinhado — o bloco `IBSCBS` da reforma tributária, hoje
// obrigatório.
//
// ⚠️ O que o gabarito NÃO dá é a assinatura: o ADN REMOVE a do contribuinte e
// põe a dele. Eu quase copiei os algoritmos do governo (`exc-c14n#WithComments`)
// achando que eram o requisito — e o manual do contribuinte diz outra coisa:
// c14n INCLUSIVA (`REC-xml-c14n-20010315`). Medir a coisa certa e ler como se
// respondesse outra pergunta é o erro mais barato de cometer e o mais caro de
// descobrir.
// ═══════════════════════════════════════════════════════════════════════════

const NS_NFSE = "http://www.sped.fazenda.gov.br/nfse";
const NS_DSIG = "http://www.w3.org/2000/09/xmldsig#";

// ⚠️ Produção restrita. A de produção fica COMENTADA de propósito: descomentar
// é um gesto deliberado, não um parâmetro que se passa por engano.
// ⚠️ O ENVIO é feito pelo `nfse-relay` (apps/financas/api), que tem o destino
// fixo `/SefinNacional/nfse`. Esta constante só serve ao `diagnostico`.
const URL_RESTRITA = "https://sefin.producaorestrita.nfse.gov.br/sefinnacional/dps";

function json(corpo: unknown, status = 200) {
  return new Response(JSON.stringify(corpo, null, 2), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// ── PEM → bytes ────────────────────────────────────────────────────────────
// ⚠️ Aceita o PEM com qualquer rótulo: `CERTIFICATE`, `PRIVATE KEY`. O que
// importa é o miolo base64 entre as linhas de cerca.
function pemParaBytes(pem: string): Uint8Array {
  const b64 = pem.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}
function pemParaB64(pem: string): string {
  return pem.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
}

// ⚠️ XML exige escape, e esquecer um `&` num nome de cliente ("A & B Ltda")
// produz XML malformado que o ADN rejeita com erro genérico de schema.
function esc(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

function b64(bytes: ArrayBuffer | Uint8Array): string {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = "";
  for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]);
  return btoa(s);
}

// ═══════════════════════════════════════════════════════════════════════════
// O Id do DPS — forma FIXA, confirmada no manual e no gabarito:
//
//   DPS + município(7) + tipoInscricao(1) + CNPJ/CPF(14) + série(5) + nDPS(15)
//
// Conferido contra uma nota real:
//   DPS 2408102 2 36060692000100 70000 000000000000359
// ═══════════════════════════════════════════════════════════════════════════
function montarId(cLocEmi: string, cnpj: string, serie: string, nDPS: string): string {
  return "DPS" +
    cLocEmi.padStart(7, "0") +
    "2" +                              // 2 = CNPJ
    cnpj.replace(/\D/g, "").padStart(14, "0") +
    serie.padStart(5, "0") +
    nDPS.padStart(15, "0");
}

// ═══════════════════════════════════════════════════════════════════════════
// ⚠️ O XML é gerado JÁ CANÔNICO — e essa é a decisão técnica central.
//
// Não existe C14N pronto no Deno, e implementar canonicalização genérica é o
// caminho de errar em silêncio: digest diferente, rejeição que não diz onde.
// A saída é a que o pessoal de NF-e usa há anos: se EU gero o XML, posso
// gerá-lo já na forma canônica e a canonicalização vira quase identidade.
//
// Para a c14n INCLUSIVA (`REC-xml-c14n-20010315`) isso exige:
//   · sem comentários e sem instruções de processamento
//   · sem quebra de linha ou espaço entre tags
//   · UTF-8 sem BOM
//   · o `xmlns` em escopo MATERIALIZADO no elemento assinado, ANTES dos
//     atributos — é a regra que mais gente erra, porque no documento final o
//     `xmlns` está no elemento PAI e some da vista.
//
// ⚠️ É por isso que `infDPS` carrega `xmlns` aqui: o que é assinado é este
// texto, exatamente como está.
// ═══════════════════════════════════════════════════════════════════════════
interface DadosDps {
  cLocEmi: string; cnpjPrest: string; fonePrest: string; emailPrest: string;
  serie: string; nDPS: string; dhEmi: string; dCompet: string;
  tomaCnpj: string; tomaNome: string; tomaMun: string; tomaCep: string;
  tomaLgr: string; tomaNro: string; tomaBairro: string;
  descServ: string; infComp: string; valor: string;
  tpAmb: "1" | "2";
}

function montarInfDps(d: DadosDps, id: string): string {
  // ⚠️ A ORDEM dos elementos NÃO é negociável em XML fiscal — ela vem do XSD.
  // Esta é a ordem exata do gabarito que o ADN aceitou.
  const infoCompl = d.infComp
    ? `<infoCompl><xInfComp>${esc(d.infComp)}</xInfComp></infoCompl>`
    : "";

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
      // Simples Nacional — copiado do gabarito, não inventado.
      `<regTrib><opSimpNac>3</opSimpNac><regApTribSN>1</regApTribSN><regEspTrib>0</regEspTrib></regTrib>` +
    `</prest>` +
    `<toma>` +
      `<CNPJ>${d.tomaCnpj}</CNPJ>` +
      `<xNome>${esc(d.tomaNome)}</xNome>` +
      `<end><endNac><cMun>${d.tomaMun}</cMun><CEP>${d.tomaCep}</CEP></endNac>` +
      `<xLgr>${esc(d.tomaLgr)}</xLgr><nro>${esc(d.tomaNro)}</nro>` +
      `<xBairro>${esc(d.tomaBairro)}</xBairro></end>` +
    `</toma>` +
    `<serv>` +
      `<locPrest><cLocPrestacao>${d.cLocEmi}</cLocPrestacao></locPrest>` +
      // ⚠️ cTribNac/cNBS do gabarito: o MESMO código cobre descarbonização e
      // comissão (medido — as duas usam 140101).
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
    // ⚠️ REFORMA TRIBUTÁRIA. Este bloco não estava em manual nenhum que eu
    // tivesse lido — ele apareceu no gabarito, e sem ele a rejeição seria por
    // schema, sem dizer o que falta.
    `<IBSCBS><finNFSe>0</finNFSe><indFinal>0</indFinal>` +
      `<cIndOp>050104</cIndOp><indDest>0</indDest>` +
      `<valores><trib><gIBSCBS><CST>000</CST><cClassTrib>000001</cClassTrib></gIBSCBS></trib></valores>` +
    `</IBSCBS>` +
  `</infDPS>`;
}

// ═══════════════════════════════════════════════════════════════════════════
// A assinatura, segundo o MANUAL DO CONTRIBUINTE — não segundo o XML que o
// governo devolve.
//
//   CanonicalizationMethod   REC-xml-c14n-20010315   (INCLUSIVA)
//   SignatureMethod          rsa-sha1  ← ⚠️ ver abaixo
//   DigestMethod             sha1      ← ⚠️ ver abaixo
//   Transforms               enveloped-signature + c14n
//
// ⚠️ **O ALGORITMO É A ÚNICA COISA QUE EU NÃO CONSEGUI MEDIR.** O padrão de
// documento fiscal brasileiro historicamente usa SHA-1 (NF-e, CT-e), e o
// manual do contribuinte da NFS-e aponta a c14n inclusiva — mas a assinatura
// do próprio ADN usa SHA-256. Os dois são plausíveis e eu NÃO VOU CHUTAR:
// o parâmetro `algo` escolhe, e a sonda testa os dois. Quem responde é a
// rejeição, não a minha opinião.
// ═══════════════════════════════════════════════════════════════════════════
type Algo = "sha1" | "sha256";
const URI_ALGO: Record<Algo, { sig: string; dig: string; hash: string }> = {
  sha1: {
    sig: "http://www.w3.org/2000/09/xmldsig#rsa-sha1",
    dig: "http://www.w3.org/2000/09/xmldsig#sha1",
    hash: "SHA-1",
  },
  sha256: {
    sig: "http://www.w3.org/2001/04/xmldsig-more#rsa-sha256",
    dig: "http://www.w3.org/2001/04/xmlenc#sha256",
    hash: "SHA-256",
  },
};

async function digest(texto: string, hash: string): Promise<string> {
  const d = await crypto.subtle.digest(hash, new TextEncoder().encode(texto));
  return b64(d);
}

async function assinar(infDps: string, id: string, certPem: string, keyPem: string, algo: Algo) {
  const A = URI_ALGO[algo];

  // ⚠️ O digest é sobre o infDPS COM o xmlns materializado — que é exatamente
  // a string que `montarInfDps` produz. A transform `enveloped-signature` é
  // no-op aqui porque a Signature é IRMÃ do infDPS, não filha dele.
  const dv = await digest(infDps, A.hash);

  // ⚠️ O SignedInfo também é canonicalizado antes de assinar, então ele
  // também carrega o próprio xmlns materializado.
  const signedInfo =
    `<SignedInfo xmlns="${NS_DSIG}">` +
    `<CanonicalizationMethod Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"></CanonicalizationMethod>` +
    `<SignatureMethod Algorithm="${A.sig}"></SignatureMethod>` +
    `<Reference URI="#${id}">` +
      `<Transforms>` +
        `<Transform Algorithm="http://www.w3.org/2000/09/xmldsig#enveloped-signature"></Transform>` +
        `<Transform Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"></Transform>` +
      `</Transforms>` +
      `<DigestMethod Algorithm="${A.dig}"></DigestMethod>` +
      `<DigestValue>${dv}</DigestValue>` +
    `</Reference>` +
    `</SignedInfo>`;

  const chave = await crypto.subtle.importKey(
    "pkcs8",
    pemParaBytes(keyPem),
    { name: "RSASSA-PKCS1-v1_5", hash: A.hash },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    chave,
    new TextEncoder().encode(signedInfo),
  );

  return `<Signature xmlns="${NS_DSIG}">` +
    signedInfo +
    `<SignatureValue>${b64(sig)}</SignatureValue>` +
    `<KeyInfo><X509Data><X509Certificate>${pemParaB64(certPem)}</X509Certificate></X509Data></KeyInfo>` +
    `</Signature>`;
}

// ── GZip + Base64, como o ADN exige no envio ───────────────────────────────
async function gzipB64(texto: string): Promise<string> {
  const fluxo = new Blob([new TextEncoder().encode(texto)])
    .stream().pipeThrough(new CompressionStream("gzip"));
  const buf = await new Response(fluxo).arrayBuffer();
  return b64(buf);
}

Deno.serve(async (req: Request): Promise<Response> => {
  // ⚠️ Fecha quando o segredo não existe — nunca abre. A regra do repo, e aqui
  // ela importa mais que o normal: esta função assina documento fiscal.
  const segredo = Deno.env.get("CRON_SECRET");
  const informado = req.headers.get("X-Cron-Secret");
  if (!segredo) return json({ ok: false, erro: "CRON_SECRET ausente no servidor" }, 500);
  if (informado !== segredo) return json({ ok: false, erro: "Unauthorized" }, 401);

  const cert = Deno.env.get("NFSE_CERT_PEM");
  const key = Deno.env.get("NFSE_KEY_PEM");
  if (!cert || !key) {
    return json({
      ok: false,
      erro: "Faltam secrets",
      faltando: [!cert && "NFSE_CERT_PEM", !key && "NFSE_KEY_PEM"].filter(Boolean),
    }, 500);
  }
  if (/ENCRYPTED/i.test(key)) {
    return json({ ok: false, erro: "NFSE_KEY_PEM está com senha. O Deno não abre chave cifrada." }, 500);
  }

  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const algo: Algo = body.algo === "sha1" ? "sha1" : "sha256";
  const enviar = body.enviar === true;

  // ═════════════════════════════════════════════════════════════════════════
  // `{"diagnostico": true}` — UM deploy, muitas respostas
  //
  // Medido em 02/10/2026: forçar HTTP/1.1 tirou o `endpoint requires HTTP/1.1`
  // e trouxe `Connection reset by peer (os error 104)`. ⚠️ Esse reset tem TRÊS
  // causas possíveis com a MESMA cara — certificado recusado, caminho que não
  // existe, ou o corpo do POST — e um deploy por hipótese é o jeito caro de
  // descobrir qual.
  //
  // ⚠️ O que torna isto mensurável é haver CONTROLE POSITIVO: o
  // `adn.producaorestrita` responde ao nosso certificado na leitura (é o que a
  // `nfse-nacional` faz desde 23/09). Se ele responder aqui e o `sefin`
  // resetar, o certificado está fora de suspeita — e sem esse par o reset não
  // prova nada.
  //
  // ⚠️ E há CONTROLE NEGATIVO: a MESMA chamada SEM o certificado. Se sem cert
  // vier resposta HTTP e com cert vier reset, é o certificado que o servidor
  // está recusando — a inversão que nenhuma outra medição mostra.
  //
  // ⚠️ A LISTA DE HOSTS É FECHADA, como na `nfse-nacional`, e não é zelo: esta
  // função APRESENTA O CERTIFICADO A1 DA EMPRESA em cada requisição. Um
  // parâmetro de host livre a transformaria num proxy que assina, no CNPJ da
  // Carbo, contra qualquer servidor que alguém escolher.
  //
  // ⚠️ SÓ HOSTS DE PRODUÇÃO RESTRITA. Sondar produção com o certificado é
  // bater na porta do serviço que emite nota de verdade.
  // ═════════════════════════════════════════════════════════════════════════
  if (body.diagnostico === true) {
    const ADN = "https://adn.producaorestrita.nfse.gov.br";
    const SEFIN = "https://sefin.producaorestrita.nfse.gov.br";

    // Um DPS mínimo e assinado, só para o corpo não ser vazio nos POSTs.
    const dAmostra: DadosDps = {
      tpAmb: "2", cLocEmi: "2408102", cnpjPrest: "36060692000100",
      fonePrest: "8432075055", emailPrest: "fiscal@carbovapt.com.br",
      serie: "1", nDPS: "900", dhEmi: "2026-10-02T12:00:00-03:00",
      dCompet: "2026-10-02", tomaCnpj: "04601397000128",
      tomaNome: "TESTE", tomaMun: "2310803", tomaCep: "63460000",
      tomaLgr: "RUA TESTE", tomaNro: "S/N", tomaBairro: "CENTRO",
      descServ: "Teste de conectividade.", infComp: "TESTE",
      valor: "1.00",
    };
    const idA = montarId(dAmostra.cLocEmi, dAmostra.cnpjPrest, dAmostra.serie, dAmostra.nDPS);
    const infA = montarInfDps(dAmostra, idA);
    let gz = "";
    try {
      const sigA = await assinar(infA, idA, cert, key, algo);
      gz = await gzipB64(
        `<?xml version="1.0" encoding="UTF-8"?><DPS xmlns="${NS_NFSE}" versao="1.01">${infA}${sigA}</DPS>`,
      );
    } catch (e) {
      return json({ ok: false, etapa: "assinar (diagnostico)", erro: String(e) }, 500);
    }

    // ⚠️ DOIS clientes: um COM certificado e um SEM. É o par que separa
    // "o servidor recusa o nosso cert" de "o servidor não está aí".
    let cliCert: Deno.HttpClient | null = null;
    try {
      cliCert = Deno.createHttpClient(
        { cert, key, http1: true, http2: false } as Deno.CreateHttpClientOptions,
      );
    } catch { /* reportado por tentativa */ }
    let cliNu: Deno.HttpClient | null = null;
    try {
      cliNu = Deno.createHttpClient({ http1: true, http2: false } as Deno.CreateHttpClientOptions);
    } catch { /* idem */ }

    type Caso = {
      nome: string; url: string; metodo: "GET" | "POST";
      comCert: boolean; corpo?: string; tipo?: string;
    };
    const corpoPadrao = JSON.stringify({ dpsXmlGZipB64: gz });

    const casos: Caso[] = [
      // ── CONTROLE POSITIVO: o host e o caminho que JÁ funcionam ───────────
      { nome: "A· CONTROLE+ adn DFe GET (cert)", url: `${ADN}/contribuintes/DFe/0`, metodo: "GET", comCert: true },
      // ── CONTROLE NEGATIVO: o mesmo, sem certificado ──────────────────────
      { nome: "B· CONTROLE- adn DFe GET (SEM cert)", url: `${ADN}/contribuintes/DFe/0`, metodo: "GET", comCert: false },
      // ── O host do DPS fala HTTP com o nosso cert? ───────────────────────
      { nome: "C· sefin dps GET (cert)", url: `${SEFIN}/sefinnacional/dps`, metodo: "GET", comCert: true },
      { nome: "D· sefin raiz GET (cert)", url: `${SEFIN}/`, metodo: "GET", comCert: true },
      { nome: "E· sefin dps GET (SEM cert)", url: `${SEFIN}/sefinnacional/dps`, metodo: "GET", comCert: false },
      // ── O POST que está resetando, e as variações que isolam o porquê ───
      { nome: "F· sefin dps POST corpo cheio (cert)", url: `${SEFIN}/sefinnacional/dps`, metodo: "POST", comCert: true, corpo: corpoPadrao },
      { nome: "G· sefin dps POST corpo {} (cert)", url: `${SEFIN}/sefinnacional/dps`, metodo: "POST", comCert: true, corpo: "{}" },
      { nome: "H· sefin dps POST corpo cheio (SEM cert)", url: `${SEFIN}/sefinnacional/dps`, metodo: "POST", comCert: false, corpo: corpoPadrao },
      // ── Variações de CAMINHO e de HOST para o POST ──────────────────────
      { nome: "I· sefin SefinNacional/dps POST (cert)", url: `${SEFIN}/SefinNacional/dps`, metodo: "POST", comCert: true, corpo: corpoPadrao },
      { nome: "J· sefin /dps POST (cert)", url: `${SEFIN}/dps`, metodo: "POST", comCert: true, corpo: corpoPadrao },
      { nome: "K· adn sefinnacional/dps POST (cert)", url: `${ADN}/sefinnacional/dps`, metodo: "POST", comCert: true, corpo: corpoPadrao },
      { nome: "L· adn contribuintes/dps POST (cert)", url: `${ADN}/contribuintes/dps`, metodo: "POST", comCert: true, corpo: corpoPadrao },
    ];

    const achados: unknown[] = [];
    for (const c of casos) {
      const cli = c.comCert ? cliCert : cliNu;
      if (!cli) {
        achados.push({ caso: c.nome, erro: "cliente não pôde ser criado" });
        continue;
      }
      const t0 = Date.now();
      try {
        const r = await fetch(c.url, {
          client: cli,
          method: c.metodo,
          headers: c.metodo === "POST"
            ? { "Content-Type": c.tipo ?? "application/json", Accept: "application/json" }
            : { Accept: "application/json" },
          body: c.metodo === "POST" ? c.corpo : undefined,
        });
        const txt = await r.text().catch(() => "");
        achados.push({
          caso: c.nome, url: c.url, status: r.status, ms: Date.now() - t0,
          // ⚠️ O corpo vai CRU, só truncado. A rejeição do ADN diz qual campo,
          // e resumir aqui é perder a única coisa que a sonda traz.
          corpo: txt.slice(0, 700),
        });
      } catch (e) {
        achados.push({ caso: c.nome, url: c.url, ms: Date.now() - t0, erro: String(e) });
      }
    }

    return json({
      ok: true,
      modo: "DIAGNÓSTICO de conectividade (produção restrita apenas)",
      algo,
      // ⚠️ A leitura NÃO é "qual deu 200". É o PADRÃO entre os controles:
      leitura: {
        "A responde e C/F resetam": "o certificado está OK — o problema é host/caminho/corpo do DPS",
        "A resetar também": "é a rede do Supabase ou o certificado, e aí nada abaixo prova nada",
        "H/E responder e F/C resetar": "o servidor está RECUSANDO o nosso certificado",
        "A e B iguais": "o endpoint de leitura não exige mTLS, então ele NÃO serve de controle do cert",
      },
      achados,
    });
  }

  // ⚠️ SEM `producao` no corpo, SEMPRE restrita e SEMPRE tpAmb=2. E mesmo com
  // ele, a função recusa: emitir de verdade não é coisa de sonda.
  if (body.producao === true) {
    return json({
      ok: false,
      erro: "Esta função NÃO emite em produção. DPS aceito em produção é nota fiscal com número, " +
            "que só se desfaz com cancelamento. Produção é outra função, escrita de propósito.",
    }, 400);
  }

  // ⚠️ `dhEmi` é hora LOCAL com fuso declarado, e o Deno roda em UTC. Trocar o
  // sufixo `Z` por `-03:00` sem mover o relógio não muda o formato — move o
  // INSTANTE três horas para o FUTURO, e data de emissão futura é rejeição do
  // ADN. Por isso o -3h vem ANTES da formatação. É a mesma doença do
  // `ordered_at::date` deste repo, na versão que o schema recusa.
  const agora = new Date();
  const brasilia = new Date(agora.getTime() - 3 * 60 * 60 * 1000);
  const iso = brasilia.toISOString().replace(/\.\d{3}Z$/, "-03:00");
  // ⚠️ A competência é o MÊS, e ela também é de Brasília: às 21h do dia 31 o
  // UTC já virou o mês seguinte.
  const hoje = brasilia.toISOString().slice(0, 10);

  const dados: DadosDps = {
    tpAmb: "2",                       // ⚠️ homologação, sempre
    cLocEmi: "2408102",               // Natal/RN — do gabarito
    cnpjPrest: "36060692000100",
    fonePrest: "8432075055",
    emailPrest: "fiscal@carbovapt.com.br",
    // ⚠️ Série PRÓPRIA. A 70000 é do emissor web, e o nDPS é sequencial POR
    // SÉRIE — usar a mesma faria o nosso contador competir com o de quem
    // digita no portal. Duas fontes incrementando o mesmo número é nota
    // duplicada no pior caso.
    serie: String(body.serie ?? "1"),
    nDPS: String(body.nDPS ?? "1"),
    dhEmi: iso,
    dCompet: hoje,
    tomaCnpj: String(body.tomaCnpj ?? "04601397000128"),
    tomaNome: String(body.tomaNome ?? "TESTE HOMOLOGACAO"),
    tomaMun: String(body.tomaMun ?? "2310803"),
    tomaCep: String(body.tomaCep ?? "63460000"),
    tomaLgr: String(body.tomaLgr ?? "RUA TESTE"),
    tomaNro: String(body.tomaNro ?? "S/N"),
    tomaBairro: String(body.tomaBairro ?? "CENTRO"),
    descServ: String(body.descServ ?? "Descarbonizacao de veiculos."),
    // ⚠️ É AQUI que o rodapé do cruzamento vai morar quando isto virar
    // produção. O campo já é usado para referenciar pedido do CLIENTE
    // ("Pedido 4500787362"), então o nosso código ACRESCENTA, nunca substitui.
    infComp: String(body.infComp ?? "TESTE DE HOMOLOGACAO - NAO E DOCUMENTO FISCAL"),
    valor: String(body.valor ?? "1.00"),
  };

  const id = montarId(dados.cLocEmi, dados.cnpjPrest, dados.serie, dados.nDPS);
  const infDps = montarInfDps(dados, id);

  let signature: string;
  try {
    signature = await assinar(infDps, id, cert, key, algo);
  } catch (e) {
    return json({
      ok: false, etapa: "assinar", algo,
      erro: String(e),
      dica: "Se falhou no importKey, a chave não está em PKCS#8 ('BEGIN PRIVATE KEY'). " +
            "Chave em PKCS#1 ('BEGIN RSA PRIVATE KEY') precisa ser convertida.",
    }, 500);
  }

  const dpsXml = `<?xml version="1.0" encoding="UTF-8"?>` +
    `<DPS xmlns="${NS_NFSE}" versao="1.01">${infDps}${signature}</DPS>`;

  const compactado = await gzipB64(dpsXml);

  // ⚠️ Sem `enviar: true` ela PARA aqui e devolve o que montou. É o modo que
  // responde "a assinatura ficou de pé?" sem tocar em serviço fiscal nenhum —
  // e é o primeiro a rodar, sempre.
  if (!enviar) {
    return json({
      ok: true,
      modo: "montagem (nada foi enviado)",
      algo,
      id,
      tamanho_xml: dpsXml.length,
      tamanho_gzip_b64: compactado.length,
      infDps_assinado: infDps,
      signature,
      proximo_passo: 'reenvie com {"enviar": true} para mandar à produção restrita',
    });
  }

  // ⚠️ O ENVIO NÃO SAI DAQUI. Medido em 08/10/2026: o SEFIN (IIS) só pede o
  // certificado por RENEGOCIAÇÃO TLS 1.2 quando vê `/SefinNacional/...`, e o
  // rustls do Deno não renegocia — a conexão caía com `Connection reset by
  // peer`, com e sem certificado, com e sem corpo. Quem transporta é o
  // `nfse-relay` (Node/OpenSSL, no Vercel do Finanças). Aqui continua a
  // montagem e a assinatura; lá, só o mTLS para um destino FIXO.
  const relayUrl = Deno.env.get("NFSE_RELAY_URL") ?? "https://finance.carbohub.com.br/api/nfse-relay";
  const relaySecret = Deno.env.get("NFSE_RELAY_SECRET");
  if (!relaySecret) {
    return json({ ok: false, etapa: "relay", erro: "NFSE_RELAY_SECRET ausente no Supabase" }, 500);
  }

  try {
    const res = await fetch(relayUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Relay-Secret": relaySecret },
      body: JSON.stringify({ dpsXmlGZipB64: compactado }),
    });
    const texto = await res.text();
    let relay: unknown = texto.slice(0, 20000);
    try { relay = JSON.parse(texto); } catch { /* corpo não-JSON vai cru */ }
    return json({
      ok: res.ok && (relay as { ok?: boolean })?.ok === true,
      modo: "ENVIADO à produção restrita (via nfse-relay)",
      algo,
      id,
      relay_status: res.status,
      // ⚠️ O corpo vai CRU e inteiro. A rejeição do SEFIN diz qual campo, e
      // resumir isso aqui é perder a única informação que a sonda existe para
      // trazer — a mesma lição do card que devolvia `[]` em vez do erro.
      relay,
    }, 200);
  } catch (e) {
    return json({ ok: false, etapa: "relay", url: relayUrl, erro: String(e) }, 500);
  }
});

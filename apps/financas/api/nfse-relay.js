// ═══════════════════════════════════════════════════════════════════════════
// nfse-relay — o TRANSPORTE do DPS até o SEFIN Nacional, e só isso
//
// Por que existe uma função no Vercel (Node), e não no Supabase (Deno):
// medido em 08/10/2026. O `sefin.*.nfse.gov.br` é IIS e só pede o certificado
// do cliente quando vê o caminho `/SefinNacional/...` — por RENEGOCIAÇÃO TLS
// 1.2 (`HelloRequest` → `CertificateRequest`). O Deno usa rustls, que NÃO
// renegocia por decisão de projeto, e a conexão cai com `Connection reset by
// peer`, com e sem certificado, com e sem corpo. O OpenSSL (curl, Node)
// renegocia e chega ao servidor. TLS 1.3 o host recusa no ClientHello.
//
// Quem MONTA e ASSINA o DPS continua sendo a edge function (`nfse-dps-*`).
// Aqui não se monta nada: recebe o `dpsXmlGZipB64` pronto, apresenta o
// certificado e devolve a resposta CRUA.
//
// ⚠️ Esta função apresenta o CERTIFICADO A1 DA EMPRESA. Por isso:
//   1. o DESTINO É FIXO — não existe parâmetro de host nem de caminho. Um
//      destino livre faria dela um proxy que assina, no CNPJ da Carbo, contra
//      qualquer servidor;
//   2. FECHA sem segredo (500) e com segredo errado (401) — nunca abre;
//   3. SÓ PRODUÇÃO RESTRITA (homologação). A URL de produção fica comentada:
//      descomentar é gesto deliberado, não parâmetro passado por engano. DPS
//      aceito em produção é nota fiscal com número;
//   4. nunca devolve nem registra certificado, chave ou segredo.
//
// Env no projeto do Vercel do Finanças (Production):
//   NFSE_CERT_PEM · NFSE_KEY_PEM (PKCS#8 sem senha) · NFSE_RELAY_SECRET
// ═══════════════════════════════════════════════════════════════════════════

import https from "node:https";

const DESTINO = {
  hostname: "sefin.producaorestrita.nfse.gov.br",
  path: "/SefinNacional/nfse",
};
// const DESTINO_PRODUCAO = { hostname: "sefin.nfse.gov.br", path: "/SefinNacional/nfse" };

function lerCorpo(req) {
  if (req.body && typeof req.body === "object") return Promise.resolve(req.body);
  if (typeof req.body === "string") {
    try { return Promise.resolve(JSON.parse(req.body)); } catch { return Promise.resolve(null); }
  }
  return new Promise((resolve) => {
    let s = "";
    req.on("data", (c) => { s += c; });
    req.on("end", () => { try { resolve(JSON.parse(s)); } catch { resolve(null); } });
    req.on("error", () => resolve(null));
  });
}

function enviar(cert, key, payload) {
  return new Promise((resolve, reject) => {
    const corpo = JSON.stringify(payload);
    const r = https.request({
      ...DESTINO,
      method: "POST",
      cert,
      key,
      // ⚠️ O host derruba TLS 1.3 no ClientHello; é na 1.2 que a renegociação
      // acontece. HTTP/1.1 é o único que o `https` do Node fala — e é o que o
      // SEFIN exige (`HTTP_1_1_REQUIRED`).
      minVersion: "TLSv1.2",
      maxVersion: "TLSv1.2",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "Content-Length": Buffer.byteLength(corpo),
      },
      timeout: 40000,
    }, (res) => {
      let s = "";
      res.setEncoding("utf8");
      res.on("data", (c) => { s += c; });
      res.on("end", () => resolve({ status: res.statusCode, corpo: s }));
    });
    r.on("timeout", () => r.destroy(new Error("timeout de 40 s no SEFIN")));
    r.on("error", reject);
    r.end(corpo);
  });
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  const responder = (status, obj) => res.status(status).json(obj);

  if (req.method !== "POST") return responder(405, { ok: false, erro: "Use POST" });

  const segredo = process.env.NFSE_RELAY_SECRET;
  if (!segredo) return responder(500, { ok: false, erro: "NFSE_RELAY_SECRET ausente no servidor (Vercel)" });
  if (req.headers["x-relay-secret"] !== segredo) return responder(401, { ok: false, erro: "Unauthorized" });

  const cert = process.env.NFSE_CERT_PEM;
  const key = process.env.NFSE_KEY_PEM;
  if (!cert || !key) {
    return responder(500, {
      ok: false, etapa: "config",
      erro: "Faltam variáveis no Vercel",
      faltando: [!cert && "NFSE_CERT_PEM", !key && "NFSE_KEY_PEM"].filter(Boolean),
    });
  }
  if (/ENCRYPTED/i.test(key)) {
    return responder(500, { ok: false, etapa: "config", erro: "NFSE_KEY_PEM está com senha; precisa ser a chave sem senha (PKCS#8)." });
  }

  const body = await lerCorpo(req);
  const gz = body && typeof body.dpsXmlGZipB64 === "string" ? body.dpsXmlGZipB64 : "";
  // Base64 e nada mais: o relay não carrega texto livre para o gov.br.
  if (!gz || gz.length > 500000 || !/^[A-Za-z0-9+/=]+$/.test(gz)) {
    return responder(400, { ok: false, erro: "dpsXmlGZipB64 ausente ou inválido" });
  }

  try {
    const r = await enviar(cert, key, { dpsXmlGZipB64: gz });
    return responder(200, {
      ok: r.status >= 200 && r.status < 300,
      destino: `https://${DESTINO.hostname}${DESTINO.path}`,
      status: r.status,
      // ⚠️ CRU e inteiro: a rejeição do SEFIN diz qual campo.
      resposta: r.corpo.slice(0, 20000),
    });
  } catch (e) {
    return responder(502, {
      ok: false, etapa: "tls/rede",
      destino: `https://${DESTINO.hostname}${DESTINO.path}`,
      erro: String(e && e.message ? e.message : e),
    });
  }
}

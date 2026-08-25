// ─────────────────────────────────────────────────────────────────────────────
// Shopee Open Platform v2 — a assinatura, pura e testável
//
// ⚠️ Este arquivo existe separado da edge function porque a assinatura é a
// única parte do fluxo que erra CALADA. Credencial errada devolve 401 e alguém
// vê; base string errada devolve `error_sign` — que parece "a chave está
// errada" e manda a pessoa trocar a chave certa por outra. Já perdemos um dia
// nesse tipo de disfarce com o CRON_SECRET.
//
// ── A regra, em uma frase ─────────────────────────────────────────────────
//
// A Shopee assina o CAMINHO e o RELÓGIO, nunca o corpo. A base string muda
// conforme o endpoint seja público (autorização) ou de loja (já autenticado):
//
//   público  →  partner_id + path + timestamp
//   de loja  →  partner_id + path + timestamp + access_token + shop_id
//
// Duas consequências que valem mais que a fórmula:
//
// 1. Trocar a ordem dos pedaços dá `error_sign`, não erro de campo. É
//    concatenação crua: não há separador, não há JSON, não há ordenação
//    alfabética de parâmetros como em outras APIs.
// 2. O `timestamp` é em SEGUNDOS e vale por poucos minutos. `Date.now()` em
//    milissegundos passa no TypeScript e falha em produção — é o mesmo erro de
//    unidade que joga o faturamento do dia 31 para o mês seguinte.
// ─────────────────────────────────────────────────────────────────────────────

/** Caminhos que este projeto usa. Ficam aqui porque o path ENTRA na assinatura:
 *  escrever o caminho na URL e outro na base string dá `error_sign`, e a causa
 *  não aparece em lugar nenhum da mensagem. */
export const SHOPEE_PATHS = {
  autorizar:  "/api/v2/shop/auth_partner",
  tokenNovo:  "/api/v2/auth/token/get",
  tokenRenovar: "/api/v2/auth/access_token/get",
} as const;

/**
 * Host da Shopee.
 *
 * ⚠️ Sandbox e produção são HOSTS diferentes, com partner_id e partner_key
 * diferentes. Apontar a chave de sandbox para o host de produção devolve...
 * `error_sign`. De novo o mesmo disfarce: o erro fala de assinatura e o
 * problema é de ambiente.
 */
export const SHOPEE_HOST_PROD = "https://partner.shopeemobile.com";
export const SHOPEE_HOST_SANDBOX = "https://partner.test-stable.shopeemobile.com";

/** Segundos desde a época. A Shopee recusa timestamp em milissegundos. */
export const agoraEmSegundos = (): number => Math.floor(Date.now() / 1000);

/** HMAC-SHA256 em hex minúsculo — o formato que a Shopee espera. */
export async function hmacHex(chave: string, mensagem: string): Promise<string> {
  const cripto = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(chave),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const buf = await crypto.subtle.sign("HMAC", cripto, new TextEncoder().encode(mensagem));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * A base string. Separada da assinatura de propósito: é ELA que os testes
 * conseguem checar sem rede, e é ela que erra.
 *
 * `accessToken` e `shopId` só entram nos endpoints de loja. Passar os dois num
 * endpoint público faz a Shopee recusar — não é "campo a mais ignorado".
 */
export function baseString(
  partnerId: string, path: string, timestamp: number,
  accessToken?: string, shopId?: string,
): string {
  const base = `${partnerId}${path}${timestamp}`;
  if (!accessToken || !shopId) return base;
  return `${base}${accessToken}${shopId}`;
}

export async function assinar(
  partnerKey: string, partnerId: string, path: string, timestamp: number,
  accessToken?: string, shopId?: string,
): Promise<string> {
  return hmacHex(partnerKey, baseString(partnerId, path, timestamp, accessToken, shopId));
}

/**
 * Monta a URL completa de um endpoint, já assinada.
 *
 * ⚠️ `partner_id`, `timestamp` e `sign` vão na QUERY STRING mesmo em requisição
 * POST. O corpo leva os dados do negócio (`code`, `shop_id`) e não é assinado.
 * É contraintuitivo e é assim.
 */
export async function urlAssinada(
  host: string, path: string, partnerId: string, partnerKey: string,
  extras: Record<string, string> = {},
  accessToken?: string, shopId?: string,
): Promise<string> {
  const ts = agoraEmSegundos();
  const sign = await assinar(partnerKey, partnerId, path, ts, accessToken, shopId);
  const q = new URLSearchParams({
    partner_id: partnerId, timestamp: String(ts), sign, ...extras,
  });
  return `${host}${path}?${q}`;
}

/**
 * A URL para onde a loja é mandada para autorizar o app.
 *
 * ⚠️ O `redirect` precisa ser IDÊNTICO ao cadastrado no painel do parceiro,
 * caractere por caractere. Diferença de barra final já é motivo de recusa, e a
 * Shopee não diz qual das duas ela esperava.
 */
export async function urlDeAutorizacao(
  host: string, partnerId: string, partnerKey: string, redirect: string,
): Promise<string> {
  return urlAssinada(host, SHOPEE_PATHS.autorizar, partnerId, partnerKey, { redirect });
}

/**
 * Quando o access token expira, a partir do `expire_in` que a Shopee devolve.
 *
 * ⚠️ Desconta 5 minutos. O token dura ~4 h e o sync roda de minuto em minuto:
 * sem a folga, uma rodada pega o token no último segundo de vida, a chamada
 * atravessa a virada e falha com `error_auth` — intermitente, irreprodutível, e
 * some quando alguém vai investigar.
 */
export function expiraEm(expireInSegundos: number, agora = new Date()): Date {
  const folga = 5 * 60;
  return new Date(agora.getTime() + Math.max(0, expireInSegundos - folga) * 1000);
}

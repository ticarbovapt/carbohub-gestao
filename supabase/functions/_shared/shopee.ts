// ─────────────────────────────────────────────────────────────────────────────
// Shopee — credenciais, renovação e chamada de API (o lado com IO)
//
// ⚠️ O TOKEN DURA 4 HORAS. É a diferença mais importante entre a Shopee e as
// outras três integrações, e ela muda o desenho: com Mercado Livre (6 h) ou
// Bling (6 h) dá para tratar renovação como caso de borda; aqui, se o refresh
// falhar, a integração morre entre uma madrugada e a manhã seguinte — e o
// sintoma é "não entrou pedido nenhum hoje", que se parece com "não vendemos".
//
// ⚠️ E O REFRESH TOKEN É ROTATIVO. Cada renovação devolve um novo e invalida o
// anterior. Guardar o antigo por engano — ou rodar duas renovações em paralelo
// — derruba a conexão de vez, e só reconectando pelo OAuth. Por isso a
// renovação grava os DOIS tokens na mesma escrita.
// ─────────────────────────────────────────────────────────────────────────────

import {
  SHOPEE_HOST_PROD, SHOPEE_HOST_SANDBOX, SHOPEE_PATHS, urlAssinada, expiraEm,
} from "./shopeeAssina.ts";

export const ID_TOKEN_SHOPEE = "shopee";

export const hostShopee = () =>
  Deno.env.get("SHOPEE_SANDBOX") === "true" ? SHOPEE_HOST_SANDBOX : SHOPEE_HOST_PROD;

export interface CredsShopee {
  accessToken: string;
  shopId: string;
  partnerId: string;
  partnerKey: string;
  lastSyncedAt: Date;
}

/** Renova o access token. Devolve null quando não dá — e diz o motivo no log. */
async function renovar(
  partnerId: string, partnerKey: string, refreshToken: string, shopId: string,
): Promise<{ access_token: string; refresh_token: string; expire_in: number } | null> {
  const url = await urlAssinada(hostShopee(), SHOPEE_PATHS.tokenRenovar, partnerId, partnerKey);
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      refresh_token: refreshToken,
      shop_id: Number(shopId),
      partner_id: Number(partnerId),
    }),
  });
  // ⚠️ A Shopee responde 200 com `error` no corpo. Olhar só o status HTTP
  // gravaria `undefined` por cima de um token válido — e aí nem o antigo serve.
  const d = await res.json() as Record<string, unknown>;
  if (d.error) {
    console.error(`[shopee] refresh recusado: ${d.error} — ${d.message ?? ""}`);
    return null;
  }
  if (!d.access_token || !d.refresh_token) {
    console.error(`[shopee] refresh sem token: ${JSON.stringify(d)}`);
    return null;
  }
  return {
    access_token: String(d.access_token),
    refresh_token: String(d.refresh_token),
    expire_in: Number(d.expire_in ?? 14400),
  };
}

/**
 * Credenciais prontas para uso, renovando quando preciso.
 *
 * ⚠️ NÃO apaga a linha quando o refresh falha, ao contrário do que o
 * `nuvemshop-auth` faz com token inválido. Lá o token não expira, então
 * inválido é mesmo desconexão. Aqui, uma indisponibilidade momentânea da
 * Shopee apagaria a conexão e exigiria refazer o OAuth à mão — trocar uma
 * falha de 5 minutos por uma tarefa humana.
 */
export async function getShopeeCreds(
  // deno-lint-ignore no-explicit-any
  supabase: any,
): Promise<CredsShopee | null> {
  const partnerId  = Deno.env.get("SHOPEE_PARTNER_ID");
  const partnerKey = Deno.env.get("SHOPEE_PARTNER_KEY");
  if (!partnerId || !partnerKey) {
    console.warn("[shopee] SHOPEE_PARTNER_ID/KEY não configurados — pulando.");
    return null;
  }

  const { data } = await supabase.from("system_tokens")
    .select("access_token, refresh_token, expires_at, seller_id, last_synced_at")
    .eq("id", ID_TOKEN_SHOPEE).maybeSingle();

  if (!data?.access_token || !data?.seller_id) {
    console.warn("[shopee] Sem token — a loja ainda não foi conectada em /shopee-auth.");
    return null;
  }

  const shopId = String(data.seller_id);
  const vencido = data.expires_at ? new Date(data.expires_at) <= new Date() : true;
  let accessToken = String(data.access_token);

  if (vencido) {
    if (!data.refresh_token) {
      console.error("[shopee] Token vencido e sem refresh_token — reconectar pelo OAuth.");
      return null;
    }
    const novo = await renovar(partnerId, partnerKey, String(data.refresh_token), shopId);
    if (!novo) return null;

    // ⚠️ Os DOIS tokens na MESMA escrita. O refresh é rotativo: gravar só o
    // access e manter o refresh velho invalida a conexão na próxima rodada.
    const { error } = await supabase.from("system_tokens").update({
      access_token:  novo.access_token,
      refresh_token: novo.refresh_token,
      expires_at:    expiraEm(novo.expire_in).toISOString(),
      updated_at:    new Date().toISOString(),
    }).eq("id", ID_TOKEN_SHOPEE);
    if (error) {
      // Falhou ao gravar: NÃO usa o token novo. A Shopee já invalidou o refresh
      // antigo, e usar um access que não conseguimos guardar deixaria a próxima
      // rodada sem nenhum dos dois.
      console.error(`[shopee] Falha ao gravar token renovado: ${error.message}`);
      return null;
    }
    accessToken = novo.access_token;
    console.log("[shopee] Token renovado.");
  }

  return {
    accessToken, shopId, partnerId, partnerKey,
    lastSyncedAt: data.last_synced_at
      ? new Date(data.last_synced_at)
      : new Date(Date.now() - 24 * 60 * 60 * 1000),
  };
}

/**
 * Chamada GET a um endpoint de LOJA, já assinada.
 *
 * ⚠️ A base string de endpoint de loja é
 * `partner_id + path + timestamp + access_token + shop_id`. Esquecer os dois
 * últimos devolve `error_sign` — que parece "chave errada" e manda a pessoa
 * trocar a chave certa.
 */
export async function chamarShopee(
  c: CredsShopee, path: string, params: Record<string, string> = {},
): Promise<Record<string, unknown>> {
  const url = await urlAssinada(
    hostShopee(), path, c.partnerId, c.partnerKey,
    { ...params, access_token: c.accessToken, shop_id: c.shopId },
    c.accessToken, c.shopId,
  );
  const res = await fetch(url, { headers: { "Content-Type": "application/json" } });
  const d = await res.json() as Record<string, unknown>;
  if (d.error) {
    throw new Error(`Shopee ${path}: ${d.error} — ${d.message ?? ""}`);
  }
  return d;
}

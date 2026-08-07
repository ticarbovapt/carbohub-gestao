// ─────────────────────────────────────────────────────────────────────────────
// Token do Melhor Envio — uma fonte, com renovação.
//
// Duas maneiras de ter o token, nesta ordem de precedência:
//
//   1. `MELHOR_ENVIO_TOKEN` (secret)  — token pessoal, se a conta oferecer.
//   2. `system_tokens` id='melhorenvio' — o que o `melhor-envio-auth` grava
//      depois do OAuth, com refresh_token.
//
// O secret ganha porque é explícito: se alguém o colocou, quis usar aquele.
// Sem ele, o OAuth assume — e é o caminho normal, porque o painel do Melhor
// Envio leva a cadastrar um APLICATIVO, não a gerar um token avulso.
//
// ⚠️ O access_token do Melhor Envio dura ~30 dias e o refresh renova. Sem
// renovar, tudo funciona por um mês e para — no meio do mês seguinte, calado.
// Por isso a renovação é automática e mora aqui, não em cada função.
// ─────────────────────────────────────────────────────────────────────────────

export const MELHOR_ENVIO_BASE = (): string =>
  (Deno.env.get("MELHOR_ENVIO_ENV") ?? "sandbox") === "production"
    ? "https://melhorenvio.com.br"
    : "https://sandbox.melhorenvio.com.br";

export const MELHOR_ENVIO_UA = "CarboHub (ti@grupocarbo.com.br)";

/** Devolve um access_token válido, renovando se estiver perto de vencer. */
export async function getMelhorEnvioToken(
  // deno-lint-ignore no-explicit-any
  supabase: any,
): Promise<string | null> {
  const doSecret = (Deno.env.get("MELHOR_ENVIO_TOKEN") ?? "").trim();
  if (doSecret) return doSecret;

  const { data, error } = await supabase
    .from("system_tokens")
    .select("access_token,refresh_token,expires_at")
    .eq("id", "melhorenvio")
    .maybeSingle();

  if (error || !data?.access_token) {
    console.warn("[melhor-envio] sem token — rode o melhor-envio-auth uma vez");
    return null;
  }

  // Renova com 24h de folga: o token dura ~30 dias, então essa margem nunca
  // aperta e evita a corrida de expirar no meio de uma rodada.
  const vence = data.expires_at ? new Date(data.expires_at).getTime() : 0;
  if (Date.now() < vence - 24 * 60 * 60 * 1000) return data.access_token;

  const clientId = Deno.env.get("MELHOR_ENVIO_CLIENT_ID") ?? "";
  const clientSecret = Deno.env.get("MELHOR_ENVIO_CLIENT_SECRET") ?? "";
  if (!clientId || !clientSecret || !data.refresh_token) {
    console.warn("[melhor-envio] não dá para renovar; usando o token atual");
    return data.access_token;
  }

  try {
    const res = await fetch(`${MELHOR_ENVIO_BASE()}/oauth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify({
        grant_type: "refresh_token",
        refresh_token: data.refresh_token,
        client_id: clientId,
        client_secret: clientSecret,
      }),
    });
    const t = await res.json();
    if (!res.ok || !t?.access_token) {
      console.error("[melhor-envio] refresh falhou:", JSON.stringify(t).slice(0, 300));
      return data.access_token;   // o antigo ainda pode servir
    }
    await supabase.from("system_tokens").upsert({
      id: "melhorenvio",
      access_token: t.access_token,
      refresh_token: t.refresh_token ?? data.refresh_token,
      expires_at: new Date(Date.now() + (t.expires_in ?? 2592000) * 1000).toISOString(),
    });
    return t.access_token;
  } catch (e) {
    console.error("[melhor-envio] refresh explodiu:", e);
    return data.access_token;
  }
}

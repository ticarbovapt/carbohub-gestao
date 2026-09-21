/**
 * ml-auth — OAuth do Mercado Livre, MULTI-CONTA
 *
 *   GET /ml-auth?action=start&conta=mercadolivre_full&label=...
 *       → gera `state`, grava em ml_oauth_states, redireciona para o ML
 *
 *   GET /ml-auth?code=...&state=...
 *       → valida o state, troca o code, lê /users/me e faz UPSERT por seller_id
 *
 *   GET /ml-auth?conta=mercadolivre
 *       → status da conexão (sem code)
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ⚠️ O QUE MUDOU, E POR QUE NÃO DÁ PARA VOLTAR ATRÁS
 *
 * 1. Escrevia em `system_tokens` com `id = 'mercadolivre'` FIXO. Conectar a
 *    segunda conta sobrescrevia a primeira — ela caía calada, e o sintoma
 *    seria "parou de sincronizar", sem erro nenhum.
 *
 * 2. ⚠️ RENOVAVA O TOKEN POR CONTA PRÓPRIA, e o `ecommerce-sync` também. O
 *    `refresh_token` do ML é de USO ÚNICO: duas renovações simultâneas queimam
 *    o token uma da outra. Hoje a renovação é UMA só, em `_shared/ml.ts`.
 *
 * 3. ⚠️ E reagia à falha APAGANDO A LINHA:
 *
 *        // Refresh failed — mark as disconnected
 *        await supabase.from("system_tokens").delete().eq("id", conta);
 *
 *    Uma corrida de segundos desconectava a integração, e só voltava com OAuth
 *    manual. Apagar joga fora o `refresh_token`, que é a única coisa capaz de
 *    recuperar sozinha — e o `invalid_grant` podia ser só a corrida. Hoje
 *    falha MARCA (`reauth_required`), nunca apaga.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getMlToken, type ContaML, type PlatformKeyML } from "../_shared/ml.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const ML_TOKEN_URL = "https://api.mercadolibre.com/oauth/token";
const ML_API_URL = "https://api.mercadolibre.com";
const ML_AUTHORIZE = "https://auth.mercadolivre.com.br/authorization";

const CONTAS: PlatformKeyML[] = ["mercadolivre", "mercadolivre_full"];

const NOME_DA_CONTA: Record<PlatformKeyML, string> = {
  mercadolivre: "ML LogHouse (despacho nosso)",
  mercadolivre_full: "ML Full (mercadoria no galpão do ML)",
};

function redirectUri(): string {
  return Deno.env.get("ML_REDIRECT_URI") ??
    `${Deno.env.get("SUPABASE_URL")}/functions/v1/ml-auth`;
}

function pagina(titulo: string, corpo: string, cor: string): Response {
  return new Response(
    `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8">
<title>${titulo}</title><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
 body{font-family:system-ui,-apple-system,sans-serif;background:#0b0f14;color:#e6edf3;
      display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:16px}
 .c{max-width:520px;text-align:center;background:#111823;border:1px solid #1e2b3a;
    border-radius:16px;padding:32px}
 h1{font-size:20px;margin:0 0 12px;color:${cor}}
 p{color:#9fb0c0;line-height:1.6;margin:8px 0}
 code{background:#0b0f14;padding:2px 6px;border-radius:6px;font-size:13px}
</style></head><body><div class="c"><h1>${titulo}</h1>${corpo}</div></body></html>`,
    { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } },
  );
}

/** Troca o código por token. */
async function exchangeCode(code: string) {
  const res = await fetch(ML_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: Deno.env.get("ML_CLIENT_ID")!,
      client_secret: Deno.env.get("ML_CLIENT_SECRET")!,
      code,
      // ⚠️ TEM de ser idêntico ao usado no authorize. É por isso que a conta
      // viaja no `state` e nunca aqui: pendurar `?conta=` nesta URL quebra a
      // troca com um erro genérico do ML, e o sintoma vira "conectar não
      // funciona" sem dizer por quê.
      redirect_uri: redirectUri(),
    }),
  });
  if (!res.ok) throw new Error(`troca de codigo falhou (${res.status}): ${await res.text()}`);
  return await res.json() as {
    access_token: string; refresh_token: string; expires_in: number;
    user_id: number; scope?: string;
  };
}

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);
  const action = url.searchParams.get("action");
  const code = url.searchParams.get("code");
  const stateRecebido = url.searchParams.get("state");

  // ── 1. INÍCIO do fluxo ────────────────────────────────────────────────────
  if (action === "start") {
    const conta = (url.searchParams.get("conta") ?? "mercadolivre") as PlatformKeyML;
    if (!CONTAS.includes(conta)) {
      return new Response(JSON.stringify({ ok: false, erro: `conta invalida: ${conta}` }),
        { status: 400, headers: { "Content-Type": "application/json" } });
    }

    const clientId = Deno.env.get("ML_CLIENT_ID");
    if (!clientId) {
      // Segredo ausente é problema NOSSO: 500 com mensagem explícita, nunca um
      // 401 que se disfarça de chamada indevida.
      return new Response(JSON.stringify({ ok: false, erro: "ML_CLIENT_ID ausente no servidor" }),
        { status: 500, headers: { "Content-Type": "application/json" } });
    }

    const state = crypto.randomUUID();
    const { error } = await supabase.from("ml_oauth_states").insert({
      state,
      platform_key: conta,
      label: url.searchParams.get("label") ?? NOME_DA_CONTA[conta],
    });
    if (error) {
      return new Response(JSON.stringify({ ok: false, erro: `nao gravou o state: ${error.message}` }),
        { status: 500, headers: { "Content-Type": "application/json" } });
    }

    const destino = `${ML_AUTHORIZE}?response_type=code`
      + `&client_id=${encodeURIComponent(clientId)}`
      + `&redirect_uri=${encodeURIComponent(redirectUri())}`
      + `&state=${encodeURIComponent(state)}`;
    return Response.redirect(destino, 302);
  }

  // ── 2. CALLBACK ───────────────────────────────────────────────────────────
  if (code) {
    // ⚠️ O state decide para QUAL conta é a autorização, e ele tem de ser um
    // que NÓS geramos. Aceitar o valor cru da query string deixaria um link
    // salvo por alguém reconectar a conta errada meses depois — e o sintoma
    // seria a LogHouse virando `mercadolivre_full`: faturamento no canal
    // errado E estoque deixando de ser deduzido, porque o Full não deduz.
    if (!stateRecebido) {
      return pagina("Autorização sem state",
        "<p>O retorno do Mercado Livre veio sem <code>state</code>. Comece de novo pela tela de Contas.</p>",
        "#f87171");
    }

    const { data: linhaState } = await supabase
      .from("ml_oauth_states")
      .select("state, platform_key, label, expira_em, usado_em")
      .eq("state", stateRecebido)
      .maybeSingle();

    if (!linhaState) {
      return pagina("Autorização não reconhecida",
        "<p>Este <code>state</code> não foi gerado por nós. Comece pela tela de Contas do Mercado Livre.</p>",
        "#f87171");
    }
    if (linhaState.usado_em) {
      return pagina("Autorização já usada",
        "<p>Este link de autorização já foi consumido. Gere um novo pela tela de Contas.</p>",
        "#fbbf24");
    }
    if (new Date(linhaState.expira_em as string).getTime() < Date.now()) {
      return pagina("Autorização expirada",
        "<p>O link valia 10 minutos. Gere um novo pela tela de Contas.</p>", "#fbbf24");
    }

    const conta = linhaState.platform_key as PlatformKeyML;

    try {
      const t = await exchangeCode(code);
      const sellerId = Number(t.user_id);

      // ⚠️ GUARDA: o mesmo vendedor não pode ocupar dois canais.
      //
      // Um app do ML aceita vários vendedores, então o mesmo client_id serve às
      // duas contas — e nada impede autorizar a LogHouse na tela do Full. Sem
      // esta checagem, todo pedido dela passaria a gravar como
      // `mercadolivre_full`: canal errado e, pior, estoque deixando de ser
      // deduzido, porque o Full não deduz. O sintoma seria uma conta "que parou
      // de vender" e outra "que dobrou".
      const { data: jaExiste } = await supabase
        .from("ml_accounts")
        .select("seller_id, platform_key")
        .eq("seller_id", sellerId)
        .maybeSingle();

      if (jaExiste && jaExiste.platform_key !== conta) {
        return pagina("Conta já conectada em outro canal",
          `<p>O vendedor <code>${sellerId}</code> já está conectado como
           <code>${jaExiste.platform_key}</code>.</p>
           <p>Conectar a MESMA conta nos dois canais faria as vendas contarem no lugar
           errado — e o estoque parar de ser deduzido, porque o Full não deduz.</p>
           <p>Autorize a conta correta, ou desconecte o outro canal antes.</p>`,
          "#f87171");
      }

      // ⚠️ E o inverso: o canal já tem OUTRO vendedor. `platform_key` é UNIQUE,
      // então o upsert falharia — mas com uma mensagem de banco que ninguém
      // entende. Melhor dizer o que aconteceu.
      const { data: canalOcupado } = await supabase
        .from("ml_accounts")
        .select("seller_id")
        .eq("platform_key", conta)
        .neq("seller_id", sellerId)
        .maybeSingle();

      if (canalOcupado) {
        return pagina("Canal já ocupado",
          `<p>O canal <code>${conta}</code> já pertence ao vendedor
           <code>${canalOcupado.seller_id}</code>.</p>
           <p>Para trocar, desconecte aquele primeiro.</p>`, "#f87171");
      }

      // Nickname é só rótulo: se a chamada falhar, a conexão continua boa.
      let nickname: string | null = null;
      try {
        const me = await fetch(`${ML_API_URL}/users/me`, {
          headers: { Authorization: `Bearer ${t.access_token}` },
        });
        if (me.ok) nickname = ((await me.json()) as { nickname?: string }).nickname ?? null;
      } catch { /* rótulo ausente não invalida a conexão */ }

      const { error: erroUpsert } = await supabase.from("ml_accounts").upsert({
        seller_id: sellerId,
        platform_key: conta,
        nickname,
        label: (linhaState.label as string) ?? NOME_DA_CONTA[conta],
        access_token: t.access_token,
        refresh_token: t.refresh_token,
        expires_at: new Date(Date.now() + t.expires_in * 1000).toISOString(),
        scopes: t.scope ?? null,
        status: "active",
        last_error: null,
        last_refresh_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }, { onConflict: "seller_id" });

      if (erroUpsert) throw new Error(`gravacao falhou: ${erroUpsert.message}`);

      // Queima o state só DEPOIS do sucesso: se a troca falhar, a pessoa pode
      // tentar de novo com o mesmo link em vez de recomeçar.
      await supabase.from("ml_oauth_states")
        .update({ usado_em: new Date().toISOString() })
        .eq("state", stateRecebido);

      console.log(`[ml-auth] conectado: conta=${conta} seller_id=${sellerId}`);

      return pagina("Mercado Livre conectado",
        `<p><strong>${NOME_DA_CONTA[conta]}</strong></p>
         <p>Vendedor <code>${sellerId}</code>${nickname ? ` · ${nickname}` : ""}</p>
         <p>Pode fechar esta janela.</p>`, "#4ade80");
    } catch (e) {
      console.error("[ml-auth] falha no callback:", e);
      return pagina("Não foi possível conectar",
        `<p>${(e as Error).message}</p><p>Nada foi alterado. Tente de novo pela tela de Contas.</p>`,
        "#f87171");
    }
  }

  // ── 3. STATUS ─────────────────────────────────────────────────────────────
  const conta = (url.searchParams.get("conta") ?? "mercadolivre") as PlatformKeyML;

  const { data: linha } = await supabase
    .from("ml_accounts")
    .select("seller_id, platform_key, nickname, label, status, expires_at, last_error, last_synced_at, access_token, refresh_token")
    .eq("platform_key", conta)
    .maybeSingle();

  if (!linha) {
    return new Response(JSON.stringify({ ok: false, connected: false, conta, reason: "no_token" }),
      { headers: { "Content-Type": "application/json" } });
  }

  // ⚠️ A renovação vem do helper COMPARTILHADO. Renovar aqui seria a segunda
  // implementação do refresh — e é exatamente isso que queimava o token.
  const token = await getMlToken(supabase as never, linha as unknown as ContaML);

  if (!token) {
    // ⚠️ E NÃO apaga nada. O helper já marcou o motivo em `last_error` e, se
    // for definitivo, pôs `reauth_required`. Apagar tiraria o `refresh_token`,
    // que é o que permite recuperar sem OAuth manual.
    const { data: agora } = await supabase.from("ml_accounts")
      .select("status, last_error").eq("platform_key", conta).maybeSingle();
    return new Response(JSON.stringify({
      ok: false, connected: false, conta,
      reason: agora?.status === "reauth_required" ? "reauth_required" : "refresh_failed",
      detalhe: agora?.last_error ?? null,
    }), { headers: { "Content-Type": "application/json" } });
  }

  const verify = await fetch(`${ML_API_URL}/users/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!verify.ok) {
    await supabase.rpc("ml_conta_marcar_erro", {
      p_seller_id: linha.seller_id,
      p_erro: `/users/me devolveu ${verify.status}`,
      p_fatal: verify.status === 401 || verify.status === 403,
    });
    return new Response(JSON.stringify({
      ok: false, connected: false, conta, reason: "token_invalid", status: verify.status,
    }), { headers: { "Content-Type": "application/json" } });
  }

  const user = await verify.json() as Record<string, unknown>;
  return new Response(JSON.stringify({
    ok: true,
    connected: true,
    conta,
    seller_id: linha.seller_id,
    nickname: (user.nickname as string) ?? linha.nickname ?? null,
    label: linha.label,
    status: linha.status,
    expires_at: linha.expires_at,
    last_synced_at: linha.last_synced_at,
  }), { headers: { "Content-Type": "application/json" } });
});

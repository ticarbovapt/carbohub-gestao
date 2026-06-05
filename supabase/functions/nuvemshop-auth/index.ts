/**
 * nuvemshop-auth — Nuvemshop (Tiendanube) OAuth callback handler
 *
 * GET /nuvemshop-auth?code=<authorization_code>
 *   → troca o code por access_token (que NÃO expira na Nuvemshop)
 *   → salva em system_tokens (id='nuvemshop'), seller_id = store_id
 *   → registra os webhooks de pedido apontando para ecommerce-webhook/nuvemshop
 *   → retorna página HTML de sucesso
 *
 * GET /nuvemshop-auth?generate_auth_url=true
 *   → retorna a URL de instalação do app (para o botão "Conectar" no sistema)
 *
 * GET /nuvemshop-auth  (sem parâmetros)
 *   → retorna JSON com o status da conexão
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const TOKEN_URL = "https://www.tiendanube.com/apps/authorize/token";
const API_BASE  = "https://api.tiendanube.com/v1";
const UA        = "CarboHub Integracao (ti@grupocarbo.com.br)";

// Eventos de pedido que queremos ouvir em tempo real.
const WEBHOOK_EVENTS = [
  "order/created",
  "order/paid",
  "order/fulfilled",
  "order/cancelled",
  "order/updated",
];

interface TokenResponse {
  access_token: string;
  token_type:   string;
  scope:        string;
  user_id:      number; // = store_id
}

async function exchangeCode(code: string): Promise<TokenResponse> {
  const clientId     = Deno.env.get("NUVEMSHOP_CLIENT_ID")!;
  const clientSecret = Deno.env.get("NUVEMSHOP_CLIENT_SECRET")!;

  const res = await fetch(TOKEN_URL, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id:     clientId,
      client_secret: clientSecret,
      grant_type:    "authorization_code",
      code,
    }),
  });

  if (!res.ok) {
    throw new Error(`Nuvemshop token exchange falhou (${res.status}): ${await res.text()}`);
  }
  return res.json();
}

async function saveTokens(t: TokenResponse) {
  // Token da Nuvemshop não expira → expires_at = null, refresh_token = null.
  const { error } = await supabase.from("system_tokens").upsert({
    id:            "nuvemshop",
    access_token:  t.access_token,
    refresh_token: null,
    expires_at:    null,
    seller_id:     String(t.user_id),
    updated_at:    new Date().toISOString(),
  }, { onConflict: "id" });

  if (error) throw new Error(`Falha ao salvar token: ${error.message}`);
}

/** Registra os webhooks de pedido (idempotente — não duplica os que já existem). */
async function registerWebhooks(accessToken: string, storeId: string) {
  const callbackUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/ecommerce-webhook/nuvemshop`;
  const headers = {
    "Authentication": `bearer ${accessToken}`,
    "Authorization":  `bearer ${accessToken}`,
    "User-Agent":     UA,
    "Content-Type":   "application/json",
  };

  // Já existentes, para não duplicar.
  let existing: { event: string; url: string }[] = [];
  try {
    const res = await fetch(`${API_BASE}/${storeId}/webhooks`, { headers });
    if (res.ok) existing = await res.json();
  } catch (e) {
    console.warn("[nuvemshop-auth] Não consegui listar webhooks existentes:", e);
  }

  for (const event of WEBHOOK_EVENTS) {
    const alreadyThere = existing.some(w => w.event === event && w.url === callbackUrl);
    if (alreadyThere) continue;
    try {
      const res = await fetch(`${API_BASE}/${storeId}/webhooks`, {
        method:  "POST",
        headers,
        body:    JSON.stringify({ event, url: callbackUrl }),
      });
      if (!res.ok) {
        console.warn(`[nuvemshop-auth] Falha ao registrar webhook ${event}: ${res.status} ${await res.text()}`);
      } else {
        console.log(`[nuvemshop-auth] Webhook registrado: ${event}`);
      }
    } catch (e) {
      console.warn(`[nuvemshop-auth] Erro ao registrar webhook ${event}:`, e);
    }
  }
}

function htmlSuccess(storeId: string): Response {
  return new Response(`
<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="utf-8"><title>Nuvemshop — Conectado</title>
<style>body{font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#f5f5f5;}
.card{background:#fff;border-radius:12px;padding:40px;text-align:center;box-shadow:0 4px 24px rgba(0,0,0,.08);max-width:420px;}
h2{color:#2d6a4f;margin-bottom:8px;}p{color:#555;}</style></head>
<body><div class="card">
  <div style="font-size:48px">✅</div>
  <h2>Nuvemshop conectada!</h2>
  <p>Loja ID: <strong>${storeId}</strong></p>
  <p>Os pedidos passam a chegar automaticamente e já deduzem o estoque do CD SP LogHouse.</p>
  <p style="margin-top:24px;font-size:13px;color:#888">Pode fechar esta aba.</p>
</div></body></html>`, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: { "Access-Control-Allow-Origin": "*" } });
  }

  const url = new URL(req.url);
  const code = url.searchParams.get("code");

  // 1) Gera a URL de instalação (para o botão "Conectar" no sistema)
  if (url.searchParams.get("generate_auth_url")) {
    const appId = Deno.env.get("NUVEMSHOP_CLIENT_ID");
    const authUrl = `https://www.nuvemshop.com.br/apps/${appId}/authorize`;
    return new Response(JSON.stringify({ ok: true, authUrl }), {
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });
  }

  // 2) Status da conexão (sem code)
  if (!code) {
    const { data } = await supabase
      .from("system_tokens")
      .select("access_token, seller_id, updated_at")
      .eq("id", "nuvemshop")
      .maybeSingle();

    if (!data?.access_token) {
      return new Response(JSON.stringify({ ok: false, connected: false, reason: "no_token" }), {
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    }

    // Verifica se o token ainda é válido com uma chamada leve.
    const verify = await fetch(`${API_BASE}/${data.seller_id}/store`, {
      headers: {
        "Authentication": `bearer ${data.access_token}`,
        "Authorization":  `bearer ${data.access_token}`,
        "User-Agent":     UA,
      },
    });

    if (!verify.ok) {
      await supabase.from("system_tokens").delete().eq("id", "nuvemshop");
      return new Response(JSON.stringify({ ok: false, connected: false, reason: "token_invalid", status: verify.status }), {
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    }

    return new Response(JSON.stringify({
      ok: true, connected: true, seller_id: data.seller_id, updated_at: data.updated_at,
    }), { headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } });
  }

  // 3) Callback do OAuth — troca o code, salva e registra webhooks
  try {
    const tokens = await exchangeCode(code);
    await saveTokens(tokens);
    await registerWebhooks(tokens.access_token, String(tokens.user_id));
    console.log(`[nuvemshop-auth] Conectado store_id=${tokens.user_id}`);
    return htmlSuccess(String(tokens.user_id));
  } catch (err) {
    console.error("[nuvemshop-auth] Erro:", err);
    return new Response(JSON.stringify({ ok: false, error: String(err) }), {
      status: 500, headers: { "Content-Type": "application/json" },
    });
  }
});

/**
 * shopee-auth — OAuth da Shopee Open Platform v2
 *
 * GET /shopee-auth?generate_auth_url=true
 *   → devolve a URL de autorização (o botão "Conectar" no sistema aponta pra cá)
 *
 * GET /shopee-auth?code=<code>&shop_id=<id>
 *   → callback da Shopee: troca o code por access/refresh token e salva
 *
 * GET /shopee-auth
 *   → status da conexão (JSON)
 *
 * ─────────────────────────────────────────────────────────────────────────
 * ⚠️ SOBE COM verify_jwt = false (ver supabase/config.toml).
 *
 * Quem chama o callback é a SHOPEE, que não tem como mandar JWT do Supabase.
 * Com JWT ligado, ela leva 401 antes de o código rodar — e o sintoma é "o app
 * não conecta", sem log nenhum, porque a requisição não chega aqui. Todas as
 * `*-auth` deste projeto estão assim pelo mesmo motivo.
 *
 * ⚠️ E ISSO NÃO A DEIXA ABERTA. O `code` da Shopee é de uso único, tem validade
 * curta e só vale com o `partner_key`, que está nos secrets. Quem chamar esta
 * URL sem code recebe status; com code inválido, recebe erro da Shopee.
 * ─────────────────────────────────────────────────────────────────────────
 *
 * ── O que a Shopee tem de diferente das outras três ──────────────────────
 *
 * 1. Token de 4 HORAS. Mercado Livre dura 6 h, Bling 6 h, e o da Nuvemshop não
 *    expira. Quatro horas significa que o refresh não é detalhe de borda: sem
 *    ele funcionando, a integração morre sozinha entre uma madrugada e outra.
 *    O refresh token dura ~30 dias e é ROTATIVO — cada renovação devolve um
 *    novo, e guardar o antigo por engano invalida a conexão de vez.
 *
 * 2. A conexão é por LOJA (`shop_id`), não por conta. O `shop_id` volta na
 *    query do callback e precisa ser guardado: sem ele não dá para assinar
 *    nenhuma chamada de loja depois — a base string exige os dois.
 *
 * 3. `partner_id` é NUMÉRICO e entra na assinatura como texto. Guardá-lo como
 *    number em algum ponto e reconvertê-lo com notação científica é o tipo de
 *    coisa que produz `error_sign` sem pista.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  SHOPEE_HOST_PROD, SHOPEE_HOST_SANDBOX, SHOPEE_PATHS,
  urlDeAutorizacao, urlAssinada, expiraEm,
} from "../_shared/shopeeAssina.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const ID_TOKEN = "shopee";

/** Sandbox só quando pedido explicitamente. O padrão é produção: um ambiente
 *  que cai em sandbox por omissão conecta, responde bonito e não vê pedido
 *  nenhum — falha que se parece com "não tem venda". */
const host = () =>
  Deno.env.get("SHOPEE_SANDBOX") === "true" ? SHOPEE_HOST_SANDBOX : SHOPEE_HOST_PROD;

const REDIRECT = () =>
  Deno.env.get("SHOPEE_REDIRECT_URI") ??
  `${Deno.env.get("SUPABASE_URL")}/functions/v1/shopee-auth`;

const json = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), {
    status,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
  });

interface RespostaToken {
  access_token?: string;
  refresh_token?: string;
  expire_in?: number;
  error?: string;
  message?: string;
}

/**
 * Troca o `code` por tokens.
 *
 * ⚠️ `partner_id`, `timestamp` e `sign` vão na QUERY, e o corpo leva `code` e
 * `shop_id`. O corpo NÃO é assinado. Mandar tudo no corpo é o engano natural de
 * quem vem de outra API e resulta em `error_sign`.
 */
async function trocarCode(code: string, shopId: string): Promise<RespostaToken> {
  // ⚠️ `.trim()`: chave colada do painel vem com espaço ou \n com frequência,
  // e um byte invisível muda o HMAC inteiro. O erro da Shopee é "Wrong sign",
  // que aponta para a chave errada e nunca para o espaço em branco.
  const partnerId  = (Deno.env.get("SHOPEE_PARTNER_ID") ?? "").trim() || undefined;
  const partnerKey = (Deno.env.get("SHOPEE_PARTNER_KEY") ?? "").trim() || undefined;
  // ⚠️ Ausência FECHA, e com 500 explícito: é problema NOSSO de configuração,
  // não chamada indevida. Um 401 aqui faria a falha se disfarçar de tentativa
  // de invasão — foi esse disfarce que custou o dia de diagnóstico do
  // CRON_SECRET.
  if (!partnerId || !partnerKey) {
    throw new Error("SHOPEE_PARTNER_ID/SHOPEE_PARTNER_KEY não configurados no servidor.");
  }

  const url = await urlAssinada(host(), SHOPEE_PATHS.tokenNovo, partnerId, partnerKey);
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code, shop_id: Number(shopId), partner_id: Number(partnerId) }),
  });

  const dados = await res.json() as RespostaToken;
  // ⚠️ A Shopee responde 200 com `error` preenchido. Confiar no status HTTP
  // gravaria `access_token: undefined` como se tivesse dado certo, e a
  // integração só falharia na primeira chamada real — longe daqui.
  if (dados.error) {
    throw new Error(`Shopee recusou: ${dados.error} — ${dados.message ?? ""}`);
  }
  if (!dados.access_token || !dados.refresh_token) {
    throw new Error(`Resposta sem token: ${JSON.stringify(dados)}`);
  }
  return dados;
}

async function salvar(t: RespostaToken, shopId: string) {
  const { error } = await supabase.from("system_tokens").upsert({
    id:            ID_TOKEN,
    access_token:  t.access_token,
    refresh_token: t.refresh_token,
    expires_at:    expiraEm(t.expire_in ?? 14400).toISOString(),
    seller_id:     shopId,
    updated_at:    new Date().toISOString(),
  }, { onConflict: "id" });
  if (error) throw new Error(`Falha ao salvar token: ${error.message}`);
}

function htmlSucesso(shopId: string): Response {
  return new Response(`
<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="utf-8"><title>Shopee — Conectada</title>
<style>body{font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#f5f5f5;}
.card{background:#fff;border-radius:12px;padding:40px;text-align:center;box-shadow:0 4px 24px rgba(0,0,0,.08);max-width:460px;}
h2{color:#2d6a4f;margin-bottom:8px;}p{color:#555;}
.aviso{margin-top:20px;padding:12px;border-radius:8px;background:#fff8e1;color:#7a5c00;font-size:13px;text-align:left;}</style></head>
<body><div class="card">
  <div style="font-size:48px">✅</div>
  <h2>Shopee conectada!</h2>
  <p>Loja ID: <strong>${shopId}</strong></p>
  <div class="aviso">
    <strong>Atenção:</strong> a Shopee usa logística própria (SPX) e não passa
    pelo Melhor Envio. Enquanto o sync de pedidos não estiver ligado, o card do
    pedido na esteira para em "etiqueta" — nada o leva a "em trânsito" ou
    "entregue" sozinho.
  </div>
  <p style="margin-top:24px;font-size:13px;color:#888">Pode fechar esta aba.</p>
</div></body></html>`, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
      },
    });
  }

  const url    = new URL(req.url);
  const code   = url.searchParams.get("code");
  // ⚠️ A Shopee manda `shop_id` na autorização por loja e `main_account_id` na
  // autorização por conta. Aceitar só o primeiro faz a conexão de conta chegar
  // aqui e ser descartada em silêncio.
  const shopId = url.searchParams.get("shop_id") ?? url.searchParams.get("main_account_id");

  try {
    // ── 1) URL de autorização, para o botão "Conectar" ──────────────────────
    // ⚠️ `ir` sozinho TAMBÉM entra aqui. Na primeira versão ele estava dentro
    // deste bloco, então `?ir=1` puro caía na rota de status e devolvia
    // `no_token` — parecendo que a função não tinha o que autorizar, quando na
    // verdade ela nem chegou a gerar o link. Quem abre não tem como saber qual
    // dos dois parâmetros faltava.
    if (url.searchParams.get("generate_auth_url") || url.searchParams.get("ir")) {
      // ⚠️ `.trim()` nos dois. Chave colada do painel vem com \n ou espaço com
      // frequência, e o HMAC muda inteiro por causa de um byte invisível — o
      // erro que a Shopee devolve é "Wrong sign", que aponta para a chave
      // errada e não para o espaço em branco.
      const partnerId  = (Deno.env.get("SHOPEE_PARTNER_ID") ?? "").trim();
      const partnerKey = (Deno.env.get("SHOPEE_PARTNER_KEY") ?? "").trim();
      if (!partnerId || !partnerKey) {
        return json({ ok: false, error: "SHOPEE_PARTNER_ID/SHOPEE_PARTNER_KEY não configurados." }, 500);
      }
      const authUrl = await urlDeAutorizacao(host(), partnerId, partnerKey, REDIRECT());

      // ⚠️ `ir=1` leva DIRETO para a Shopee, em vez de devolver o link.
      //
      // A assinatura carrega um `timestamp` e a Shopee recusa link velho — na
      // prática, poucos minutos. Devolver JSON obriga a copiar e colar, e a
      // corrida entre gerar e abrir é vencida pelo relógio com facilidade: o
      // erro que aparece é de assinatura inválida, que faz parecer que a chave
      // está errada quando o problema é só a idade do link.
      //
      // Com o 302 o link nasce e é usado no mesmo instante.
      if (url.searchParams.get("ir")) {
        return new Response(null, { status: 302, headers: { Location: authUrl } });
      }
      return json({ ok: true, authUrl, redirect: REDIRECT(), sandbox: host() === SHOPEE_HOST_SANDBOX });
    }

    // ── 1b) Diagnóstico ────────────────────────────────────────────────────
    //
    // ⚠️ NUNCA devolve a chave. Devolve o que permite COMPARAR com o painel da
    // Shopee sem ninguém copiar segredo para lugar nenhum: tamanho, os quatro
    // primeiros caracteres, e se sobrou espaço em branco na ponta.
    //
    // Existe porque "Wrong sign" tem três causas que produzem a MESMA
    // mensagem — chave de teste com partner de produção, espaço colado junto,
    // e host trocado — e nenhuma delas dá para distinguir olhando o erro.
    if (url.searchParams.get("diagnostico")) {
      const idBruto  = Deno.env.get("SHOPEE_PARTNER_ID") ?? "";
      const keyBruta = Deno.env.get("SHOPEE_PARTNER_KEY") ?? "";
      return json({
        ok: true,
        partner_id: idBruto.trim(),
        partner_id_tem_espaco: idBruto !== idBruto.trim(),
        chave_tamanho: keyBruta.trim().length,
        chave_comeca_com: keyBruta.trim().slice(0, 4),
        chave_tem_espaco: keyBruta !== keyBruta.trim(),
        sandbox: host() === SHOPEE_HOST_SANDBOX,
        host: host(),
        redirect: REDIRECT(),
        // O par tem de ser do MESMO ambiente: partner de produção com chave de
        // produção. Cruzar os dois é a causa mais comum de "Wrong sign".
        lembrete: "Confira no painel: o partner_id acima é o Live ou o Test? A chave cadastrada tem de ser a DO MESMO.",
      });
    }

    // ── 2) Status ───────────────────────────────────────────────────────────
    if (!code) {
      const { data } = await supabase.from("system_tokens")
        .select("access_token, seller_id, expires_at, updated_at")
        .eq("id", ID_TOKEN).maybeSingle();

      if (!data?.access_token) {
        return json({ ok: false, connected: false, reason: "no_token" });
      }
      // ⚠️ Não valida com chamada à API de propósito: token de 4 h expira o
      // tempo todo, e "expirado" NÃO é "desconectado" — o refresh token
      // resolve. Apagar a linha aqui (como faz o nuvemshop-auth, onde o token
      // não expira) destruiria a conexão a cada 4 horas.
      const expirado = data.expires_at ? new Date(data.expires_at) < new Date() : false;
      return json({
        ok: true, connected: true, seller_id: data.seller_id,
        expires_at: data.expires_at, updated_at: data.updated_at,
        access_token_expirado: expirado,
      });
    }

    // ── 3) Callback ─────────────────────────────────────────────────────────
    if (!shopId) {
      return json({ ok: false, error: "Callback sem shop_id/main_account_id — sem ele não dá para assinar nenhuma chamada depois." }, 400);
    }

    const tokens = await trocarCode(code, shopId);
    await salvar(tokens, shopId);
    console.log(`[shopee-auth] Conectado shop_id=${shopId} expire_in=${tokens.expire_in}`);
    return htmlSucesso(shopId);

  } catch (err) {
    console.error("[shopee-auth] Erro:", err);
    return json({ ok: false, error: String(err) }, 500);
  }
});

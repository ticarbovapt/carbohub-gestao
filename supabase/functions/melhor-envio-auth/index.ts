// ─────────────────────────────────────────────────────────────────────────────
// melhor-envio-auth — OAuth do Melhor Envio, inteiro no navegador
//
// O painel do Melhor Envio leva a cadastrar um APLICATIVO, não a gerar um token
// avulso. Aplicativo significa OAuth: o usuário autoriza, o Melhor Envio devolve
// um `code` numa URL de retorno, e essa URL troca o code pelo token.
//
// O `bling2-auth` faz isso em duas pontas — uma tela no front chama a função
// com `action: authorize` e depois com `action: callback`. Aqui não: esta função
// atende as DUAS pontas sozinha, porque a URL de retorno cadastrada no Melhor
// Envio é ela mesma. Sem tela, sem rota nova em app nenhum.
//
//   GET  sem parâmetros  → 302 para a tela de autorização
//   GET  ?code=...       → troca pelo token, grava, mostra "conectado"
//
// Cadastre nos DOIS campos do aplicativo (ambiente de testes e redirecionamento):
//   https://<projeto>.supabase.co/functions/v1/melhor-envio-auth
//
// ⚠️ A URL tem que bater CARACTERE POR CARACTERE com a cadastrada, inclusive a
// barra final (não tem). Diferença aí e o Melhor Envio recusa com
// `redirect_uri_mismatch` — que é o erro mais comum deste fluxo.
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { MELHOR_ENVIO_BASE, MELHOR_ENVIO_UA } from "../_shared/melhorEnvio.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const CLIENT_ID     = Deno.env.get("MELHOR_ENVIO_CLIENT_ID") ?? "";
const CLIENT_SECRET = Deno.env.get("MELHOR_ENVIO_CLIENT_SECRET") ?? "";

// Escopos: o mínimo para o que usamos hoje.
//   shipping-tracking  → o histórico de movimentação (a esteira)
//   orders-read        → listar pedidos para casar código ↔ envio
//   shipping-calculate → cotação de frete (melhor-envio-quote)
// Sobrescrevível por secret caso o Melhor Envio renomeie algum: escopo inválido
// faz a autorização falhar inteira, e trocar um nome não pode exigir deploy.
const ESCOPOS = Deno.env.get("MELHOR_ENVIO_SCOPES")
  ?? "shipping-tracking orders-read shipping-calculate";

function pagina(titulo: string, corpo: string, ok: boolean): Response {
  return new Response(
    `<!doctype html><meta charset="utf-8">
     <title>${titulo}</title>
     <div style="font:16px/1.6 system-ui;max-width:34rem;margin:12vh auto;padding:0 1.5rem">
       <h1 style="font-size:1.3rem;color:${ok ? "#16a34a" : "#dc2626"}">${titulo}</h1>
       ${corpo}
     </div>`,
    { status: ok ? 200 : 400, headers: { "Content-Type": "text/html; charset=utf-8" } },
  );
}

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);
  // A própria URL desta função, sem query — é ela que vai cadastrada no app.
  const redirectUri = `${url.origin}${url.pathname}`;

  if (!CLIENT_ID || !CLIENT_SECRET) {
    return pagina("Faltam credenciais", `
      <p>Cadastre nos Secrets das Edge Functions:</p>
      <pre>MELHOR_ENVIO_CLIENT_ID
MELHOR_ENVIO_CLIENT_SECRET
MELHOR_ENVIO_ENV = production</pre>
      <p>Os dois primeiros aparecem no painel do Melhor Envio depois de
         cadastrar o aplicativo.</p>`, false);
  }

  const code = url.searchParams.get("code");
  const erro = url.searchParams.get("error");

  if (erro) {
    return pagina("O Melhor Envio recusou", `
      <p><code>${erro}</code></p>
      <p>${url.searchParams.get("error_description") ?? ""}</p>
      <p>Se for <code>redirect_uri_mismatch</code>, a URL cadastrada no
         aplicativo precisa ser exatamente esta:</p>
      <pre>${redirectUri}</pre>`, false);
  }

  // ── Ida: manda para a tela de autorização ────────────────────────────────
  if (!code) {
    const destino = `${MELHOR_ENVIO_BASE()}/oauth/authorize`
      + `?client_id=${encodeURIComponent(CLIENT_ID)}`
      + `&redirect_uri=${encodeURIComponent(redirectUri)}`
      + `&response_type=code`
      + `&state=${crypto.randomUUID()}`
      + `&scope=${encodeURIComponent(ESCOPOS)}`;
    return new Response(null, { status: 302, headers: { Location: destino } });
  }

  // ── Volta: troca o código pelo token ─────────────────────────────────────
  try {
    const res = await fetch(`${MELHOR_ENVIO_BASE()}/oauth/token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "User-Agent": MELHOR_ENVIO_UA,
      },
      body: JSON.stringify({
        grant_type: "authorization_code",
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        redirect_uri: redirectUri,
        code,
      }),
    });
    const t = await res.json();

    if (!res.ok || !t?.access_token) {
      console.error("[melhor-envio-auth] troca falhou:", JSON.stringify(t).slice(0, 500));
      return pagina("Não consegui trocar o código pelo token", `
        <pre style="white-space:pre-wrap">${JSON.stringify(t, null, 2).slice(0, 800)}</pre>
        <p>URL de retorno usada: <code>${redirectUri}</code></p>`, false);
    }

    // O access_token dura ~30 dias; o refresh renova sem intervenção.
    await supabase.from("system_tokens").upsert({
      id: "melhorenvio",
      access_token: t.access_token,
      refresh_token: t.refresh_token ?? null,
      expires_at: new Date(Date.now() + (t.expires_in ?? 2592000) * 1000).toISOString(),
    });

    return pagina("Melhor Envio conectado ✅", `
      <p>O token foi guardado e renova sozinho.</p>
      <p>Ambiente: <code>${MELHOR_ENVIO_BASE()}</code></p>
      <p>Pode fechar esta aba. O rastreio de Jadlog e Correios começa na
         próxima rodada do <code>rastreio-sync</code>.</p>`, true);
  } catch (e) {
    console.error("[melhor-envio-auth]", e);
    return pagina("Erro inesperado", `<pre>${String((e as Error)?.message ?? e)}</pre>`, false);
  }
});

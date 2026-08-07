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

/**
 * A URL de retorno, montada a partir do `SUPABASE_URL`.
 *
 * ⚠️ NÃO derive isto do `req.url`. Foi o que eu fiz primeiro e o Melhor Envio
 * recusou com `invalid_client`, porque dentro da edge function o request chega
 * DUAS vezes diferente do que o mundo vê:
 *
 *   esquema  http://   — o proxy do Supabase termina o TLS antes de nós
 *   caminho  /melhor-envio-auth   — o gateway já comeu o /functions/v1
 *
 * O resultado era `http://<projeto>.supabase.co/melhor-envio-auth`, que não
 * bate com a URL cadastrada no aplicativo. E o erro não diz "redirect errado":
 * diz "Client authentication failed", que manda você conferir client_id e
 * secret — os dois lugares certos e o problema em outro.
 *
 * `SUPABASE_URL` já vem com https e sem barra final. O secret existe para o
 * caso de um dia isso rodar atrás de domínio próprio.
 */
const REDIRECT_URI = Deno.env.get("MELHOR_ENVIO_REDIRECT_URI")
  ?? `${Deno.env.get("SUPABASE_URL")}/functions/v1/melhor-envio-auth`;

// Escopos: o mínimo para o que usamos hoje.
//   shipping-tracking  → o histórico de movimentação (a esteira)
//   orders-read        → listar pedidos para casar código ↔ envio
//   shipping-calculate → cotação de frete (melhor-envio-quote)
// Sobrescrevível por secret caso o Melhor Envio renomeie algum: escopo inválido
// faz a autorização falhar inteira, e trocar um nome não pode exigir deploy.
const ESCOPOS = Deno.env.get("MELHOR_ENVIO_SCOPES")
  ?? "shipping-tracking orders-read shipping-calculate";

/**
 * Resposta em TEXTO PURO, não HTML.
 *
 * A primeira versão devolvia HTML com `Content-Type: text/html` e o navegador
 * exibiu as tags como texto. Não vale caçar o motivo: esta é uma página de
 * utilidade que uma pessoa abre duas vezes na vida, e HTML aqui só adiciona
 * uma forma de parecer quebrada. Texto puro renderiza igual em todo lugar.
 */
function pagina(titulo: string, corpo: string, ok: boolean): Response {
  return new Response(
    `${ok ? "✅" : "⚠️"}  ${titulo}\n${"─".repeat(titulo.length + 4)}\n\n${corpo.trim()}\n`,
    { status: ok ? 200 : 400, headers: { "Content-Type": "text/plain; charset=utf-8" } },
  );
}

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);
  const redirectUri = REDIRECT_URI;

  if (!CLIENT_ID || !CLIENT_SECRET) {
    return pagina("Faltam credenciais", `
Cadastre em Supabase > Edge Functions > Secrets:

    MELHOR_ENVIO_CLIENT_ID
    MELHOR_ENVIO_CLIENT_SECRET
    MELHOR_ENVIO_ENV = production

Os dois primeiros ficam no painel do Melhor Envio, em Area Dev >
Seus aplicativos > carbohub. Depois de salvar, recarregue esta pagina.`, false);
  }

  const code = url.searchParams.get("code");
  const erro = url.searchParams.get("error");

  if (erro) {
    return pagina("O Melhor Envio recusou", `
${erro}
${url.searchParams.get("error_description") ?? ""}

Se for redirect_uri_mismatch, a URL cadastrada no aplicativo
precisa ser exatamente esta (sem barra no final):

    ${redirectUri}`, false);
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
      return pagina("Nao consegui trocar o codigo pelo token", `
${JSON.stringify(t, null, 2).slice(0, 800)}

URL de retorno usada: ${redirectUri}`, false);
    }

    // O access_token dura ~30 dias; o refresh renova sem intervenção.
    await supabase.from("system_tokens").upsert({
      id: "melhorenvio",
      access_token: t.access_token,
      refresh_token: t.refresh_token ?? null,
      expires_at: new Date(Date.now() + (t.expires_in ?? 2592000) * 1000).toISOString(),
    });

    return pagina("Melhor Envio conectado", `
O token foi guardado e renova sozinho.

Ambiente: ${MELHOR_ENVIO_BASE()}
Expira em: ${new Date(Date.now() + (t.expires_in ?? 2592000) * 1000).toLocaleDateString("pt-BR")}

Pode fechar esta aba. O rastreio de Jadlog e Correios comeca na
proxima rodada do rastreio-sync.`, true);
  } catch (e) {
    console.error("[melhor-envio-auth]", e);
    return pagina("Erro inesperado", String((e as Error)?.message ?? e), false);
  }
});

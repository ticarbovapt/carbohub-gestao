/**
 * ml-token-refresh — renova os tokens do Mercado Livre por conta própria
 *
 * ⚠️ POR QUE ESTA FUNÇÃO EXISTE
 *
 * Até aqui, o token do ML só era renovado por efeito colateral: o
 * `ecommerce-sync` conferia a expiração a cada rodada. Funciona enquanto o sync
 * roda — e é exatamente isso que não se pode assumir. Se o `ecommerce-sync`
 * parar (401 por segredo, erro de deploy, cron desligado), o `refresh_token`
 * vence em silêncio e a conta cai. Aí o diagnóstico é duplo: "por que o sync
 * parou" E "por que a conta desconectou", quando a segunda é consequência da
 * primeira.
 *
 * Aqui a renovação tem vida própria, a cada 30 min, sobre quem vence em menos
 * de 90 min — três chances antes de expirar de verdade.
 *
 * ⚠️ A renovação em si NÃO está aqui: está em `_shared/ml.ts`, porque o
 * `refresh_token` do ML é de USO ÚNICO e duas implementações do mesmo refresh
 * são exatamente o defeito que este trabalho corrige. Esta função só escolhe
 * QUEM renovar e chama o helper.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { contasAtivas, getMlToken, type ContaML } from "../_shared/ml.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

// Renova quem vence dentro desta janela. 90 min sobre um cron de 30 min dá três
// tentativas antes de o token morrer — margem para um blip de rede não virar
// desconexão.
const JANELA_MIN = 90;

Deno.serve(async (req: Request) => {
  // ⚠️ AUSÊNCIA FECHA. Sem o segredo configurado, recusa com 500 e mensagem
  // explícita — nunca aceita. A forma `if (SEGREDO && informado !== SEGREDO)`
  // aceitaria qualquer chamada quando o secret sumisse, e o CRON_SECRET já
  // sumiu uma vez neste projeto.
  const segredo = Deno.env.get("CRON_SECRET");
  if (!segredo) {
    console.error("[ml-token-refresh] CRON_SECRET ausente no servidor");
    return new Response(
      JSON.stringify({ ok: false, erro: "CRON_SECRET ausente no servidor" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
  // 401 para chave errada (problema de quem chama) x 500 acima para segredo
  // ausente (problema nosso). Um 401 para os dois faz falha de configuração se
  // disfarçar de chamada indevida — foi esse disfarce que custou um dia.
  const informado = req.headers.get("x-cron-secret") ?? new URL(req.url).searchParams.get("secret");
  if (informado !== segredo) {
    return new Response(JSON.stringify({ ok: false, erro: "nao autorizado" }),
      { status: 401, headers: { "Content-Type": "application/json" } });
  }

  const contas = await contasAtivas(supabase as never);
  const limite = Date.now() + JANELA_MIN * 60 * 1000;

  const resultado: Record<string, string> = {};

  for (const conta of contas as ContaML[]) {
    const venceEm = conta.expires_at ? new Date(conta.expires_at).getTime() : 0;
    if (venceEm > limite) {
      resultado[conta.platform_key] = "ainda vale";
      continue;
    }

    // ⚠️ `getMlToken` já faz a troca condicional e marca erro sem apagar nada.
    // Se outro worker renovar no meio, ele relê e devolve o token do vencedor —
    // então rodar este cron junto com o sync não queima token.
    const token = await getMlToken(supabase as never, conta);
    resultado[conta.platform_key] = token ? "renovado" : "FALHOU (ver last_error)";
  }

  // ⚠️ O que precisa de gente aparece SEPARADO, e não como mais uma linha no
  // meio do log. `reauth_required` é a única coisa aqui que ninguém resolve
  // sozinho — é OAuth manual.
  const { data: precisamOauth } = await (supabase as never as {
    from: (t: string) => any;
  }).from("ml_accounts").select("platform_key, last_error").eq("status", "reauth_required");

  const pendentes = (precisamOauth ?? []) as { platform_key: string; last_error: string }[];
  if (pendentes.length > 0) {
    console.error("[ml-token-refresh] CONTAS PRECISANDO DE OAUTH MANUAL:",
      JSON.stringify(pendentes));
  }

  console.log("[ml-token-refresh]", JSON.stringify(resultado));
  return new Response(
    JSON.stringify({ ok: true, contas: resultado, reauth_required: pendentes }),
    { headers: { "Content-Type": "application/json" } },
  );
});

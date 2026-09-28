// Recebe as medições da SONDA EXTERNA (GitHub Actions) e as grava.
//
// ⚠️ Por que existe uma função em vez de o workflow escrever direto no
// PostgREST: para o GitHub guardar o segredo MENOR. Escrever direto exigiria
// a `SUPABASE_SERVICE_ROLE_KEY` num secret do Actions — e essa chave lê o
// banco inteiro, incluindo `ml_accounts` (tokens do Mercado Livre) e as notas
// fiscais. O `CRON_SECRET` só abre as portas de cron, que é exatamente o que
// a sonda precisa.
//
// ⚠️ E isto NÃO fecha o buraco que a `20261012000000` descreve: a função roda
// no Supabase, então com o Supabase fora ela também está fora. O sinal de
// queda continua sendo o BURACO na série, nunca uma linha `ok = false`.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CRON_SECRET = Deno.env.get("CRON_SECRET");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

interface Medicao {
  alvo: string;
  ok: boolean;
  ms?: number | null;
  detalhe?: string | null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  // ⚠️ AUSÊNCIA FECHA. `if (SEGREDO && informado !== SEGREDO)` aceitaria tudo
  // no dia em que o secret sumisse — e aqui isso é qualquer um forjando
  // "estava tudo bem" durante uma queda. Ver a seção do CRON_SECRET no
  // CLAUDE.md: 401 é problema de quem chama, 500 é problema nosso.
  if (!CRON_SECRET) {
    return new Response(
      JSON.stringify({ erro: "CRON_SECRET ausente no servidor — configure em Edge Functions → Secrets." }),
      { status: 500, headers: { ...cors, "Content-Type": "application/json" } },
    );
  }
  const informado = req.headers.get("x-cron-secret") ?? new URL(req.url).searchParams.get("secret");
  if (informado !== CRON_SECRET) {
    return new Response(JSON.stringify({ erro: "não autorizado" }), {
      status: 401,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  let corpo: { medicoes?: Medicao[] };
  try {
    corpo = await req.json();
  } catch {
    return new Response(JSON.stringify({ erro: "corpo inválido" }), {
      status: 400,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const medicoes = (corpo.medicoes ?? []).filter((m) => m && typeof m.alvo === "string" && typeof m.ok === "boolean");
  if (medicoes.length === 0) {
    return new Response(JSON.stringify({ erro: "nenhuma medição" }), {
      status: 400,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const db = createClient(SUPABASE_URL, SERVICE_ROLE);
  const agora = new Date().toISOString();
  const { error } = await db.from("carbo_status_sonda").insert(
    medicoes.map((m) => ({
      medido_em: agora,
      alvo: m.alvo.slice(0, 80),
      ok: m.ok,
      ms: typeof m.ms === "number" ? Math.round(m.ms) : null,
      detalhe: m.detalhe ? String(m.detalhe).slice(0, 300) : null,
    })),
  );

  if (error) {
    console.error("status-sonda: falha ao gravar", error.message);
    return new Response(JSON.stringify({ erro: error.message }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ gravadas: medicoes.length }), {
    headers: { ...cors, "Content-Type": "application/json" },
  });
});

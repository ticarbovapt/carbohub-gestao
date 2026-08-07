// ─────────────────────────────────────────────────────────────────────────────
// melhor-envio-webhook — o aviso, não a verdade
//
// O Melhor Envio avisa quando uma etiqueta muda ("Atualização das etiquetas
// criadas e editadas"). Com isso a esteira anda em tempo real e o cron de hora
// em hora vira só rede de segurança.
//
// ── O que esta função NÃO faz ────────────────────────────────────────────────
//
// Ela não grava rastreio, não interpreta status e não confia no corpo do aviso.
// Extrai os códigos e chama a `rastreio-sync`, que busca a verdade na API.
//
// Isso é deliberado e é a mesma lição do resto deste repositório: o corpo do
// webhook é um formato de terceiro que pode mudar sem avisar, e uma segunda
// implementação da regra de rastreio divergiria da primeira em silêncio — não
// dá erro, dá dois cards contando histórias diferentes. O aviso é o GATILHO; a
// API é a FONTE.
//
// ── Segurança ────────────────────────────────────────────────────────────────
//
// O painel do Melhor Envio só pede uma URL, sem campo de segredo e sem
// assinatura documentada. A proteção possível é o segredo na própria URL
// (`?secret=`). É modesto, e a consequência de alguém descobrir é limitada:
// esta função só provoca uma releitura da API. Nada aqui grava o que o
// chamador mandou.
//
// ── Formato do payload ───────────────────────────────────────────────────────
//
// Não confirmado. Por isso o corpo cru vai INTEIRO para `rastreio_webhook_log`
// antes de qualquer coisa, e a extração de códigos varre o objeto procurando
// campos conhecidos em qualquer profundidade. Aviso que não virar código nenhum
// fica visível numa consulta, em vez de sumir:
//
//   select recebido_em, payload from public.rastreio_webhook_log
//   where cardinality(codigos) = 0 order by recebido_em desc;
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const SEGREDO = Deno.env.get("CRON_SECRET") ?? "";
const BASE_FUNCOES = `${Deno.env.get("SUPABASE_URL")}/functions/v1`;

/** Campos que já vimos carregar um código de rastreio, em qualquer nível. */
const CAMPOS_CODIGO = new Set([
  "tracking", "self_tracking", "melhorenvio_tracking", "protocol", "code",
]);

/**
 * Varre o objeto inteiro atrás de códigos.
 *
 * Recursivo de propósito: o Melhor Envio pode mandar o envio na raiz, dentro
 * de `data`, ou uma lista deles. Fixar um caminho é apostar num formato que
 * não está documentado — e errar a aposta significa avisos chegando e não
 * fazendo nada, que é pior do que não ter webhook.
 */
// deno-lint-ignore no-explicit-any
function extrairCodigos(no: any, achados = new Set<string>(), nivel = 0): Set<string> {
  if (!no || nivel > 6) return achados;
  if (Array.isArray(no)) {
    for (const item of no) extrairCodigos(item, achados, nivel + 1);
    return achados;
  }
  if (typeof no !== "object") return achados;

  for (const [chave, valor] of Object.entries(no)) {
    if (CAMPOS_CODIGO.has(chave) && typeof valor === "string" && valor.trim()) {
      achados.add(valor.trim());
    } else if (valor && typeof valor === "object") {
      extrairCodigos(valor, achados, nivel + 1);
    }
  }
  return achados;
}

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);

  if (SEGREDO && url.searchParams.get("secret") !== SEGREDO) {
    return new Response(JSON.stringify({ error: "segredo inválido" }), {
      status: 401, headers: { "Content-Type": "application/json" },
    });
  }

  // Corpo ilegível também vira linha: se o Melhor Envio um dia mandar form-data
  // em vez de JSON, quero ver isso na tabela, não descobrir por ausência.
  let corpo: unknown = null;
  let cru = "";
  try {
    cru = await req.text();
    corpo = cru ? JSON.parse(cru) : null;
  } catch {
    corpo = { _nao_era_json: cru.slice(0, 2000) };
  }

  const codigos = [...extrairCodigos(corpo)];

  const { data: registro } = await supabase
    .from("rastreio_webhook_log")
    .insert({
      origem: "melhorenvio",
      evento: (corpo as Record<string, unknown>)?.event as string ?? null,
      codigos,
      payload: corpo,
      acao: codigos.length ? "disparado" : "sem codigo no payload",
    })
    .select("id")
    .maybeSingle();

  // Sem código não há o que atualizar. Respondo 200 assim mesmo: devolver erro
  // faria o Melhor Envio reenviar em laço um aviso que eu continuaria sem
  // entender. A linha registrada é o que resolve isso, não a repetição.
  if (!codigos.length) {
    return new Response(
      JSON.stringify({ ok: true, nota: "sem código reconhecível — registrado para análise", log: registro?.id }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }

  // O trabalho é da rastreio-sync: uma implementação só da regra de rastreio.
  const alvo = `${BASE_FUNCOES}/rastreio-sync`
    + `?secret=${encodeURIComponent(SEGREDO)}`
    + `&codigos=${encodeURIComponent(codigos.join(","))}`;

  const disparar = fetch(alvo, { headers: { "X-Cron-Secret": SEGREDO } })
    .then(async (r) => {
      const txt = await r.text();
      await supabase.from("rastreio_webhook_log")
        .update({ acao: `rastreio-sync ${r.status}: ${txt.slice(0, 300)}` })
        .eq("id", registro?.id ?? -1);
    })
    .catch(async (e) => {
      await supabase.from("rastreio_webhook_log")
        .update({ acao: `falhou: ${String(e).slice(0, 300)}` })
        .eq("id", registro?.id ?? -1);
    });

  // Responde já e termina o trabalho depois: o Melhor Envio espera um 200
  // rápido, e uma sincronização que demore faria o aviso ser considerado
  // falho e reenviado.
  // deno-lint-ignore no-explicit-any
  const rt = (globalThis as any).EdgeRuntime;
  if (rt?.waitUntil) rt.waitUntil(disparar); else await disparar;

  return new Response(
    JSON.stringify({ ok: true, codigos, log: registro?.id }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
});

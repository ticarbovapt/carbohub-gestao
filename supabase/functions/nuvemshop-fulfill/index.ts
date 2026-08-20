// ─────────────────────────────────────────────────────────────────────────────
// nuvemshop-fulfill — FASE 3: o envio postado vira "enviado" na loja
//
// É a ÚNICA função deste trabalho que ESCREVE fora daqui. E escrever aqui
// dispara e-mail para o cliente, o que torna o erro irreversível: não existe
// desfazer um e-mail.
//
// ── A divisão de trabalho ────────────────────────────────────────────────────
//
//   banco    decide QUEM deve ser marcado  (view carbo_fulfill_fila)
//   aqui     confere na loja e escreve
//   log      garante que aconteça UMA vez
//
// A função não julga vínculo, não escolhe envio e não interpreta situação. Se
// está na fila, é para marcar — e a fila já carrega as travas do vínculo
// confirmado e do envio vigente.
//
// ── ⚠️ A dupla checagem, e por que ela não é paranoia ───────────────────────
//
// A fila já exclui pedido que a loja diz enviado. Ainda assim, esta função faz
// um GET no pedido ANTES de escrever.
//
// O motivo é a janela: entre a última sincronização e agora, alguém pode ter
// marcado o envio à mão no painel. O `ecommerce_orders` só saberia disso na
// próxima rodada do `ecommerce-sync`. Sem o GET, o cliente receberia o segundo
// e-mail — e o log diria que estava tudo certo, porque pelo nosso dado estava.
//
// A fonte da verdade sobre o estado do pedido é a LOJA, no instante da escrita.
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getNuvemshopCreds, NUVEMSHOP_API, NUVEMSHOP_UA } from "../_shared/nuvemshop.ts";
// ⚠️ A regra do "já saiu?" mora num módulo puro: é a mais perigosa desta
// integração, e é a que os testes cobrem.
import { jaEnviado } from "../_shared/nuvemshopFulfill.ts";

// deno-lint-ignore-file no-explicit-any

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const SEGREDO = Deno.env.get("CRON_SECRET") ?? "";
const PAUSA_MS = 300;

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status, headers: { "Content-Type": "application/json" },
  });
}

function headers(token: string): HeadersInit {
  return {
    "Authentication": `bearer ${token}`,
    "Authorization":  `bearer ${token}`,
    "User-Agent":     NUVEMSHOP_UA,
    "Content-Type":   "application/json",
  };
}

interface LinhaFila {
  bling_id: number;
  pedido_loja: string;
  loja_order_id: string;
  me_id: string;
  rastreio: string;
  url_rastreio: string | null;
  transportadora: string | null;
  servico: string | null;
  postado_em: string | null;
  situacao: string;
  cliente: string | null;
  total: number | null;
}

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);
  const informado = req.headers.get("X-Cron-Secret") ?? url.searchParams.get("secret");

  // FECHA quando o segredo não existe — e aqui isso vale dobrado: a forma
  // errada abriria uma função que manda e-mail para a base de clientes.
  if (!SEGREDO) {
    console.error("[portaria] CRON_SECRET não configurado — recusando por precaução.");
    return json({ error: "CRON_SECRET não está configurado neste projeto." }, 500);
  }
  if (informado !== SEGREDO) return json({ error: "segredo inválido ou ausente" }, 401);

  const { data: cfg } = await supabase
    .from("carbo_fulfill_config").select("*").eq("id", true).maybeSingle();

  // ⚠️ Sem configuração = DESLIGADO. Ausência nunca abre.
  const ativo = cfg?.ativo === true;
  // O dry-run também pode vir da URL, para ensaiar sem mexer na tabela.
  const dryRun = cfg?.dry_run !== false || url.searchParams.get("ensaio") === "1";
  const teto = Math.min(Number(cfg?.teto_rodada ?? 20) || 20, 200);

  const { data: fila, error } = await supabase
    .from("carbo_fulfill_fila").select("*").limit(teto);
  if (error) return json({ error: `fila: ${error.message}` }, 500);
  if (!fila?.length) return json({ ok: true, fila: 0, ativo, dry_run: dryRun, nota: "nada a marcar" });

  // ⚠️ A checagem da chave vem DEPOIS da fila, de propósito. Com a automação
  // desligada e nada a fazer, isto responderia "desligado" a cada rodada — 288
  // linhas de log por dia dizendo o óbvio. Sem nada na fila, não há decisão a
  // tomar.
  if (!ativo && !dryRun) {
    return json({ ok: true, fila: fila.length, ativo: false,
                  nota: "automação desligada em carbo_fulfill_config" });
  }

  const creds = await getNuvemshopCreds(supabase);
  if (!creds) return json({ error: "Nuvemshop não conectada." }, 500);

  const resultados: unknown[] = [];
  let marcados = 0, jaEstavam = 0, erros = 0, ensaiados = 0;

  for (const l of fila as LinhaFila[]) {
    const base = `${NUVEMSHOP_API}/${creds.storeId}/orders/${l.loja_order_id}`;

    // ── 1. O estado ATUAL na loja ────────────────────────────────────────────
    let pedido: any = null;
    try {
      const res = await fetch(base, { headers: headers(creds.accessToken) });
      if (!res.ok) throw new Error(`GET ${res.status}`);
      pedido = await res.json();
    } catch (e) {
      erros++;
      await supabase.from("carbo_fulfill_log").upsert({
        platform: "nuvemshop", pedido_loja: l.pedido_loja, bling_id: l.bling_id,
        me_id: l.me_id, rastreio: l.rastreio, status: "erro",
        motivo: `não consegui ler o pedido na loja: ${String((e as Error).message).slice(0, 200)}`,
      });
      continue;
    }

    if (jaEnviado(pedido)) {
      jaEstavam++;
      // ⚠️ `ignorado`, não `erro`. A loja já sabe — o objetivo está cumprido, e
      // registrar isso é o que impede a fila de reapresentar o mesmo pedido
      // para sempre.
      await supabase.from("carbo_fulfill_log").upsert({
        platform: "nuvemshop", pedido_loja: l.pedido_loja, bling_id: l.bling_id,
        me_id: l.me_id, rastreio: l.rastreio, status: "ignorado",
        motivo: "a loja já registrava o envio", enviado_em: new Date().toISOString(),
        resposta: { shipping_status: pedido?.shipping_status ?? null },
      });
      continue;
    }

    const corpo = {
      shipping_tracking_number: l.rastreio,
      shipping_tracking_url: l.url_rastreio ?? undefined,
    };

    if (dryRun) {
      ensaiados++;
      // ⚠️ O ensaio NÃO grava no log, e isso é deliberado: a fila exclui todo
      // pedido que TENHA linha, com qualquer status. Se o ensaio registrasse,
      // ele consumiria a vaga — e o pedido nunca seria marcado de verdade.
      // Um ensaio que impede o efeito que ele ensaia não é ensaio.
      resultados.push({
        pedido_loja: l.pedido_loja, cliente: l.cliente, rastreio: l.rastreio,
        chamaria: `POST ${base}/fulfill`, corpo,
        estado_na_loja: pedido?.shipping_status ?? null,
      });
      continue;
    }

    // ── 2. Grava a intenção ANTES de chamar ─────────────────────────────────
    // Se a API cair no meio, fica `erro` e não volta para a fila. Perder uma
    // marcação é ruim; mandar o mesmo e-mail duas vezes é pior.
    await supabase.from("carbo_fulfill_log").upsert({
      platform: "nuvemshop", pedido_loja: l.pedido_loja, bling_id: l.bling_id,
      me_id: l.me_id, rastreio: l.rastreio, url_rastreio: l.url_rastreio,
      status: "erro", motivo: "escrita iniciada", requisicao: corpo,
    });

    try {
      const res = await fetch(`${base}/fulfill`, {
        method: "POST",
        headers: headers(creds.accessToken),
        body: JSON.stringify(corpo),
      });
      const texto = await res.text();
      let resposta: unknown = texto;
      try { resposta = JSON.parse(texto); } catch { /* texto puro serve */ }

      await supabase.from("carbo_fulfill_log").upsert({
        platform: "nuvemshop", pedido_loja: l.pedido_loja, bling_id: l.bling_id,
        me_id: l.me_id, rastreio: l.rastreio, url_rastreio: l.url_rastreio,
        status: res.ok ? "enviado" : "erro",
        motivo: res.ok ? null : `nuvemshop ${res.status}`,
        requisicao: corpo, resposta: resposta as Record<string, unknown>,
        enviado_em: new Date().toISOString(),
      });
      if (res.ok) marcados++; else erros++;
      resultados.push({ pedido_loja: l.pedido_loja, status: res.status });
    } catch (e) {
      erros++;
      await supabase.from("carbo_fulfill_log").upsert({
        platform: "nuvemshop", pedido_loja: l.pedido_loja, bling_id: l.bling_id,
        me_id: l.me_id, rastreio: l.rastreio, status: "erro",
        motivo: String((e as Error)?.message ?? e).slice(0, 300),
        requisicao: corpo, enviado_em: new Date().toISOString(),
      });
    }

    await dormir(PAUSA_MS);
  }

  const resumo = {
    ok: true, ativo, dry_run: dryRun, fila: fila.length,
    marcados, ja_estavam: jaEstavam, ensaiados, erros,
    ...(dryRun ? { faria: resultados } : { resultados }),
  };
  console.log("[nuvemshop-fulfill]", JSON.stringify({ ...resumo, faria: undefined }));
  return json(resumo);
});

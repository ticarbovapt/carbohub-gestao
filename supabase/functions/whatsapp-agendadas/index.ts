// ─────────────────────────────────────────────────────────────────────────────
// whatsapp-agendadas — a resposta que alguém marcou para sair mais tarde
//
// Lê `carbo_wa_agendadas_fila` (o que já passou da hora e ainda não saiu) e
// envia texto livre pelo Graph API.
//
// ── ⚠️ Por que ela confere a janela de novo ─────────────────────────────────
//
// A tela já valida ao agendar, e a janela de 24 h só se ESTENDE — então o
// horário que cabia continua cabendo. Não é a janela que preocupa: é o resto.
// Entre agendar e disparar passam horas, e nesse tempo o token pode expirar, o
// número pode virar inválido, alguém pode ter respondido. Mandar às cegas
// depois de esperar é pior do que não ter agendado.
//
// ── ⚠️ Falha aqui é silenciosa por natureza ────────────────────────────────
//
// Quem agendou foi embora achando que estava resolvido. Não há ninguém olhando
// a tela no minuto do disparo, como há num envio manual. Por isso todo caminho
// que não termina em mensagem entregue grava `falhou` com o motivo em texto
// legível — e a tela mostra o agendamento pendente o tempo todo.
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { detalheDoErro, ehTransitorio } from "../_shared/metaTemplate.ts";

// deno-lint-ignore-file no-explicit-any

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const SEGREDO  = Deno.env.get("CRON_SECRET") ?? "";
const TOKEN    = Deno.env.get("WHATSAPP_ACCESS_TOKEN") ?? "";
const PHONE_ID = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID") ?? "1255756280958635";
const VERSAO   = Deno.env.get("WHATSAPP_API_VERSION") ?? "v25.0";

const TETO = 20;
const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status, headers: { "Content-Type": "application/json" },
  });
}

interface LinhaFila {
  id: string; wa_id: string; texto: string; enviar_em: string;
  janela_ate: string | null; janela_aberta: boolean | null;
}

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);
  const informado = req.headers.get("X-Cron-Secret") ?? url.searchParams.get("secret");

  if (!SEGREDO) {
    console.error("[portaria] CRON_SECRET não configurado — recusando por precaução.");
    return json({ error: "CRON_SECRET não está configurado neste projeto." }, 500);
  }
  if (informado !== SEGREDO) return json({ error: "segredo inválido ou ausente" }, 401);

  // A fila antes da checagem do token: sem nada a enviar, não há configuração
  // faltando — há nada a fazer. Ao contrário, isto seria 1440 falhas por dia.
  const { data: fila, error } = await supabase
    .from("carbo_wa_agendadas_fila").select("*")
    .order("enviar_em", { ascending: true }).limit(TETO);
  if (error) return json({ error: `fila: ${error.message}` }, 500);
  if (!fila?.length) return json({ ok: true, fila: 0, nota: "nada agendado para agora" });

  if (!TOKEN) {
    return json({ error: "WHATSAPP_ACCESS_TOKEN não está configurado.", fila: fila.length }, 500);
  }

  let enviados = 0, falhas = 0;
  const resultados: unknown[] = [];

  for (const a of fila as LinhaFila[]) {
    // ── A janela, no instante do envio ──────────────────────────────────────
    if (!a.janela_aberta) {
      falhas++;
      await supabase.from("carbo_wa_agendadas").update({
        status: "falhou",
        motivo: a.janela_ate
          ? `A janela de 24h fechou em ${new Date(a.janela_ate).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })} e a mensagem não pôde sair. Só template aprovado alcança este cliente agora.`
          : "Este cliente nunca escreveu para o número, então não há janela aberta.",
        enviado_em: new Date().toISOString(),
      }).eq("id", a.id);
      resultados.push({ id: a.id, wa_id: a.wa_id, resultado: "janela fechada" });
      continue;
    }

    const payload = {
      messaging_product: "whatsapp", recipient_type: "individual",
      to: a.wa_id, type: "text",
      text: { preview_url: false, body: a.texto },
    };

    // ⚠️ Marca como enviando ANTES de chamar. Se a função morrer no meio, a
    // linha fica `falhou` e não volta para a fila — mandar a mesma mensagem
    // duas vezes, horas depois, é pior do que perder uma.
    await supabase.from("carbo_wa_agendadas").update({
      status: "falhou", motivo: "envio iniciado",
    }).eq("id", a.id);

    let resposta: any = null, status = 0;
    try {
      for (let tentativa = 0; tentativa <= 2; tentativa++) {
        const res = await fetch(`https://graph.facebook.com/${VERSAO}/${PHONE_ID}/messages`, {
          method: "POST",
          headers: { "Authorization": `Bearer ${TOKEN}`, "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        resposta = await res.json().catch(() => ({}));
        status = res.status;
        if (res.ok) break;
        if (ehTransitorio(res.status, resposta?.error?.code) && tentativa < 2) {
          await dormir(2 ** tentativa * 1000);
          continue;
        }
        break;
      }
    } catch (e) {
      resposta = { error: { message: String((e as Error)?.message ?? e) } };
      status = 0;
    }

    const ok = status >= 200 && status < 300;
    const wamid = resposta?.messages?.[0]?.id ?? null;

    if (ok && wamid) {
      enviados++;
      await supabase.from("carbo_wa_agendadas").update({
        status: "enviado", motivo: null, wamid, erro_codigo: null,
        enviado_em: new Date().toISOString(),
      }).eq("id", a.id);

      // ⚠️ Entra na conversa como qualquer mensagem nossa. Sem isto, o
      // atendimento não veria o que foi dito ao cliente — que é o mesmo buraco
      // que a esteira tinha antes de os avisos entrarem na linha do tempo.
      const { error: erroMsg } = await supabase.from("carbo_wa_mensagens").upsert({
        wamid, wa_id: a.wa_id, direcao: "saida", tipo: "text", texto: a.texto,
        ocorrido_em: new Date().toISOString(),
        // ⚠️ O agendamento NÃO gravava autor nenhum — só `agendada_id`. Quem
        // agendou às 18h de sexta e a mensagem saiu no sábado era, para a
        // tela, ninguém. O autor sempre existiu em `carbo_wa_agendadas`; o que
        // faltava era atravessar para a mensagem.
        enviado_por: a.criado_por ?? null,
        enviado_por_nome: a.criado_por_nome ?? null,
        payload: { agendada_id: a.id, ...payload },
      }, { onConflict: "wamid" });
      if (erroMsg) console.error("[agendadas] enviou mas não gravou", wamid, erroMsg);

      resultados.push({ id: a.id, wa_id: a.wa_id, wamid });
    } else {
      falhas++;
      const detalhe = detalheDoErro(resposta) || `HTTP ${status}`;
      await supabase.from("carbo_wa_agendadas").update({
        status: "falhou",
        motivo: `A Meta recusou: ${detalhe}`,
        erro_codigo: resposta?.error?.code ?? null,
        enviado_em: new Date().toISOString(),
      }).eq("id", a.id);
      resultados.push({ id: a.id, wa_id: a.wa_id, erro: detalhe });
    }

    await dormir(250);
  }

  const resumo = { ok: true, fila: fila.length, enviados, falhas, resultados };
  console.log("[whatsapp-agendadas]", JSON.stringify(resumo));
  return json(resumo);
});

// ─────────────────────────────────────────────────────────────────────────────
// whatsapp-meta-webhook — o que acontece DEPOIS do envio
//
// Três coisas chegam por aqui, e é o que transforma "a Meta aceitou" em prova:
//
//   statuses[]                        sent → delivered → read → failed
//   messages[]                        o cliente respondeu (abre a janela de 24h)
//   message_template_status_update    template aprovado / recusado / pausado
//
// ── ⚠️ Quem autentica é a ASSINATURA, não um segredo na URL ─────────────────
//
// Esta função é a única do projeto chamada por um TERCEIRO, e o painel da Meta
// não deixa mandar header. Então o padrão do `CRON_SECRET` não serve: a prova
// é o `X-Hub-Signature-256`, um HMAC-SHA256 do corpo CRU com o app secret.
//
// O princípio, esse é o mesmo: FECHA quando o segredo não existe. Sem
// `WHATSAPP_APP_SECRET` configurado, tudo é recusado — nunca "aceita porque
// não dá para conferir".
//
// ⚠️ E o HMAC é sobre os BYTES do corpo, exatamente como vieram. Fazer
// `JSON.parse` e re-serializar muda espaço e ordem de chave, e a assinatura
// deixa de bater — com o sintoma de "a Meta está mandando assinatura errada",
// que é o diagnóstico errado mais caro deste caminho.
//
// ── Sobre responder rápido ───────────────────────────────────────────────────
//
// A Meta reentrega quando o 200 demora. O processamento aqui é curto (uma
// chamada de banco por evento) e, mais importante, é IDEMPOTENTE: a
// `carbo_wa_eventos` recusa a segunda vez pela chave primária. Preferi
// processar antes de responder e deixar a reentrega ser inofensiva, em vez de
// responder cedo e depender de o processo sobreviver ao fim da requisição.
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  interpretar, assinaturaConfere, statusDeTemplate,
} from "../_shared/metaWebhook.ts";

// deno-lint-ignore-file no-explicit-any

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const APP_SECRET   = Deno.env.get("WHATSAPP_APP_SECRET") ?? "";
const VERIFY_TOKEN = Deno.env.get("WHATSAPP_WEBHOOK_VERIFY_TOKEN") ?? "";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status, headers: { "Content-Type": "application/json" },
  });
}

const hex = (b: ArrayBuffer) =>
  [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");

async function assinar(corpo: Uint8Array, segredo: string): Promise<string> {
  const chave = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(segredo),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  return "sha256=" + hex(await crypto.subtle.sign("HMAC", chave, corpo));
}

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);

  // ── Verificação (GET), feita uma vez pela Meta ao salvar a URL ────────────
  if (req.method === "GET") {
    if (!VERIFY_TOKEN) {
      console.error("[portaria] WHATSAPP_WEBHOOK_VERIFY_TOKEN não configurado.");
      return json({ error: "WHATSAPP_WEBHOOK_VERIFY_TOKEN não está configurado." }, 500);
    }
    const modo = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const desafio = url.searchParams.get("hub.challenge") ?? "";
    if (modo === "subscribe" && assinaturaConfere(VERIFY_TOKEN, token ?? "")) {
      // ⚠️ Texto puro, sem aspas. A Meta compara o corpo com o challenge que
      // mandou; devolver JSON ("123") faz a verificação falhar com a mensagem
      // genérica "não foi possível validar a URL de callback".
      return new Response(desafio, {
        status: 200, headers: { "Content-Type": "text/plain" },
      });
    }
    return json({ error: "verificação recusada" }, 403);
  }

  if (req.method !== "POST") return json({ error: "método não suportado" }, 405);

  // FECHA quando o segredo não existe.
  if (!APP_SECRET) {
    console.error("[portaria] WHATSAPP_APP_SECRET não configurado — recusando tudo.");
    return json({ error: "WHATSAPP_APP_SECRET não está configurado." }, 500);
  }

  const cru = new Uint8Array(await req.arrayBuffer());
  const recebida = req.headers.get("X-Hub-Signature-256") ?? "";
  const esperada = await assinar(cru, APP_SECRET);
  if (!assinaturaConfere(esperada, recebida)) {
    console.error("[webhook] assinatura inválida — descartando.");
    return json({ error: "assinatura inválida" }, 401);
  }

  let payload: any = null;
  try {
    payload = JSON.parse(new TextDecoder().decode(cru));
  } catch {
    // Assinatura válida e corpo ilegível é problema nosso de leitura, não da
    // Meta. 200 para ela não reentregar algo que vai falhar de novo.
    console.error("[webhook] corpo não é JSON.");
    return json({ ok: true, nota: "corpo ilegível, descartado" });
  }

  let status = 0, inbound = 0, templates = 0, repetidos = 0;
  const falhas: Array<{ chave: string; motivo: string }> = [];

  for (const entry of payload?.entry ?? []) {
    for (const change of entry?.changes ?? []) {
      for (const acao of interpretar(change)) {
        // ── A trava da reentrega ────────────────────────────────────────────
        // Grava a chave PRIMEIRO. Se já existe, este evento já foi tratado e
        // não se faz nada — nem se olha o que ele dizia.
        const { error: erroChave } = await supabase
          .from("carbo_wa_eventos").insert({ chave: acao.chave });
        if (erroChave) {
          // ⚠️ SÓ 23505 (chave duplicada) significa "já tratei". Tratar
          // qualquer erro como repetição faria uma queda de conexão descartar
          // eventos em silêncio, e o painel diria "entregue" para mensagens
          // cujo status nunca chegou.
          if (erroChave.code === "23505") { repetidos++; continue; }
          console.error("[webhook] não consegui registrar a chave", acao.chave, erroChave);
          falhas.push({ chave: acao.chave, motivo: `chave: ${erroChave.message}` });
          continue;
        }

        try {
          // ⚠️ TODA escrita daqui tem o erro conferido.
          //
          // O supabase-js NÃO lança: ele devolve `{ error }`. Um `await` sem
          // conferir o retorno engole a falha inteira — e como a chave do
          // evento já foi gravada, o evento fica marcado como tratado sem ter
          // sido, sem uma linha de log em lugar nenhum.
          //
          // No caminho do inbound isso seria a janela de 24 h nunca abrir: o
          // cliente responde, o registro diz que foi processado, e o
          // atendimento leva 131047 ao responder em texto livre sem nada
          // explicando por quê.
          if (acao.tipo === "status") {
            // A regra do "só anda para a frente" mora no BANCO, não aqui: ela
            // precisa valer para qualquer caminho que venha a escrever status,
            // e uma regra de ordenação no front é uma regra que o próximo
            // caminho esquece de copiar.
            const { error: e1 } = await supabase.rpc("carbo_msg_status_meta", {
              p_wamid: acao.wamid, p_status: acao.status, p_quando: acao.quando,
              p_erro_codigo: acao.codigo, p_erro_detalhe: acao.detalhe,
            });
            if (e1) throw new Error(`status: ${e1.message}`);
            status++;
          } else if (acao.tipo === "inbound") {
            const { error: e2 } = await supabase.from("carbo_wa_contatos").upsert({
              wa_id: acao.waId, nome: acao.nome, last_inbound_at: acao.quando,
            }, { onConflict: "wa_id" });
            if (e2) throw new Error(`contato ${acao.waId}: ${e2.message}`);

            // ⚠️ A CONVERSA. Número da Cloud API não aparece na Caixa de
            // Entrada do Business Suite, e a Cloud API não tem endpoint de
            // histórico: o que não for gravado aqui existe só no celular do
            // cliente. Três dos seis templates pedem resposta em texto.
            //
            // Grava DEPOIS do contato porque a janela de 24 h é a parte
            // urgente: se esta escrita falhar, o atendimento ainda sabe que
            // pode responder, e a falha aparece no corpo da resposta.
            const { error: e2b } = await supabase.from("carbo_wa_mensagens").upsert({
              wamid: acao.wamid, wa_id: acao.waId, direcao: "entrada",
              tipo: acao.formato, texto: acao.texto,
              midia_id: acao.midiaId, midia_mime: acao.midiaMime,
              responde_a: acao.respondeA, ocorrido_em: acao.quando,
              payload: acao.payload,
            }, { onConflict: "wamid" });
            if (e2b) throw new Error(`mensagem ${acao.wamid}: ${e2b.message}`);
            inbound++;
          } else if (acao.tipo === "template") {
            const novo = statusDeTemplate(acao.evento);
            // Evento desconhecido não vira status inventado: o CHECK recusaria
            // e a rodada falharia por causa de um nome novo da Meta.
            if (novo) {
              const { error: e3 } = await supabase.from("carbo_msg_templates").update({
                meta_status: novo, meta_status_em: new Date().toISOString(),
                meta_motivo_recusa: acao.motivo,
              }).eq("meta_template_nome", acao.nome);
              if (e3) throw new Error(`template ${acao.nome}: ${e3.message}`);
              templates++;
              console.log(`[webhook] template ${acao.nome} → ${novo}`);
            }
          }
        } catch (e) {
          // ⚠️ A chave já foi gravada, então este evento não volta. É o mesmo
          // trade do envio: perder um aviso é melhor que aplicá-lo duas vezes.
          //
          // Por isso a falha NÃO fica só no log: ela volta no corpo da
          // resposta. A Meta ignora o corpo, mas quem estiver testando pelo
          // painel dela — ou pelo `net.http_post` — lê o motivo na hora, em vez
          // de precisar abrir o painel de logs para descobrir que houve falha.
          const motivo = String((e as Error)?.message ?? e).slice(0, 300);
          console.error("[webhook] falha ao aplicar", acao.chave, motivo);
          falhas.push({ chave: acao.chave, motivo });
        }
      }
    }
  }

  const resumo = {
    ok: falhas.length === 0,
    status, inbound, templates, repetidos,
    ...(falhas.length ? { falhas } : {}),
  };
  if (status || inbound || templates) console.log("[webhook]", JSON.stringify(resumo));
  return json(resumo);
});

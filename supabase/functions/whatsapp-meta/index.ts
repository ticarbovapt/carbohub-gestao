// ─────────────────────────────────────────────────────────────────────────────
// whatsapp-meta — a esteira fala pela API OFICIAL
//
// Lê `carbo_msg_fila` só onde `canal_envio = 'meta'` (as seis etapas da compra
// à entrega) e envia DIRETO para o Graph API. Recompra e carrinho continuam no
// `kanban-n8n`, pela Evolution.
//
// ── Por que direto, e não pelo n8n ───────────────────────────────────────────
//
// O ganho inteiro da API oficial é o `wamid` e o webhook que reporta
// sent → delivered → read → failed. Passando pelo n8n, o wamid fica lá e
// "enviado" continua significando "o POST foi aceito" — o mesmo sinal fraco do
// `pg_cron` marcando `succeeded` por ter postado, que já custou 25 h de
// sincronismo morto neste projeto.
//
// E separa os destinos de falha: n8n fora do ar deixa de parar a esteira.
//
// ── Divisão de trabalho ──────────────────────────────────────────────────────
//
//   banco            decide QUE houve movimentação (a PK (bling_id, etapa))
//   metaTemplate.ts  decide SE dá para montar a mensagem (regra pura, testada)
//   aqui             conversa com a Meta e registra o que aconteceu
//
// ── ⚠️ As travas ─────────────────────────────────────────────────────────────
//
// 1. A fila não entrega etapa `meta` sem `meta_status = 'APPROVED'`. Ligar o
//    `ativo` antes da aprovação produz NADA, em vez de uma rajada de 132001.
// 2. `ativo = false` em cada template: a chave geral continua sendo por etapa.
// 3. Variável obrigatória sem valor SEGURA o envio (linha `pendente`, que a
//    fila devolve na rodada seguinte). A Meta recusa parâmetro vazio, então a
//    alternativa não é "mandar torto" — é não mandar.
// 4. O registro é gravado ANTES da chamada. API que cai no meio deixa a linha
//    como erro e não volta para a fila: perder um aviso é ruim, mandar o mesmo
//    aviso duas vezes é pior.
// 5. TETO por rodada.
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  normalizarBR, montarPayload, ehTransitorio, detalheDoErro,
  type VarTemplate,
} from "../_shared/metaTemplate.ts";

// deno-lint-ignore-file no-explicit-any

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const SEGREDO  = Deno.env.get("CRON_SECRET") ?? "";
const TOKEN    = Deno.env.get("WHATSAPP_ACCESS_TOKEN") ?? "";
const PHONE_ID = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID") ?? "1255756280958635";
const VERSAO   = Deno.env.get("WHATSAPP_API_VERSION") ?? "v25.0";

// Teto por rodada. O cron é de 1 minuto; 20 por rodada é muito acima do que a
// operação gera num dia e segura qualquer surpresa — mesmo teto do kanban-n8n.
const TETO = 20;
const PAUSA_MS = 250;

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status, headers: { "Content-Type": "application/json" },
  });
}

interface LinhaFila {
  bling_id: number; etapa: string; titulo: string; atraso_min: number;
  telefone: string | null; nome: string | null;
  canal_envio: string; meta_template_nome: string | null;
  meta_idioma: string | null; meta_variaveis: VarTemplate[] | null;
  meta_botao_url_de: string | null; meta_status: string | null;
  [k: string]: unknown;
}

/** Uma chamada ao Graph, com repetição só no que é transitório. */
async function enviar(body: Record<string, unknown>) {
  const url = `https://graph.facebook.com/${VERSAO}/${PHONE_ID}/messages`;
  let ultima: { status: number; json: any } = { status: 0, json: null };

  for (let tentativa = 0; tentativa <= 2; tentativa++) {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    const corpo = await res.json().catch(() => ({}));
    ultima = { status: res.status, json: corpo };
    if (res.ok) return ultima;

    const codigo = corpo?.error?.code as number | undefined;
    if (ehTransitorio(res.status, codigo) && tentativa < 2) {
      // Espera crescente com ruído: duas mensagens que baterem no mesmo rate
      // limit não devem voltar juntas e bater de novo.
      await dormir(2 ** tentativa * 1000 + Math.random() * 500);
      continue;
    }
    return ultima;
  }
  return ultima;
}

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);
  const informado = req.headers.get("X-Cron-Secret") ?? url.searchParams.get("secret");

  // FECHA quando o segredo não existe. Aqui vale dobrado: a forma errada
  // abriria uma função que manda WhatsApp para a base de clientes.
  if (!SEGREDO) {
    console.error("[portaria] CRON_SECRET não configurado — recusando por precaução.");
    return json({ error: "CRON_SECRET não está configurado neste projeto." }, 500);
  }
  if (informado !== SEGREDO) return json({ error: "segredo inválido ou ausente" }, 401);

  // Ensaio: monta o payload EXATO e devolve, sem enviar e sem gravar. É com ele
  // que se compara o que sai daqui com os exemplos aprovados na Meta.
  const ensaio = url.searchParams.get("ensaio") === "1";

  // ⚠️ A fila vem ANTES da checagem do token, de propósito. Sem nada a enviar,
  // não há configuração faltando: há nada a fazer. Ao contrário, isto devolveria
  // 500 a cada minuto por falta de um secret que ainda não é necessário — 1440
  // falhas por dia num lugar que ninguém abre.
  const { data: fila, error } = await supabase
    .from("carbo_msg_fila").select("*")
    .eq("canal_envio", "meta")
    .order("prioridade", { ascending: true })
    .limit(TETO);
  if (error) return json({ error: `fila: ${error.message}` }, 500);
  if (!fila?.length) return json({ ok: true, fila: 0, nota: "nada a avisar pela Meta" });

  if (!TOKEN) {
    return json({
      error: "Há mensagens na fila da Meta, mas falta o secret WHATSAPP_ACCESS_TOKEN.",
      fila: fila.length,
      como_resolver: "Supabase > Edge Functions > Secrets > WHATSAPP_ACCESS_TOKEN = token permanente do usuário do sistema.",
    }, 500);
  }

  const agora = Date.now();
  const resultados: unknown[] = [];
  let enviados = 0, falhas = 0, adiados = 0, semFone = 0, segurados = 0;

  for (const l of fila as LinhaFila[]) {
    const numero = normalizarBR(l.telefone);

    if (!numero) {
      semFone++;
      if (!ensaio) {
        await supabase.from("carbo_msg_envios").upsert({
          bling_id: l.bling_id, etapa: l.etapa, status: "ignorado", canal: "meta",
          motivo: `telefone inválido: ${l.telefone ?? "vazio"}`,
          telefone: l.telefone, enviado_em: new Date().toISOString(),
        });
      } else {
        resultados.push({ bling_id: l.bling_id, etapa: l.etapa,
                          decisao: "ignoraria — telefone inválido", telefone: l.telefone });
      }
      continue;
    }

    const montado = montarPayload(
      numero,
      String(l.meta_template_nome ?? ""),
      String(l.meta_idioma ?? "pt_BR"),
      (l.meta_variaveis ?? []) as VarTemplate[],
      l as unknown as Record<string, unknown>,
      l.meta_botao_url_de,
    );

    // ── Falta variável obrigatória: SEGURA, não manda torto ─────────────────
    //
    // ⚠️ `pendente` de propósito. A fila devolve a linha `pendente` na rodada
    // seguinte — é o mesmo mecanismo que faz o `atraso_min` funcionar. Gravar
    // 'erro' aqui tiraria o pedido da fila para sempre por causa de um dado que
    // chega dez minutos depois.
    if (!montado.body) {
      segurados++;
      if (!ensaio) {
        await supabase.from("carbo_msg_envios").upsert({
          bling_id: l.bling_id, etapa: l.etapa, status: "pendente", canal: "meta",
          motivo: `esperando: ${montado.faltando.join(", ")}`,
          telefone: numero,
        });
      }
      resultados.push({ bling_id: l.bling_id, etapa: l.etapa,
                        decisao: "esperaria", faltando: montado.faltando });
      continue;
    }

    // ── O atraso do template (pós-entrega são 180 min) ──────────────────────
    if (l.atraso_min > 0 && !ensaio) {
      const { data: ja } = await supabase.from("carbo_msg_envios")
        .select("detectado_em").eq("bling_id", l.bling_id).eq("etapa", l.etapa).maybeSingle();
      if (!ja) {
        adiados++;
        await supabase.from("carbo_msg_envios").upsert({
          bling_id: l.bling_id, etapa: l.etapa, status: "pendente", canal: "meta",
          motivo: `aguardando ${l.atraso_min} min do template`, telefone: numero,
        });
        continue;
      }
      if (agora < new Date(ja.detectado_em).getTime() + l.atraso_min * 60_000) {
        adiados++; continue;
      }
    }

    if (ensaio) {
      resultados.push({
        bling_id: l.bling_id, etapa: l.etapa, template: l.meta_template_nome,
        para: numero, valores: montado.valores, payload: montado.body,
      });
      continue;
    }

    // ── Grava a intenção ANTES de chamar ────────────────────────────────────
    await supabase.from("carbo_msg_envios").upsert({
      bling_id: l.bling_id, etapa: l.etapa, status: "erro", canal: "meta",
      motivo: "envio iniciado", telefone: numero, payload: montado.body,
    });

    try {
      const { status, json: resposta } = await enviar(montado.body);
      const ok = status >= 200 && status < 300;
      const wamid = resposta?.messages?.[0]?.id ?? null;
      // ⚠️ O `wa_id` é o número REAL na base do WhatsApp, e pode ser diferente
      // do que mandamos: no Brasil o 9º dígito varia por DDD e por idade do
      // cadastro. Guardar só o que enviamos é guardar o endereço que digitamos
      // em vez do que o carteiro usou.
      const waId = resposta?.contacts?.[0]?.wa_id ?? null;
      const codigo = resposta?.error?.code ?? null;

      await supabase.from("carbo_msg_envios").upsert({
        bling_id: l.bling_id, etapa: l.etapa, canal: "meta",
        // `falhou` e não `erro`: a Meta respondeu, e o que ela disse está no
        // código. `erro` fica para o que nem chegou lá.
        status: ok ? "enviado" : "falhou",
        motivo: ok ? null : `meta ${codigo ?? status}`,
        telefone: numero, wamid, wa_id: waId,
        erro_codigo: ok ? null : codigo,
        erro_detalhe: ok ? null : detalheDoErro(resposta),
        payload: montado.body, resposta,
        enviado_em: new Date().toISOString(),
      });

      if (ok) enviados++; else falhas++;
      resultados.push({ bling_id: l.bling_id, etapa: l.etapa, status, wamid,
                        ...(ok ? {} : { erro: detalheDoErro(resposta) }) });
    } catch (e) {
      falhas++;
      await supabase.from("carbo_msg_envios").upsert({
        bling_id: l.bling_id, etapa: l.etapa, status: "erro", canal: "meta",
        motivo: String((e as Error)?.message ?? e).slice(0, 300),
        telefone: numero, payload: montado.body,
        enviado_em: new Date().toISOString(),
      });
    }

    await dormir(PAUSA_MS);
  }

  const resumo = {
    ok: true, ensaio, fila: fila.length,
    enviados, falhas, adiados, segurados, sem_telefone: semFone,
    ...(ensaio ? { faria: resultados } : { resultados }),
  };
  console.log("[whatsapp-meta]", JSON.stringify({ ...resumo, faria: undefined }));
  return json(resumo);
});

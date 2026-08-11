// ─────────────────────────────────────────────────────────────────────────────
// kanban-n8n — o aviso ao cliente a cada movimentação da esteira
//
// Lê `carbo_msg_fila` (pedidos que mudaram para uma etapa ainda não avisada),
// monta o texto a partir do template daquela etapa e entrega ao n8n, que
// dispara pelo WhatsApp.
//
// ── Divisão de trabalho ─────────────────────────────────────────────────────
//
//   banco     decide QUE houve movimentação (a PK (bling_id, etapa))
//   aqui      monta O QUE dizer (template + variáveis)
//   n8n       entrega
//
// O workflow do n8n aceita `card.mensagem` pronta e, quando ela vem, ignora os
// templates dele. É de propósito: uma redação, num lugar só, editável por quem
// fala com o cliente — e não em JavaScript dentro de um nó.
//
// ── O que impede o disparo em massa ─────────────────────────────────────────
//
// Três travas, e as três importam:
//
//   1. A migração marcou todo pedido existente como "ignorado" na ativação.
//      Sem isso a primeira rodada mandaria centenas de mensagens para quem já
//      recebeu o produto.
//   2. O registro é gravado ANTES do envio. Se o n8n cair no meio, a linha fica
//      como 'erro' — não volta para a fila e não vira mensagem repetida. Perder
//      um aviso é ruim; mandar o mesmo aviso cinco vezes é pior.
//   3. `TETO` por rodada. Um pico de pedidos não vira uma rajada de WhatsApp.
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const N8N_URL    = Deno.env.get("N8N_KANBAN_WEBHOOK") ?? "";
const N8N_TOKEN  = Deno.env.get("N8N_KANBAN_TOKEN") ?? "";
const SEGREDO    = Deno.env.get("CRON_SECRET") ?? "";

// Teto por rodada. O cron roda de 10 em 10 minutos; 20 mensagens por rodada é
// mais do que a operação gera num dia inteiro, e segura qualquer surpresa.
const TETO = 20;

interface LinhaFila {
  bling_id: number; etapa: string; titulo: string; texto: string; atraso_min: number;
  /** Instância da Evolution por onde ESTA mensagem sai. null = a padrão.
   *  Quem roteia é o n8n; aqui só se diz qual função está falando. */
  instancia: string | null;
  telefone: string | null; nome: string | null; primeiro_nome: string | null;
  pedido: string | null; canal: string | null; valor: number | null; nf: string | null;
  transportadora: string | null; servico: string | null; rastreio: string | null;
  /** PDF da NF. Vai como variável no texto E como anexo no payload. */
  link_nota: string | null;
  cidade: string | null; uf: string | null;
  link_rastreio: string | null; previsao: string | null;
}

const brl = (v: number | null) =>
  (v ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** Data com dia da semana — "qui., 14/08". É como se fala com o cliente. */
function dataCurta(s: string | null): string {
  if (!s) return "";
  const d = new Date(s.length <= 10 ? `${s}T12:00:00` : s);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString("pt-BR", {
    weekday: "short", day: "2-digit", month: "2-digit", timeZone: "America/Sao_Paulo",
  });
}

/**
 * Troca `{{variavel}}` pelo valor.
 *
 * ⚠️ Variável sem valor apaga a LINHA inteira, não vira espaço em branco. Um
 * pedido sem link de rastreio (Mercado Envios não tem página pública) mandaria
 * "Acompanhe aqui:" seguido de nada — o cliente responde perguntando qual link,
 * e o time gasta um atendimento por causa de um campo vazio.
 */
function montar(texto: string, vars: Record<string, string>): string {
  return texto
    .split("\n")
    .map((linha) => {
      const marcadores = [...linha.matchAll(/\{\{\s*(\w+)\s*\}\}/g)];
      if (marcadores.length && marcadores.every((m) => !vars[m[1]])) return null;
      return linha.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => vars[k] ?? "");
    })
    .filter((l) => l !== null)
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Telefone só com dígitos e com DDI. O n8n também normaliza, mas mandar certo
 *  daqui deixa o log daqui legível e igual ao que foi entregue. */
function normalizarFone(v: string | null): string | null {
  let n = String(v ?? "").replace(/\D/g, "");
  if (!n) return null;
  if (n.length <= 11) n = "55" + n;
  return n.length >= 12 && n.length <= 13 ? n : null;
}

function variaveis(l: LinhaFila): Record<string, string> {
  return {
    nome:           l.nome ?? "",
    primeiro_nome:  l.primeiro_nome || "tudo bem",
    pedido:         l.pedido ?? "",
    canal:          l.canal ?? "",
    valor:          l.valor != null ? brl(l.valor) : "",
    nf:             l.nf ?? "",
    transportadora: l.transportadora ?? "",
    servico:        l.servico ?? "",
    rastreio:       l.rastreio ?? "",
    link_rastreio:  l.link_rastreio ?? "",
    link_nota:      l.link_nota ?? "",
    previsao:       dataCurta(l.previsao),
    cidade:         l.cidade ?? "",
    uf:             l.uf ?? "",
  };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status, headers: { "Content-Type": "application/json" },
  });
}

/**
 * Portaria: FECHA quando o segredo não existe.
 *
 * ⚠️ A versão anterior era `if (SEGREDO && informado !== SEGREDO)`. Quando o
 * secret não está configurado no projeto, `SEGREDO` é "" — a condição é falsa e
 * a função ACEITA QUALQUER CHAMADA, sem erro, sem log, sem sinal nenhum.
 *
 * Isso não é hipótese: o secret `CRON_SECRET` já sumiu uma vez neste projeto, e
 * o efeito foram 25 horas de sincronismo morto (ver a migração
 * 20260876000000_cron_secret_unificado.sql). Naquela vez a ausência TRAVOU
 * tudo, que é o modo de falhar seguro. Aqui ela ABRIRIA — e nesta função em
 * particular isso significa qualquer pessoa na internet disparando WhatsApp
 * para a base de clientes.
 *
 * Os dois motivos de recusa são SEPARADOS de propósito. "Segredo errado" é
 * problema de quem chama; "segredo ausente no servidor" é problema nosso, e
 * devolver 401 para os dois faria a segunda causa se disfarçar de primeira —
 * exatamente o disfarce que custou aquele dia inteiro de diagnóstico.
 */
Deno.serve(async (req: Request) => {
  const url = new URL(req.url);
  const informado = req.headers.get("X-Cron-Secret") ?? url.searchParams.get("secret");
  if (!SEGREDO) {
    console.error("[portaria] CRON_SECRET não está configurado — recusando por precaução.");
    return json({
      error: "CRON_SECRET não está configurado neste projeto.",
      como_resolver: "Supabase > Edge Functions > Secrets: criar CRON_SECRET.",
    }, 500);
  }
  if (informado !== SEGREDO) {
    return json({ error: "segredo inválido ou ausente" }, 401);
  }
  // Ensaio: monta as mensagens e devolve, sem enviar e sem gravar. É como se
  // confere um texto novo antes de ele sair para cliente de verdade.
  const ensaio = url.searchParams.get("ensaio") === "1";

  // ⚠️ A FILA vem antes da checagem do secret, de propósito.
  //
  // Ao contrário, e com nenhum texto ligado, esta função devolveria 500 a cada
  // 10 minutos só por falta de um secret que ainda não é necessário — 144
  // falhas por dia num lugar que ninguém abre. É literalmente o padrão do
  // `sync-meta`, que passou 719 rodadas assim antes de alguém notar.
  //
  // Sem nada a enviar, não há configuração faltando: há nada a fazer.
  const { data: fila, error } = await supabase
    .from("carbo_msg_fila")
    .select("*")
    .limit(TETO);
  if (error) return json({ error: `fila: ${error.message}` }, 500);
  if (!fila?.length) return json({ ok: true, fila: 0, nota: "nada a avisar" });

  if (!N8N_URL) {
    return json({
      error: "Há mensagens na fila, mas falta o secret N8N_KANBAN_WEBHOOK.",
      fila: fila.length,
      como_resolver: "Supabase > Edge Functions > Secrets > N8N_KANBAN_WEBHOOK = a URL do webhook do n8n (…/webhook/kanban-whatsapp)",
    }, 500);
  }

  const agora = Date.now();
  const resultados: unknown[] = [];
  let enviados = 0, erros = 0, adiados = 0, semFone = 0;

  for (const l of fila as LinhaFila[]) {
    const texto = montar(l.texto, variaveis(l));
    const numero = normalizarFone(l.telefone);

    if (ensaio) {
      resultados.push({ bling_id: l.bling_id, etapa: l.etapa, numero, texto });
      continue;
    }

    if (!numero) {
      semFone++;
      await supabase.from("carbo_msg_envios").upsert({
        bling_id: l.bling_id, etapa: l.etapa, status: "ignorado",
        motivo: `telefone inválido: ${l.telefone ?? "vazio"}`,
        telefone: l.telefone, enviado_em: new Date().toISOString(),
      });
      continue;
    }

    // Atraso do template (pós-entrega). A etapa foi detectada agora; a linha
    // fica marcada como pendente e a rodada seguinte reavalia.
    if (l.atraso_min > 0) {
      const { data: ja } = await supabase.from("carbo_msg_envios")
        .select("detectado_em,status").eq("bling_id", l.bling_id).eq("etapa", l.etapa).maybeSingle();
      if (!ja) {
        adiados++;
        await supabase.from("carbo_msg_envios").insert({
          bling_id: l.bling_id, etapa: l.etapa, status: "pendente",
          motivo: `aguardando ${l.atraso_min} min do template`,
          telefone: numero, mensagem: texto,
        });
        continue;
      }
      const espera = new Date(ja.detectado_em).getTime() + l.atraso_min * 60_000;
      if (agora < espera) { adiados++; continue; }
    }

    // ⚠️ Grava ANTES de enviar. Se o n8n cair no meio, fica 'erro' e não volta
    // para a fila — mandar o mesmo aviso cinco vezes é pior que perder um.
    await supabase.from("carbo_msg_envios").upsert({
      bling_id: l.bling_id, etapa: l.etapa, status: "erro",
      motivo: "envio iniciado", telefone: numero, mensagem: texto,
    });

    try {
      const res = await fetch(N8N_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(N8N_TOKEN ? { "Authorization": `Bearer ${N8N_TOKEN}` } : {}),
        },
        // Formato do workflow "Kanban -> WhatsApp": ele lê `card.mensagem` e,
        // quando ela existe, nem consulta os templates dele.
        body: JSON.stringify({
          card: {
            id: String(l.bling_id),
            nome: l.nome ?? "",
            telefone: numero,
            coluna: l.etapa,
            mensagem: texto,
            campos: variaveis(l),
          },
          origem: "carbohub/esteira",
          etapa_titulo: l.titulo,
          // ⚠️ Aviso de entrega e oferta de recompra saem por números
          // DIFERENTES: quem bloqueia o número por causa da campanha não pode
          // perder o "seu pedido saiu para entrega" junto. Quem escolhe o
          // número é o n8n; aqui só se diz qual FUNÇÃO está falando.
          // null = instância padrão, que é o comportamento de sempre.
          instancia: l.instancia ?? null,
          // ⚠️ O PDF vai SEPARADO do texto, não só dentro dele.
          //
          // Colar uma URL na mensagem é pedir que o cliente saia do WhatsApp,
          // abra o navegador e volte. Mandar o arquivo anexado entrega a nota
          // ali, e ela fica salva na conversa — que é onde ele vai procurar
          // quando precisar dela daqui a três meses.
          //
          // Quem decide se anexa é o n8n: aqui só se diz que existe documento
          // e qual é. Null quando a nota ainda não tem PDF.
          anexo_url: l.link_nota ?? null,
          anexo_nome: l.nf ? `NF-${l.nf}.pdf` : null,
        }),
      });
      const corpo = await res.text();
      let resposta: unknown = corpo;
      try { resposta = JSON.parse(corpo); } catch { /* texto puro serve */ }

      await supabase.from("carbo_msg_envios").upsert({
        bling_id: l.bling_id, etapa: l.etapa,
        status: res.ok ? "enviado" : "erro",
        motivo: res.ok ? null : `n8n ${res.status}`,
        telefone: numero, mensagem: texto,
        enviado_em: new Date().toISOString(),
        resposta: resposta as Record<string, unknown>,
      });
      if (res.ok) enviados++; else erros++;
      resultados.push({ bling_id: l.bling_id, etapa: l.etapa, status: res.status });
    } catch (e) {
      erros++;
      await supabase.from("carbo_msg_envios").upsert({
        bling_id: l.bling_id, etapa: l.etapa, status: "erro",
        motivo: String((e as Error)?.message ?? e).slice(0, 300),
        telefone: numero, mensagem: texto, enviado_em: new Date().toISOString(),
      });
    }
  }

  return json({
    ok: true, ensaio, fila: fila.length,
    enviados, erros, adiados, sem_telefone: semFone,
    ...(ensaio ? { mensagens: resultados } : {}),
  });
});

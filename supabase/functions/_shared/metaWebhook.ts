// ─────────────────────────────────────────────────────────────────────────────
// metaWebhook — ler o que a Meta manda, sem acreditar em ordem nem em unicidade
//
// Módulo PURO. O edge function faz crypto, rede e banco; a interpretação do
// payload e a comparação da assinatura moram aqui, onde os testes alcançam.
//
// ── Duas coisas que a Meta NÃO garante ───────────────────────────────────────
//
// 1. Que o evento chegue uma vez. Ela REENTREGA quando o 200 demora, e
//    reentrega é o normal, não a exceção. Por isso `chaveDoEvento`.
// 2. Que os eventos cheguem em ordem. Um `delivered` atrasado pode chegar
//    depois do `read` do mesmo envio. Quem resolve isso é a regra do banco
//    (`carbo_msg_status_meta`, que só deixa o status andar para a frente);
//    aqui só se traduz o que veio.
// ─────────────────────────────────────────────────────────────────────────────

export type Acao =
  | { tipo: "status"; wamid: string; status: string; quando: string;
      codigo: number | null; detalhe: string | null; chave: string }
  | { tipo: "inbound"; waId: string; nome: string | null; quando: string;
      chave: string; wamid: string; formato: string; texto: string | null;
      midiaId: string | null; midiaMime: string | null; respondeA: string | null;
      // deno-lint-ignore no-explicit-any
      payload: any }
  | { tipo: "template"; nome: string; evento: string; motivo: string | null;
      chave: string };

/**
 * A chave de idempotência.
 *
 * ⚠️ Para status ela inclui o STATUS, não só o id da mensagem: o mesmo `wamid`
 * gera sent, delivered e read — três eventos legítimos. Usar só o id faria o
 * primeiro deles bloquear os outros dois, e a mensagem ficaria "enviada" para
 * sempre mesmo depois de lida.
 *
 * Para mensagem recebida a chave é o id sozinho: ela acontece uma vez.
 */
export function chaveDoEvento(tipo: string, id: string, sufixo?: string): string {
  return sufixo ? `${tipo}:${id}:${sufixo}` : `${tipo}:${id}`;
}

/**
 * Compara duas assinaturas em tempo constante.
 *
 * ⚠️ `a === b` vaza informação pelo TEMPO: a comparação de strings do
 * JavaScript sai no primeiro byte diferente, então quem tenta adivinhar mede a
 * demora e descobre a assinatura byte a byte. Aqui todo byte é sempre olhado.
 *
 * Tamanho diferente devolve falso antes — isso não vaza nada útil, porque o
 * tamanho de um HMAC-SHA256 em hex é público e sempre o mesmo.
 */
export function assinaturaConfere(esperada: string, recebida: string): boolean {
  const a = String(esperada ?? "");
  const b = String(recebida ?? "");
  if (a.length !== b.length || a.length === 0) return false;
  let diferenca = 0;
  for (let i = 0; i < a.length; i++) diferenca |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diferenca === 0;
}

/**
 * O que a pessoa disse, por tipo de mensagem.
 *
 * ⚠️ Tipo desconhecido devolve texto nulo e NÃO joga a mensagem fora — a linha
 * é gravada com o payload cru. A Meta acrescenta tipos (reação, pedido,
 * localização, e o que vier), e uma mensagem de cliente que some porque o
 * parser não conhecia o formato é a pior falha possível aqui: ela não deixa
 * rastro nenhum, e o cliente acha que foi ignorado.
 *
 * Mídia NÃO é baixada: guarda-se o id. O arquivo tem validade na Meta, e
 * baixar é outra decisão (storage, custo, LGPD) que não pode atrasar a captura
 * do texto, que é o que se perde para sempre.
 */
// deno-lint-ignore no-explicit-any
export function conteudoDaMensagem(msg: any): {
  formato: string; texto: string | null;
  midiaId: string | null; midiaMime: string | null;
} {
  const formato = String(msg?.type ?? "unknown");
  const vazio = { formato, texto: null, midiaId: null, midiaMime: null };

  switch (formato) {
    case "text":
      return { ...vazio, texto: msg?.text?.body ?? null };
    // Resposta de botão de TEMPLATE. O que interessa é o rótulo — é o que a
    // pessoa viu e tocou.
    case "button":
      return { ...vazio, texto: msg?.button?.text ?? null };
    case "interactive":
      return { ...vazio,
        texto: msg?.interactive?.button_reply?.title
            ?? msg?.interactive?.list_reply?.title ?? null };
    case "reaction":
      return { ...vazio, texto: msg?.reaction?.emoji ?? null };
    case "location": {
      const l = msg?.location ?? {};
      const nome = l.name ?? l.address ?? null;
      const coord = (l.latitude != null && l.longitude != null)
        ? `${l.latitude}, ${l.longitude}` : null;
      return { ...vazio, texto: nome ?? coord };
    }
    case "image": case "video": case "document": case "audio": case "sticker": {
      const m = msg?.[formato] ?? {};
      return {
        formato,
        // A legenda é texto de verdade; o nome do arquivo, no documento, é o
        // que a pessoa vê na conversa.
        texto: m.caption ?? m.filename ?? null,
        midiaId: m.id ?? null,
        midiaMime: m.mime_type ?? null,
      };
    }
    default:
      return vazio;
  }
}

/** Segundos do epoch (como a Meta manda) para ISO. */
function paraIso(ts: unknown): string {
  const n = Number(ts);
  if (!Number.isFinite(n) || n <= 0) return new Date(0).toISOString();
  // ⚠️ A Meta manda SEGUNDOS, e como string. `new Date('1755902400')` daria
  // Invalid Date, e `new Date(1755902400)` daria 1970 — o registro ficaria com
  // uma entrega de meio século atrás, sem erro nenhum.
  return new Date(n * 1000).toISOString();
}

/**
 * Traduz um `change` do webhook numa lista de ações.
 *
 * Devolve lista, e não uma ação, porque um único POST da Meta pode carregar
 * vários status e várias mensagens — ela agrupa por conta, não por evento.
 */
// deno-lint-ignore no-explicit-any
export function interpretar(change: any): Acao[] {
  const acoes: Acao[] = [];
  const campo = String(change?.field ?? "");
  const valor = change?.value ?? {};

  if (campo === "messages") {
    for (const st of valor.statuses ?? []) {
      const wamid = String(st?.id ?? "");
      const status = String(st?.status ?? "");
      if (!wamid || !status) continue;
      const erro = Array.isArray(st?.errors) ? st.errors[0] : null;
      acoes.push({
        tipo: "status", wamid, status,
        quando: paraIso(st?.timestamp),
        codigo: erro?.code != null ? Number(erro.code) : null,
        // `error_data.details` é quem diz o que houve; `title` é genérico.
        detalhe: erro ? String(erro?.error_data?.details ?? erro?.title ?? "") || null : null,
        chave: chaveDoEvento("status", wamid, status),
      });
    }

    // Mensagem do cliente. Ela faz duas coisas: abre a janela de 24 h e É a
    // conversa.
    //
    // ⚠️ O conteúdo é GRAVADO, e isto corrige uma decisão anterior. A Fase 3
    // não guardava, no entendimento de que as mensagens viveriam na Caixa de
    // Entrada do Business Suite — que NÃO aceita número da Cloud API. Como a
    // Cloud API também não tem endpoint de histórico, o que não for gravado
    // aqui existe só no celular do cliente. E três dos seis templates pedem
    // resposta em texto.
    const perfil = valor?.contacts?.[0]?.profile?.name ?? null;
    for (const msg of valor.messages ?? []) {
      const waId = String(msg?.from ?? "");
      const id = String(msg?.id ?? "");
      if (!waId || !id) continue;
      const conteudo = conteudoDaMensagem(msg);
      acoes.push({
        tipo: "inbound", waId,
        nome: perfil ? String(perfil) : null,
        quando: paraIso(msg?.timestamp),
        chave: chaveDoEvento("inbound", id),
        wamid: id,
        formato: conteudo.formato,
        texto: conteudo.texto,
        midiaId: conteudo.midiaId,
        midiaMime: conteudo.midiaMime,
        // `context.id` é o wamid da NOSSA mensagem que ela respondeu — o que
        // liga "chegou quebrado" a um pedido em vez de a um recado solto.
        respondeA: msg?.context?.id ? String(msg.context.id) : null,
        payload: msg,
      });
    }
  }

  if (campo === "message_template_status_update") {
    const nome = String(valor?.message_template_name ?? "");
    const evento = String(valor?.event ?? "");
    if (nome && evento) {
      acoes.push({
        tipo: "template", nome, evento,
        motivo: valor?.reason ? String(valor.reason) : null,
        // ⚠️ A chave leva nome + evento, e NÃO um id: a Meta não manda id neste
        // campo. Um template pode ir e voltar (APPROVED → PAUSED → APPROVED), e
        // travar pelo par nome+evento faria a volta ser ignorada. Por isso entra
        // também o carimbo — repetição no mesmo segundo é reentrega; dias
        // depois é mudança de verdade.
        chave: chaveDoEvento("template", `${nome}:${evento}`, String(valor?.message_template_id ?? paraIso(valor?.timestamp))),
      });
    }
  }

  return acoes;
}

/** Status da Meta → o CHECK de `carbo_msg_templates.meta_status`. */
export function statusDeTemplate(evento: string): string | null {
  switch (String(evento ?? "").toUpperCase()) {
    case "APPROVED":          return "APPROVED";
    case "REJECTED":          return "REJECTED";
    case "PAUSED":            return "PAUSED";
    case "DISABLED":
    case "PENDING_DELETION":  return "DISABLED";
    case "IN_APPEAL":         return "IN_APPEAL";
    case "PENDING":           return "PENDING";
    // ⚠️ Evento desconhecido devolve null e NÃO vira um status inventado. O
    // CHECK recusaria o valor e a rodada inteira falharia por causa de um nome
    // novo que a Meta passou a mandar.
    default:                  return null;
  }
}

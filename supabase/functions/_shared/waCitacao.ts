// ─────────────────────────────────────────────────────────────────────────────
// Responder CITANDO e REAGIR — as duas coisas que o cliente vê no WhatsApp dele
// (26/11/2026, pedido do time de atendimento pelo app do TI).
//
// As duas são da Cloud API, não invenção da tela:
//
//   citação   o envio leva `context.message_id` = o wamid da mensagem citada.
//             No celular do cliente a resposta aparece com o balão citado em
//             cima, igual a quem responde pelo app.
//   reação    mensagem própria, `type: "reaction"`, com `reaction.message_id`
//             e o emoji. Emoji VAZIO tira a reação.
//
// ⚠️ As duas só passam com a janela de 24 h ABERTA, como o texto livre: não há
// template que cite nem que reaja. Quem confere a janela é a função que chama.
//
// ⚠️ A mensagem citada (ou reagida) tem de ser DESTA conversa — mesmo número
// nosso e mesmo cliente. Um wamid de outra conversa iria à Meta e voltaria como
// erro genérico, ou pior: citaria em silêncio a fala de outra pessoa. Por isso
// a conferência pergunta ao banco com os TRÊS (wamid, número, cliente).
// ─────────────────────────────────────────────────────────────────────────────
// deno-lint-ignore-file no-explicit-any

/** O mesmo envio, agora citando `wamid`. Sem wamid, devolve o envio como veio. */
export function comCitacao<T extends Record<string, unknown>>(
  payload: T, wamid: string | null | undefined,
): T & { context?: { message_id: string } } {
  const id = String(wamid ?? "").trim();
  if (!id) return payload;
  return { ...payload, context: { message_id: id } };
}

/** O corpo da reação. ⚠️ `emoji` vazio é o jeito da Meta de TIRAR a reação. */
export function corpoDaReacao(to: string, alvo: string, emoji: string): Record<string, unknown> {
  return {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
    type: "reaction",
    reaction: { message_id: alvo, emoji },
  };
}

/**
 * O emoji é aceitável? Vazio (= tirar) ou UM emoji, sem letra, número nem
 * espaço. A Meta recusa texto com código genérico; recusar aqui dá a frase.
 * O teto de 16 unidades cabe emoji composto (👍🏽, 👨‍👩‍👧) e barra frase.
 */
export function emojiValido(e: unknown): boolean {
  if (typeof e !== "string") return false;
  if (e === "") return true;
  if (e.length > 16) return false;
  if (/[\s\p{L}\p{N}]/u.test(e)) return false;
  return /\p{Extended_Pictographic}/u.test(e);
}

export type AlvoDaConversa =
  | { ok: true; direcao: "entrada" | "saida"; tipo: string }
  | { ok: false; erro: string };

/**
 * A mensagem `wamid` é desta conversa (número nosso + cliente)?
 *
 * Procura nas DUAS casas: `carbo_wa_mensagens` (o que o cliente mandou e o que
 * o atendimento respondeu) e `carbo_msg_envios` (os avisos automáticos — o
 * cliente cita muito o "saiu para entrega").
 * ⚠️ Erro do banco APARECE como erro, nunca como "não achei": a recusa diria à
 * pessoa que a mensagem não é da conversa quando o que houve foi falha de leitura.
 */
export async function alvoDaConversa(
  supabase: any, numeroId: string, waId: string, wamid: string,
): Promise<AlvoDaConversa> {
  const { data: m, error: e1 } = await supabase.from("carbo_wa_mensagens")
    .select("direcao, tipo").eq("wamid", wamid)
    .eq("numero_id", numeroId).eq("wa_id", waId).maybeSingle();
  if (e1) return { ok: false, erro: `Não consegui conferir a mensagem: ${e1.message}` };
  if (m) return { ok: true, direcao: m.direcao, tipo: m.tipo };

  const { data: v, error: e2 } = await supabase.from("carbo_msg_envios")
    .select("wamid").eq("wamid", wamid)
    .eq("numero_id", numeroId).eq("wa_id", waId).limit(1);
  if (e2) return { ok: false, erro: `Não consegui conferir a mensagem: ${e2.message}` };
  if (v?.length) return { ok: true, direcao: "saida", tipo: "template" };

  return { ok: false, erro: "A mensagem citada não é desta conversa." };
}

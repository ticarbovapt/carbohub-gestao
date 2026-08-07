// ─────────────────────────────────────────────────────────────────────────────
// Gravação de rastreio — uma regra, um lugar.
//
// Duas funções alimentam as mesmas tabelas:
//
//   ecommerce-sync  → Mercado Envios (já tem o token e já chama /shipments)
//   rastreio-sync   → Melhor Envio (Jadlog `.Package` + Correios)
//
// Se cada uma escrevesse do seu jeito, o dedupe e a normalização de status
// divergiriam — e divergir aqui não dá erro: dá trajeto repetido num card e
// status que a tela não sabe pintar no outro. Por isso a escrita mora aqui.
// ─────────────────────────────────────────────────────────────────────────────

/** Lista branca. É a MESMA do CHECK em `rastreio_envios.status`; valor novo
 *  entra nos dois lugares ou o INSERT falha. Falhar é o comportamento certo —
 *  status silenciosamente ignorado some do card sem ninguém perceber. */
export type StatusRastreio =
  | "postado" | "em_transito" | "saiu_entrega"
  | "entregue" | "problema" | "devolvido" | "cancelado";

export interface EventoRastreio {
  ocorrido_em: string;             // ISO
  descricao: string;
  status?: StatusRastreio | null;
  cidade?: string | null;
  uf?: string | null;
}

export interface EnvioRastreio {
  codigo: string;
  fonte: "mercadolivre" | "melhorenvio" | "desconhecida";
  bling_id?: number | null;
  fonte_id?: string | null;
  transportadora?: string | null;
  servico?: string | null;
  status?: StatusRastreio | null;
  status_descricao?: string | null;
  previsao_entrega?: string | null;   // YYYY-MM-DD
  postado_em?: string | null;
  entregue_em?: string | null;
  ultimo_evento_em?: string | null;
  url_rastreio?: string | null;
  erro?: string | null;
  raw?: unknown;
}

/**
 * Grava o estado e o histórico de um código.
 *
 * Os eventos entram com `ignoreDuplicates`: toda rodada relê o histórico
 * inteiro da transportadora, e a PK (codigo, ocorrido_em, descricao) é quem
 * decide o que é novo. Sem isso o mesmo "Objeto em trânsito" viraria uma linha
 * a cada meia hora.
 */
export async function gravarRastreio(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  envio: EnvioRastreio,
  eventos: EventoRastreio[] = [],
): Promise<{ ok: boolean; novos: number; erro?: string }> {
  const ultimo = eventos.length
    ? eventos.map((e) => e.ocorrido_em).sort().at(-1)
    : envio.ultimo_evento_em ?? null;

  const { error: e1 } = await supabase.from("rastreio_envios").upsert({
    ...envio,
    ultimo_evento_em: envio.ultimo_evento_em ?? ultimo,
    raw: envio.raw ?? null,
    consultado_em: new Date().toISOString(),
  }, { onConflict: "codigo" });

  if (e1) {
    console.error("[rastreio] envio", envio.codigo, e1.message);
    return { ok: false, novos: 0, erro: e1.message };
  }
  if (!eventos.length) return { ok: true, novos: 0 };

  const { data, error: e2 } = await supabase
    .from("rastreio_eventos")
    .upsert(
      eventos.map((ev) => ({ ...ev, codigo: envio.codigo })),
      { onConflict: "codigo,ocorrido_em,descricao", ignoreDuplicates: true },
    )
    .select("codigo");

  if (e2) {
    console.error("[rastreio] eventos", envio.codigo, e2.message);
    return { ok: false, novos: 0, erro: e2.message };
  }
  return { ok: true, novos: data?.length ?? 0 };
}

/**
 * Link público de rastreio.
 *
 * ⚠️ Deliberadamente curto. Só entra aqui URL que eu tenho certeza que existe e
 * aceita o código na query — link errado é pior que link nenhum: o cliente
 * clica, cai numa página de erro e liga para o time. Quando a API da fonte
 * devolve a URL dela, ela ganha desta função; isto é só o fallback.
 *
 * Mercado Envios fica de fora de propósito: o comprador rastreia dentro do
 * próprio Mercado Livre, não existe página pública por código.
 */
export function urlRastreio(
  transportadora: string | null | undefined,
  codigo: string,
): string | null {
  const t = (transportadora ?? "").toLowerCase();
  const c = encodeURIComponent(codigo.trim());
  if (!c) return null;

  // Código dos Correios: 2 letras + 9 dígitos + 2 letras (AV087935517BR).
  const ehCorreios = /^[A-Z]{2}\d{9}[A-Z]{2}$/i.test(codigo.trim());
  if (t.includes("correios") || ehCorreios) {
    return `https://rastreamento.correios.com.br/app/index.php?objeto=${c}`;
  }
  return null;
}

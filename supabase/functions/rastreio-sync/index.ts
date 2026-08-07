// ─────────────────────────────────────────────────────────────────────────────
// rastreio-sync — o trajeto dos envios do Melhor Envio
//
// Cobre Jadlog (`.Package Centralizado`) e Correios (Mini Envios, PAC, SEDEX):
// as etiquetas são compradas no Melhor Envio da Carbo, então quem tem o
// histórico é ele, não cada transportadora. Isso também resolve os Correios,
// cuja API pública de rastreio foi descontinuada em 2023 — hoje exige contrato
// e credencial CWS que não temos.
//
// O Mercado Envios NÃO passa por aqui: o `ecommerce-sync` já busca
// `/shipments/{id}` a cada 15 minutos e grava nas mesmas tabelas. Duplicar essa
// chamada custaria token, tempo e uma segunda normalização de status para
// divergir da primeira.
//
// Amazon DBA e Mandaê ficam de fora por enquanto: 14 pedidos somados, e a
// Amazon não expõe trajeto de logística própria.
//
// ── Sobre o formato da resposta ──────────────────────────────────────────────
//
// O endpoint de rastreio do Melhor Envio devolve um objeto indexado pelo id do
// pedido, e o histórico já apareceu com nomes diferentes conforme a
// transportadora (`events`, `tracking_events`, `history`, `ocorrencias`). Em
// vez de fixar um nome e quebrar calado, o parsing aceita qualquer um deles e,
// se não achar nenhum, GRAVA O ERRO na linha do envio. Tem também
// `?diagnostico=<codigo>`, que devolve a resposta crua — é com ele que se
// corrige o mapeamento numa rodada, em vez de adivinhar.
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  gravarRastreio, urlRastreio,
  type EventoRastreio, type StatusRastreio,
} from "../_shared/rastreio.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const TOKEN = Deno.env.get("MELHOR_ENVIO_TOKEN") ?? "";
const AMBIENTE = Deno.env.get("MELHOR_ENVIO_ENV") ?? "sandbox";
const BASE = AMBIENTE === "production"
  ? "https://melhorenvio.com.br"
  : "https://sandbox.melhorenvio.com.br";

// Teto por rodada. O cron roda de hora em hora; 60 códigos cobrem a fila
// inteira de hoje com folga e mantêm a execução longe do limite de tempo.
const TETO = 60;

const cabecalhos = () => ({
  "Authorization": `Bearer ${TOKEN}`,
  "Content-Type": "application/json",
  "Accept": "application/json",
  "User-Agent": "CarboHub (ti@grupocarbo.com.br)",
});

// ─── Vocabulário do Melhor Envio → nossa lista branca ────────────────────────
function mapaStatus(s: string): StatusRastreio | null {
  switch ((s ?? "").toLowerCase()) {
    case "pending":
    case "released":    return null;          // ainda não saiu: não é rastreio
    case "posted":
    case "generated":   return "postado";
    case "in_transit":
    case "transit":     return "em_transito";
    case "out_for_delivery": return "saiu_entrega";
    case "delivered":   return "entregue";
    case "undelivered":
    case "problem":     return "problema";
    case "returning":
    case "returned":    return "devolvido";
    case "canceled":
    case "cancelled":   return "cancelado";
    default:            return null;
  }
}

/** O histórico já veio com quatro nomes diferentes. Aceita todos; se não
 *  encontrar nenhum, devolve null — que vira `erro` na linha, não silêncio. */
// deno-lint-ignore no-explicit-any
function acharEventos(d: any): any[] | null {
  for (const chave of ["events", "tracking_events", "history", "ocorrencias"]) {
    const v = d?.[chave];
    if (Array.isArray(v)) return v;
  }
  return null;
}

// deno-lint-ignore no-explicit-any
function mapearEvento(e: any): EventoRastreio | null {
  const quando = e?.date ?? e?.datetime ?? e?.created_at ?? e?.data ?? e?.occurred_at;
  const texto  = e?.description ?? e?.status ?? e?.title ?? e?.descricao ?? e?.message;
  if (!quando || !texto) return null;
  const d = new Date(quando);
  if (isNaN(d.getTime())) return null;
  return {
    ocorrido_em: d.toISOString(),
    descricao:   String(texto).trim().slice(0, 300),
    status:      mapaStatus(String(e?.status ?? "")),
    cidade:      e?.city ?? e?.cidade ?? e?.location ?? null,
    uf:          e?.state ?? e?.uf ?? null,
  };
}

/** Busca o pedido do Melhor Envio pelo código de rastreio. Custa uma chamada,
 *  por isso o id vai para `fonte_id` e a rodada seguinte pula esta etapa. */
async function acharPedidoME(codigo: string): Promise<string | null> {
  const res = await fetch(
    `${BASE}/api/v2/me/orders?q=${encodeURIComponent(codigo)}`,
    { headers: cabecalhos() },
  );
  if (!res.ok) {
    console.error("[rastreio-sync] busca", codigo, res.status);
    return null;
  }
  const json = await res.json();
  const lista = Array.isArray(json?.data) ? json.data : Array.isArray(json) ? json : [];
  const achado = lista.find(
    // deno-lint-ignore no-explicit-any
    (o: any) => String(o?.tracking ?? "").trim().toUpperCase() === codigo.toUpperCase(),
  ) ?? lista[0];
  return achado?.id ? String(achado.id) : null;
}

// deno-lint-ignore no-explicit-any
async function consultarRastreio(ids: string[]): Promise<Record<string, any>> {
  if (!ids.length) return {};
  const res = await fetch(`${BASE}/api/v2/me/shipment/tracking`, {
    method: "POST",
    headers: cabecalhos(),
    body: JSON.stringify({ orders: ids }),
  });
  if (!res.ok) {
    const corpo = await res.text();
    throw new Error(`tracking ${res.status}: ${corpo.slice(0, 300)}`);
  }
  return await res.json();
}

// ─── A fila ──────────────────────────────────────────────────────────────────
//
// Envio entregue sai da fila para sempre: o trajeto dele não muda mais, e
// reconsultar 130 pedidos entregues a cada hora é o tipo de desperdício que
// ninguém enxerga até estourar o limite da API.
interface ItemFila {
  codigo: string; bling_id: number | null;
  transportadora: string | null; servico: string | null; fonte_id: string | null;
}

async function montarFila(): Promise<ItemFila[]> {
  const { data: esteira, error } = await supabase
    .from("bling2_esteira")
    .select("bling_id,rastreio,transportadora,servico,canal,etapa")
    .not("rastreio", "is", null)
    .neq("etapa", "cancelado")
    .neq("etapa", "entregue")
    .limit(500);
  if (error) throw new Error(`esteira: ${error.message}`);

  const { data: jaTemos } = await supabase
    .from("rastreio_envios")
    .select("codigo,fonte_id,status");
  const conhecidos = new Map<string, { fonte_id: string | null; status: string | null }>(
    (jaTemos ?? []).map((r: Record<string, string | null>) =>
      [String(r.codigo), { fonte_id: r.fonte_id, status: r.status }]),
  );

  const fila: ItemFila[] = [];
  for (const o of esteira ?? []) {
    const codigo = String(o.rastreio ?? "").trim();
    if (!codigo) continue;
    // Mercado Envios é do `ecommerce-sync`. O canal é o nome da loja no Bling.
    if (/mercado\s*livre|mercadolivre|meli/i.test(String(o.canal ?? ""))) continue;
    if (/amazon/i.test(String(o.canal ?? ""))) continue;
    const conhecido = conhecidos.get(codigo);
    if (conhecido?.status === "entregue") continue;
    fila.push({
      codigo,
      bling_id: o.bling_id ?? null,
      transportadora: o.transportadora ?? null,
      servico: o.servico ?? null,
      fonte_id: conhecido?.fonte_id ?? null,
    });
    if (fila.length >= TETO) break;
  }
  return fila;
}

// ─── Handler ─────────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  const segredo = Deno.env.get("CRON_SECRET") ?? "";
  if (segredo && req.headers.get("X-Cron-Secret") !== segredo) {
    return json({ error: "X-Cron-Secret inválido" }, 401);
  }
  if (!TOKEN) {
    return json({
      error: "Falta o secret MELHOR_ENVIO_TOKEN.",
      como_resolver: "Supabase Dashboard > Edge Functions > Secrets > MELHOR_ENVIO_TOKEN (e MELHOR_ENVIO_ENV=production)",
    }, 500);
  }

  const url = new URL(req.url);
  const diagnostico = url.searchParams.get("diagnostico");

  try {
    // Modo diagnóstico: um código, resposta crua, nada é gravado. Existe para
    // acertar o mapeamento de campos sem chutar.
    if (diagnostico) {
      const id = await acharPedidoME(diagnostico);
      const bruto = id ? await consultarRastreio([id]) : null;
      return json({
        ambiente: AMBIENTE, codigo: diagnostico, pedido_melhor_envio: id,
        achou_pedido: Boolean(id),
        chaves_do_retorno: bruto ? Object.keys(bruto) : [],
        resposta_crua: bruto,
      });
    }

    const fila = await montarFila();
    if (!fila.length) return json({ ok: true, fila: 0, nota: "nada a rastrear" });

    // Descobre o id no Melhor Envio de quem ainda não tem, e guarda.
    const porId = new Map<string, ItemFila>();
    for (const item of fila) {
      const id = item.fonte_id ?? await acharPedidoME(item.codigo);
      if (!id) {
        await gravarRastreio(supabase, {
          codigo: item.codigo, fonte: "melhorenvio", bling_id: item.bling_id,
          transportadora: item.transportadora, servico: item.servico,
          url_rastreio: urlRastreio(item.transportadora, item.codigo),
          erro: "pedido não encontrado no Melhor Envio (etiqueta comprada em outra conta?)",
        });
        continue;
      }
      porId.set(id, { ...item, fonte_id: id });
    }
    if (!porId.size) return json({ ok: true, fila: fila.length, rastreados: 0, nota: "nenhum pedido casou no Melhor Envio" });

    const bruto = await consultarRastreio([...porId.keys()]);

    let gravados = 0, novos = 0, semHistorico = 0;
    for (const [id, item] of porId) {
      const d = (bruto as Record<string, unknown>)[id];
      if (!d) continue;
      // deno-lint-ignore no-explicit-any
      const dd = d as any;

      const crus = acharEventos(dd);
      const eventos = (crus ?? []).map(mapearEvento).filter(Boolean) as EventoRastreio[];
      if (crus === null) semHistorico++;

      const entregueEm = dd?.delivered_at ?? dd?.tracking_delivered_at ?? null;
      const r = await gravarRastreio(supabase, {
        codigo: item.codigo,
        fonte: "melhorenvio",
        fonte_id: id,
        bling_id: item.bling_id,
        transportadora: item.transportadora ?? dd?.company?.name ?? null,
        servico: item.servico ?? dd?.service?.name ?? null,
        status: mapaStatus(String(dd?.status ?? "")),
        status_descricao: dd?.status ?? null,
        previsao_entrega: dd?.delivery_date ?? dd?.estimated_delivery ?? null,
        postado_em: dd?.posted_at ?? null,
        entregue_em: entregueEm,
        url_rastreio: dd?.tracking_url
          ?? urlRastreio(item.transportadora, item.codigo),
        // Histórico ausente NÃO vira tela vazia: fica escrito o motivo.
        erro: crus === null
          ? `sem histórico na resposta (chaves: ${Object.keys(dd ?? {}).join(",").slice(0, 200)})`
          : null,
        raw: dd,
      }, eventos);
      if (r.ok) { gravados++; novos += r.novos; }
    }

    return json({ ok: true, fila: fila.length, rastreados: gravados, eventos_novos: novos, sem_historico: semHistorico });
  } catch (e) {
    console.error("[rastreio-sync]", e);
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status, headers: { "Content-Type": "application/json" },
  });
}

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
import {
  getMelhorEnvioToken, MELHOR_ENVIO_BASE, MELHOR_ENVIO_UA,
} from "../_shared/melhorEnvio.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

// O token vem do secret OU do OAuth (system_tokens), com renovação — a regra
// mora no _shared/melhorEnvio.ts. Preenchido no início de cada requisição.
let TOKEN = "";
const AMBIENTE = Deno.env.get("MELHOR_ENVIO_ENV") ?? "sandbox";
const BASE = MELHOR_ENVIO_BASE();

// Teto por rodada. O cron roda de hora em hora; 60 códigos cobrem a fila
// inteira de hoje com folga e mantêm a execução longe do limite de tempo.
const TETO = 60;

const cabecalhos = () => ({
  "Authorization": `Bearer ${TOKEN}`,
  "Content-Type": "application/json",
  "Accept": "application/json",
  "User-Agent": MELHOR_ENVIO_UA,
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

/**
 * Mapa código de rastreio → id do pedido no Melhor Envio, montado LISTANDO.
 *
 * ⚠️ A versão óbvia — uma busca `?q=<codigo>` por código — não sobrevive à
 * primeira rodada. São ~70 envios abertos do Melhor Envio; 70 chamadas HTTP
 * sequenciais dentro de uma invocação estouram o tempo da edge function, e o
 * sintoma seria um timeout sem nada gravado, que parece "a API não respondeu".
 *
 * Listar resolve pela raiz: 3 páginas de 50 cobrem a operação inteira. Depois
 * da primeira rodada nem isso é preciso, porque o id fica em `fonte_id`.
 */
async function mapearPedidosME(paginas = 4): Promise<Map<string, string>> {
  const mapa = new Map<string, string>();
  for (let p = 1; p <= paginas; p++) {
    const res = await fetch(
      `${BASE}/api/v2/me/orders?page=${p}&per_page=50`,
      { headers: cabecalhos() },
    );
    if (!res.ok) {
      console.error("[rastreio-sync] listagem página", p, res.status);
      break;
    }
    const json = await res.json();
    const lista = Array.isArray(json?.data) ? json.data : Array.isArray(json) ? json : [];
    if (!lista.length) break;
    for (const o of lista) {
      const cod = String(o?.tracking ?? "").trim().toUpperCase();
      if (cod && o?.id) mapa.set(cod, String(o.id));
    }
    if (lista.length < 50) break;   // última página
  }
  return mapa;
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
  const url = new URL(req.url);

  // O segredo vale pelo header (é assim que o pg_cron manda) OU pela query.
  //
  // A query existe por uma razão prática: navegador não permite definir header,
  // e quem opera este sistema trabalha pelo navegador — Supabase, GitHub,
  // Vercel, sem terminal. Sem isso, o modo diagnóstico seria inalcançável
  // justamente para quem precisa dele.
  //
  // O risco é aceitável e limitado: esta função só LÊ rastreio, e o segredo
  // protege contra disparo anônimo, não contra vazamento de dado. Quando a URL
  // com segredo entrar num histórico de navegador, o pior caso é alguém
  // disparar uma sincronização.
  const segredo = Deno.env.get("CRON_SECRET") ?? "";
  const informado = req.headers.get("X-Cron-Secret") ?? url.searchParams.get("secret");
  if (segredo && informado !== segredo) {
    return json({
      error: "Segredo inválido ou ausente.",
      como_resolver: "Header X-Cron-Secret, ou ?secret=... na URL para testar pelo navegador.",
    }, 401);
  }
  TOKEN = (await getMelhorEnvioToken(supabase)) ?? "";
  if (!TOKEN) {
    return json({
      error: "Sem token do Melhor Envio.",
      como_resolver: "Abra uma vez no navegador: /functions/v1/melhor-envio-auth — ou defina o secret MELHOR_ENVIO_TOKEN. Confira também MELHOR_ENVIO_ENV=production.",
    }, 500);
  }

  const diagnostico = url.searchParams.get("diagnostico");

  try {
    // Modo diagnóstico: um código, resposta crua, nada é gravado. Existe para
    // acertar o mapeamento de campos sem chutar.
    if (diagnostico) {
      const mapa = await mapearPedidosME();
      const id = mapa.get(diagnostico.trim().toUpperCase()) ?? null;
      const bruto = id ? await consultarRastreio([id]) : null;
      const d = id && bruto ? (bruto as Record<string, unknown>)[id] : null;
      return json({
        ambiente: AMBIENTE,
        codigo: diagnostico,
        pedido_melhor_envio: id,
        achou_pedido: Boolean(id),
        codigos_vistos_na_listagem: mapa.size,
        // O que eu preciso ver para corrigir o mapeamento: os nomes dos campos.
        campos_do_envio: d ? Object.keys(d as Record<string, unknown>) : [],
        onde_esta_o_historico: d ? (acharEventos(d) ? "encontrado" : "NENHUMA das chaves conhecidas") : null,
        resposta_crua: bruto,
      });
    }

    const fila = await montarFila();
    if (!fila.length) return json({ ok: true, fila: 0, nota: "nada a rastrear" });

    // Uma listagem só resolve todos os que ainda não têm id — e se todo mundo
    // já tem `fonte_id`, nem essa chamada acontece.
    const precisaDescobrir = fila.some((f) => !f.fonte_id);
    const porCodigo = precisaDescobrir ? await mapearPedidosME() : new Map<string, string>();

    const porId = new Map<string, ItemFila>();
    for (const item of fila) {
      const id = item.fonte_id ?? porCodigo.get(item.codigo.toUpperCase()) ?? null;
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

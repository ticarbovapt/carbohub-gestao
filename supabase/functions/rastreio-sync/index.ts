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

/**
 * O trajeto, montado a partir dos MARCOS.
 *
 * ⚠️ O Melhor Envio NÃO devolve lista de eventos. A resposta do rastreio tem
 * exatamente estas chaves:
 *
 *   id, protocol, status, tracking, melhorenvio_tracking,
 *   created_at, paid_at, generated_at, posted_at, delivered_at,
 *   canceled_at, expired_at
 *
 * Nada de `events`, `history` ou `ocorrencias` — eu procurei os quatro nomes e
 * gravei "sem histórico" em 54 envios até o erro registrado na linha mostrar a
 * lista real. Não é campo com outro nome: é dado que não existe aqui.
 *
 * As bipagens de centro de distribuição são da transportadora, e só a API dela
 * tem — a dos Correios exige contrato e credencial CWS. O que dá para
 * prometer, e é honesto, é o caminho por marcos: etiqueta gerada, postado,
 * entregue. Mesma granularidade do Mercado Envios, que já está no ar.
 *
 * Ordem do fluxo, não a do objeto: JSON não garante ordem de chave, e trajeto
 * fora de ordem parece dado corrompido.
 */
// deno-lint-ignore no-explicit-any
function eventosDosMarcos(d: any): EventoRastreio[] {
  const marcos: Array<[string, string, StatusRastreio | null]> = [
    ["generated_at", "Etiqueta gerada",                 null],
    ["posted_at",    "Postado — coletado pela transportadora", "em_transito"],
    ["delivered_at", "Entregue",                        "entregue"],
    ["canceled_at",  "Envio cancelado",                 "cancelado"],
    ["expired_at",   "Etiqueta expirada sem postagem",  "problema"],
  ];
  const eventos: EventoRastreio[] = [];
  for (const [chave, descricao, status] of marcos) {
    const quando = d?.[chave];
    if (!quando) continue;
    const dt = new Date(String(quando).replace(" ", "T"));
    if (isNaN(dt.getTime())) continue;
    eventos.push({ ocorrido_em: dt.toISOString(), descricao, status });
  }
  return eventos;
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
// deno-lint-ignore no-explicit-any
interface InfoEnvioME {
  prazoMax: number | null;
  linkBase: string | null;
  codigoPublico: string | null;
  transportadora: string | null;
  servico: string | null;
}

async function mapearPedidosME(paginas = 10): Promise<{
  mapa: Map<string, string>;
  extras: Map<string, InfoEnvioME>;
  exemplo: any | null; total: number;
}> {
  const mapa = new Map<string, string>();
  // Dados que SÓ existem na listagem: o prazo contratado e o link público da
  // transportadora. A resposta do rastreio não traz nenhum dos dois, e sem
  // isto o card ficaria sem previsão e sem link para mandar ao cliente.
  const extras = new Map<string, InfoEnvioME>();
  // deno-lint-ignore no-explicit-any
  let exemplo: any = null;
  let total = 0;

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
    if (!exemplo) exemplo = lista[0];
    total += lista.length;

    for (const o of lista) {
      // O código de rastreio já apareceu em mais de um campo conforme a
      // transportadora. `tracking` é o principal; os outros são o mesmo dado
      // com outro nome, e aceitar todos custa nada. Cada envio entra no mapa
      // por TODOS os códigos que ele expuser, porque o Bling pode ter guardado
      // qualquer um deles — e o que não casa some do card sem erro nenhum.
      for (const campo of ["tracking", "self_tracking", "protocol", "melhorenvio_tracking"]) {
        const cod = String(o?.[campo] ?? "").trim().toUpperCase();
        if (cod && o?.id) mapa.set(cod, String(o.id));
      }
      // A CHAVE DA NF é a melhor porta de todas: ela é exata, é a mesma dos
      // dois lados, e não depende de qual dos dois códigos cada sistema
      // resolveu guardar. Entrou depois de descobrir que o Bling grava o
      // `self_tracking` e o Melhor Envio lista pelo `tracking`.
      const chaveNf = String(o?.invoice?.key ?? "").trim().toUpperCase();
      if (chaveNf && o?.id) mapa.set(chaveNf, String(o.id));

      if (o?.id) extras.set(String(o.id), {
        prazoMax:      Number(o?.delivery_max ?? 0) || null,
        linkBase:      o?.service?.company?.tracking_link ?? null,
        codigoPublico: o?.tracking ?? null,
        transportadora: o?.service?.company?.name ?? null,
        servico:        o?.service?.name ?? null,
      });
    }
    if (lista.length < 50) break;   // última página
  }
  return { mapa, extras, exemplo, total };
}

/**
 * Busca um envio pelo código, um por vez.
 *
 * A listagem cobre os mais recentes (139 na primeira medição) e resolve a
 * maioria de graça. Mas a cauda existe — envio de dez dias atrás não aparece
 * lá —, e sem isto ele ficaria sem trajeto para sempre, calado.
 *
 * É caro (uma chamada por código), então só roda para quem sobrou e com teto.
 * Como o id encontrado vai para `fonte_id`, cada envio paga esse custo UMA vez
 * na vida: nas rodadas seguintes ele já é conhecido.
 */
async function buscarPedidoME(codigo: string): Promise<string | null> {
  try {
    const res = await fetch(
      `${BASE}/api/v2/me/orders?q=${encodeURIComponent(codigo)}`,
      { headers: cabecalhos() },
    );
    if (!res.ok) { console.error("[rastreio-sync] busca", codigo, res.status); return null; }
    const json = await res.json();
    const lista = Array.isArray(json?.data) ? json.data : Array.isArray(json) ? json : [];
    const alvo = codigo.trim().toUpperCase();
    // deno-lint-ignore no-explicit-any
    const achado = lista.find((o: any) =>
      [o?.tracking, o?.self_tracking, o?.protocol, o?.invoice?.key]
        .some((v) => String(v ?? "").trim().toUpperCase() === alvo)) ?? lista[0];
    return achado?.id ? String(achado.id) : null;
  } catch (e) {
    console.error("[rastreio-sync] busca", codigo, "falhou:", e);
    return null;
  }
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
  codigo: string; bling_id: number | null; nf_chave: string | null;
  transportadora: string | null; servico: string | null; fonte_id: string | null;
}

// Quantos envios entraram pela auto-cura na última montagem de fila. Vai na
// resposta da função: número que não aparece é número em que ninguém confia.
let reprocessados = 0;

async function montarFila(alvos?: string[]): Promise<ItemFila[]> {
  // Com `alvos`, a fila é EXATAMENTE aqueles códigos — é assim que o webhook
  // pede para atualizar o que acabou de mudar. Sem eles, a fila é a rotina.
  //
  // ⚠️ No modo alvo, os filtros de etapa NÃO se aplicam. Um aviso sobre envio
  // já entregue é justamente o que fecha o ciclo, e descartá-lo por causa do
  // filtro da rotina deixaria o card parado em "em trânsito" para sempre.
  let consulta = supabase
    .from("bling2_esteira")
    .select("bling_id,rastreio,nf_chave,transportadora,servico,canal,etapa")
    .not("rastreio", "is", null);
  consulta = alvos?.length
    ? consulta.in("rastreio", alvos)
    : consulta.neq("etapa", "cancelado").neq("etapa", "entregue");
  const { data: esteira, error } = await consulta.limit(500);
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
    // Mandaê tem API própria e não passa pelo Melhor Envio. Sem este corte
    // ela entra na fila toda hora, gasta uma busca e falha — 48 chamadas por
    // dia que nunca podem dar certo, e um erro no card que não é erro.
    if (/mandae|mandaê/i.test(String(o.transportadora ?? ""))) continue;
    const conhecido = conhecidos.get(codigo);
    // ⚠️ "Já entregue, pula" vale para a ROTINA — reconsultar 130 entregues de
    // hora em hora é desperdício. NÃO vale no modo alvo: ali alguém pediu
    // explicitamente por este código, e o aviso mais comum do webhook é
    // justamente o da entrega. Eu já tinha tirado o filtro equivalente da
    // consulta à esteira e deixei este no laço — o resultado foi `fila: 0`
    // para um envio que existe, com cara de "nada a fazer".
    if (!alvos?.length && conhecido?.status === "entregue") continue;
    fila.push({
      codigo,
      bling_id: o.bling_id ?? null,
      nf_chave: o.nf_chave ?? null,
      transportadora: o.transportadora ?? null,
      servico: o.servico ?? null,
      fonte_id: conhecido?.fonte_id ?? null,
    });
    if (fila.length >= TETO) break;
  }

  // No modo alvo não há auto-cura: o pedido é pontual e a resposta tem que
  // ser rápida — o Melhor Envio está esperando o 200.
  if (alvos?.length) { reprocessados = 0; return fila; }

  // ── Auto-cura ────────────────────────────────────────────────────────────
  //
  // A fila acima vem da esteira, que exclui entregue e cancelado. Isso é certo
  // para o dia a dia, mas cria um buraco: envio que falhou numa rodada e
  // depois foi entregue SAI da fila e nunca mais é tentado — fica com a
  // mensagem de erro daquele dia congelada no card, para sempre.
  //
  // Aconteceu com 11 envios enquanto eu ainda procurava um campo de histórico
  // que não existe. Depois de corrigido, eles continuavam errados, porque nada
  // os traria de volta.
  //
  // Estes já têm `fonte_id`, então reprocessá-los não custa busca nenhuma:
  // entram na mesma chamada em lote dos outros.
  // ⚠️ Filtro por `erro is not null` na TABELA, não por `qtd_eventos = 0` na
  // view. A primeira versão filtrava pela coluna calculada e voltou vazia sem
  // dizer por quê — e eu não olhava o erro da consulta, exatamente o descuido
  // que passei o dia corrigindo em outros lugares. Coluna real, filtro simples,
  // e o resultado aparece na resposta da função.
  const { data: pendentes, error: erroPendentes } = await supabase
    .from("rastreio_envios")
    .select("codigo,fonte_id,bling_id,transportadora,servico")
    .eq("fonte", "melhorenvio")
    .not("erro", "is", null)
    // Quem já foi julgado "de outra conta" não volta: reprocessar isso é
    // repetir para sempre uma pergunta cuja resposta não muda.
    .not("erro", "ilike", "%não encontrado%")
    // Sem exigir `fonte_id`: quem não tem id só precisa ser reencontrado pela
    // listagem, como qualquer outro. Exigi-lo aqui foi o que manteve 13 envios
    // presos — a condição extra não protegia de nada e excluía exatamente quem
    // mais precisava voltar.
    .limit(30);
  if (erroPendentes) console.error("[rastreio-sync] pendentes:", erroPendentes.message);

  const jaNaFila = new Set(fila.map((f) => f.codigo));
  reprocessados = 0;
  for (const p of pendentes ?? []) {
    if (jaNaFila.has(String(p.codigo))) continue;
    fila.push({
      codigo: String(p.codigo),
      bling_id: p.bling_id ?? null,
      nf_chave: null,
      transportadora: p.transportadora ?? null,
      servico: p.servico ?? null,
      fonte_id: p.fonte_id ?? null,
    });
    reprocessados++;
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
  // ⚠️ FECHA quando o segredo não existe.
  //
  // Era `if (segredo && informado !== segredo)`: sem o secret configurado,
  // `segredo` é "" e a função aceitava qualquer chamada, calada. O secret
  // `CRON_SECRET` já sumiu uma vez neste projeto (25h de sincronismo morto, ver
  // a migração 20260876) — lá a ausência travou tudo, que é o jeito seguro de
  // falhar. Aqui ela abriria.
  //
  // As duas recusas são separadas porque têm donos diferentes: 401 é de quem
  // chamou, 500 é nosso. Devolver 401 para o segundo caso faria a falha de
  // configuração se passar por chamada indevida.
  const segredo = Deno.env.get("CRON_SECRET") ?? "";
  const informado = req.headers.get("X-Cron-Secret") ?? url.searchParams.get("secret");
  if (!segredo) {
    console.error("[rastreio-sync] CRON_SECRET não configurado — recusando por precaução.");
    return json({
      error: "CRON_SECRET não está configurado neste projeto.",
      como_resolver: "Supabase > Edge Functions > Secrets: criar CRON_SECRET.",
    }, 500);
  }
  if (informado !== segredo) {
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
      const { mapa, exemplo, total } = await mapearPedidosME();
      const alvo = diagnostico.trim().toUpperCase();
      const idListagem = mapa.get(alvo) ?? null;
      const id = idListagem ?? await buscarPedidoME(diagnostico);
      const bruto = id ? await consultarRastreio([id]) : null;
      const d = id && bruto ? (bruto as Record<string, unknown>)[id] : null;
      return json({
        ambiente: AMBIENTE,
        codigo: diagnostico,
        pedido_melhor_envio: id,
        achou_pedido: Boolean(id),
        achou_como: idListagem ? "listagem" : id ? "busca individual" : "não achou",
        envios_na_listagem: total,
        codigos_vistos_na_listagem: mapa.size,
        // Quando `achou_pedido` é false, a pergunta seguinte é sempre "então
        // com o que eu deveria estar comparando?". Estes dois respondem sem
        // mais uma ida e volta.
        amostra_de_codigos: [...mapa.keys()].slice(0, 15),
        campos_de_um_envio_da_listagem: exemplo ? Object.keys(exemplo) : [],
        exemplo_da_listagem: exemplo,
        // O que eu preciso ver para corrigir o mapeamento: os nomes dos campos.
        campos_do_envio: d ? Object.keys(d as Record<string, unknown>) : [],
        marcos_encontrados: d ? eventosDosMarcos(d).map((e) => e.descricao) : [],
        resposta_crua: bruto,
      });
    }

    const alvos = (url.searchParams.get("codigos") ?? "")
      .split(",").map((c) => c.trim()).filter(Boolean);
    const fila = await montarFila(alvos);
    if (!fila.length) {
      // "Nada a rastrear" e "não conheço este código" são coisas MUITO
      // diferentes, e a mesma frase para as duas me fez caçar um bug que não
      // existia: o código do teste simplesmente não estava no sistema, e a
      // resposta parecia falha de filtro.
      return json({
        ok: true, fila: 0, alvos,
        nota: alvos.length
          ? "código(s) desconhecido(s): não estão na esteira nem em rastreio_envios"
          : "nada a rastrear na rotina",
      });
    }

    // Uma listagem só resolve todos os que ainda não têm id — e se todo mundo
    // já tem `fonte_id`, nem essa chamada acontece.
    const precisaDescobrir = fila.some((f) => !f.fonte_id);
    const listagem = precisaDescobrir
      ? await mapearPedidosME()
      : { mapa: new Map<string, string>(), extras: new Map<string, InfoEnvioME>() };
    const porCodigo = listagem.mapa;

    // Teto de buscas individuais: cada uma é uma chamada HTTP, e a rodada
    // inteira tem que caber no tempo da edge function. Quem sobrar hoje é
    // pego na próxima hora — e como o id fica guardado, a fila só encolhe.
    let buscasRestantes = 15;

    const porId = new Map<string, ItemFila>();
    for (const item of fila) {
      let id = item.fonte_id
        ?? porCodigo.get(item.codigo.toUpperCase())
        ?? (item.nf_chave ? porCodigo.get(item.nf_chave.toUpperCase()) : null)
        ?? null;
      // A listagem não cobre a cauda: aí vale pagar a busca individual.
      if (!id && buscasRestantes > 0) {
        buscasRestantes--;
        id = await buscarPedidoME(item.codigo);
      }
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

      const eventos = eventosDosMarcos(dd);
      if (!eventos.length) semHistorico++;

      const dataME = (v: unknown) =>
        v ? new Date(String(v).replace(" ", "T")).toISOString() : null;
      const entregueEm = dataME(dd?.delivered_at);
      const extra = listagem.extras.get(id);

      // Previsão = postagem + prazo contratado. O rastreio não devolve data
      // prevista; o prazo (`delivery_max`, em dias) vem da listagem.
      //
      // ⚠️ `undefined`, NÃO `null`, quando não dá para calcular. O upsert só
      // grava as colunas presentes no payload, e `undefined` some na
      // serialização — então o valor calculado numa rodada anterior sobrevive.
      // Com `null` a gente apagaria a previsão toda vez que a listagem não
      // fosse consultada, que é justamente o caso comum.
      const base = dataME(dd?.posted_at) ?? dataME(dd?.generated_at);
      const previsao = (base && extra?.prazoMax)
        ? new Date(new Date(base).getTime() + extra.prazoMax * 86400_000)
            .toISOString().slice(0, 10)
        : undefined;
      const r = await gravarRastreio(supabase, {
        codigo: item.codigo,
        fonte: "melhorenvio",
        fonte_id: id,
        bling_id: item.bling_id,
        transportadora: item.transportadora ?? extra?.transportadora ?? null,
        servico: item.servico ?? extra?.servico ?? null,
        status: mapaStatus(String(dd?.status ?? "")),
        status_descricao: dd?.status ?? null,
        previsao_entrega: previsao,
        postado_em: dataME(dd?.posted_at),
        entregue_em: entregueEm,
        // O próprio Melhor Envio informa a base do rastreio público em
        // `service.company.tracking_link` — usar a dele é melhor que eu
        // adivinhar a URL de cada transportadora. Aqui é `tracking` (o código
        // da transportadora), não o `self_tracking`.
        url_rastreio: (extra?.linkBase && extra?.codigoPublico
                        ? `${extra.linkBase}${extra.codigoPublico}`
                        : null)
          ?? urlRastreio(item.transportadora, dd?.tracking ?? item.codigo)
          ?? undefined,
        // Nenhum marco significa etiqueta ainda não gerada — estado legítimo,
        // não falha. O erro fica escrito só quando há algo de fato errado.
        erro: eventos.length
          ? null
          : `sem marcos ainda (status: ${dd?.status ?? "?"})`,
        raw: dd,
      }, eventos);
      if (r.ok) { gravados++; novos += r.novos; }
    }

    return json({
      ok: true, fila: fila.length, reprocessados,
      rastreados: gravados, eventos_novos: novos, sem_historico: semHistorico,
    });
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

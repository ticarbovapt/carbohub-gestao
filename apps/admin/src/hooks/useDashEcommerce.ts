import { useEffect, useRef, useState } from "react";
import { subDays, startOfMonth, format, startOfDay } from "date-fns";
import { ptBR } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/components/ui/sonner";
import {
  COLUNAS_MAPA_SKU,
  construirMapaUnidades,
  fatorUnidades,
  normalizarSku,
  unidadesExibidas,
  type MapaUnidades,
  type SkuMappingRow,
} from "@/lib/skuUnidades";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type EcommercePlatform = "mercadolivre" | "amazon" | "nuvemshop" | "payt" | "shopee";
export type EcommercePeriod   =
  | "today" | "yesterday" | "7d" | "30d" | "month" | "custom";

/** Início e fim do período, em YYYY-MM-DD e ambos INCLUSIVOS. */
export interface EcommerceRange { from: string; to: string }

/** Datas de um período personalizado. Ignorado fora de period="custom". */
export interface EcommerceCustom { from?: string; to?: string }

export interface CommissionRate {
  id: string;
  platform: EcommercePlatform;
  rate: number;
  valid_from: string;
  created_at: string;
}

export interface EcommerceProduct {
  id: string;
  name: string;
  /** ⚠️ `null` = a plataforma não mandou SKU (Shopee). NUNCA cair no nome do
   *  produto: um nome no lugar do SKU faz a linha parecer mapeável. */
  sku: string | null;
  /** `null` = multiplicador DESCONHECIDO (sem SKU, ou SKU sem cadastro em
   *  `sku_product_mappings`). Não é o mesmo que ×1. */
  units_per_pack: number | null;
  orders: number;
  units_sold: number;
  revenue: number;
}

export interface EcommerceDailySale {
  date: string;
  label: string;
  orders: number;
  units: number;
  revenue: number;
}

export interface EcommerceMetrics {
  platform: EcommercePlatform;
  totalOrders: number;
  // ⚠️ Pedidos que viraram VENDA (paid|shipped|delivered). Já era calculado
  // desde sempre — servia só de divisor do ticket médio e nunca chegava à tela.
  // Era exatamente o número que faltava: "18 pedidos" na tela e 16 vendas de
  // verdade, sem nenhum lugar mostrando o 16.
  saleOrders: number;
  totalUnitsSold: number;
  saleUnits: number;         // unidades só dos pedidos que viraram venda
  totalQuantityRaw: number;  // sum(quantity) sem multiplicador — usado na verificação de integridade
  totalRevenue: number;      // receita realizada (paid|shipped|delivered)
  netRevenue: number;        // idem — mantido para os consumidores existentes
  cancelledRevenue: number;  // pedido cancelado: dinheiro que voltou
  pendingRevenue: number;    // pedido não pago: dinheiro que ainda não entrou
  avgTicket: number;
  cancelledOrders: number;
  cancellationRate: number;
  pendingOrders: number;
  paidOrders: number;
  shippedOrders: number;
  deliveredOrders: number;
  commissionTotal: number;
  topProduct: EcommerceProduct | null;
  avgRating: number | null;
  products: EcommerceProduct[];
  dailySales: EcommerceDailySale[];
  isConnected: boolean;
  /** ⚠️ Minutos desde a última rodada que TROUXE dado. `null` = nunca
   *  sincronizou. Conectado com este número alto é o estado que engana:
   *  o token está válido e não está entrando nada. */
  minutosSemSincronizar?: number | null;
}

export interface ComparativoMetrics {
  platform: EcommercePlatform;
  totalOrders: number;
  saleOrders: number;
  /**
   * ⚠️ Unidades de VENDA (paid|shipped|delivered), não de tudo que chegou.
   * Chamava-se `totalUnitsSold` e somava pedido cancelado — o cartão dizia
   * "entregues ao cliente" contando o que ninguém recebeu. A aba de cada
   * plataforma já usava `saleUnits`; só o Comparativo tinha ficado para trás,
   * e o mesmo rótulo virava dois números conforme a aba.
   */
  saleUnits: number;
  totalRevenue: number;
  avgTicket: number;
  cancelledOrders: number;
  dailySales: EcommerceDailySale[];
}

/**
 * Quanto de CADA PRODUTO saiu, somando as plataformas selecionadas.
 *
 * ⚠️ O agrupamento é pelo PRODUTO DO CADASTRO (`sku_product_mappings.product_id`
 * → `mrp_products`), nunca por dois nomes escritos no código. "Sachê e frasco
 * 100 ml" é a resposta de hoje; produto novo entra pelo cadastro, sem deploy —
 * e uma lista fixa aqui o deixaria de fora em silêncio, que é a doença que este
 * repositório persegue.
 *
 * ⚠️ SKU sem mapeamento vira linha PRÓPRIA, com `mapeado: false`. Somá-lo a um
 * produto qualquer, ou escondê-lo, apagaria a única pista de que falta cadastro
 * — e é o mesmo motivo pelo qual `units_per_pack` devolve `null` em vez de 1.
 */
export interface ProdutoVendido {
  /** `prod:<uuid>` quando mapeado; `sku:<sku>` ou `nome:<nome>` quando não. */
  key: string;
  nome: string;
  /** Código do cadastro (`CZ100`, `KIT-CARB-SACH-10ML`). `null` sem mapa. */
  productCode: string | null;
  /** Os SKUs das plataformas que caem neste produto. */
  skus: string[];
  /** `false` = nenhum SKU desta linha resolve para produto do cadastro. */
  mapeado: boolean;
  /** Packs vendidos: a soma de `quantity`, que é o que a plataforma vendeu. */
  packs: number;
  /**
   * O que o CLIENTE levou — `display_units_per_pack`, o multiplicador de
   * exibição. ⚠️ NÃO é `unidades_por_venda`: um kit de sachês entrega 10
   * sachês e tira 1 kit da prateleira. Trocar os dois faz a venda de kit
   * aparecer como 1 unidade aqui.
   * ⚠️ Sem mapa isto vale `units_real ?? quantity` — é PISO, não medida.
   */
  unidades: number;
  /** Só pedido pago, para bater com os cartões do topo. */
  receita: number;
}

// Path 1 — raw DB aggregation (no business logic transformation)
export interface RawCheckMetrics {
  totalOrders: number;
  totalQuantity: number;
  totalUnitsReal: number;
  totalRevenue: number;      // bruto: tudo, inclusive cancelado e não pago
  saleRevenue: number;       // lista branca — é este que espelha o Caminho 2
  cancelledOrders: number;
  pendingOrders: number;
  shippedOrders: number;
  deliveredOrders: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Date helpers
// ─────────────────────────────────────────────────────────────────────────────

const ymd = (d: Date) => format(d, "yyyy-MM-dd");

/**
 * Período completo — início E fim.
 *
 * Antes existia só `getRangeStart` e a consulta filtrava apenas por `gte`. Isso
 * bastava enquanto todo período terminava hoje, mas impede "ontem" (que tem fim
 * ontem) e qualquer intervalo escolhido à mão. Por isso agora vai um par.
 */
export function getRange(period: EcommercePeriod, custom?: EcommerceCustom): EcommerceRange {
  const today = startOfDay(new Date());
  switch (period) {
    case "today":     return { from: ymd(today), to: ymd(today) };
    case "yesterday": { const d = subDays(today, 1); return { from: ymd(d), to: ymd(d) }; }
    case "7d":        return { from: ymd(subDays(today, 6)),  to: ymd(today) };
    case "month":     return { from: ymd(startOfMonth(today)), to: ymd(today) };
    case "custom": {
      // Sem data escolhida, cai nos 30 dias — melhor que devolver vazio e
      // parecer que não há venda nenhuma.
      const from = custom?.from || ymd(subDays(today, 29));
      const to   = custom?.to   || ymd(today);
      // Invertido pelo usuário: ordena em vez de não trazer nada.
      return from <= to ? { from, to } : { from: to, to: from };
    }
    default:          return { from: ymd(subDays(today, 29)), to: ymd(today) };
  }
}

/** @deprecated use getRange — mantido porque useVindi ainda chama. */
export function getRangeStart(period: EcommercePeriod): Date {
  const today = startOfDay(new Date());
  switch (period) {
    case "today": return today;
    case "yesterday": return subDays(today, 1);
    case "7d":    return subDays(today, 6);
    case "month": return startOfMonth(today);
    default:      return subDays(today, 29);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// DB row type (what comes from ecommerce_orders)
// ─────────────────────────────────────────────────────────────────────────────

interface DBOrder {
  id: string;
  platform: string;
  order_id: string;
  product_sku: string | null;
  product_name: string | null;
  quantity: number;
  units_real: number;
  unit_price: number;
  total: number;
  status: string;
  ordered_at: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// O que conta como venda
// ─────────────────────────────────────────────────────────────────────────────

// Lista BRANCA — espelha public.ecommerce_status_e_venda() no banco.
// Status desconhecido NÃO é venda: plataforma nova que chega com vocabulário
// próprio fica de fora até ser mapeada, em vez de entrar calada na receita.
// Mudou aqui? Mude lá também (supabase/migrations/*_ecommerce_notifica_so_pago.sql).
const SALE_STATUSES = new Set(["paid", "shipped", "delivered"]);
const isSale = (status: string | null | undefined): boolean =>
  SALE_STATUSES.has((status ?? "").toLowerCase());

// ─────────────────────────────────────────────────────────────────────────────
// Uma linha por ITEM, não por pedido
// ─────────────────────────────────────────────────────────────────────────────
//
// Os normalizadores gravam UMA LINHA POR ITEM do pedido, com
// `order_id = '<pedido>-<item>'` (ver _shared/nuvemshop.ts, ecommerce-sync e
// ecommerce-webhook). É de propósito: o par (platform, order_id) é a chave do
// upsert, então webhook e sync podem rodar em qualquer ordem sem duplicar.
//
// O efeito colateral é que `rows.length` conta ITENS. Um pedido da Nuvemshop com
// dois produtos aparecia como duas vendas: a loja dizia 4 vendas no dia e o
// painel mostrava 8.
//
// Receita e unidades continuam somando linha a linha — isso sempre esteve
// certo. O que muda é só a CONTAGEM de pedidos.
//
// ⚠️ Não dá para cortar no último `-`: o número de pedido da Amazon já tem
// hífens (`123-4567890-1234567`), e pedido de item único é gravado sem sufixo
// (`order_id: orderId`). Cortar cegamente transformaria dois pedidos Amazon
// diferentes no mesmo. Por isso a raiz é reconhecida pelo FORMATO de cada
// plataforma. Espelha public.ecommerce_pedido_raiz() no banco.
const RAIZ_AMAZON = /^\d{3}-\d{7}-\d{7}/;

export function pedidoRaiz(platform: string, orderId: string | null | undefined): string {
  const id = String(orderId ?? "");
  if (!id) return id;
  if (platform === "amazon") {
    const m = id.match(RAIZ_AMAZON);
    return m ? m[0] : id;
  }
  // ML, Nuvemshop, Shopee, PayT: número do pedido puro, sufixo do item depois
  // do primeiro hífen. ⚠️ Espelha o `else split_part(...)` de
  // public.ecommerce_pedido_raiz — plataforma nova cai aqui por padrão, e só
  // sai daqui se o número dela tiver hífen próprio, como o da Amazon.
  const corte = id.indexOf("-");
  return corte > 0 ? id.slice(0, corte) : id;
};

/** Quantos PEDIDOS distintos existem nestas linhas. */
function contarPedidos(rows: DBOrder[]): number {
  const vistos = new Set<string>();
  for (const r of rows) vistos.add(pedidoRaiz(r.platform, r.order_id));
  return vistos.size;
}

// Dia em que a venda aconteceu PARA QUEM VENDE — fuso do navegador, não UTC.
//
// `ordered_at` é timestamptz e chega como ISO em UTC. O `slice(0, 10)` de antes
// pegava a data UTC: pedido das 21h de Brasília (00h UTC do dia seguinte)
// entrava no dia errado, e "hoje" trazia três horas de ontem. Somado à contagem
// por item, era essa a diferença para o painel da Nuvemshop.
const diaLocal = (isoUtc: string): string => ymd(new Date(isoUtc));

// ─────────────────────────────────────────────────────────────────────────────
// System-logic aggregator (Path 2)
// ─────────────────────────────────────────────────────────────────────────────

function buildMetrics(
  platform: EcommercePlatform,
  rows: DBOrder[],
  rateHistory: CommissionRate[],
  skuMappings: MapaUnidades = new Map(),
): EcommerceMetrics {
  if (rows.length === 0) return emptyMetrics(platform);

  // Unidades que o cliente levou. A regra inteira mora em `lib/skuUnidades.ts`
  // — inclusive a de não multiplicar `units_real` (a Nuvemshop já multiplicou
  // na escrita) e a de tratar SKU ausente como fator DESCONHECIDO.
  const displayUnits = (r: DBOrder): number => unidadesExibidas(skuMappings, r);

  // CONTAGENS = todos os pedidos. RECEITA = só os pedidos pagos (saleRows).
  // Antes as duas receitas usavam lista negra (`!== "cancelled"`), o que punha
  // pedido pendente — dinheiro que ainda não entrou — dentro do faturamento.
  // PEDIDOS distintos, não linhas — ver pedidoRaiz(). Unidades e receita seguem
  // somando linha a linha, que é o certo: o pedido de dois itens vendeu os dois.
  const totalOrders      = contarPedidos(rows);
  const totalUnitsSold   = rows.reduce((s, r) => s + displayUnits(r), 0);
  const totalQuantityRaw = rows.reduce((s, r) => s + r.quantity, 0);

  const porStatus  = (st: string) => contarPedidos(rows.filter(r => r.status === st));
  const cancelled  = porStatus("cancelled");
  const pending    = porStatus("pending");
  const paid       = porStatus("paid");
  const shipped    = porStatus("shipped");
  const delivered  = porStatus("delivered");

  const saleRows         = rows.filter(r => isSale(r.status));
  const saleOrders       = contarPedidos(saleRows);
  const saleUnits        = saleRows.reduce((s, r) => s + displayUnits(r), 0);
  const sumTotal         = (rs: DBOrder[]) => rs.reduce((s, r) => s + Number(r.total), 0);

  const totalRevenue     = sumTotal(saleRows);
  const netRevenue       = totalRevenue;
  // Receita que NÃO entrou — antes ficava escondida dentro dos números acima.
  const cancelledRevenue = sumTotal(rows.filter(r => r.status === "cancelled"));
  const pendingRevenue   = sumTotal(rows.filter(r => !isSale(r.status) && r.status !== "cancelled"));

  const cancellationRate = totalOrders > 0 ? (cancelled / totalOrders) * 100 : 0;
  const commissionTotal  = saleRows.reduce((s, r) => {
    const rate = getRateForDate(rateHistory, platform, r.ordered_at);
    return s + Number(r.total) * rate;
  }, 0);

  // Group by product SKU — orders = sum(quantity), not count of rows.
  // A single order with qty=2 counts as 2 packs sold.
  //
  // ⚠️ Linha SEM SKU (a Shopee grava `product_sku` nulo) agrupa pelo NOME, mas
  // guarda `sku: null`. Antes o nome era escrito na coluna SKU, e o produto
  // aparecia como se estivesse cadastrado — inclusive com um "×1" inventado
  // pela divisão `units / orders`. Ausência que se disfarça de dado é o que
  // impede alguém de ir cadastrar o mapeamento que falta.
  const skuMap = new Map<string, { name: string; sku: string | null; orders: number; txns: number; units: number; revenue: number }>();
  for (const r of rows) {
    const sku  = normalizarSku(r.product_sku);
    const name = r.product_name ?? sku ?? "Produto desconhecido";
    const key  = sku ?? `\0nome:${name}`;
    const prev = skuMap.get(key) ?? { name, sku, orders: 0, txns: 0, units: 0, revenue: 0 };
    skuMap.set(key, {
      name,
      sku,
      // ⚠️ SÓ VENDA, nas três colunas. Antes packs e unidades somavam todo
      // pedido e só a receita filtrava — a tabela dizia "Unidades" contando
      // CANCELADO, e o Comparativo ao lado passou a contar só venda: a mesma
      // palavra com dois números conforme a aba, que é o defeito que este
      // arquivo já pagou entre o Comparativo e a aba do ML.
      // A lista branca é a mesma que a dedução de estoque usa para decidir o
      // que saiu do galpão.
      orders:  prev.orders  + (isSale(r.status) ? r.quantity : 0),   // packs vendidos
      txns:    prev.txns    + 1,                  // linhas recebidas, venda ou não
      units:   prev.units   + (isSale(r.status) ? displayUnits(r) : 0),
      revenue: prev.revenue + (isSale(r.status) ? Number(r.total) : 0),
    });
  }

  const products: EcommerceProduct[] = Array.from(skuMap.values()).map((v, i) => ({
    id:           `p-${i}`,
    name:         v.name,
    sku:          v.sku,
    // Só o que o cadastro diz. `null` = desconhecido — nunca uma média
    // arredondada de `units / orders`, que devolvia "×1" para SKU sem mapa e
    // escondia exatamente o caso que precisa de ação.
    units_per_pack: fatorUnidades(skuMappings, platform, v.sku),
    orders:       v.orders,   // packs sold = sum(quantity)
    units_sold:   v.units,
    revenue:      Math.round(v.revenue * 100) / 100,
  })).sort((a, b) => b.orders - a.orders || b.revenue - a.revenue);

  // Group by day
  const dayMap = new Map<string, { pedidos: Set<string>; units: number; revenue: number }>();
  for (const r of rows) {
    const day = diaLocal(r.ordered_at);
    const prev = dayMap.get(day) ?? { pedidos: new Set<string>(), units: 0, revenue: 0 };
    prev.pedidos.add(pedidoRaiz(r.platform, r.order_id));
    dayMap.set(day, {
      pedidos: prev.pedidos,
      units:   prev.units   + displayUnits(r),
      revenue: prev.revenue + (isSale(r.status) ? Number(r.total) : 0),
    });
  }

  const dailySales: EcommerceDailySale[] = Array.from(dayMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, v]) => ({
      date,
      label:   format(new Date(date + "T12:00:00"), "dd/MM", { locale: ptBR }),
      orders:  v.pedidos.size,
      units:   v.units,
      revenue: Math.round(v.revenue * 100) / 100,
    }));

  return {
    platform,
    totalOrders,
    saleOrders,
    totalUnitsSold,
    saleUnits,
    totalQuantityRaw,
    totalRevenue:     Math.round(totalRevenue * 100) / 100,
    netRevenue:       Math.round(netRevenue * 100) / 100,
    cancelledRevenue: Math.round(cancelledRevenue * 100) / 100,
    pendingRevenue:   Math.round(pendingRevenue * 100) / 100,
    // Ticket médio = receita realizada ÷ pedidos que geraram essa receita.
    // Dividir por totalOrders (que inclui cancelado) rebaixaria o ticket.
    avgTicket:        saleOrders > 0 ? Math.round((totalRevenue / saleOrders) * 100) / 100 : 0,
    cancelledOrders: cancelled,
    cancellationRate: Math.round(cancellationRate * 10) / 10,
    pendingOrders:   pending,
    paidOrders:      paid,
    shippedOrders:   shipped,
    deliveredOrders: delivered,
    commissionTotal: Math.round(commissionTotal * 100) / 100,
    topProduct:      products[0] ?? null,
    avgRating:       null,
    products,
    dailySales,
    isConnected:     true,
  };
}

/**
 * Taxa de comissão presumida enquanto ninguém cadastrou uma em
 * `platform_commission_rates`.
 *
 * ⚠️ `null` = NÃO MEDIDA, e é diferente de `0`. O zero da Nuvemshop é uma
 * decisão ("loja própria, não há comissão de marketplace"); `null` é a ausência
 * de informação, e ela precisa aparecer como ausência na tela — número chutado
 * que se passa por medição é a doença que este repo já pagou várias vezes.
 *
 * A `shopee: 0.12` era um CHUTE herdado e foi para `null` em 31/08/2026 — ela
 * aparecia como comissão apurada e mexia na margem de todo relatório do canal.
 * Cadastre a taxa real pelo cartão "Comissão da Plataforma" (ela vale a partir
 * da data informada) em vez de escrever um número aqui: número no código não
 * tem data, e comissão muda.
 */
export const PLATFORM_FEE_DEFAULT: Record<EcommercePlatform, number | null> = {
  mercadolivre: 0.16,
  amazon:       0.15,
  nuvemshop:    0,      // loja própria — sem comissão de marketplace
  payt:         null,   // ⚠️ NÃO MEDIDA — checkout próprio, taxa ainda desconhecida
  // ⚠️ Era `0.12`, um CHUTE herdado que nunca foi medido — e que a tela exibia
  // como se fosse comissão apurada, mexendo na margem de todo relatório da
  // Shopee. Vira `null` pelo mesmo motivo da PayT: ausência tem de aparecer
  // como ausência. A taxa real entra pelo cartão "Comissão da Plataforma", que
  // guarda a data a partir da qual ela vale — número aqui não tem data.
  shopee:       null,
};

function getRateForDate(history: CommissionRate[], platform: EcommercePlatform, date: string): number {
  const day = date.slice(0, 10);
  const match = history
    .filter(r => r.valid_from <= day)
    .sort((a, b) => b.valid_from.localeCompare(a.valid_from))[0];
  // Sem taxa cadastrada e sem padrão medido, a comissão é 0 — e a TELA diz que
  // não há taxa, em vez de imprimir "R$ 0,00 de comissão" como se fosse medido.
  return match?.rate ?? PLATFORM_FEE_DEFAULT[platform] ?? 0;
}

function emptyMetrics(platform: EcommercePlatform): EcommerceMetrics {
  return {
    platform,
    totalOrders: 0, saleOrders: 0, totalUnitsSold: 0, saleUnits: 0, totalQuantityRaw: 0,
    totalRevenue: 0, netRevenue: 0,
    cancelledRevenue: 0, pendingRevenue: 0, avgTicket: 0,
    cancelledOrders: 0, cancellationRate: 0, pendingOrders: 0, paidOrders: 0, shippedOrders: 0, deliveredOrders: 0,
    commissionTotal: 0, topProduct: null,
    avgRating: null, products: [], dailySales: [],
    isConnected: false,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// PATH 1 — Raw check hook (simple DB aggregation, no business logic)
// ─────────────────────────────────────────────────────────────────────────────

export function useEcommerceRawCheck(
  platform: EcommercePlatform,
  period: EcommercePeriod,
  custom?: EcommerceCustom,
): RawCheckMetrics | null {
  const [data, setData] = useState<RawCheckMetrics | null>(null);

  useEffect(() => {
    const { from, to } = getRange(period, custom);

    supabase
      .from("ecommerce_raw_summary" as never)
      .select("*")
      .eq("platform", platform)
      .gte("day", from)
      .lte("day", to)
      .then(({ data: rows, error }) => {
        if (error || !rows?.length) { setData(null); return; }
        const r = rows as Record<string, number>[];
        setData({
          totalOrders:     r.reduce((s, x) => s + (x.total_orders   ?? 0), 0),
          totalQuantity:   r.reduce((s, x) => s + (x.total_quantity  ?? 0), 0),
          totalUnitsReal:  r.reduce((s, x) => s + (x.total_units_real ?? 0), 0),
          totalRevenue:    r.reduce((s, x) => s + Number(x.total_revenue  ?? 0), 0),
          saleRevenue:     r.reduce((s, x) => s + Number(x.sale_revenue   ?? 0), 0),
          cancelledOrders: r.reduce((s, x) => s + (x.cancelled_orders ?? 0), 0),
          pendingOrders:   r.reduce((s, x) => s + (x.pending_orders  ?? 0), 0),
          shippedOrders:   r.reduce((s, x) => s + (x.shipped_orders  ?? 0), 0),
          deliveredOrders: r.reduce((s, x) => s + (x.delivered_orders ?? 0), 0),
        });
      });
  }, [platform, period, custom?.from, custom?.to]);

  return data;
}

// ─────────────────────────────────────────────────────────────────────────────
// PATH 2 — System hook (full business logic + real-time)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * ⚠️ "Conectado" e "sincronizando" são perguntas DIFERENTES.
 *
 * `is_connected` responde só "existe token e ele não venceu". Em 26/08/2026 o
 * `ecommerce-sync` passou ~20 h tomando 401 do próprio cron com todos os
 * tokens válidos — o selo teria dito "Conectado" o tempo todo enquanto nada
 * entrava. Por isso a segunda metade: quando foi a última vez que a rodada
 * trouxe dado.
 */
async function statusDaConexao(
  platform: EcommercePlatform,
): Promise<{ conectado: boolean; minutos: number | null }> {
  // ⚠️ DUAS consultas, e a segunda pode falhar sem derrubar a primeira.
  //
  // Front e migração não sobem juntos: o deploy da tela é instantâneo no push,
  // a migração é rodada à mão depois. Pedir uma coluna que ainda não existe faz
  // o PostgREST devolver ERRO — e um `select` com erro devolve `data: null`,
  // que aqui virava "não conectado" para TODAS as plataformas de uma vez.
  //
  // Aconteceu em 27/08/2026: a tela subiu antes da 20260954 e o painel inteiro
  // passou a dizer "Aguardando integração" com todos os tokens válidos. O
  // sintoma era exatamente o oposto do que o selo existe para mostrar.
  //
  // A pergunta essencial ("tem token?") fica isolada e nunca depende da coluna
  // nova; a métrica de atraso é um extra que degrada para `null`.
  const { data: base } = await supabase
    .from("platform_connection_status" as never)
    .select("is_connected")
    .eq("platform", platform)
    .maybeSingle() as { data: { is_connected: boolean } | null };

  let minutos: number | null = null;
  const { data: extra, error: erroExtra } = await supabase
    .from("platform_connection_status" as never)
    .select("minutos_sem_sincronizar")
    .eq("platform", platform)
    .maybeSingle() as {
      data: { minutos_sem_sincronizar: number | null } | null;
      error: { message: string } | null;
    };
  if (erroExtra) {
    // Coluna ainda não existe (migração pendente). Não é falha de conexão, e
    // não pode ser lida como uma.
    console.warn("[useDashEcommerce] minutos_sem_sincronizar indisponível:", erroExtra.message);
  } else {
    minutos = extra?.minutos_sem_sincronizar ?? null;
  }

  return { conectado: base?.is_connected === true, minutos };
}

/** O sync roda a cada 5 min. Uma hora sem trazer dado é anomalia, não folga. */
export const MINUTOS_ATE_ALERTAR = 60;

/**
 * O mapa (plataforma, SKU) → unidades por pack, para estas linhas.
 *
 * ⚠️ É UMA função, chamada por TODOS os caminhos desta tela. O Comparativo
 * rodava sem mapa nenhum — nem sequer trazia `product_sku` no `select` — e por
 * isso somava `units_real` cru: o Mercado Livre mostrava 30 packs = 30
 * unidades, enquanto a aba do próprio ML, com o mesmo dado, mostrava ×5. Duas
 * telas, dois números, nenhum erro.
 */
async function carregarMapaUnidades(
  rows: Pick<DBOrder, "product_sku">[],
): Promise<MapaUnidades> {
  const skus = [...new Set(rows.map(r => normalizarSku(r.product_sku)).filter(Boolean))] as string[];
  if (skus.length === 0) return new Map();

  const { data, error } = await supabase
    .from("sku_product_mappings" as never)
    .select(COLUNAS_MAPA_SKU)
    .in("platform_sku", skus)
    .eq("is_active", true) as { data: SkuMappingRow[] | null; error: { message: string } | null };

  if (error) {
    // Sem mapa, `unidadesExibidas` cai em `units_real ?? quantity` — número
    // menor, nunca inflado. Mas ele NÃO pode passar calado: silêncio aqui é
    // exatamente o defeito que esta correção fecha.
    console.error("[useDashEcommerce] sku_product_mappings indisponível:", error.message);
    return new Map();
  }
  return construirMapaUnidades(data ?? []);
}

/** Identidade do produto para o qual um (plataforma, SKU) aponta. */
interface ProdutoDoSku { productId: string; productCode: string; nome: string }

/**
 * De (plataforma, SKU) para o PRODUTO do cadastro.
 *
 * ⚠️ Consulta separada da `carregarMapaUnidades` de propósito: aquela responde
 * "quantas unidades", esta responde "de qual produto". Juntá-las faria uma
 * falha na segunda derrubar a primeira — e a contagem de unidades não pode
 * depender de o nome do produto estar disponível.
 *
 * ⚠️ A chave repete a precedência da `carbo_ecommerce_sku_resolve`: a linha da
 * PLATAFORMA vence a genérica (`platform = null`). Indexar só pelo SKU faria o
 * produto de um canal ser atribuído a outro, que foi o defeito que o
 * `lib/skuUnidades.ts` existe para fechar.
 */
async function carregarProdutosDoSku(
  rows: Pick<DBOrder, "product_sku">[],
): Promise<Map<string, ProdutoDoSku>> {
  const skus = [...new Set(rows.map(r => normalizarSku(r.product_sku)).filter(Boolean))] as string[];
  if (skus.length === 0) return new Map();

  const { data: maps, error } = await supabase
    .from("sku_product_mappings" as never)
    .select("platform_sku, platform, product_id")
    .in("platform_sku", skus)
    .eq("is_active", true) as {
      data: { platform_sku: string; platform: string | null; product_id: string | null }[] | null;
      error: { message: string } | null;
    };

  if (error) {
    // Cai para agrupamento por SKU. A tela DIZ que não está mapeado, em vez de
    // inventar um produto — ausência disfarçada de resposta é pior que ausência.
    console.error("[useDashEcommerce] produto do SKU indisponível:", error.message);
    return new Map();
  }

  const ids = [...new Set((maps ?? []).map(m => m.product_id).filter(Boolean))] as string[];
  if (ids.length === 0) return new Map();

  const { data: prods, error: erroProd } = await supabase
    .from("mrp_products" as never)
    .select("id, product_code, name")
    .in("id", ids) as {
      data: { id: string; product_code: string | null; name: string | null }[] | null;
      error: { message: string } | null;
    };

  if (erroProd) {
    console.error("[useDashEcommerce] mrp_products indisponível:", erroProd.message);
    return new Map();
  }

  const porId = new Map<string, ProdutoDoSku>();
  for (const p of prods ?? []) {
    porId.set(p.id, {
      productId:   p.id,
      productCode: p.product_code ?? "",
      nome:        p.name ?? p.product_code ?? "Produto sem nome",
    });
  }

  const saida = new Map<string, ProdutoDoSku>();
  for (const m of maps ?? []) {
    const sku = normalizarSku(m.platform_sku);
    const prod = m.product_id ? porId.get(m.product_id) : undefined;
    if (!sku || !prod) continue;
    saida.set(`${m.platform ?? "*"} ${sku}`, prod);
  }
  return saida;
}

/** O produto daquele SKU naquela plataforma — específico vence genérico. */
function produtoDoSku(
  mapa: Map<string, ProdutoDoSku>,
  platform: string,
  sku: string | null | undefined,
): ProdutoDoSku | null {
  const s = normalizarSku(sku);
  if (!s) return null;
  return mapa.get(`${platform} ${s}`) ?? mapa.get(`* ${s}`) ?? null;
}

/**
 * Soma por produto, atravessando as plataformas selecionadas.
 *
 * ⚠️ Unidades usam `unidadesExibidas` — a MESMA função dos cartões do topo.
 * Uma segunda conta aqui daria dois totais diferentes na mesma tela, que é
 * como o Comparativo e a aba do ML já divergiram uma vez.
 */
function somarPorProduto(
  rows: DBOrder[],
  mapaUnidades: MapaUnidades,
  mapaProdutos: Map<string, ProdutoDoSku>,
): ProdutoVendido[] {
  const acc = new Map<string, ProdutoVendido>();

  for (const r of rows) {
    const sku  = normalizarSku(r.product_sku);
    const prod = produtoDoSku(mapaProdutos, r.platform, sku);
    // Sem produto no cadastro a linha NÃO some e NÃO se mistura: ela vira uma
    // linha própria, pelo SKU, ou pelo nome quando nem SKU existe (Shopee).
    const key = prod ? `prod:${prod.productId}` : sku ? `sku:${sku}` : `nome:${r.product_name ?? "?"}`;

    const prev = acc.get(key) ?? {
      key,
      nome:        prod?.nome ?? r.product_name ?? sku ?? "Produto desconhecido",
      productCode: prod?.productCode ?? null,
      skus:        [] as string[],
      mapeado:     !!prod,
      packs:       0,
      unidades:    0,
      receita:     0,
    };

    if (sku && !prev.skus.includes(sku)) prev.skus.push(sku);
    // ⚠️ SÓ VENDA DE VERDADE, nas três colunas. Antes packs e unidades somavam
    // todas as linhas e só a receita filtrava — então o card dizia "entregues
    // ao cliente" contando pedido CANCELADO. Medido em 03/09: 67 packs de 596
    // (11%) nunca foram entregues a ninguém.
    //
    // Não era rótulo incompleto, era rótulo FALSO — e é a mesma lista branca
    // (`isSale` → paid|shipped|delivered) que a dedução de estoque usa para
    // decidir o que saiu do galpão. Contar aqui o que o estoque não deduz lá
    // era o painel discordando do próprio sistema.
    if (!isSale(r.status)) continue;
    prev.packs    += Number(r.quantity) || 0;
    prev.unidades += unidadesExibidas(mapaUnidades, r);
    prev.receita  += Number(r.total) || 0;
    acc.set(key, prev);
  }

  return [...acc.values()]
    .map(p => ({ ...p, receita: Math.round(p.receita * 100) / 100 }))
    .sort((a, b) => b.unidades - a.unidades || b.receita - a.receita);
}

async function fetchOrders(
  platform: EcommercePlatform,
  period: EcommercePeriod,
  custom?: EcommerceCustom,
): Promise<EcommerceMetrics> {
  const r = getRange(period, custom);
  // ⚠️ Instante, não texto solto.
  //
  // Antes ia `"2026-08-05T00:00:00"` cru para o filtro. Sem fuso, o Postgres lê
  // isso no fuso DELE (UTC no Supabase) — então "hoje" começava às 21h de
  // ontem em Brasília e terminava às 21h de hoje. O `new Date(...)` interpreta
  // a string SEM sufixo como hora local e o toISOString() manda o instante
  // certo; assim o dia do painel é o dia de quem vende.
  //
  // 23:59:59.999 do último dia: `to` é inclusivo, e sem isso o dia final
  // ficaria de fora — "ontem" não traria nada.
  const from = new Date(`${r.from}T00:00:00`).toISOString();
  const to   = new Date(`${r.to}T23:59:59.999`).toISOString();

  const [{ data, error }, connected, { data: rateData }] = await Promise.all([
    supabase
      .from("ecommerce_orders" as never)
      .select("id,platform,order_id,product_sku,product_name,quantity,units_real,unit_price,total,status,ordered_at")
      .eq("platform", platform)
      .gte("ordered_at", from)
      .lte("ordered_at", to),
    statusDaConexao(platform),
    supabase
      .from("platform_commission_rates" as never)
      .select("id,platform,rate,valid_from,created_at")
      .eq("platform", platform)
      .order("valid_from", { ascending: false }),
  ]);

  if (error) { console.error("[useDashEcommerce]", error.message); return emptyMetrics(platform); }

  const rows        = (data ?? []) as DBOrder[];
  const rateHistory = (rateData ?? []) as CommissionRate[];

  if (rows.length === 0 && !connected.conectado) return emptyMetrics(platform);
  if (rows.length === 0) {
    return { ...emptyMetrics(platform), isConnected: true,
             minutosSemSincronizar: connected.minutos };
  }

  const skuMappings = await carregarMapaUnidades(rows);

  return { ...buildMetrics(platform, rows, rateHistory, skuMappings),
           isConnected: connected.conectado,
           minutosSemSincronizar: connected.minutos };
}

const PLATFORM_LABEL: Record<EcommercePlatform, string> = {
  mercadolivre: "Mercado Livre",
  amazon:       "Amazon",
  nuvemshop:    "Nuvemshop",
  payt:         "PayT",
  shopee:       "Shopee",
};

export function useDashEcommerce(
  platform: EcommercePlatform,
  period: EcommercePeriod,
  custom?: EcommerceCustom,
): { data: EcommerceMetrics; isLoading: boolean } {
  const [data, setData]         = useState<EcommerceMetrics>(emptyMetrics(platform));
  const [isLoading, setLoading] = useState(true);
  const channelRef    = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const prevConnected = useRef<boolean | null>(null);
  const pollRef       = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    let cancelled = false;
    // Restore last known state from localStorage to detect disconnects across page refreshes
    const storageKey = `ecommerce_connected_${platform}`;
    prevConnected.current = localStorage.getItem(storageKey) === "true" ? true
                          : localStorage.getItem(storageKey) === "false" ? false
                          : null;
    setLoading(true);

    const load = () =>
      fetchOrders(platform, period, custom).then(async m => {
        if (cancelled) return;
        // Detect disconnection → toast + persistent notification
        if (prevConnected.current === true && !m.isConnected) {
          toast.error(`⚠️ ${PLATFORM_LABEL[platform]} desconectado`, {
            description: "A integração caiu. Reconecte para continuar recebendo pedidos.",
            duration: 10000,
          });
          // Save to notification bell via RPC (bypasses RLS safely)
          const { data: { user } } = await supabase.auth.getUser();
          if (user) {
            await (supabase.rpc as Function)("notify_ecommerce_disconnected", {
              p_user_id:  user.id,
              p_platform: platform,
              p_title:    `⚠️ ${PLATFORM_LABEL[platform]} desconectado`,
              p_body:     "A integração caiu. Acesse Vendas Online e reconecte a plataforma.",
            });
          }
        }
        prevConnected.current = m.isConnected;
        localStorage.setItem(storageKey, String(m.isConnected));
        setData(m);
        setLoading(false);
      });

    load();

    // Poll connection status every 60s — detects drops without page refresh
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(load, 60_000);

    // Real-time: re-fetch on order changes AND token changes
    if (channelRef.current) supabase.removeChannel(channelRef.current);
    channelRef.current = supabase
      .channel(`ecommerce-rt-${platform}`)
      .on(
        "postgres_changes" as never,
        { event: "*", schema: "public", table: "ecommerce_orders", filter: `platform=eq.${platform}` },
        () => fetchOrders(platform, period, custom).then(m => { if (!cancelled) { setData(m); } })
      )
      .on(
        "postgres_changes" as never,
        { event: "*", schema: "public", table: "system_tokens", filter: `id=eq.${platform}` },
        () => load()
      )
      .subscribe();

    return () => {
      cancelled = true;
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
      if (channelRef.current) { supabase.removeChannel(channelRef.current); channelRef.current = null; }
    };
  }, [platform, period, custom?.from, custom?.to]);

  return { data, isLoading };
}

// ─────────────────────────────────────────────────────────────────────────────
// Commission rates hook
// ─────────────────────────────────────────────────────────────────────────────

export function useCommissionRates(platform: EcommercePlatform) {
  const [history, setHistory] = useState<CommissionRate[]>([]);
  const [saving, setSaving]   = useState(false);

  const load = async () => {
    const { data } = await supabase
      .from("platform_commission_rates" as never)
      .select("id,platform,rate,valid_from,created_at")
      .eq("platform", platform)
      .order("valid_from", { ascending: false }) as { data: CommissionRate[] | null };
    setHistory(data ?? []);
  };

  useEffect(() => { load(); }, [platform]);

  const saveRate = async (rate: number, validFrom: string) => {
    setSaving(true);
    const { error } = await supabase
      .from("platform_commission_rates" as never)
      .insert({ platform, rate, valid_from: validFrom });
    setSaving(false);
    if (error) { toast.error("Erro ao salvar taxa"); return false; }
    toast.success("Taxa salva com sucesso");
    await load();
    return true;
  };

  /** ⚠️ `null` = nenhuma taxa cadastrada E nenhum padrão medido. Quem exibe
   *  precisa DIZER isso; imprimir 0% faria a ausência parecer medição. */
  const currentRate: number | null = history[0]?.rate ?? PLATFORM_FEE_DEFAULT[platform];

  return { history, currentRate, saveRate, saving };
}

// ─────────────────────────────────────────────────────────────────────────────
// Comparativo hook
// ─────────────────────────────────────────────────────────────────────────────

export function useEcommerceComparativo(
  platforms: EcommercePlatform[],
  period: EcommercePeriod,
  custom?: EcommerceCustom,
): { data: ComparativoMetrics[]; porProduto: ProdutoVendido[]; isLoading: boolean } {
  const [data, setData]             = useState<ComparativoMetrics[]>([]);
  const [porProduto, setPorProduto] = useState<ProdutoVendido[]>([]);
  const [isLoading, setLoading]     = useState(true);
  const platformsKey = platforms.join(",");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    // ⚠️ Par início/FIM, igual ao `fetchOrders`. Antes era só
    // `getRangeStart(period)` com um `gte` solto, sem teto — e um filtro sem
    // teto sempre termina AGORA.
    //
    // Enquanto todo período acabava hoje, isso passava despercebido: "7 dias" e
    // "este mês" terminam hoje mesmo, então a falta do limite não mudava nada.
    // "Ontem" é o único que tem fim no passado — e virava ontem MAIS hoje, dois
    // dias somados num seletor que diz um. "Hoje" continuava certo pelo mesmo
    // motivo que escondia o defeito, o que fez a tela parecer confiável
    // justamente onde ela não era.
    //
    // ⚠️ E `custom` agora chega aqui. Sem ele, escolher "Por período…" no
    // Comparativo caía no default de 30 dias, em silêncio: o seletor mostrava
    // as datas escolhidas e a tabela respondia outra pergunta.
    const r    = getRange(period, custom);
    const from = new Date(`${r.from}T00:00:00`).toISOString();
    const to   = new Date(`${r.to}T23:59:59.999`).toISOString();

    // ⚠️ `product_sku` FAZ PARTE da conta. Sem ele no `select` não há como
    // resolver o multiplicador, e a tabela caía em `units_real` — que só a
    // Nuvemshop preenche multiplicado. Era daí que vinha "27 vendas / 30
    // unidades" do Mercado Livre com kits de 5 e de 10 no meio.
    supabase
      .from("ecommerce_orders" as never)
      // ⚠️ `product_name` entrou junto: sem ele a linha SEM SKU (Shopee) não tem
      // como se identificar na soma por produto, e viraria "Produto
      // desconhecido" para todas — juntando produtos diferentes numa linha só.
      .select("platform,order_id,product_sku,product_name,quantity,units_real,total,status,ordered_at")
      .in("platform", platforms)
      .gte("ordered_at", from)
      .lte("ordered_at", to)
      .then(async ({ data: rows }) => {
        if (cancelled) return;
        const allRows = (rows ?? []) as DBOrder[];
        const [mapa, mapaProdutos] = await Promise.all([
          carregarMapaUnidades(allRows),
          carregarProdutosDoSku(allRows),
        ]);
        if (cancelled) return;
        setPorProduto(somarPorProduto(allRows, mapa, mapaProdutos));
        const result: ComparativoMetrics[] = platforms.map(p => {
          const m = buildMetrics(p, allRows.filter(r => r.platform === p), [], mapa);
          return {
            platform:        m.platform,
            totalOrders:     m.totalOrders,
            saleOrders:      m.saleOrders,
            saleUnits:       m.saleUnits,
            totalRevenue:    m.totalRevenue,
            avgTicket:       m.avgTicket,
            cancelledOrders: m.cancelledOrders,
            dailySales:      m.dailySales,
          };
        });
        setData(result);
        setLoading(false);
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [platformsKey, period, custom?.from, custom?.to]);

  return { data, porProduto, isLoading };
}

// ─────────────────────────────────────────────────────────────────────────────
// Histórico mensal hook
// ─────────────────────────────────────────────────────────────────────────────

export interface MonthlyMetrics {
  month: string;
  label: string;
  platform: EcommercePlatform;
  /** Pedidos que chegaram, em qualquer status. */
  totalOrders: number;
  /** Destes, os que viraram venda. É o número que vale. */
  saleOrders: number;
  /** Faturamento: só paid|shipped|delivered. */
  totalRevenue: number;
  pendingRevenue: number;
  cancelledRevenue: number;
  totalUnitsSold: number;
  saleUnits: number;
  cancelledOrders: number;
  pendingOrders: number;
  cancellationRate: number;
  avgTicket: number;
}

interface MonthlyRPCRow {
  platform:          string;
  month_str:         string;
  total_orders:      number;
  sale_orders:       number;
  total_units:       number;
  sale_units:        number;
  /** ⚠️ Desde a 20260914 é FATURAMENTO (paid|shipped|delivered). Antes somava
   *  cancelado e pendente junto — e a tela chamava isso de receita do mês. */
  total_revenue:     number;
  pending_revenue:   number;
  cancelled_revenue: number;
  cancelled_orders:  number;
  pending_orders:    number;
}

export function useEcommerceHistoricoMensal(
  platforms: EcommercePlatform[],
  fromMonth: string, // "2025-05"
  toMonth:   string, // "2026-05"
) {
  const [data, setData]         = useState<MonthlyMetrics[]>([]);
  const [isLoading, setLoading] = useState(true);
  const key = `${platforms.join(",")}|${fromMonth}|${toMonth}`;

  useEffect(() => {
    if (!platforms.length) { setData([]); setLoading(false); return; }
    let cancelled = false;
    setLoading(true);

    supabase
      .rpc("ecommerce_monthly_summary" as never, {
        p_platforms: platforms,
        p_from:      `${fromMonth}-01`,
        p_to:        `${toMonth}-01`,
      })
      .then(({ data: rows, error }) => {
        if (cancelled) return;
        if (error) { console.error("ecommerce_monthly_summary:", error); setLoading(false); return; }

        const MN = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
        const result: MonthlyMetrics[] = ((rows ?? []) as MonthlyRPCRow[]).map(r => {
          const [y, m]   = r.month_str.split("-");
          const orders   = Number(r.total_orders);
          const vendas   = Number(r.sale_orders);
          const revenue  = Number(r.total_revenue);
          const cancelled = Number(r.cancelled_orders);
          return {
            month:           r.month_str,
            label:           `${MN[parseInt(m) - 1]}/${y.slice(2)}`,
            platform:        r.platform as EcommercePlatform,
            totalOrders:     orders,
            saleOrders:      vendas,
            totalRevenue:    revenue,
            pendingRevenue:  Number(r.pending_revenue),
            cancelledRevenue: Number(r.cancelled_revenue),
            totalUnitsSold:  Number(r.total_units),
            saleUnits:       Number(r.sale_units),
            cancelledOrders: cancelled,
            pendingOrders:   Number(r.pending_orders),
            cancellationRate: orders > 0 ? Math.round((cancelled / orders) * 1000) / 10 : 0,
            // ⚠️ Ticket divide o faturamento pelas VENDAS, não por todos os
            // pedidos. Com `orders` no denominador, um mês com muito PIX não
            // pago mostrava ticket baixo sem nada ter acontecido com o preço.
            avgTicket:        vendas > 0 ? Math.round((revenue / vendas) * 100) / 100 : 0,
          };
        }).sort((a, b) => a.month.localeCompare(b.month));

        setData(result);
        setLoading(false);
      });

    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return { data, isLoading };
}

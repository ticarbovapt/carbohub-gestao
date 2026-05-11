import React, { useMemo, useState } from "react";
import { CarboCard, CarboCardContent, CarboCardHeader, CarboCardTitle } from "@/components/ui/carbo-card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell, Legend,
} from "recharts";
import {
  TrendingUp, DollarSign, Package, ChevronLeft, ChevronRight,
  Users, Trophy, Target, Star, ShoppingCart, BarChart2, TrendingDown,
} from "lucide-react";
import {
  format, startOfMonth, endOfMonth, eachWeekOfInterval,
  startOfWeek, endOfWeek, parseISO, isWithinInterval,
  getDaysInMonth, differenceInDays,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import type { CarbozeOrder, OrderStatus, OrderItem } from "@/hooks/useCarbozeOrders";

// ─── Types ─────────────────────────────────────────────────────────────────

interface OrdersAnalyticsProps {
  orders: CarbozeOrder[];
  isLoading?: boolean;
}

// ─── Status config ──────────────────────────────────────────────────────────

const STATUS_COLORS: Record<OrderStatus, string> = {
  pending:   "#FBBF24",
  confirmed: "#3B82F6",
  invoiced:  "#8B5CF6",
  shipped:   "#06B6D4",
  delivered: "#22C55E",
  cancelled: "#EF4444",
};

const STATUS_LABELS: Record<OrderStatus, string> = {
  pending:   "Pendente",
  confirmed: "Confirmado",
  invoiced:  "Faturado",
  shipped:   "Enviado",
  delivered: "Entregue",
  cancelled: "Cancelado",
};

// ─── Product line config ─────────────────────────────────────────────────────
// Labels e cores para linhas de produto conhecidas.
// Novos produtos aparecem automaticamente — estes são apenas os "conhecidos".

const LINHA_LABELS: Record<string, string> = {
  carboze_100ml:   "CarboZé 100ml",
  carboze_1l:      "CarboZé 1L",
  carboze_sache:   "CarboZé Sachê",
  carbopro:        "CarboPRO",
  carbovapt:       "CarboVapt",
  carbonz:         "CarbonZ",
  outros:          "Outros",
};

const LINHA_COLORS: Record<string, string> = {
  carboze_100ml:   "#3BC770",
  carboze_1l:      "#4FA4E8",
  carboze_sache:   "#06B6D4",
  carbopro:        "#FBBF24",
  carbovapt:       "#8B5CF6",
  carbonz:         "#F97316",
  outros:          "#94A3B8",
};

const CHART_PALETTE = [
  "#3BC770", "#4FA4E8", "#FBBF24", "#8B5CF6",
  "#06B6D4", "#F97316", "#EF4444", "#94A3B8",
];

// ─── Helpers ────────────────────────────────────────────────────────────────

function parseItems(order: CarbozeOrder): OrderItem[] {
  if (!Array.isArray(order.items)) return [];
  // Normaliza campo: DB Bling usa "product_name", interface usa "name"
  return (order.items as any[]).map((i) => ({
    ...i,
    name: i.name || i.product_name || "",
  })) as OrderItem[];
}

/**
 * Classifica o nome de um item Bling em uma linha de produto canônica.
 * Baseado em keywords presentes no nome real do produto no Bling.
 */
function classifyItemName(name: string): string {
  if (!name) return "outros";
  const n = name
    .toUpperCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

  // CarboPRO — checar antes de "CARBO" genérico
  if (n.includes("CARBOPRO") || n.includes("CARBO PRO")) return "carbopro";
  // CarboVapt
  if (n.includes("CARBOVAPT") || n.includes("CARBO VAPT") || n.includes("VAPT")) return "carbovapt";
  // CarbonZ
  if (n.includes("CARBONZ") || n.includes("CARBON Z")) return "carbonz";
  // CarboZé Sachê (checar antes de 100ML para evitar conflito)
  if (n.includes("SACHE") || n.includes("SACHE") || (n.includes("10ML") && !n.includes("100ML"))) return "carboze_sache";
  // CarboZé 1L (checar antes de 100ML)
  if (/\b1\s*L\b/.test(n) || n.includes("1000ML") || n.includes("1 LITRO")) return "carboze_1l";
  // CarboZé 100ml
  if (n.includes("100ML") || n.includes("100 ML")) return "carboze_100ml";
  // CarboZé genérico (provavelmente 100ml se sem indicação de tamanho)
  if (n.includes("CARBOZE") || n.includes("CARBO ZE") || n.includes("ESTABILIZADOR")) return "carboze_100ml";

  return "outros";
}

/**
 * Retorna todas as linhas de produto presentes em um pedido (via items[]).
 * Se o pedido não tem items parseáveis, usa o campo `linha` do pedido.
 */
function getLinhasFromOrder(order: CarbozeOrder): string[] {
  const items = parseItems(order);
  if (items.length > 0) {
    const linhas = new Set(items.map((i) => classifyItemName(i.name)));
    return Array.from(linhas);
  }
  // Fallback: campo linha direto ou detecção por SKU
  if (order.linha) return [order.linha];
  if (order.sku?.code?.includes("1L")) return ["carboze_1l"];
  if (order.sku?.code?.includes("PRO")) return ["carbopro"];
  return ["carboze_100ml"];
}

function getLabel(linha: string): string {
  return LINHA_LABELS[linha] ?? linha;
}

function getColor(linha: string): string {
  return LINHA_COLORS[linha] ?? "#94A3B8";
}

// ─── Component ──────────────────────────────────────────────────────────────

export function OrdersAnalytics({ orders, isLoading }: OrdersAnalyticsProps) {
  const [monthOffset,    setMonthOffset]    = useState(0);
  const [showAllMonths,  setShowAllMonths]  = useState(false);
  const [productFilter,  setProductFilter]  = useState("all");
  const [vendedorFilter, setVendedorFilter] = useState("all");

  // ── Mês base ───────────────────────────────────────────────────────────────
  const currentMonth = useMemo(() => {
    const d = new Date();
    d.setMonth(d.getMonth() + monthOffset);
    return d;
  }, [monthOffset]);

  const monthLabel = useMemo(() => {
    if (showAllMonths) return "Todos os meses";
    return format(currentMonth, "MMMM yyyy", { locale: ptBR }).replace(/^\w/, (c) => c.toUpperCase());
  }, [currentMonth, showAllMonths]);

  // ── Vendedores disponíveis ─────────────────────────────────────────────────
  const vendedores = useMemo(() => {
    const names = new Set<string>();
    orders.forEach((o) => { if (o.vendedor_name) names.add(o.vendedor_name); });
    return Array.from(names).sort();
  }, [orders]);

  // ── Filtros de produto DINÂMICOS (baseados nos items reais) ───────────────
  const dynamicProductFilters = useMemo(() => {
    const linhaSet = new Set<string>();
    for (const order of orders) {
      for (const linha of getLinhasFromOrder(order)) {
        if (linha !== "outros") linhaSet.add(linha);
      }
    }
    // Ordenar: linhas conhecidas primeiro, depois extras
    const knownOrder = ["carboze_100ml", "carboze_1l", "carboze_sache", "carbopro", "carbovapt", "carbonz"];
    const sorted = [
      ...knownOrder.filter((k) => linhaSet.has(k)),
      ...Array.from(linhaSet).filter((k) => !knownOrder.includes(k)),
    ];
    return [
      { key: "all", label: "Todos" },
      ...sorted.map((k) => ({ key: k, label: getLabel(k) })),
    ];
  }, [orders]);

  // ── Pedidos filtrados (período + produto + vendedor) ───────────────────────
  const filteredOrders = useMemo(() => {
    return orders.filter((order) => {
      if (!showAllMonths) {
        const d = parseISO(order.created_at);
        if (!isWithinInterval(d, { start: startOfMonth(currentMonth), end: endOfMonth(currentMonth) })) return false;
      }
      if (productFilter !== "all") {
        if (!getLinhasFromOrder(order).includes(productFilter)) return false;
      }
      if (vendedorFilter !== "all" && order.vendedor_name !== vendedorFilter) return false;
      return true;
    });
  }, [orders, currentMonth, showAllMonths, productFilter, vendedorFilter]);

  // ── Faturados (invoiced, shipped, delivered) ───────────────────────────────
  const faturados = useMemo(() =>
    filteredOrders.filter((o) => ["invoiced", "shipped", "delivered"].includes(o.status)),
    [filteredOrders]
  );

  // ── KPIs gerais ────────────────────────────────────────────────────────────
  const metrics = useMemo(() => {
    const fatBruto         = faturados.reduce((s, o) => s + Number(o.total    || 0), 0);
    const totalDescontos   = faturados.reduce((s, o) => s + Number(o.discount || 0), 0);
    const fatLiquido       = fatBruto - totalDescontos;
    const pedidosFaturados = faturados.length;
    const ticketMedio      = pedidosFaturados > 0 ? fatBruto / pedidosFaturados : 0;
    const clientesUnicos   = new Set(faturados.map((o) => o.customer_name)).size;
    const totalUnidades    = faturados.reduce((s, o) => {
      const items = parseItems(o);
      return s + (items.length > 0
        ? items.reduce((si, i) => si + (i.quantity || 0), 0)
        : 0);
    }, 0);
    return { fatBruto, fatLiquido, pedidosFaturados, ticketMedio, clientesUnicos, totalDescontos, totalUnidades };
  }, [faturados]);

  // ── Métricas POR ITEM (produto real via items[]) ───────────────────────────
  const itemMetrics = useMemo(() => {
    const map = new Map<string, {
      key: string; units: number; revenue: number;
      descontos: number; pedidoIds: Set<string>;
    }>();

    for (const order of faturados) {
      const items = parseItems(order);
      const totalDisc = Number(order.discount || 0);

      if (items.length === 0) {
        // Sem items: usar order total com linha do pedido
        for (const linha of getLinhasFromOrder(order)) {
          if (linha === "outros") continue; // ignorar itens não classificados
          const entry = map.get(linha) ?? { key: linha, units: 0, revenue: 0, descontos: 0, pedidoIds: new Set() };
          entry.revenue    += Number(order.total || 0);
          entry.descontos  += totalDisc;
          entry.pedidoIds.add(order.id);
          map.set(linha, entry);
        }
      } else {
        const totalItemRevenue = items.reduce((s, i) => s + (i.total || i.unit_price * (i.quantity || 0) || 0), 0);
        for (const item of items) {
          const linha     = classifyItemName(item.name);
          if (linha === "outros") continue; // ignorar itens não classificados (embalagens, internos, etc.)
          const itemRev   = item.total || item.unit_price * (item.quantity || 0) || 0;
          const itemDisc  = totalItemRevenue > 0 ? (itemRev / totalItemRevenue) * totalDisc : 0;
          const entry = map.get(linha) ?? { key: linha, units: 0, revenue: 0, descontos: 0, pedidoIds: new Set() };
          entry.units     += item.quantity || 0;
          entry.revenue   += itemRev;
          entry.descontos += itemDisc;
          entry.pedidoIds.add(order.id);
          map.set(linha, entry);
        }
      }
    }

    return Array.from(map.values())
      .map(({ pedidoIds, ...rest }) => ({
        ...rest,
        label:      getLabel(rest.key),
        color:      getColor(rest.key),
        liquido:    rest.revenue - rest.descontos,
        precoMedio: rest.units > 0 ? rest.revenue / rest.units : 0,
        pedidos:    pedidoIds.size,
        pctUnits:   0,  // preenchido abaixo
      }))
      .sort((a, b) => b.units - a.units);
  }, [faturados]);

  // Percentual de unidades por produto
  const itemMetricsWithPct = useMemo(() => {
    const totalUnits = itemMetrics.reduce((s, p) => s + p.units, 0);
    return itemMetrics.map((p) => ({
      ...p,
      pctUnits: totalUnits > 0 ? (p.units / totalUnits) * 100 : 0,
    }));
  }, [itemMetrics]);

  // ── Ranking de vendedores ──────────────────────────────────────────────────
  const vendedorRanking = useMemo(() => {
    const map = new Map<string, { name: string; count: number; revenue: number; units: number }>();
    for (const o of faturados) {
      const name  = o.vendedor_name || "Sem vendedor";
      const entry = map.get(name) ?? { name, count: 0, revenue: 0, units: 0 };
      entry.count   += 1;
      entry.revenue += Number(o.total || 0);
      const items = parseItems(o);
      entry.units   += items.reduce((s, i) => s + (i.quantity || 0), 0);
      map.set(name, entry);
    }
    return Array.from(map.values()).sort((a, b) => b.revenue - a.revenue);
  }, [faturados]);

  // ── Top clientes ───────────────────────────────────────────────────────────
  const topClients = useMemo(() => {
    const map = new Map<string, { revenue: number; pedidos: number }>();
    for (const o of faturados) {
      const e = map.get(o.customer_name) ?? { revenue: 0, pedidos: 0 };
      e.revenue += Number(o.total || 0);
      e.pedidos += 1;
      map.set(o.customer_name, e);
    }
    return Array.from(map.entries())
      .map(([name, d]) => ({
        name:    name.length > 28 ? name.slice(0, 25) + "…" : name,
        revenue: d.revenue,
        pedidos: d.pedidos,
      }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10);
  }, [faturados]);

  // ── Evolução semanal ───────────────────────────────────────────────────────
  const weeklyTrend = useMemo(() => {
    if (showAllMonths) return [];
    const start = startOfMonth(currentMonth);
    const end   = endOfMonth(currentMonth);
    const weeks = eachWeekOfInterval({ start, end }, { weekStartsOn: 0 });
    return weeks.map((weekStart, i) => {
      const wStart = i === 0 ? start : startOfWeek(weekStart);
      const wEnd   = i === weeks.length - 1 ? end : endOfWeek(weekStart);
      const wOrders = faturados.filter((o) => isWithinInterval(parseISO(o.created_at), { start: wStart, end: wEnd }));
      return {
        name:        `Sem ${i + 1}`,
        faturamento: wOrders.reduce((s, o) => s + Number(o.total || 0), 0),
        pedidos:     wOrders.length,
        unidades:    wOrders.reduce((s, o) => {
          const items = parseItems(o);
          return s + items.reduce((si, i) => si + (i.quantity || 0), 0);
        }, 0),
      };
    });
  }, [faturados, currentMonth, showAllMonths]);

  // ── Status distribution ────────────────────────────────────────────────────
  const statusDistribution = useMemo(() =>
    Object.entries(STATUS_LABELS)
      .map(([status, label]) => ({
        name:  label,
        value: filteredOrders.filter((o) => o.status === status).length,
        color: STATUS_COLORS[status as OrderStatus],
      }))
      .filter((d) => d.value > 0),
    [filteredOrders]
  );

  // ── Volume por data (produto selecionado ou todos) ─────────────────────────
  const volumeByDate = useMemo(() => {
    const dateMap = new Map<string, number>();
    for (const o of faturados) {
      if (productFilter !== "all" && !getLinhasFromOrder(o).includes(productFilter)) continue;
      const dateKey = format(parseISO(o.created_at), "dd/MM");
      const items   = parseItems(o);
      const qty     = productFilter === "all"
        ? items.reduce((s, i) => s + (i.quantity || 0), 0)
        : items
            .filter((i) => classifyItemName(i.name) === productFilter)
            .reduce((s, i) => s + (i.quantity || 0), 0);
      if (qty > 0) dateMap.set(dateKey, (dateMap.get(dateKey) || 0) + qty);
    }
    return Array.from(dateMap.entries())
      .map(([date, qty]) => ({ date, qty }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [faturados, productFilter]);

  // ── Projeção mensal ────────────────────────────────────────────────────────
  const projection = useMemo(() => {
    if (showAllMonths) return null;
    const now        = new Date();
    const monthStart = startOfMonth(currentMonth);
    const monthEnd   = endOfMonth(currentMonth);
    const totalDays  = getDaysInMonth(currentMonth);
    const elapsed    = Math.max(1, differenceInDays(now > monthEnd ? monthEnd : now, monthStart) + 1);
    const dailyRev   = metrics.fatBruto / elapsed;
    const dailyOrds  = metrics.pedidosFaturados / elapsed;
    const dailyUnits = metrics.totalUnidades / elapsed;
    return {
      projFat:    dailyRev   * totalDays,
      projPedidos: Math.round(dailyOrds  * totalDays),
      projUnidades: Math.round(dailyUnits * totalDays),
      pctElapsed: Math.round((elapsed / totalDays) * 100),
    };
  }, [metrics, currentMonth, showAllMonths]);

  // ── Formatters ─────────────────────────────────────────────────────────────
  const fmt     = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(v);
  const fmtFull = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
  const fmtNum  = (v: number) => new Intl.NumberFormat("pt-BR").format(v);

  // ── Loading ────────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 bg-muted animate-pulse rounded" />
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {[1, 2, 3, 4, 5].map((i) => <div key={i} className="h-24 bg-muted animate-pulse rounded-xl" />)}
        </div>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">

      {/* ===== HEADER: período + filtros ===== */}
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-carbo-green" />
            Análise de Pedidos
          </h3>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" className="h-8 w-8"
              onClick={() => { setShowAllMonths(false); setMonthOffset((p) => p - 1); }}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant={showAllMonths ? "default" : "outline"} size="sm"
              className="min-w-[160px]"
              onClick={() => setShowAllMonths(!showAllMonths)}
            >
              {monthLabel}
            </Button>
            <Button variant="outline" size="icon" className="h-8 w-8"
              onClick={() => { setShowAllMonths(false); setMonthOffset((p) => Math.min(0, p + 1)); }}
              disabled={monthOffset >= 0 && !showAllMonths}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Filtros produto (dinâmico) + vendedor */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground uppercase">Produto:</span>
          {dynamicProductFilters.map((f) => (
            <Button
              key={f.key}
              variant={productFilter === f.key ? "default" : "outline"}
              size="sm"
              className="h-7 text-xs gap-1.5"
              style={productFilter === f.key && f.key !== "all"
                ? { backgroundColor: getColor(f.key), borderColor: getColor(f.key), color: "#fff" }
                : undefined}
              onClick={() => setProductFilter(f.key)}
            >
              {f.key !== "all" && (
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: getColor(f.key) }} />
              )}
              {f.label}
            </Button>
          ))}
          <div className="w-px h-6 bg-border mx-1" />
          <span className="text-xs font-medium text-muted-foreground uppercase">Vendedor:</span>
          <Select value={vendedorFilter} onValueChange={setVendedorFilter}>
            <SelectTrigger className="w-44 h-7 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os vendedores</SelectItem>
              {vendedores.map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}
            </SelectContent>
          </Select>
          <span className="ml-auto text-sm text-muted-foreground">
            Mostrando <strong>{filteredOrders.length}</strong> pedidos
          </span>
        </div>
      </div>

      {/* ===== KPI CARDS (6) ===== */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <CarboCard className="bg-gradient-to-br from-carbo-green/10 to-transparent">
          <CarboCardContent className="p-4">
            <div className="flex items-center gap-1.5 mb-1">
              <DollarSign className="h-3.5 w-3.5 text-carbo-green" />
              <p className="text-[10px] font-semibold uppercase text-muted-foreground tracking-wider">Fat. Bruto</p>
            </div>
            <p className="text-xl font-bold text-carbo-green kpi-number">{fmt(metrics.fatBruto)}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">{metrics.pedidosFaturados} pedidos</p>
          </CarboCardContent>
        </CarboCard>

        <CarboCard className="bg-gradient-to-br from-emerald-500/10 to-transparent">
          <CarboCardContent className="p-4">
            <div className="flex items-center gap-1.5 mb-1">
              <TrendingUp className="h-3.5 w-3.5 text-emerald-500" />
              <p className="text-[10px] font-semibold uppercase text-muted-foreground tracking-wider">Fat. Líquido</p>
            </div>
            <p className="text-xl font-bold text-emerald-500 kpi-number">{fmt(metrics.fatLiquido)}</p>
            {metrics.totalDescontos > 0 && (
              <p className="text-[10px] text-muted-foreground mt-0.5">
                -{fmt(metrics.totalDescontos)} deduções
              </p>
            )}
          </CarboCardContent>
        </CarboCard>

        <CarboCard className="bg-gradient-to-br from-blue-500/10 to-transparent">
          <CarboCardContent className="p-4">
            <div className="flex items-center gap-1.5 mb-1">
              <ShoppingCart className="h-3.5 w-3.5 text-blue-500" />
              <p className="text-[10px] font-semibold uppercase text-muted-foreground tracking-wider">Pedidos Fat.</p>
            </div>
            <p className="text-xl font-bold text-blue-500 kpi-number">{metrics.pedidosFaturados}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              {filteredOrders.length} total no período
            </p>
          </CarboCardContent>
        </CarboCard>

        <CarboCard>
          <CarboCardContent className="p-4">
            <div className="flex items-center gap-1.5 mb-1">
              <BarChart2 className="h-3.5 w-3.5 text-amber-500" />
              <p className="text-[10px] font-semibold uppercase text-muted-foreground tracking-wider">Ticket Médio</p>
            </div>
            <p className="text-xl font-bold kpi-number">{fmt(metrics.ticketMedio)}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">por pedido faturado</p>
          </CarboCardContent>
        </CarboCard>

        <CarboCard>
          <CarboCardContent className="p-4">
            <div className="flex items-center gap-1.5 mb-1">
              <Package className="h-3.5 w-3.5 text-purple-500" />
              <p className="text-[10px] font-semibold uppercase text-muted-foreground tracking-wider">Unidades</p>
            </div>
            <p className="text-xl font-bold kpi-number">{fmtNum(metrics.totalUnidades)}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">un. saídas (faturadas)</p>
          </CarboCardContent>
        </CarboCard>

        <CarboCard>
          <CarboCardContent className="p-4">
            <div className="flex items-center gap-1.5 mb-1">
              <Users className="h-3.5 w-3.5 text-cyan-500" />
              <p className="text-[10px] font-semibold uppercase text-muted-foreground tracking-wider">Clientes</p>
            </div>
            <p className="text-xl font-bold kpi-number">{metrics.clientesUnicos}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">clientes únicos</p>
          </CarboCardContent>
        </CarboCard>
      </div>

      {/* ===== STRIP DE PRODUTOS (dinâmico) ===== */}
      {itemMetricsWithPct.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 bg-muted/40 rounded-xl border border-border/50">
          {itemMetricsWithPct.map((p) => (
            <div key={p.key} className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: p.color }} />
              <span className="text-xs font-semibold uppercase text-muted-foreground">{p.label}</span>
              <span className="font-bold text-sm" style={{ color: p.color }}>{fmtNum(p.units)} un</span>
              <span className="text-xs text-muted-foreground">({p.pctUnits.toFixed(0)}%)</span>
            </div>
          ))}
          <div className="h-4 w-px bg-border" />
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold uppercase text-muted-foreground">Total Saídas</span>
            <span className="font-bold text-sm text-carbo-green">{fmtNum(metrics.totalUnidades)} un</span>
          </div>
        </div>
      )}

      {/* ===== PROJEÇÃO MENSAL ===== */}
      {!showAllMonths && projection && metrics.fatBruto > 0 && (
        <CarboCard className="border-carbo-green/30">
          <CarboCardContent className="p-4">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-semibold flex items-center gap-2">
                <Target className="h-4 w-4 text-carbo-green" />
                Projeção do Mês — {projection.pctElapsed}% concluído
              </h4>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <p className="text-xs text-muted-foreground mb-1">Faturamento Bruto</p>
                <div className="h-2 bg-muted rounded-full overflow-hidden mb-1">
                  <div className="h-full bg-carbo-green rounded-full" style={{ width: `${projection.pctElapsed}%` }} />
                </div>
                <div className="flex justify-between text-xs">
                  <span className="font-bold text-carbo-green">{fmt(metrics.fatBruto)}</span>
                  <span className="text-muted-foreground">→ {fmt(projection.projFat)}</span>
                </div>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">Pedidos Faturados</p>
                <div className="h-2 bg-muted rounded-full overflow-hidden mb-1">
                  <div className="h-full bg-blue-500 rounded-full" style={{ width: `${projection.pctElapsed}%` }} />
                </div>
                <div className="flex justify-between text-xs">
                  <span className="font-bold text-blue-500">{metrics.pedidosFaturados}</span>
                  <span className="text-muted-foreground">→ {projection.projPedidos}</span>
                </div>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">Unidades Faturadas</p>
                <div className="h-2 bg-muted rounded-full overflow-hidden mb-1">
                  <div className="h-full bg-purple-500 rounded-full" style={{ width: `${projection.pctElapsed}%` }} />
                </div>
                <div className="flex justify-between text-xs">
                  <span className="font-bold text-purple-500">{fmtNum(metrics.totalUnidades)}</span>
                  <span className="text-muted-foreground">→ {fmtNum(projection.projUnidades)}</span>
                </div>
              </div>
            </div>
          </CarboCardContent>
        </CarboCard>
      )}

      {/* ===== DESTAQUE + RANKING VENDEDORES ===== */}
      {vendedorRanking.length > 0 && vendedorRanking[0].name !== "Sem vendedor" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <CarboCard className="border-yellow-400/30 bg-gradient-to-br from-yellow-50/50 to-transparent dark:from-yellow-900/10">
            <CarboCardContent className="p-4">
              <div className="flex items-center gap-2 mb-3">
                <Star className="h-4 w-4 text-yellow-500" />
                <span className="text-xs font-bold uppercase text-yellow-600 dark:text-yellow-400">Destaque do Mês</span>
              </div>
              <p className="text-lg font-bold">{vendedorRanking[0].name}</p>
              <p className="text-xs text-muted-foreground mb-3">Maior faturamento no período selecionado</p>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-lg bg-muted/40 p-2">
                  <p className="text-[10px] text-muted-foreground uppercase">Unidades</p>
                  <p className="font-bold text-sm">{fmtNum(vendedorRanking[0].units)}</p>
                </div>
                <div className="rounded-lg bg-muted/40 p-2">
                  <p className="text-[10px] text-muted-foreground uppercase">Fat. Bruto</p>
                  <p className="font-bold text-sm">{fmt(vendedorRanking[0].revenue)}</p>
                </div>
                <div className="rounded-lg bg-muted/40 p-2">
                  <p className="text-[10px] text-muted-foreground uppercase">Pedidos</p>
                  <p className="font-bold text-sm">{vendedorRanking[0].count}</p>
                </div>
              </div>
            </CarboCardContent>
          </CarboCard>

          <CarboCard>
            <CarboCardHeader className="pb-2">
              <CarboCardTitle className="text-sm flex items-center gap-2">
                <Trophy className="h-4 w-4 text-carbo-green" />
                Ranking — Faturamento por Vendedor
              </CarboCardTitle>
            </CarboCardHeader>
            <CarboCardContent className="pt-0">
              <div className="space-y-2">
                {vendedorRanking.map((v, i) => (
                  <div key={v.name} className="flex items-center gap-3">
                    <span className="w-6 text-center font-bold text-xs flex-shrink-0">
                      {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}º`}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between text-sm mb-0.5">
                        <span className="truncate font-medium">{v.name}</span>
                        <span className="font-bold text-xs kpi-number ml-2 flex-shrink-0">{fmt(v.revenue)}</span>
                      </div>
                      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full bg-carbo-green rounded-full"
                          style={{ width: `${vendedorRanking[0].revenue > 0 ? (v.revenue / vendedorRanking[0].revenue) * 100 : 0}%` }}
                        />
                      </div>
                    </div>
                    <span className="text-xs text-muted-foreground flex-shrink-0">{fmtNum(v.units)} un</span>
                  </div>
                ))}
              </div>
            </CarboCardContent>
          </CarboCard>
        </div>
      )}

      {/* ===== ANÁLISE POR PRODUTO (dinâmico) ===== */}
      {itemMetricsWithPct.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold uppercase text-muted-foreground mb-3 tracking-wider">
            Análise por Produto
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {itemMetricsWithPct.map((p) => (
              <CarboCard key={p.key} className="overflow-hidden">
                <div className="h-1.5 w-full" style={{ backgroundColor: p.color }} />
                <CarboCardContent className="p-4">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-xs font-bold uppercase tracking-wider" style={{ color: p.color }}>{p.label}</p>
                    <Badge variant="outline" className="text-[10px] font-semibold">{p.pctUnits.toFixed(0)}% das un.</Badge>
                  </div>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Unidades Saídas</span>
                      <span className="font-bold">{fmtNum(p.units)} un.</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Fat. Bruto</span>
                      <span className="font-bold">{fmt(p.revenue)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Fat. Líquido</span>
                      <span className="font-bold" style={{ color: p.color }}>{fmt(p.liquido)}</span>
                    </div>
                    {p.descontos > 0 && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Deduções</span>
                        <span className="font-bold text-destructive">-{fmt(p.descontos)}</span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Preço Médio/un.</span>
                      <span className="font-bold">{p.units > 0 ? fmtFull(p.precoMedio) + "/un." : "—"}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Pedidos</span>
                      <span className="font-bold">{p.pedidos} pedidos</span>
                    </div>
                    {/* Mini progress bar de participação */}
                    <div className="pt-1">
                      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${p.pctUnits}%`, backgroundColor: p.color }} />
                      </div>
                    </div>
                  </div>
                </CarboCardContent>
              </CarboCard>
            ))}
          </div>
        </div>
      )}

      {/* ===== CHARTS GRID ===== */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Evolução semanal */}
        {weeklyTrend.length > 0 && (
          <CarboCard>
            <CarboCardHeader>
              <CarboCardTitle className="text-sm">Evolução Semanal de Faturamento</CarboCardTitle>
            </CarboCardHeader>
            <CarboCardContent className="pt-0">
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={weeklyTrend}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="name" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} />
                  <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} tickFormatter={(v) => fmt(v)} />
                  <Tooltip
                    contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px" }}
                    formatter={(value: number, name: string) => [
                      name === "faturamento" ? fmt(value) : fmtNum(value),
                      name === "faturamento" ? "Faturamento" : "Unidades",
                    ]}
                  />
                  <Bar dataKey="faturamento" fill="#3BC770" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CarboCardContent>
          </CarboCard>
        )}

        {/* Mix de produtos por unidades (Donut) */}
        {itemMetricsWithPct.filter((p) => p.units > 0).length > 0 && (
          <CarboCard>
            <CarboCardHeader>
              <CarboCardTitle className="text-sm">Mix de Produtos — Volume (Unidades)</CarboCardTitle>
            </CarboCardHeader>
            <CarboCardContent className="pt-0">
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie
                    data={itemMetricsWithPct.filter((p) => p.units > 0).map((p) => ({ name: p.label, value: p.units }))}
                    cx="50%" cy="50%"
                    innerRadius={55} outerRadius={85}
                    paddingAngle={3} dataKey="value"
                  >
                    {itemMetricsWithPct.filter((p) => p.units > 0).map((p, i) => (
                      <Cell key={i} fill={p.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px" }}
                    formatter={(value: number) => [fmtNum(value) + " un.", "Volume"]}
                  />
                  <Legend verticalAlign="bottom" height={36} formatter={(value) => <span className="text-xs text-muted-foreground">{value}</span>} />
                </PieChart>
              </ResponsiveContainer>
            </CarboCardContent>
          </CarboCard>
        )}

        {/* Faturamento por linha de produto (Donut) */}
        {itemMetricsWithPct.filter((p) => p.revenue > 0).length > 0 && (
          <CarboCard>
            <CarboCardHeader>
              <CarboCardTitle className="text-sm">Faturamento por Linha de Produto</CarboCardTitle>
            </CarboCardHeader>
            <CarboCardContent className="pt-0">
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie
                    data={itemMetricsWithPct.filter((p) => p.revenue > 0).map((p) => ({ name: p.label, value: p.revenue }))}
                    cx="50%" cy="50%"
                    innerRadius={55} outerRadius={85}
                    paddingAngle={3} dataKey="value"
                  >
                    {itemMetricsWithPct.filter((p) => p.revenue > 0).map((p, i) => (
                      <Cell key={i} fill={p.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px" }}
                    formatter={(value: number) => [fmt(value), "Faturamento"]}
                  />
                  <Legend verticalAlign="bottom" height={36} formatter={(value) => <span className="text-xs text-muted-foreground">{value}</span>} />
                </PieChart>
              </ResponsiveContainer>
            </CarboCardContent>
          </CarboCard>
        )}

        {/* Distribuição por status */}
        {statusDistribution.length > 0 && (
          <CarboCard>
            <CarboCardHeader>
              <CarboCardTitle className="text-sm">Distribuição por Status</CarboCardTitle>
            </CarboCardHeader>
            <CarboCardContent className="pt-0">
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie data={statusDistribution} cx="50%" cy="50%" innerRadius={55} outerRadius={85} paddingAngle={2} dataKey="value">
                    {statusDistribution.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                  </Pie>
                  <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px" }} />
                  <Legend verticalAlign="bottom" height={36} formatter={(value) => <span className="text-xs text-muted-foreground">{value}</span>} />
                </PieChart>
              </ResponsiveContainer>
            </CarboCardContent>
          </CarboCard>
        )}

        {/* Faturamento por vendedor (horizontal bar) */}
        {vendedorRanking.length > 0 && vendedorRanking[0].name !== "Sem vendedor" && (
          <CarboCard>
            <CarboCardHeader>
              <CarboCardTitle className="text-sm">Faturamento por Vendedor</CarboCardTitle>
            </CarboCardHeader>
            <CarboCardContent className="pt-0">
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={vendedorRanking.slice(0, 8)} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis type="number" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} tickFormatter={(v) => fmt(v)} />
                  <YAxis type="category" dataKey="name" width={100} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} />
                  <Tooltip
                    contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px" }}
                    formatter={(value: number) => [fmt(value), "Faturamento"]}
                  />
                  <Bar dataKey="revenue" fill="#3BC770" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CarboCardContent>
          </CarboCard>
        )}

        {/* Top 10 clientes */}
        {topClients.length > 0 && (
          <CarboCard>
            <CarboCardHeader>
              <CarboCardTitle className="text-sm">Top 10 Clientes por Receita</CarboCardTitle>
            </CarboCardHeader>
            <CarboCardContent className="pt-0">
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={topClients} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis type="number" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} tickFormatter={(v) => fmt(v)} />
                  <YAxis type="category" dataKey="name" width={120} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} />
                  <Tooltip
                    contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px" }}
                    formatter={(value: number) => [fmt(value), "Receita"]}
                  />
                  <Bar dataKey="revenue" fill="#4FA4E8" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CarboCardContent>
          </CarboCard>
        )}

        {/* Volume de saídas por data (produto selecionado ou todos) */}
        {volumeByDate.length > 0 && (
          <CarboCard className="lg:col-span-2">
            <CarboCardHeader>
              <CarboCardTitle className="text-sm">
                Volume de Saídas por Data
                {productFilter !== "all" && (
                  <span className="ml-2 text-[11px] font-normal text-muted-foreground">
                    — {getLabel(productFilter)}
                  </span>
                )}
              </CarboCardTitle>
            </CarboCardHeader>
            <CarboCardContent className="pt-0">
              <ResponsiveContainer width="100%" height={250}>
                <AreaChart data={volumeByDate}>
                  <defs>
                    <linearGradient id="colorVolume" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor={productFilter !== "all" ? getColor(productFilter) : "#3BC770"} stopOpacity={0.3} />
                      <stop offset="95%" stopColor={productFilter !== "all" ? getColor(productFilter) : "#3BC770"} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="date" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} />
                  <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} />
                  <Tooltip
                    contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px" }}
                    formatter={(value: number) => [value + " un.", "Volume"]}
                  />
                  <Area
                    type="monotone"
                    dataKey="qty"
                    stroke={productFilter !== "all" ? getColor(productFilter) : "#3BC770"}
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#colorVolume)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </CarboCardContent>
          </CarboCard>
        )}
      </div>
    </div>
  );
}

import React, { useMemo, useState } from "react";
import { CarboCard, CarboCardContent, CarboCardHeader, CarboCardTitle } from "@/components/ui/carbo-card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell, Legend } from "recharts";
import { TrendingUp, DollarSign, Package, ChevronLeft, ChevronRight, Users, Trophy, Target, Star, ShoppingCart } from "lucide-react";
import { format, startOfMonth, endOfMonth, eachWeekOfInterval, startOfWeek, endOfWeek, parseISO, isWithinInterval, getDaysInMonth, differenceInDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { CarbozeOrder, OrderStatus, OrderItem } from "@/hooks/useCarbozeOrders";

interface OrdersAnalyticsProps {
  orders: CarbozeOrder[];
  isLoading?: boolean;
}

const STATUS_COLORS: Record<OrderStatus, string> = {
  pending: "#FBBF24",
  confirmed: "#3B82F6",
  invoiced: "#8B5CF6",
  shipped: "#06B6D4",
  delivered: "#22C55E",
  cancelled: "#EF4444",
};

const STATUS_LABELS: Record<OrderStatus, string> = {
  pending: "Pendente",
  confirmed: "Confirmado",
  invoiced: "Faturado",
  shipped: "Enviado",
  delivered: "Entregue",
  cancelled: "Cancelado",
};

const PRODUCT_FILTERS = [
  { key: "all", label: "Todos" },
  { key: "carboze_100ml", label: "CarboZé 100ml" },
  { key: "carboze_1l", label: "CarboZé 1L" },
  { key: "carbopro", label: "CarboPRO" },
] as const;

type ProductFilter = (typeof PRODUCT_FILTERS)[number]["key"];

function parseItems(order: CarbozeOrder): OrderItem[] {
  return Array.isArray(order.items) ? (order.items as unknown as OrderItem[]) : [];
}

function getLinhaFromOrder(order: CarbozeOrder): string {
  if (order.linha) return order.linha;
  if (order.sku?.code?.includes("1L")) return "carboze_1l";
  if (order.sku?.code?.includes("PRO")) return "carbopro";
  return "carboze_100ml";
}

export function OrdersAnalytics({ orders, isLoading }: OrdersAnalyticsProps) {
  const [monthOffset, setMonthOffset] = useState(0); // 0 = current month, -1 = last month, etc.
  const [showAllMonths, setShowAllMonths] = useState(false);
  const [productFilter, setProductFilter] = useState<ProductFilter>("all");
  const [vendedorFilter, setVendedorFilter] = useState("all");

  // Current month based on offset
  const currentMonth = useMemo(() => {
    const d = new Date();
    d.setMonth(d.getMonth() + monthOffset);
    return d;
  }, [monthOffset]);

  const monthLabel = useMemo(() => {
    if (showAllMonths) return "Todos os meses";
    return format(currentMonth, "MMMM yyyy", { locale: ptBR }).replace(/^\w/, (c) => c.toUpperCase());
  }, [currentMonth, showAllMonths]);

  // Get unique vendedores
  const vendedores = useMemo(() => {
    const names = new Set<string>();
    orders.forEach((o) => { if (o.vendedor_name) names.add(o.vendedor_name); });
    return Array.from(names).sort();
  }, [orders]);

  // Filter orders by month + product + vendedor
  const filteredOrders = useMemo(() => {
    return orders.filter((order) => {
      // Month filter
      if (!showAllMonths) {
        const orderDate = parseISO(order.created_at);
        const start = startOfMonth(currentMonth);
        const end = endOfMonth(currentMonth);
        if (!isWithinInterval(orderDate, { start, end })) return false;
      }
      // Product filter
      if (productFilter !== "all") {
        const linha = getLinhaFromOrder(order);
        if (linha !== productFilter) return false;
      }
      // Vendedor filter
      if (vendedorFilter !== "all") {
        if (order.vendedor_name !== vendedorFilter) return false;
      }
      return true;
    });
  }, [orders, currentMonth, showAllMonths, productFilter, vendedorFilter]);

  // Faturados = delivered or invoiced (not cancelled, not pending)
  const faturados = useMemo(() => {
    return filteredOrders.filter((o) => o.status === "delivered" || o.status === "invoiced" || o.status === "shipped");
  }, [filteredOrders]);

  // KPI calculations
  const metrics = useMemo(() => {
    const fatBruto = faturados.reduce((sum, o) => sum + Number(o.total || 0), 0);
    const totalDescontos = faturados.reduce((sum, o) => sum + Number(o.discount || 0), 0);
    const fatLiquido = fatBruto - totalDescontos;
    const pedidosFaturados = faturados.length;
    const ticketMedio = pedidosFaturados > 0 ? fatBruto / pedidosFaturados : 0;
    const clientesUnicos = new Set(faturados.map((o) => o.customer_name)).size;

    return { fatBruto, fatLiquido, pedidosFaturados, ticketMedio, clientesUnicos, totalDescontos };
  }, [faturados]);

  // Product units breakdown
  const productUnits = useMemo(() => {
    const result = { carboze_100ml: 0, carboze_1l: 0, carbopro: 0, total: 0 };
    for (const order of faturados) {
      const linha = getLinhaFromOrder(order);
      const items = parseItems(order);
      const qty = items.reduce((sum, item) => sum + (item.quantity || 0), 0);
      if (linha === "carboze_100ml") result.carboze_100ml += qty;
      else if (linha === "carboze_1l") result.carboze_1l += qty;
      else if (linha === "carbopro") result.carbopro += qty;
      result.total += qty;
    }
    return result;
  }, [faturados]);

  // Product analysis cards
  const productAnalysis = useMemo(() => {
    const lines = ["carboze_100ml", "carboze_1l", "carbopro"] as const;
    return lines.map((linha) => {
      const lineOrders = faturados.filter((o) => getLinhaFromOrder(o) === linha);
      const units = lineOrders.reduce((sum, o) => {
        const items = parseItems(o);
        return sum + items.reduce((s, i) => s + (i.quantity || 0), 0);
      }, 0);
      const bruto = lineOrders.reduce((sum, o) => sum + Number(o.total || 0), 0);
      const descontos = lineOrders.reduce((sum, o) => sum + Number(o.discount || 0), 0);
      const liquido = bruto - descontos;
      const precoMedio = units > 0 ? bruto / units : 0;

      const labels: Record<string, string> = {
        carboze_100ml: "CARBOZÉ ESTABILIZADOR 100ML",
        carboze_1l: "CARBOZÉ ESTABILIZADOR 1L",
        carbopro: "CARBOPRO",
      };

      return {
        key: linha,
        label: labels[linha],
        units,
        bruto,
        liquido,
        descontos,
        precoMedio,
        pedidos: lineOrders.length,
      };
    });
  }, [faturados]);

  // Vendedor ranking
  const vendedorRanking = useMemo(() => {
    const map = new Map<string, { name: string; count: number; revenue: number; delivered: number; units: number }>();
    for (const o of faturados) {
      const name = o.vendedor_name || "Sem vendedor";
      const entry = map.get(name) || { name, count: 0, revenue: 0, delivered: 0, units: 0 };
      entry.count += 1;
      entry.revenue += Number(o.total || 0);
      if (o.status === "delivered") entry.delivered += 1;
      const items = parseItems(o);
      entry.units += items.reduce((s, i) => s + (i.quantity || 0), 0);
      map.set(name, entry);
    }
    return Array.from(map.values()).sort((a, b) => b.revenue - a.revenue);
  }, [faturados]);

  // Top clients
  const topClients = useMemo(() => {
    const map = new Map<string, number>();
    for (const o of faturados) {
      const name = o.customer_name;
      map.set(name, (map.get(name) || 0) + Number(o.total || 0));
    }
    return Array.from(map.entries())
      .map(([name, revenue]) => ({ name: name.length > 25 ? name.slice(0, 22) + "..." : name, revenue }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10);
  }, [faturados]);

  // Ticket medio per client
  const ticketPerClient = useMemo(() => {
    const map = new Map<string, { total: number; count: number }>();
    for (const o of faturados) {
      const name = o.customer_name;
      const entry = map.get(name) || { total: 0, count: 0 };
      entry.total += Number(o.total || 0);
      entry.count += 1;
      map.set(name, entry);
    }
    return Array.from(map.entries())
      .map(([name, { total, count }]) => ({
        name: name.length > 25 ? name.slice(0, 22) + "..." : name,
        ticket: count > 0 ? total / count : 0,
      }))
      .sort((a, b) => b.ticket - a.ticket)
      .slice(0, 10);
  }, [faturados]);

  // Weekly revenue trend
  const weeklyTrend = useMemo(() => {
    if (showAllMonths) return [];
    const start = startOfMonth(currentMonth);
    const end = endOfMonth(currentMonth);
    const weeks = eachWeekOfInterval({ start, end }, { weekStartsOn: 0 });
    return weeks.map((weekStart, i) => {
      const wStart = i === 0 ? start : startOfWeek(weekStart);
      const wEnd = i === weeks.length - 1 ? end : endOfWeek(weekStart);
      const weekOrders = faturados.filter((o) => {
        const d = parseISO(o.created_at);
        return isWithinInterval(d, { start: wStart, end: wEnd });
      });
      const revenue = weekOrders.reduce((sum, o) => sum + Number(o.total || 0), 0);
      return { name: `Sem ${i + 1}`, faturamento: revenue, pedidos: weekOrders.length };
    });
  }, [faturados, currentMonth, showAllMonths]);

  // Status distribution
  const statusDistribution = useMemo(() => {
    return Object.entries(STATUS_LABELS)
      .map(([status, label]) => ({
        name: label,
        value: filteredOrders.filter((o) => o.status === status).length,
        color: STATUS_COLORS[status as OrderStatus],
      }))
      .filter((d) => d.value > 0);
  }, [filteredOrders]);

  // Volume 100ml by date
  const volume100ml = useMemo(() => {
    const dateMap = new Map<string, number>();
    for (const o of faturados) {
      if (getLinhaFromOrder(o) !== "carboze_100ml") continue;
      const dateKey = format(parseISO(o.created_at), "dd/MM");
      const items = parseItems(o);
      const qty = items.reduce((s, i) => s + (i.quantity || 0), 0);
      dateMap.set(dateKey, (dateMap.get(dateKey) || 0) + qty);
    }
    return Array.from(dateMap.entries())
      .map(([date, qty]) => ({ date, qty }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [faturados]);

  // Month projection
  const projection = useMemo(() => {
    if (showAllMonths) return null;
    const now = new Date();
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(currentMonth);
    const totalDays = getDaysInMonth(currentMonth);
    const elapsedDays = Math.max(1, differenceInDays(now > monthEnd ? monthEnd : now, monthStart) + 1);
    const dailyRate = metrics.fatBruto / elapsedDays;
    return {
      projFat: dailyRate * totalDays,
      projPedidos: Math.round((metrics.pedidosFaturados / elapsedDays) * totalDays),
    };
  }, [metrics, currentMonth, showAllMonths]);

  const fmt = (value: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(value);

  const fmtFull = (value: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);

  const fmtNum = (value: number) =>
    new Intl.NumberFormat("pt-BR").format(value);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 bg-muted animate-pulse rounded" />
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          {[1, 2, 3, 4, 5].map((i) => (<div key={i} className="h-24 bg-muted animate-pulse rounded-xl" />))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ===== HEADER: Period + Filters ===== */}
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-carbo-green" />
            Análise de Pedidos
          </h3>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => { setShowAllMonths(false); setMonthOffset((p) => p - 1); }}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant={showAllMonths ? "default" : "outline"}
              size="sm"
              className="min-w-[160px]"
              onClick={() => setShowAllMonths(!showAllMonths)}
            >
              {monthLabel}
            </Button>
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => { setShowAllMonths(false); setMonthOffset((p) => Math.min(0, p + 1)); }} disabled={monthOffset >= 0 && !showAllMonths}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Product + Vendedor filters */}
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-xs font-medium text-muted-foreground uppercase">Produto:</span>
          {PRODUCT_FILTERS.map((f) => (
            <Button
              key={f.key}
              variant={productFilter === f.key ? "default" : "outline"}
              size="sm"
              className="h-7 text-xs"
              onClick={() => setProductFilter(f.key)}
            >
              {f.label}
            </Button>
          ))}
          <div className="w-px h-6 bg-border mx-1" />
          <span className="text-xs font-medium text-muted-foreground uppercase">Vendedor:</span>
          <Select value={vendedorFilter} onValueChange={setVendedorFilter}>
            <SelectTrigger className="w-48 h-7 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os vendedores</SelectItem>
              {vendedores.map((v) => (<SelectItem key={v} value={v}>{v}</SelectItem>))}
            </SelectContent>
          </Select>
          <span className="ml-auto text-sm text-muted-foreground">
            Mostrando <strong>{filteredOrders.length}</strong> pedidos
          </span>
        </div>
      </div>

      {/* ===== KPI CARDS (5) ===== */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <CarboCard className="bg-gradient-to-br from-carbo-green/10 to-transparent">
          <CarboCardContent className="p-4">
            <p className="text-[10px] font-semibold uppercase text-muted-foreground tracking-wider">Faturamento Bruto</p>
            <p className="text-xl font-bold mt-1 text-carbo-green kpi-number">{fmt(metrics.fatBruto)}</p>
            <p className="text-[10px] text-muted-foreground">{metrics.pedidosFaturados} pedidos faturados</p>
          </CarboCardContent>
        </CarboCard>

        <CarboCard className="bg-gradient-to-br from-emerald-500/10 to-transparent">
          <CarboCardContent className="p-4">
            <p className="text-[10px] font-semibold uppercase text-muted-foreground tracking-wider">Faturamento Líquido</p>
            <p className="text-xl font-bold mt-1 text-emerald-500 kpi-number">{fmt(metrics.fatLiquido)}</p>
            <p className="text-[10px] text-muted-foreground">{metrics.pedidosFaturados} pedidos faturados</p>
          </CarboCardContent>
        </CarboCard>

        <CarboCard className="bg-gradient-to-br from-blue-500/10 to-transparent">
          <CarboCardContent className="p-4">
            <p className="text-[10px] font-semibold uppercase text-muted-foreground tracking-wider">Pedidos Faturados</p>
            <p className="text-xl font-bold mt-1 text-blue-500 kpi-number">{metrics.pedidosFaturados}</p>
            <p className="text-[10px] text-muted-foreground">sem ocorrências</p>
          </CarboCardContent>
        </CarboCard>

        <CarboCard>
          <CarboCardContent className="p-4">
            <p className="text-[10px] font-semibold uppercase text-muted-foreground tracking-wider">Ticket Médio</p>
            <p className="text-xl font-bold mt-1 kpi-number">{fmt(metrics.ticketMedio)}</p>
            <p className="text-[10px] text-muted-foreground">base: {metrics.pedidosFaturados} faturados</p>
          </CarboCardContent>
        </CarboCard>

        <CarboCard>
          <CarboCardContent className="p-4">
            <p className="text-[10px] font-semibold uppercase text-muted-foreground tracking-wider">Clientes Únicos</p>
            <p className="text-xl font-bold mt-1 kpi-number">{metrics.clientesUnicos}</p>
            <p className="text-[10px] text-muted-foreground">clientes atendidos</p>
          </CarboCardContent>
        </CarboCard>
      </div>

      {/* ===== PRODUCT UNITS STRIP ===== */}
      <div className="flex flex-wrap items-center gap-6 px-4 py-3 bg-muted/50 rounded-xl text-sm">
        <span className="font-semibold text-xs uppercase text-muted-foreground">Carbozé 100ml</span>
        <span className="font-bold text-carbo-green">{fmtNum(productUnits.carboze_100ml)} un</span>
        <span className="font-semibold text-xs uppercase text-muted-foreground">Carbozé 1L</span>
        <span className="font-bold text-carbo-green">{fmtNum(productUnits.carboze_1l)} un</span>
        <span className="font-semibold text-xs uppercase text-muted-foreground">CarboPRO</span>
        <span className="font-bold">{productUnits.carbopro > 0 ? fmtNum(productUnits.carbopro) + " un" : "—"}</span>
        <span className="font-semibold text-xs uppercase text-muted-foreground">Total Saídas (vendas)</span>
        <span className="font-bold text-carbo-green">{fmtNum(productUnits.total)} un</span>
      </div>

      {/* ===== METAS DO MÊS ===== */}
      {!showAllMonths && projection && (
        <CarboCard className="border-carbo-green/30">
          <CarboCardContent className="p-4">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-semibold flex items-center gap-2">
                <Target className="h-4 w-4 text-carbo-green" />
                Metas do Mês
              </h4>
            </div>
            <div className="space-y-3">
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="font-medium">Faturamento (Pedidos Faturados)</span>
                  <span className="font-bold">{fmt(metrics.fatBruto)}</span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div className="h-full bg-carbo-green rounded-full" style={{ width: "100%" }} />
                </div>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  Projeção fim de mês: {fmt(projection.projFat)}
                </p>
              </div>
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="font-medium">Pedidos Faturados</span>
                  <span className="font-bold">{metrics.pedidosFaturados} pedidos</span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div className="h-full bg-blue-500 rounded-full" style={{ width: "100%" }} />
                </div>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  Projeção fim de mês: {projection.projPedidos} pedidos
                </p>
              </div>
            </div>
          </CarboCardContent>
        </CarboCard>
      )}

      {/* ===== DESTAQUE DO MÊS + RANKING VENDEDORES ===== */}
      {vendedorRanking.length > 0 && vendedorRanking[0].name !== "Sem vendedor" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Destaque */}
          <CarboCard className="border-yellow-400/30 bg-gradient-to-br from-yellow-50/50 to-transparent dark:from-yellow-900/10">
            <CarboCardContent className="p-4">
              <div className="flex items-center gap-2 mb-3">
                <Star className="h-4 w-4 text-yellow-500" />
                <span className="text-xs font-bold uppercase text-yellow-600 dark:text-yellow-400">Destaque do Mês</span>
              </div>
              <p className="text-lg font-bold">{vendedorRanking[0].name}</p>
              <p className="text-xs text-muted-foreground mb-3">Maior faturamento líquido (pedidos faturados)</p>
              <div className="grid grid-cols-4 gap-2 text-center">
                <div>
                  <p className="text-xs text-muted-foreground uppercase">Un. Fat.</p>
                  <p className="font-bold text-sm">{vendedorRanking[0].units}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase">Fat. Bruto</p>
                  <p className="font-bold text-sm">{fmt(vendedorRanking[0].revenue)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase">Fat. Líquido</p>
                  <p className="font-bold text-sm text-carbo-green">{fmt(vendedorRanking[0].revenue)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase">Pedidos Fat.</p>
                  <p className="font-bold text-sm">{vendedorRanking[0].count}</p>
                </div>
              </div>
            </CarboCardContent>
          </CarboCard>

          {/* Ranking */}
          <CarboCard>
            <CarboCardHeader className="pb-2">
              <CarboCardTitle className="text-sm flex items-center gap-2">
                <Trophy className="h-4 w-4 text-carbo-green" />
                Ranking — Faturamento Líquido por Vendedor
              </CarboCardTitle>
            </CarboCardHeader>
            <CarboCardContent className="pt-0">
              <div className="space-y-2">
                {vendedorRanking.map((v, i) => (
                  <div key={v.name} className="flex items-center gap-3 text-sm">
                    <span className="w-6 text-center font-bold text-xs">
                      {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}º`}
                    </span>
                    <span className="flex-1 truncate">{v.name}</span>
                    <span className="font-bold text-xs kpi-number">{fmt(v.revenue)}</span>
                  </div>
                ))}
              </div>
            </CarboCardContent>
          </CarboCard>
        </div>
      )}

      {/* ===== ANÁLISE POR PRODUTO (3 cards) ===== */}
      <div>
        <h4 className="text-sm font-semibold uppercase text-muted-foreground mb-3 tracking-wider">Análise por Produto</h4>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {productAnalysis.map((p) => (
            <CarboCard key={p.key}>
              <CarboCardContent className="p-4">
                <p className="text-xs font-bold uppercase text-carbo-green mb-3">{p.label}</p>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Unidades Saidas</span>
                    <span className="font-bold">{fmtNum(p.units)} un.</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Faturamento Bruto</span>
                    <span className="font-bold">{fmt(p.bruto)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Faturamento Liquido</span>
                    <span className="font-bold text-carbo-green">{fmt(p.liquido)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Deduções</span>
                    <span className="font-bold text-destructive">{fmt(p.descontos)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Preço Médio / un.</span>
                    <span className="font-bold">{p.units > 0 ? fmtFull(p.precoMedio) + "/un." : "—"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Pedidos</span>
                    <span className="font-bold">{p.pedidos} pedidos</span>
                  </div>
                </div>
              </CarboCardContent>
            </CarboCard>
          ))}
        </div>
      </div>

      {/* ===== CHARTS GRID ===== */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Weekly Revenue Evolution */}
        {weeklyTrend.length > 0 && (
          <CarboCard>
            <CarboCardHeader>
              <CarboCardTitle className="text-sm">Evolução Semanal de Faturamento</CarboCardTitle>
            </CarboCardHeader>
            <CarboCardContent className="pt-0">
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={weeklyTrend}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="name" className="text-xs" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} />
                  <YAxis className="text-xs" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} tickFormatter={(v) => fmt(v)} />
                  <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px" }} formatter={(value: number) => [fmt(value), "Faturamento"]} />
                  <Bar dataKey="faturamento" fill="#3BC770" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CarboCardContent>
          </CarboCard>
        )}

        {/* Revenue by Product Line (Donut) */}
        <CarboCard>
          <CarboCardHeader>
            <CarboCardTitle className="text-sm">Faturamento por Linha de Produto</CarboCardTitle>
          </CarboCardHeader>
          <CarboCardContent className="pt-0">
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie
                  data={productAnalysis.filter((p) => p.bruto > 0).map((p) => ({ name: p.label, value: p.bruto }))}
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={85}
                  paddingAngle={3}
                  dataKey="value"
                >
                  {productAnalysis.filter((p) => p.bruto > 0).map((_, i) => (
                    <Cell key={i} fill={["#3BC770", "#4FA4E8", "#FBBF24"][i]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px" }} formatter={(value: number) => [fmt(value), "Faturamento"]} />
                <Legend verticalAlign="bottom" height={36} formatter={(value) => <span className="text-xs text-muted-foreground">{value}</span>} />
              </PieChart>
            </ResponsiveContainer>
          </CarboCardContent>
        </CarboCard>

        {/* Status Distribution */}
        <CarboCard>
          <CarboCardHeader>
            <CarboCardTitle className="text-sm">Distribuição por Status</CarboCardTitle>
          </CarboCardHeader>
          <CarboCardContent className="pt-0">
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie data={statusDistribution} cx="50%" cy="50%" innerRadius={55} outerRadius={85} paddingAngle={2} dataKey="value">
                  {statusDistribution.map((entry, index) => (<Cell key={index} fill={entry.color} />))}
                </Pie>
                <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px" }} />
                <Legend verticalAlign="bottom" height={36} formatter={(value) => <span className="text-xs text-muted-foreground">{value}</span>} />
              </PieChart>
            </ResponsiveContainer>
          </CarboCardContent>
        </CarboCard>

        {/* Fat líquido por vendedor */}
        {vendedorRanking.length > 0 && vendedorRanking[0].name !== "Sem vendedor" && (
          <CarboCard>
            <CarboCardHeader>
              <CarboCardTitle className="text-sm">Faturamento Líquido por Vendedor</CarboCardTitle>
            </CarboCardHeader>
            <CarboCardContent className="pt-0">
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={vendedorRanking.slice(0, 8)} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis type="number" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} tickFormatter={(v) => fmt(v)} />
                  <YAxis type="category" dataKey="name" width={100} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} />
                  <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px" }} formatter={(value: number) => [fmt(value), "Fat. Líquido"]} />
                  <Bar dataKey="revenue" fill="#3BC770" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CarboCardContent>
          </CarboCard>
        )}

        {/* Top 10 Clients */}
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
                  <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px" }} formatter={(value: number) => [fmt(value), "Receita"]} />
                  <Bar dataKey="revenue" fill="#4FA4E8" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CarboCardContent>
          </CarboCard>
        )}

        {/* Ticket medio per client */}
        {ticketPerClient.length > 0 && (
          <CarboCard>
            <CarboCardHeader>
              <CarboCardTitle className="text-sm">Ticket Médio por Cliente (Faturados)</CarboCardTitle>
            </CarboCardHeader>
            <CarboCardContent className="pt-0">
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={ticketPerClient} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis type="number" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} tickFormatter={(v) => fmt(v)} />
                  <YAxis type="category" dataKey="name" width={120} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} />
                  <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px" }} formatter={(value: number) => [fmt(value), "Ticket"]} />
                  <Bar dataKey="ticket" fill="#8B5CF6" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CarboCardContent>
          </CarboCard>
        )}

        {/* Volume 100ml by date */}
        {volume100ml.length > 0 && (
          <CarboCard className="lg:col-span-2">
            <CarboCardHeader>
              <CarboCardTitle className="text-sm">Volume de Saídas — CarboZé 100ml (por Data)</CarboCardTitle>
            </CarboCardHeader>
            <CarboCardContent className="pt-0">
              <ResponsiveContainer width="100%" height={250}>
                <AreaChart data={volume100ml}>
                  <defs>
                    <linearGradient id="colorVol100" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3BC770" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#3BC770" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="date" className="text-xs" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} />
                  <YAxis className="text-xs" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} />
                  <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px" }} formatter={(value: number) => [value + " un.", "Volume"]} />
                  <Area type="monotone" dataKey="qty" stroke="#3BC770" strokeWidth={2} fillOpacity={1} fill="url(#colorVol100)" />
                </AreaChart>
              </ResponsiveContainer>
            </CarboCardContent>
          </CarboCard>
        )}
      </div>
    </div>
  );
}

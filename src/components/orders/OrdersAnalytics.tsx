import React, { useMemo, useState } from "react";
import { CarboCard, CarboCardContent, CarboCardHeader, CarboCardTitle } from "@/components/ui/carbo-card";
import { CarboButton } from "@/components/ui/carbo-button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell, Legend } from "recharts";
import { TrendingUp, DollarSign, Package, Calendar, ChevronUp, ChevronDown, Users, Trophy } from "lucide-react";
import { format, subMonths, startOfMonth, endOfMonth, eachMonthOfInterval, eachWeekOfInterval, subWeeks, startOfWeek, endOfWeek, parseISO, isWithinInterval } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { CarbozeOrder, OrderStatus } from "@/hooks/useCarbozeOrders";

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

type PeriodFilter = "7d" | "30d" | "3m" | "6m" | "12m";

export function OrdersAnalytics({ orders, isLoading }: OrdersAnalyticsProps) {
  const [period, setPeriod] = useState<PeriodFilter>("30d");

  // Filter orders by selected period
  const filteredOrders = useMemo(() => {
    const now = new Date();
    let startDate: Date;

    switch (period) {
      case "7d":
        startDate = subWeeks(now, 1);
        break;
      case "30d":
        startDate = subMonths(now, 1);
        break;
      case "3m":
        startDate = subMonths(now, 3);
        break;
      case "6m":
        startDate = subMonths(now, 6);
        break;
      case "12m":
        startDate = subMonths(now, 12);
        break;
      default:
        startDate = subMonths(now, 1);
    }

    return orders.filter((order) => {
      const orderDate = parseISO(order.created_at);
      return isWithinInterval(orderDate, { start: startDate, end: now });
    });
  }, [orders, period]);

  // Calculate trend data for chart
  const trendData = useMemo(() => {
    const now = new Date();
    let intervals: Date[];
    let formatStr: string;

    if (period === "7d") {
      intervals = eachWeekOfInterval({ start: subWeeks(now, 1), end: now }, { weekStartsOn: 0 });
      formatStr = "dd/MM";
    } else if (period === "30d") {
      intervals = eachWeekOfInterval({ start: subMonths(now, 1), end: now }, { weekStartsOn: 0 });
      formatStr = "dd/MM";
    } else {
      const monthsBack = period === "3m" ? 3 : period === "6m" ? 6 : 12;
      intervals = eachMonthOfInterval({ start: subMonths(now, monthsBack), end: now });
      formatStr = "MMM";
    }

    return intervals.map((date) => {
      const start = period === "7d" || period === "30d" ? startOfWeek(date) : startOfMonth(date);
      const end = period === "7d" || period === "30d" ? endOfWeek(date) : endOfMonth(date);

      const periodOrders = filteredOrders.filter((order) => {
        const orderDate = parseISO(order.created_at);
        return isWithinInterval(orderDate, { start, end });
      });

      const revenue = periodOrders
        .filter((o) => o.status === "delivered")
        .reduce((sum, o) => sum + Number(o.total || 0), 0);

      return {
        name: format(date, formatStr, { locale: ptBR }),
        pedidos: periodOrders.length,
        faturamento: revenue,
        entregues: periodOrders.filter((o) => o.status === "delivered").length,
        cancelados: periodOrders.filter((o) => o.status === "cancelled").length,
      };
    });
  }, [filteredOrders, period]);

  // Calculate status distribution for pie chart
  const statusDistribution = useMemo(() => {
    const distribution = Object.entries(STATUS_LABELS).map(([status, label]) => ({
      name: label,
      value: filteredOrders.filter((o) => o.status === status).length,
      color: STATUS_COLORS[status as OrderStatus],
    }));
    return distribution.filter((d) => d.value > 0);
  }, [filteredOrders]);

  // Calculate summary metrics
  const metrics = useMemo(() => {
    const totalOrders = filteredOrders.length;
    const deliveredOrders = filteredOrders.filter((o) => o.status === "delivered");
    const totalRevenue = deliveredOrders.reduce((sum, o) => sum + Number(o.total || 0), 0);
    const avgOrderValue = deliveredOrders.length > 0 ? totalRevenue / deliveredOrders.length : 0;
    const conversionRate = totalOrders > 0 ? (deliveredOrders.length / totalOrders) * 100 : 0;

    // Compare with previous period
    const previousPeriodOrders = orders.filter((order) => {
      const now = new Date();
      const orderDate = parseISO(order.created_at);
      let periodStart: Date, periodEnd: Date;

      switch (period) {
        case "7d":
          periodStart = subWeeks(now, 2);
          periodEnd = subWeeks(now, 1);
          break;
        case "30d":
          periodStart = subMonths(now, 2);
          periodEnd = subMonths(now, 1);
          break;
        case "3m":
          periodStart = subMonths(now, 6);
          periodEnd = subMonths(now, 3);
          break;
        case "6m":
          periodStart = subMonths(now, 12);
          periodEnd = subMonths(now, 6);
          break;
        case "12m":
          periodStart = subMonths(now, 24);
          periodEnd = subMonths(now, 12);
          break;
        default:
          periodStart = subMonths(now, 2);
          periodEnd = subMonths(now, 1);
      }

      return isWithinInterval(orderDate, { start: periodStart, end: periodEnd });
    });

    const prevRevenue = previousPeriodOrders
      .filter((o) => o.status === "delivered")
      .reduce((sum, o) => sum + Number(o.total || 0), 0);

    const revenueChange = prevRevenue > 0 ? ((totalRevenue - prevRevenue) / prevRevenue) * 100 : 0;
    const ordersChange = previousPeriodOrders.length > 0
      ? ((totalOrders - previousPeriodOrders.length) / previousPeriodOrders.length) * 100
      : 0;

    return {
      totalOrders,
      totalRevenue,
      avgOrderValue,
      conversionRate,
      revenueChange,
      ordersChange,
    };
  }, [filteredOrders, orders, period]);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
      notation: "compact",
    }).format(value);
  };

  const TrendIndicator = ({ value }: { value: number }) => {
    if (value === 0) return null;
    const isPositive = value > 0;
    return (
      <span className={`flex items-center text-xs font-medium ${isPositive ? "text-success" : "text-destructive"}`}>
        {isPositive ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        {Math.abs(value).toFixed(1)}%
      </span>
    );
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 bg-muted animate-pulse rounded" />
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-24 bg-muted animate-pulse rounded-xl" />
          ))}
        </div>
        <div className="h-80 bg-muted animate-pulse rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Period Selector */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-carbo-green" />
          Análise de Pedidos
        </h3>
        <Select value={period} onValueChange={(v) => setPeriod(v as PeriodFilter)}>
          <SelectTrigger className="w-40 h-9 rounded-lg">
            <Calendar className="h-4 w-4 mr-2" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7d">Últimos 7 dias</SelectItem>
            <SelectItem value="30d">Últimos 30 dias</SelectItem>
            <SelectItem value="3m">Últimos 3 meses</SelectItem>
            <SelectItem value="6m">Últimos 6 meses</SelectItem>
            <SelectItem value="12m">Último ano</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <CarboCard className="bg-gradient-to-br from-carbo-green/10 to-transparent">
          <CarboCardContent className="p-4">
            <div className="flex items-center justify-between">
              <Package className="h-8 w-8 text-carbo-green/50" />
              <TrendIndicator value={metrics.ordersChange} />
            </div>
            <p className="text-2xl font-bold mt-2 kpi-number">{metrics.totalOrders}</p>
            <p className="text-xs text-muted-foreground">Pedidos no período</p>
          </CarboCardContent>
        </CarboCard>

        <CarboCard className="bg-gradient-to-br from-carbo-blue/10 to-transparent">
          <CarboCardContent className="p-4">
            <div className="flex items-center justify-between">
              <DollarSign className="h-8 w-8 text-carbo-blue/50" />
              <TrendIndicator value={metrics.revenueChange} />
            </div>
            <p className="text-2xl font-bold mt-2 kpi-number">{formatCurrency(metrics.totalRevenue)}</p>
            <p className="text-xs text-muted-foreground">Faturamento</p>
          </CarboCardContent>
        </CarboCard>

        <CarboCard>
          <CarboCardContent className="p-4">
            <p className="text-2xl font-bold kpi-number">{formatCurrency(metrics.avgOrderValue)}</p>
            <p className="text-xs text-muted-foreground">Ticket médio</p>
          </CarboCardContent>
        </CarboCard>

        <CarboCard>
          <CarboCardContent className="p-4">
            <p className="text-2xl font-bold kpi-number">{metrics.conversionRate.toFixed(1)}%</p>
            <p className="text-xs text-muted-foreground">Taxa de entrega</p>
          </CarboCardContent>
        </CarboCard>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Revenue Trend */}
        <CarboCard className="lg:col-span-2">
          <CarboCardHeader>
            <CarboCardTitle className="text-base">Evolução de Faturamento</CarboCardTitle>
          </CarboCardHeader>
          <CarboCardContent className="pt-0">
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={trendData}>
                <defs>
                  <linearGradient id="colorFaturamento" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3BC770" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#3BC770" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="name" className="text-xs" tick={{ fill: "hsl(var(--muted-foreground))" }} />
                <YAxis className="text-xs" tick={{ fill: "hsl(var(--muted-foreground))" }} tickFormatter={(v) => formatCurrency(v)} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px",
                  }}
                  formatter={(value: number) => [formatCurrency(value), "Faturamento"]}
                />
                <Area
                  type="monotone"
                  dataKey="faturamento"
                  stroke="#3BC770"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#colorFaturamento)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </CarboCardContent>
        </CarboCard>

        {/* Status Distribution */}
        <CarboCard>
          <CarboCardHeader>
            <CarboCardTitle className="text-base">Distribuição por Status</CarboCardTitle>
          </CarboCardHeader>
          <CarboCardContent className="pt-0">
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie
                  data={statusDistribution}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={90}
                  paddingAngle={2}
                  dataKey="value"
                >
                  {statusDistribution.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px",
                  }}
                />
                <Legend
                  verticalAlign="bottom"
                  height={36}
                  formatter={(value) => <span className="text-xs text-muted-foreground">{value}</span>}
                />
              </PieChart>
            </ResponsiveContainer>
          </CarboCardContent>
        </CarboCard>
      </div>

      {/* Orders Volume Trend */}
      <CarboCard>
        <CarboCardHeader>
          <CarboCardTitle className="text-base">Volume de Pedidos</CarboCardTitle>
        </CarboCardHeader>
        <CarboCardContent className="pt-0">
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={trendData}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis dataKey="name" className="text-xs" tick={{ fill: "hsl(var(--muted-foreground))" }} />
              <YAxis className="text-xs" tick={{ fill: "hsl(var(--muted-foreground))" }} />
              <Tooltip
                contentStyle={{
                  backgroundColor: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "8px",
                }}
              />
              <Bar dataKey="pedidos" fill="#4FA4E8" radius={[4, 4, 0, 0]} name="Total" />
              <Bar dataKey="entregues" fill="#3BC770" radius={[4, 4, 0, 0]} name="Entregues" />
              <Bar dataKey="cancelados" fill="#EF4444" radius={[4, 4, 0, 0]} name="Cancelados" />
            </BarChart>
          </ResponsiveContainer>
        </CarboCardContent>
      </CarboCard>

      {/* Vendedor Ranking */}
      <VendedorRanking orders={filteredOrders} formatCurrency={formatCurrency} />
    </div>
  );
}

// ---- Vendedor Ranking Sub-component ----

const MEDAL_COLORS = ["text-yellow-500", "text-gray-400", "text-amber-600"];

function VendedorRanking({ orders, formatCurrency }: { orders: CarbozeOrder[]; formatCurrency: (v: number) => string }) {
  const ranking = useMemo(() => {
    const map = new Map<string, { name: string; count: number; revenue: number; delivered: number }>();

    for (const o of orders) {
      const name = o.vendedor_name || "Sem vendedor";
      const entry = map.get(name) || { name, count: 0, revenue: 0, delivered: 0 };
      entry.count += 1;
      if (o.status === "delivered") {
        entry.revenue += Number(o.total || 0);
        entry.delivered += 1;
      }
      map.set(name, entry);
    }

    return Array.from(map.values()).sort((a, b) => b.revenue - a.revenue);
  }, [orders]);

  if (ranking.length <= 1 && ranking[0]?.name === "Sem vendedor") return null;

  const maxRevenue = ranking[0]?.revenue || 1;

  return (
    <CarboCard>
      <CarboCardHeader>
        <CarboCardTitle className="text-base flex items-center gap-2">
          <Users className="h-5 w-5 text-carbo-green" />
          Ranking de Vendedores
        </CarboCardTitle>
      </CarboCardHeader>
      <CarboCardContent className="pt-0">
        <div className="space-y-3">
          {ranking.map((v, i) => (
            <div key={v.name} className="flex items-center gap-4">
              <div className="w-8 text-center">
                {i < 3 ? (
                  <Trophy className={`h-5 w-5 mx-auto ${MEDAL_COLORS[i]}`} />
                ) : (
                  <span className="text-sm text-muted-foreground font-medium">{i + 1}º</span>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-medium text-sm truncate">{v.name}</span>
                  <span className="text-sm font-bold kpi-number ml-2">{formatCurrency(v.revenue)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-carbo-green rounded-full transition-all"
                      style={{ width: `${(v.revenue / maxRevenue) * 100}%` }}
                    />
                  </div>
                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                    {v.count} pedidos · {v.delivered} entregues
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </CarboCardContent>
    </CarboCard>
  );
}

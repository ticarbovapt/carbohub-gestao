import React from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
} from "recharts";
import { CarboCard, CarboCardContent, CarboCardHeader, CarboCardTitle } from "@/components/ui/carbo-card";
import { CarboSkeleton } from "@/components/ui/CarboSkeleton";
import { TrendingUp, TrendingDown, BarChart3, Minus } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format, subMonths } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";

interface LicenseePerformanceChartsProps {
  licenseeId: string;
}

interface TrendIndicatorProps {
  current: number;
  previous: number;
  label: string;
  format?: "currency" | "number";
}

function TrendIndicator({ current, previous, label, format: formatType = "number" }: TrendIndicatorProps) {
  const diff = current - previous;
  const percentChange = previous > 0 ? ((diff / previous) * 100) : (current > 0 ? 100 : 0);
  const isPositive = diff > 0;
  const isNeutral = diff === 0;

  const formatValue = (value: number) => {
    if (formatType === "currency") {
      return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(value);
    }
    return value.toString();
  };

  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="text-muted-foreground">{label}:</span>
      <span className="font-medium">{formatValue(current)}</span>
      {!isNeutral && (
        <div className={cn(
          "flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-semibold",
          isPositive ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"
        )}>
          {isPositive ? (
            <TrendingUp className="h-3 w-3" />
          ) : (
            <TrendingDown className="h-3 w-3" />
          )}
          <span>{isPositive ? "+" : ""}{percentChange.toFixed(0)}%</span>
        </div>
      )}
      {isNeutral && (
        <div className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-muted text-muted-foreground">
          <Minus className="h-3 w-3" />
          <span>0%</span>
        </div>
      )}
    </div>
  );
}

export function LicenseePerformanceCharts({ licenseeId }: LicenseePerformanceChartsProps) {
  // Fetch orders for this licensee to build charts
  const { data: ordersData, isLoading: ordersLoading } = useQuery({
    queryKey: ["licensee-orders-timeline", licenseeId],
    queryFn: async () => {
      const sixMonthsAgo = subMonths(new Date(), 6);
      const { data, error } = await supabase
        .from("carboze_orders_secure")
        .select("created_at, total, status")
        .eq("licensee_id", licenseeId)
        .gte("created_at", sixMonthsAgo.toISOString())
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data;
    },
    enabled: !!licenseeId,
  });

  // Fetch machines data for credits evolution
  const { data: machinesData, isLoading: machinesLoading } = useQuery({
    queryKey: ["licensee-machines-timeline", licenseeId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("machines")
        .select("id, created_at, total_credits_generated, total_units_dispensed")
        .eq("licensee_id", licenseeId);
      if (error) throw error;
      return data;
    },
    enabled: !!licenseeId,
  });

  // Process orders data for timeline chart
  const ordersTimeline = React.useMemo(() => {
    if (!ordersData) return [];
    
    const months: Record<string, { month: string; label: string; orders: number; revenue: number }> = {};
    
    // Generate last 6 months
    for (let i = 5; i >= 0; i--) {
      const date = subMonths(new Date(), i);
      const key = format(date, "yyyy-MM");
      months[key] = {
        month: key,
        label: format(date, "MMM/yy", { locale: ptBR }),
        orders: 0,
        revenue: 0,
      };
    }

    // Aggregate orders by month
    ordersData.forEach((order) => {
      const key = format(new Date(order.created_at), "yyyy-MM");
      if (months[key]) {
        months[key].orders += 1;
        months[key].revenue += Number(order.total) || 0;
      }
    });

    return Object.values(months);
  }, [ordersData]);

  // Calculate trend indicators (current month vs previous month)
  const trendData = React.useMemo(() => {
    if (ordersTimeline.length < 2) {
      return {
        currentMonthRevenue: 0,
        previousMonthRevenue: 0,
        currentMonthOrders: 0,
        previousMonthOrders: 0,
      };
    }
    
    const currentMonth = ordersTimeline[ordersTimeline.length - 1];
    const previousMonth = ordersTimeline[ordersTimeline.length - 2];
    
    return {
      currentMonthRevenue: currentMonth?.revenue || 0,
      previousMonthRevenue: previousMonth?.revenue || 0,
      currentMonthOrders: currentMonth?.orders || 0,
      previousMonthOrders: previousMonth?.orders || 0,
    };
  }, [ordersTimeline]);

  // Calculate machine stats
  const machineStats = React.useMemo(() => {
    if (!machinesData) return { totalCredits: 0, totalUnits: 0 };
    return {
      totalCredits: machinesData.reduce((sum, m) => sum + Number(m.total_credits_generated || 0), 0),
      totalUnits: machinesData.reduce((sum, m) => sum + Number(m.total_units_dispensed || 0), 0),
    };
  }, [machinesData]);

  const isLoading = ordersLoading || machinesLoading;

  if (isLoading) {
    return (
      <div className="grid gap-6 md:grid-cols-2">
        <CarboCard>
          <CarboCardHeader>
            <CarboSkeleton className="h-6 w-48" />
          </CarboCardHeader>
          <CarboCardContent>
            <CarboSkeleton className="h-[200px] w-full" />
          </CarboCardContent>
        </CarboCard>
        <CarboCard>
          <CarboCardHeader>
            <CarboSkeleton className="h-6 w-48" />
          </CarboCardHeader>
          <CarboCardContent>
            <CarboSkeleton className="h-[200px] w-full" />
          </CarboCardContent>
        </CarboCard>
      </div>
    );
  }

  const hasOrderData = ordersTimeline.some(d => d.orders > 0 || d.revenue > 0);

  return (
    <div className="grid gap-6 md:grid-cols-2">
      {/* Revenue Chart */}
      <CarboCard>
        <CarboCardHeader className="pb-2">
          <div className="flex flex-col gap-2">
            <CarboCardTitle className="flex items-center gap-2 text-base">
              <TrendingUp className="h-4 w-4 text-carbo-green" />
              Evolução de Receita
            </CarboCardTitle>
            <TrendIndicator
              current={trendData.currentMonthRevenue}
              previous={trendData.previousMonthRevenue}
              label="Este mês"
              format="currency"
            />
          </div>
        </CarboCardHeader>
        <CarboCardContent>
          {hasOrderData ? (
            <ResponsiveContainer width="100%" height={180}>
              <AreaChart data={ordersTimeline} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(142, 76%, 36%)" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="hsl(142, 76%, 36%)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  className="text-muted-foreground"
                />
                <YAxis
                  tick={{ fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  className="text-muted-foreground"
                  tickFormatter={(value) => `R$${(value / 1000).toFixed(0)}k`}
                />
                <Tooltip
                  formatter={(value: number) => [
                    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value),
                    "Receita"
                  ]}
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px",
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="revenue"
                  name="Receita"
                  stroke="hsl(142, 76%, 36%)"
                  fillOpacity={1}
                  fill="url(#colorRevenue)"
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-[180px] text-muted-foreground text-sm">
              Sem dados de receita no período
            </div>
          )}
        </CarboCardContent>
      </CarboCard>

      {/* Orders Chart */}
      <CarboCard>
        <CarboCardHeader className="pb-2">
          <div className="flex flex-col gap-2">
            <CarboCardTitle className="flex items-center gap-2 text-base">
              <BarChart3 className="h-4 w-4 text-carbo-blue" />
              Pedidos por Mês
            </CarboCardTitle>
            <TrendIndicator
              current={trendData.currentMonthOrders}
              previous={trendData.previousMonthOrders}
              label="Este mês"
              format="number"
            />
          </div>
        </CarboCardHeader>
        <CarboCardContent>
          {hasOrderData ? (
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={ordersTimeline} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  className="text-muted-foreground"
                />
                <YAxis
                  tick={{ fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  className="text-muted-foreground"
                  allowDecimals={false}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px",
                  }}
                />
                <Bar
                  dataKey="orders"
                  name="Pedidos"
                  fill="hsl(217, 91%, 60%)"
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-[180px] text-muted-foreground text-sm">
              Sem pedidos no período
            </div>
          )}
        </CarboCardContent>
      </CarboCard>
    </div>
  );
}

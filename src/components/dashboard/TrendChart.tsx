import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { DailyTrendData } from "@/hooks/useDashboardCharts";

interface TrendChartProps {
  title: string;
  description: string;
  data: DailyTrendData[] | undefined;
  isLoading: boolean;
  variant?: "checklist" | "os";
}

export function TrendChart({ title, description, data, isLoading, variant = "checklist" }: TrendChartProps) {
  const completedColor = variant === "checklist" ? "hsl(142, 76%, 36%)" : "hsl(217, 91%, 40%)";
  const pendingColor = "hsl(45, 93%, 47%)";

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[250px] w-full" />
        </CardContent>
      </Card>
    );
  }

  const hasData = data && data.some((d) => d.total > 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-semibold">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        {hasData ? (
          <ResponsiveContainer width="100%" height={250}>
            <AreaChart
              data={data}
              margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
            >
              <defs>
                <linearGradient id={`colorCompleted${variant}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={completedColor} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={completedColor} stopOpacity={0} />
                </linearGradient>
                <linearGradient id={`colorPending${variant}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={pendingColor} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={pendingColor} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis 
                dataKey="label" 
                tick={{ fontSize: 12 }} 
                tickLine={false}
                axisLine={false}
                className="text-muted-foreground"
              />
              <YAxis 
                tick={{ fontSize: 12 }} 
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
                labelStyle={{ color: "hsl(var(--foreground))" }}
              />
              <Legend />
              <Area
                type="monotone"
                dataKey="completed"
                name="Concluídos"
                stroke={completedColor}
                fillOpacity={1}
                fill={`url(#colorCompleted${variant})`}
                strokeWidth={2}
              />
              <Area
                type="monotone"
                dataKey="pending"
                name="Pendentes"
                stroke={pendingColor}
                fillOpacity={1}
                fill={`url(#colorPending${variant})`}
                strokeWidth={2}
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex items-center justify-center h-[250px] text-muted-foreground">
            <p className="text-sm">Nenhum dado disponível para o período</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

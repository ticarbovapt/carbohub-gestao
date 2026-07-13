import {
  Truck, Package, Clock, AlertTriangle,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from "recharts";
import { CarboPageHeader } from "@/components/ui/carbo-page-header";
import { CarboKPI } from "@/components/ui/carbo-kpi";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/contexts/AuthContext";
import { useDashLogistica } from "@/hooks/useDashLogistica";

function RestrictedNotice() {
  return (
    <div className="rounded-xl border border-dashed border-amber-500/40 bg-amber-500/5 p-6 flex flex-col items-center gap-2 text-center">
      <AlertTriangle className="h-8 w-8 text-amber-500/70" />
      <p className="text-sm font-medium">Área restrita a gestores.</p>
    </div>
  );
}

export default function DashboardsLogistica() {
  const { canAdmin } = useAuth();
  const { data, isLoading } = useDashLogistica();

  if (!canAdmin) {
    return (
      <main className="mx-auto max-w-6xl px-4 sm:px-6 py-8">
        <RestrictedNotice />
      </main>
    );
  }

  const chartData = data?.porStatus ?? [];
  const hasChart = chartData.length > 0;

  return (
    <main className="mx-auto max-w-6xl px-4 sm:px-6 py-8 space-y-6">
      <CarboPageHeader
        icon={Truck}
        iconColor="blue"
        title="Logística — Visão Geral"
        description="Rastreamento de remessas e status de entrega"
      />

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <CarboKPI title="Pendentes" value={data?.pendentes ?? 0} icon={Package}
          iconColor="warning" loading={isLoading} />
        <CarboKPI title="Em transporte" value={data?.emTransporte ?? 0} icon={Truck}
          iconColor="blue" loading={isLoading} />
        <CarboKPI title="Entregues" value={data?.entregues ?? 0} icon={Clock}
          iconColor="success" loading={isLoading} />
        <CarboKPI title="Atrasados" value={data?.atrasados ?? 0} icon={AlertTriangle}
          iconColor={data?.atrasados ? "destructive" : "muted"} loading={isLoading} />
      </div>

      {/* Distribuição por status */}
      <Card className="rounded-2xl border-0 shadow-sm">
        <CardHeader className="pb-1 pt-5 px-5">
          <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            Remessas por status
          </CardTitle>
        </CardHeader>
        <CardContent className="px-2 pb-4">
          {!hasChart ? (
            <p className="px-3 py-10 text-center text-sm text-muted-foreground">
              Nenhuma remessa registrada.
            </p>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={chartData} margin={{ top: 4, right: 12, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis allowDecimals={false} tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{ background: "var(--background)", border: "1px solid var(--border)", borderRadius: 10, fontSize: 12 }}
                  formatter={(v: number) => [v, "Remessas"]}
                  cursor={{ fill: "var(--muted)", opacity: 0.3 }} />
                <Bar dataKey="count" radius={[4, 4, 0, 0]} maxBarSize={56}>
                  {chartData.map((d) => (
                    <Cell key={d.status} fill={d.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
    </main>
  );
}

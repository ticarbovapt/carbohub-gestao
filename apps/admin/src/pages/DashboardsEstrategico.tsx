import {
  Target, FileText, AlertTriangle, Users, DollarSign, Cpu,
} from "lucide-react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import { CarboPageHeader } from "@/components/ui/carbo-page-header";
import { CarboKPI } from "@/components/ui/carbo-kpi";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/contexts/AuthContext";
import { fmtBRL, monthLabel } from "@/lib/dash-format";
import { useDashEstrategico } from "@/hooks/useDashEstrategico";

function RestrictedNotice() {
  return (
    <div className="rounded-xl border border-dashed border-amber-500/40 bg-amber-500/5 p-6 flex flex-col items-center gap-2 text-center">
      <AlertTriangle className="h-8 w-8 text-amber-500/70" />
      <p className="text-sm font-medium">Área restrita a gestores.</p>
    </div>
  );
}

export default function DashboardsEstrategico() {
  const { canAdmin } = useAuth();
  const { data, isLoading } = useDashEstrategico(12);

  if (!canAdmin) {
    return (
      <main className="mx-auto max-w-6xl px-4 sm:px-6 py-8">
        <RestrictedNotice />
      </main>
    );
  }

  const chartData = (data?.revenueMonthly ?? []).map((m) => ({
    mes: monthLabel(m.key + "-01T12:00:00"),
    receita: m.receita,
  }));
  const hasChart = chartData.some((d) => d.receita > 0);

  return (
    <main className="mx-auto max-w-6xl px-4 sm:px-6 py-8 space-y-6">
      <CarboPageHeader
        icon={Target}
        iconColor="gradient"
        title="Estratégico — Cockpit"
        description="Visão global do ecossistema Carbo · KPIs e receita da rede"
      />

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <CarboKPI title="OP ativas" value={data?.activeOS ?? 0} icon={FileText}
          iconColor="blue" loading={isLoading} />
        <CarboKPI title="OP atrasadas" value={data?.overdueOS ?? 0} icon={AlertTriangle}
          iconColor={data?.overdueOS ? "warning" : "muted"} loading={isLoading} />
        <CarboKPI title="Licenciados ativos" value={data?.activeLicensees ?? 0} icon={Users}
          iconColor="green" loading={isLoading} />
        <CarboKPI title="Receita mensal" value={fmtBRL(data?.monthlyRevenue ?? 0)} icon={DollarSign}
          iconColor="green" loading={isLoading} />
        <CarboKPI title="Máquinas operacionais" value={data?.activeMachines ?? 0} icon={Cpu}
          iconColor="blue" loading={isLoading} />
      </div>

      {/* Receita por mês (rede) */}
      <Card className="rounded-2xl border-0 shadow-sm">
        <CardHeader className="pb-1 pt-5 px-5">
          <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            Receita por mês · rede toda
          </CardTitle>
        </CardHeader>
        <CardContent className="px-2 pb-4">
          {!hasChart ? (
            <p className="px-3 py-10 text-center text-sm text-muted-foreground">
              Sem receita no período.
            </p>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={chartData} margin={{ top: 4, right: 12, left: -6, bottom: 0 }}>
                <defs>
                  <linearGradient id="estrategicoReceita" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#22c55e" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" vertical={false} />
                <XAxis dataKey="mes" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false}
                  tickFormatter={(x: number) => (x >= 1000 ? `${Math.round(x / 1000)}k` : String(x))} />
                <Tooltip
                  contentStyle={{ background: "var(--background)", border: "1px solid var(--border)", borderRadius: 10, fontSize: 12 }}
                  formatter={(v: number) => [fmtBRL(v), "Receita"]}
                  cursor={{ fill: "var(--muted)", opacity: 0.3 }} />
                <Area type="monotone" dataKey="receita" stroke="#22c55e" strokeWidth={2}
                  fill="url(#estrategicoReceita)" />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
    </main>
  );
}

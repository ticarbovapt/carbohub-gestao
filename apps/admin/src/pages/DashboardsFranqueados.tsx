import {
  Building2, DollarSign, Wrench, CheckCircle2, AlertTriangle,
} from "lucide-react";
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import { CarboPageHeader } from "@/components/ui/carbo-page-header";
import { CarboKPI } from "@/components/ui/carbo-kpi";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/contexts/AuthContext";
import { fmtBRL, monthLabel } from "@/lib/dash-format";
import { useFranqueadosKpis, useFranqueadosRevenueMonthly } from "@/hooks/useDashFranqueados";

function AccessNotice() {
  return (
    <div className="rounded-xl border border-dashed border-amber-500/40 bg-amber-500/5 p-6 flex flex-col items-center gap-2 text-center">
      <AlertTriangle className="h-8 w-8 text-amber-500/70" />
      <p className="text-sm font-medium">Sem dados do Portal de Licenciados</p>
      <p className="text-xs text-muted-foreground max-w-md">
        Para ver o consolidado dos franqueados, seu usuário precisa ter{" "}
        <code className="font-mono bg-muted px-1 rounded">portal_licenciado</code> liberado em{" "}
        <span className="font-medium">Usuários → Sistemas liberados</span>. Sem essa liberação o
        portal não devolve os números da rede.
      </p>
    </div>
  );
}

export default function DashboardsFranqueados() {
  const { canAdmin } = useAuth();

  const { data: kpis, isLoading: kLoad } = useFranqueadosKpis();
  const { data: months = [] } = useFranqueadosRevenueMonthly(12);

  const chartData = months.map((m) => ({
    mes: monthLabel(m.month_start), receita: m.revenue, servicos: m.services,
  }));
  const hasRevenue = chartData.some((d) => d.receita > 0);
  const hasData = Boolean(kpis) && ((kpis!.total_lojas ?? 0) > 0 || (kpis!.total_services ?? 0) > 0);

  if (!canAdmin) {
    return (
      <main className="mx-auto max-w-6xl px-4 sm:px-6 py-8">
        <AccessNotice />
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-6xl px-4 sm:px-6 py-8 space-y-6">
      <CarboPageHeader
        icon={Building2}
        iconColor="blue"
        title="Franqueados — Visão Geral"
        description="Rede de descarbonização CarboVapt · consolidado de todas as lojas"
      />

      {!kLoad && !hasData && <AccessNotice />}

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <CarboKPI title="Total de lojas" value={kpis?.total_lojas ?? 0} icon={Building2}
          iconColor="blue" loading={kLoad} />
        <CarboKPI title="Lojas ativas" value={kpis?.active_lojas ?? 0} icon={CheckCircle2}
          iconColor="green" loading={kLoad} />
        <CarboKPI title="Serviços no mês" value={kpis?.total_services ?? 0} icon={Wrench}
          iconColor="green" loading={kLoad} />
        <CarboKPI title="Receita no mês" value={fmtBRL(kpis?.total_revenue ?? 0)} icon={DollarSign}
          iconColor="green" loading={kLoad} />
      </div>

      {/* Receita (colunas) + serviços (linha) por mês */}
      <Card className="rounded-2xl border-0 shadow-sm">
        <CardHeader className="pb-1 pt-5 px-5">
          <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            Receita e serviços por mês · rede toda
          </CardTitle>
        </CardHeader>
        <CardContent className="px-2 pb-4">
          {!hasRevenue ? (
            <p className="px-3 py-10 text-center text-sm text-muted-foreground">
              Sem receita no período — as colunas aparecem conforme descarbonizações são registradas.
            </p>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <ComposedChart data={chartData} margin={{ top: 8, right: 8, left: -6, bottom: 0 }}>
                <defs>
                  <linearGradient id="grad-franq-receita" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.95} />
                    <stop offset="100%" stopColor="#3b82f6" stopOpacity={0.45} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" vertical={false} />
                <XAxis dataKey="mes" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis yAxisId="receita" tick={{ fontSize: 10 }} axisLine={false} tickLine={false}
                  tickFormatter={(x: number) => (x >= 1000 ? `${Math.round(x / 1000)}k` : String(x))} />
                <YAxis yAxisId="servicos" orientation="right" tick={{ fontSize: 10, fill: "#f59e0b" }}
                  axisLine={false} tickLine={false} allowDecimals={false} width={28} />
                <Tooltip
                  contentStyle={{ background: "var(--background)", border: "1px solid var(--border)", borderRadius: 10, fontSize: 12 }}
                  formatter={(v: number, n: string) => (n === "receita" ? [fmtBRL(v), "Receita"] : [v, "Serviços"])}
                  cursor={{ fill: "var(--muted)", opacity: 0.3 }} />
                <Legend iconType="circle" iconSize={9}
                  formatter={(v) => (v === "receita" ? "Receita" : "Serviços")} />
                <Bar yAxisId="receita" dataKey="receita" fill="url(#grad-franq-receita)"
                  radius={[6, 6, 0, 0]} maxBarSize={44} />
                <Line yAxisId="servicos" type="monotone" dataKey="servicos" stroke="#f59e0b"
                  strokeWidth={2.5} dot={{ r: 3, fill: "#f59e0b", stroke: "var(--background)", strokeWidth: 1.5 }}
                  activeDot={{ r: 5 }} />
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
    </main>
  );
}

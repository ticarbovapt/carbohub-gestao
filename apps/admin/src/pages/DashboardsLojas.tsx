import { useMemo } from "react";
import {
  Store, DollarSign, ShoppingCart, Boxes, Users, AlertTriangle, TrendingUp,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import { CarboPageHeader } from "@/components/ui/carbo-page-header";
import { CarboKPI } from "@/components/ui/carbo-kpi";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/contexts/AuthContext";
import { fmtBRL, fmtBRLc, delta } from "@/lib/dash-format";
import { useLojasKpis, useLojasKpisPrev, useLojasTimeseries } from "@/hooks/useDashLojas";

// Rótulo curto de dia (dd/MM) para o eixo do gráfico diário.
const dayLabel = (iso: string) =>
  new Date(iso + "T12:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });

// Variantes do CarboZé (produtos.products.variant) e suas cores no gráfico.
const VARIANTS: { key: string; label: string; color: string }[] = [
  { key: "sache", label: "Sachê", color: "#22c55e" },
  { key: "100ml", label: "100ml", color: "#3b82f6" },
  { key: "1L", label: "1L", color: "#f59e0b" },
  { key: "outro", label: "Outro", color: "#a78bfa" },
];

function AccessNotice() {
  return (
    <div className="rounded-xl border border-dashed border-amber-500/40 bg-amber-500/5 p-6 flex flex-col items-center gap-2 text-center">
      <AlertTriangle className="h-8 w-8 text-amber-500/70" />
      <p className="text-sm font-medium">Sem dados do Portal de Vendas</p>
      <p className="text-xs text-muted-foreground max-w-md">
        Para ver o consolidado das lojas, seu usuário precisa ter <code className="font-mono bg-muted px-1 rounded">portal_pdv</code>{" "}
        liberado em <span className="font-medium">Usuários → Sistemas liberados</span>. Sem essa liberação
        o portal não devolve os números da rede.
      </p>
    </div>
  );
}

export default function DashboardsLojas() {
  const { canAdmin } = useAuth();

  const { data: kpis, isLoading: kLoad } = useLojasKpis(30);
  const { data: kpisPrev } = useLojasKpisPrev(30);
  const { data: series = [] } = useLojasTimeseries(30);

  // Pivot: uma linha por dia, uma coluna por variante (para a barra empilhada).
  const chartData = useMemo(() => {
    const byDay = new Map<string, Record<string, number | string>>();
    for (const r of series) {
      const row = byDay.get(r.day) ?? { day: r.day, label: dayLabel(r.day) };
      row[r.variant] = (Number(row[r.variant]) || 0) + Number(r.total_amount || 0);
      byDay.set(r.day, row);
    }
    return Array.from(byDay.values()).sort((a, b) => String(a.day).localeCompare(String(b.day)));
  }, [series]);

  const dRevenue = delta(kpis?.total_revenue ?? 0, kpisPrev?.total_revenue ?? 0);
  const dSales = delta(kpis?.total_sales ?? 0, kpisPrev?.total_sales ?? 0);

  // Degradação: gestor sem a flag portal_pdv não recebe nada dos RPCs.
  const hasData = Boolean(kpis) && (kpis!.total_postos > 0 || kpis!.total_sales > 0);

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
        icon={Store}
        iconColor="green"
        title="Lojas — Visão Geral"
        description="Consolidado da rede do Portal de Vendas (CarboZé) · últimos 30 dias"
      />

      {!kLoad && !hasData && <AccessNotice />}

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <CarboKPI title="Receita (30d)" value={fmtBRL(kpis?.total_revenue ?? 0)} icon={DollarSign}
          iconColor="green" loading={kLoad}
          trend={{ ...dRevenue, label: "vs período anterior" }} />
        <CarboKPI title="Vendas (30d)" value={kpis?.total_sales ?? 0} icon={ShoppingCart}
          iconColor="blue" loading={kLoad} trend={{ ...dSales, label: "vs anterior" }} />
        <CarboKPI title="Unidades vendidas" value={kpis?.total_units ?? 0} icon={Boxes}
          iconColor="green" loading={kLoad} />
        <CarboKPI title="Lojas ativas" value={kpis?.active_postos ?? 0} icon={Store}
          iconColor="blue" loading={kLoad} />
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <CarboKPI title="Total de lojas" value={kpis?.total_postos ?? 0} icon={Store}
          iconColor="muted" loading={kLoad} />
        <CarboKPI title="Frentistas" value={kpis?.total_frentistas ?? 0} icon={Users}
          iconColor="muted" loading={kLoad} />
        <CarboKPI title="Produtos em falta" value={kpis?.low_stock_products ?? 0} icon={AlertTriangle}
          iconColor={kpis?.low_stock_products ? "warning" : "muted"} loading={kLoad} />
        <CarboKPI title="Ticket médio"
          value={fmtBRLc(kpis && kpis.total_sales > 0 ? kpis.total_revenue / kpis.total_sales : 0)}
          icon={TrendingUp} iconColor="green" loading={kLoad} />
      </div>

      {/* Receita por dia (empilhada por variante) */}
      {chartData.length > 0 && (
        <Card className="rounded-2xl border-0 shadow-sm">
          <CardHeader className="pb-1 pt-5 px-5">
            <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              Receita por dia · por variante
            </CardTitle>
          </CardHeader>
          <CardContent className="px-2 pb-4">
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={chartData} margin={{ top: 4, right: 12, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false}
                  tickFormatter={(x: number) => (x >= 1000 ? `${Math.round(x / 1000)}k` : String(x))} />
                <Tooltip
                  contentStyle={{ background: "var(--background)", border: "1px solid var(--border)", borderRadius: 10, fontSize: 12 }}
                  formatter={(v: number, n: string) => [fmtBRL(v), VARIANTS.find((x) => x.key === n)?.label ?? n]}
                  cursor={{ fill: "var(--muted)", opacity: 0.3 }} />
                <Legend iconType="square" iconSize={10} formatter={(v) => VARIANTS.find((x) => x.key === v)?.label ?? v} />
                {VARIANTS.map((v) => (
                  <Bar key={v.key} dataKey={v.key} stackId="rev" fill={v.color} maxBarSize={28}
                    radius={v.key === "outro" ? [4, 4, 0, 0] : [0, 0, 0, 0]} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}
    </main>
  );
}

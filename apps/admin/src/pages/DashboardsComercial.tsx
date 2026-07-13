import {
  TrendingUp, DollarSign, ShoppingCart, Receipt, AlertTriangle,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import { CarboPageHeader } from "@/components/ui/carbo-page-header";
import { CarboKPI } from "@/components/ui/carbo-kpi";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/contexts/AuthContext";
import { fmtBRL, fmtBRLc, fmtNum, pct, monthLabel } from "@/lib/dash-format";
import { useDashComercial } from "@/hooks/useDashComercial";

function RestrictedNotice() {
  return (
    <div className="rounded-xl border border-dashed border-amber-500/40 bg-amber-500/5 p-6 flex flex-col items-center gap-2 text-center">
      <AlertTriangle className="h-8 w-8 text-amber-500/70" />
      <p className="text-sm font-medium">Área restrita a gestores.</p>
    </div>
  );
}

const SEG = [
  { key: "consumo", label: "Consumo (B2B)", color: "#3b82f6" },
  { key: "revenda", label: "Revenda (PDV)", color: "#f59e0b" },
  { key: "online", label: "On-line", color: "#22c55e" },
  { key: "naoClassificado", label: "Não classificado", color: "#94a3b8" },
] as const;

export default function DashboardsComercial() {
  const { canAdmin } = useAuth();
  const { data, isLoading } = useDashComercial(12);

  if (!canAdmin) {
    return (
      <main className="mx-auto max-w-6xl px-4 sm:px-6 py-8">
        <RestrictedNotice />
      </main>
    );
  }

  const chartData = (data?.monthly ?? []).map((m) => ({
    mes: monthLabel(m.key + "-01T12:00:00"),
    faturado: m.faturado,
  }));
  const hasChart = chartData.some((d) => d.faturado > 0);
  const segTotal = data
    ? data.segmentos.consumo.brl + data.segmentos.revenda.brl +
      data.segmentos.online.brl + data.segmentos.naoClassificado.brl
    : 0;

  return (
    <main className="mx-auto max-w-6xl px-4 sm:px-6 py-8 space-y-6">
      <CarboPageHeader
        icon={TrendingUp}
        iconColor="green"
        title="Comercial — Visão Geral"
        description="Pedidos e performance de vendas (CarboZé / Bling) · últimos 12 meses"
      />

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <CarboKPI title="Total faturado" value={fmtBRL(data?.totalBRL ?? 0)} icon={DollarSign}
          iconColor="green" loading={isLoading} />
        <CarboKPI title="Nº de vendas" value={data?.totalVendas ?? 0} icon={ShoppingCart}
          iconColor="blue" loading={isLoading} />
        <CarboKPI title="Ticket médio" value={fmtBRLc(data?.ticketMedio ?? 0)} icon={Receipt}
          iconColor="green" loading={isLoading} />
        <CarboKPI title="Consumo (B2B)" value={fmtBRL(data?.segmentos.consumo.brl ?? 0)} icon={TrendingUp}
          iconColor="blue" loading={isLoading} />
      </div>

      {/* Faturamento por mês */}
      <Card className="rounded-2xl border-0 shadow-sm">
        <CardHeader className="pb-1 pt-5 px-5">
          <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            Faturamento por mês
          </CardTitle>
        </CardHeader>
        <CardContent className="px-2 pb-4">
          {!hasChart ? (
            <p className="px-3 py-10 text-center text-sm text-muted-foreground">
              Sem faturamento no período.
            </p>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={chartData} margin={{ top: 4, right: 12, left: -6, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" vertical={false} />
                <XAxis dataKey="mes" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false}
                  tickFormatter={(x: number) => (x >= 1000 ? `${Math.round(x / 1000)}k` : String(x))} />
                <Tooltip
                  contentStyle={{ background: "var(--background)", border: "1px solid var(--border)", borderRadius: 10, fontSize: 12 }}
                  formatter={(v: number) => [fmtBRL(v), "Faturado"]}
                  cursor={{ fill: "var(--muted)", opacity: 0.3 }} />
                <Bar dataKey="faturado" fill="#22c55e" radius={[4, 4, 0, 0]} maxBarSize={48} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Vendas por canal */}
      <Card className="rounded-2xl border-0 shadow-sm">
        <CardHeader className="pt-5 px-5 pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <ShoppingCart className="h-4 w-4 text-carbo-blue" /> Vendas por canal
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0 pb-2">
          {segTotal === 0 ? (
            <p className="px-5 py-6 text-sm text-muted-foreground">Sem vendas classificadas no período.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-y border-border/50 bg-muted/30 text-muted-foreground text-xs">
                    <th className="text-left px-5 py-2 font-medium">Canal</th>
                    <th className="text-right px-4 py-2 font-medium">Pedidos</th>
                    <th className="text-right px-4 py-2 font-medium">Faturado</th>
                    <th className="text-right px-5 py-2 font-medium">% do total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/30">
                  {SEG.map((s) => {
                    const d = data!.segmentos[s.key];
                    return (
                      <tr key={s.key} className="hover:bg-muted/20">
                        <td className="px-5 py-2.5 font-medium">
                          <span className="inline-flex items-center gap-2">
                            <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} />
                            {s.label}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums">{fmtNum(d.qtd)}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums font-semibold">{fmtBRL(d.brl)}</td>
                        <td className="px-5 py-2.5 text-right">
                          <Badge variant="outline" className="text-xs font-mono">{pct(d.brl, segTotal)}</Badge>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </main>
  );
}

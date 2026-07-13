import {
  Building2, DollarSign, Wrench, CheckCircle2, AlertTriangle,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import { CarboPageHeader } from "@/components/ui/carbo-page-header";
import { CarboKPI } from "@/components/ui/carbo-kpi";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/contexts/AuthContext";
import { fmtBRL, monthLabel } from "@/lib/dash-format";
import {
  useFranqueadosKpis, useFranqueadosRevenueMonthly, useFranqueadosLojas,
} from "@/hooks/useDashFranqueados";

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
  const { data: lojas = [] } = useFranqueadosLojas();

  const chartData = months.map((m) => ({ mes: monthLabel(m.month_start), receita: m.revenue }));
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

      {/* Receita por mês (rede) */}
      <Card className="rounded-2xl border-0 shadow-sm">
        <CardHeader className="pb-1 pt-5 px-5">
          <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            Receita por mês · rede toda
          </CardTitle>
        </CardHeader>
        <CardContent className="px-2 pb-4">
          {!hasRevenue ? (
            <p className="px-3 py-10 text-center text-sm text-muted-foreground">
              Sem receita no período — as colunas aparecem conforme descarbonizações são registradas.
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
                  formatter={(v: number) => [fmtBRL(v), "Receita"]}
                  cursor={{ fill: "var(--muted)", opacity: 0.3 }} />
                <Bar dataKey="receita" fill="#3b82f6" radius={[4, 4, 0, 0]} maxBarSize={48} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Lojas */}
      <Card className="rounded-2xl border-0 shadow-sm">
        <CardHeader className="pt-5 px-5 pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Building2 className="h-4 w-4 text-carbo-blue" /> Lojas da rede
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0 pb-2">
          {lojas.length === 0 ? (
            <p className="px-5 py-6 text-sm text-muted-foreground">Nenhuma loja cadastrada.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-y border-border/50 bg-muted/30 text-muted-foreground text-xs">
                    <th className="text-left px-5 py-2 font-medium">Nome</th>
                    <th className="text-left px-4 py-2 font-medium">Cidade/UF</th>
                    <th className="text-center px-5 py-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/30">
                  {lojas.map((l) => (
                    <tr key={l.id} className="hover:bg-muted/20">
                      <td className="px-5 py-2.5 font-medium">{l.name}</td>
                      <td className="px-4 py-2.5 text-muted-foreground text-xs">
                        {l.city ? `${l.city}${l.state ? `, ${l.state}` : ""}` : "—"}
                      </td>
                      <td className="px-5 py-2.5 text-center">
                        <Badge variant="outline" className={l.active
                          ? "text-xs text-green-600 border-green-500/40"
                          : "text-xs text-muted-foreground"}>
                          {l.active ? "Ativa" : "Inativa"}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </main>
  );
}

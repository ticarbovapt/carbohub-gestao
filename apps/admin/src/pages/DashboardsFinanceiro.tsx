import {
  Wallet, Receipt, AlertTriangle, FileText, ClipboardList,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import { CarboPageHeader } from "@/components/ui/carbo-page-header";
import { CarboKPI } from "@/components/ui/carbo-kpi";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/contexts/AuthContext";
import { fmtBRL } from "@/lib/dash-format";
import { useDashFinanceiro } from "@/hooks/useDashFinanceiro";

function RestrictedNotice() {
  return (
    <div className="rounded-xl border border-dashed border-amber-500/40 bg-amber-500/5 p-6 flex flex-col items-center gap-2 text-center">
      <AlertTriangle className="h-8 w-8 text-amber-500/70" />
      <p className="text-sm font-medium">Área restrita a gestores.</p>
    </div>
  );
}

const truncate = (s: string, n = 18) => (s.length > n ? s.slice(0, n - 1) + "…" : s);

export default function DashboardsFinanceiro() {
  const { canAdmin } = useAuth();
  const { data, isLoading } = useDashFinanceiro();

  if (!canAdmin) {
    return (
      <main className="mx-auto max-w-6xl px-4 sm:px-6 py-8">
        <RestrictedNotice />
      </main>
    );
  }

  const chartData = (data?.fornecedores ?? []).map((f) => ({
    fornecedor: truncate(f.supplier),
    total: f.total,
  }));
  const hasChart = chartData.length > 0;

  return (
    <main className="mx-auto max-w-6xl px-4 sm:px-6 py-8 space-y-6">
      <CarboPageHeader
        icon={Wallet}
        iconColor="green"
        title="Financeiro — Compras"
        description="Contas a pagar, ordens de compra e requisições"
      />

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <CarboKPI title="Total a pagar" value={fmtBRL(data?.totalAPagar ?? 0)} icon={Wallet}
          iconColor="green" loading={isLoading} />
        <CarboKPI title="Contas atrasadas" value={data?.contasAtrasadas ?? 0} icon={AlertTriangle}
          iconColor={data?.contasAtrasadas ? "destructive" : "muted"} loading={isLoading} />
        <CarboKPI title="OC abertas" value={data?.ocAbertas ?? 0} icon={FileText}
          iconColor="blue" loading={isLoading} />
        <CarboKPI title="RC pendentes" value={data?.rcPendentes ?? 0} icon={ClipboardList}
          iconColor={data?.rcPendentes ? "warning" : "muted"} loading={isLoading} />
      </div>

      {/* Custo comprometido por fornecedor (top 8) */}
      <Card className="rounded-2xl border-0 shadow-sm">
        <CardHeader className="pb-1 pt-5 px-5">
          <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
            <Receipt className="h-4 w-4" /> Custo comprometido por fornecedor · top 8
          </CardTitle>
        </CardHeader>
        <CardContent className="px-2 pb-4">
          {!hasChart ? (
            <p className="px-3 py-10 text-center text-sm text-muted-foreground">
              Nenhuma ordem de compra registrada.
            </p>
          ) : (
            <ResponsiveContainer width="100%" height={Math.max(200, chartData.length * 40)}>
              <BarChart data={chartData} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 10 }} axisLine={false} tickLine={false}
                  tickFormatter={(x: number) => (x >= 1000 ? `${Math.round(x / 1000)}k` : String(x))} />
                <YAxis type="category" dataKey="fornecedor" tick={{ fontSize: 11 }} axisLine={false}
                  tickLine={false} width={130} />
                <Tooltip
                  contentStyle={{ background: "var(--background)", border: "1px solid var(--border)", borderRadius: 10, fontSize: 12 }}
                  formatter={(v: number) => [fmtBRL(v), "Comprometido"]}
                  cursor={{ fill: "var(--muted)", opacity: 0.3 }} />
                <Bar dataKey="total" fill="#22c55e" radius={[0, 4, 4, 0]} maxBarSize={26} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
    </main>
  );
}

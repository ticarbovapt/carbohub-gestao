import {
  Factory, ClipboardCheck, AlertTriangle, Wrench, Timer,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import { CarboPageHeader } from "@/components/ui/carbo-page-header";
import { CarboKPI } from "@/components/ui/carbo-kpi";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/contexts/AuthContext";
import { useDashProducao } from "@/hooks/useDashProducao";

function RestrictedNotice() {
  return (
    <div className="rounded-xl border border-dashed border-amber-500/40 bg-amber-500/5 p-6 flex flex-col items-center gap-2 text-center">
      <AlertTriangle className="h-8 w-8 text-amber-500/70" />
      <p className="text-sm font-medium">Área restrita a gestores.</p>
    </div>
  );
}

function fmtDuration(min: number | null): string {
  if (min == null) return "—";
  if (min < 60) return `${min}min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m > 0 ? `${h}h${String(m).padStart(2, "0")}` : `${h}h`;
}

export default function DashboardsProducao() {
  const { canAdmin } = useAuth();
  const { data, isLoading } = useDashProducao(7);

  if (!canAdmin) {
    return (
      <main className="mx-auto max-w-6xl px-4 sm:px-6 py-8">
        <RestrictedNotice />
      </main>
    );
  }

  const trend = data?.trend ?? [];
  const hasTrend = trend.some((d) => d.completed > 0 || d.pending > 0);

  return (
    <main className="mx-auto max-w-6xl px-4 sm:px-6 py-8 space-y-6">
      <CarboPageHeader
        icon={Factory}
        iconColor="blue"
        title="Produção — Visão Geral"
        description="Checklists e ordens de produção · últimos 7 dias"
      />

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <CarboKPI title="Taxa de conclusão" value={`${data?.completionRate ?? 0}%`} icon={ClipboardCheck}
          iconColor="green" loading={isLoading} />
        <CarboKPI title="Checklists pendentes" value={data?.pendingChecklists ?? 0} icon={AlertTriangle}
          iconColor={data?.pendingChecklists ? "warning" : "muted"} loading={isLoading} />
        <CarboKPI title="OP ativas" value={data?.activeOS ?? 0} icon={Wrench}
          iconColor="blue" loading={isLoading} />
        <CarboKPI title="Tempo médio" value={fmtDuration(data?.avgCompletionMin ?? null)} icon={Timer}
          iconColor="muted" loading={isLoading} />
      </div>

      {/* Checklists nos últimos 7 dias */}
      <Card className="rounded-2xl border-0 shadow-sm">
        <CardHeader className="pb-1 pt-5 px-5">
          <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            Checklists por dia · concluídos vs pendentes
          </CardTitle>
        </CardHeader>
        <CardContent className="px-2 pb-4">
          {!hasTrend ? (
            <p className="px-3 py-10 text-center text-sm text-muted-foreground">
              Sem checklists nos últimos 7 dias.
            </p>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={trend} margin={{ top: 4, right: 12, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis allowDecimals={false} tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{ background: "var(--background)", border: "1px solid var(--border)", borderRadius: 10, fontSize: 12 }}
                  cursor={{ fill: "var(--muted)", opacity: 0.3 }}
                  formatter={(v: number, n: string) => [v, n === "completed" ? "Concluídos" : "Pendentes"]} />
                <Legend iconType="square" iconSize={10}
                  formatter={(v) => (v === "completed" ? "Concluídos" : "Pendentes")} />
                <Bar dataKey="completed" stackId="cl" fill="#22c55e" maxBarSize={40} />
                <Bar dataKey="pending" stackId="cl" fill="#f59e0b" maxBarSize={40} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
    </main>
  );
}

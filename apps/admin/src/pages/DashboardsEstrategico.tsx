import {
  Target, FileText, AlertTriangle, Users, DollarSign, Cpu, TrendingUp, ShieldAlert, ShieldCheck,
} from "lucide-react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import { startOfMonth, getDaysInMonth, getDate } from "date-fns";
import { CarboPageHeader } from "@/components/ui/carbo-page-header";
import { CarboBadge } from "@/components/ui/carbo-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/contexts/AuthContext";
import { fmtBRL, monthLabel } from "@/lib/dash-format";
import { useDashEstrategico } from "@/hooks/useDashEstrategico";
import { useMetasVendedores } from "@/hooks/useMetasVendedores";

function RestrictedNotice() {
  return (
    <div className="rounded-xl border border-dashed border-amber-500/40 bg-amber-500/5 p-6 flex flex-col items-center gap-2 text-center">
      <AlertTriangle className="h-8 w-8 text-amber-500/70" />
      <p className="text-sm font-medium">Área restrita a gestores.</p>
    </div>
  );
}

// Semana comercial começa na sexta (getDay()===5) — mesma regra do Placar.
function commercialWeekStartOf(d: Date): Date {
  const n = new Date(d);
  const diff = (n.getDay() - 5 + 7) % 7;
  n.setDate(n.getDate() - diff);
  n.setHours(0, 0, 0, 0);
  return n;
}

const fmtK = (v: number) =>
  v >= 1_000_000 ? `R$${(v / 1_000_000).toFixed(1)}M`
  : v >= 1000    ? `R$${(v / 1000).toFixed(0)}k`
  : fmtBRL(v);

const META_COLORS = {
  green:  { bar: "#22c55e", badge: "success"     as const, text: "text-green-500",        ring: "border-green-500/30" },
  yellow: { bar: "#f59e0b", badge: "warning"     as const, text: "text-amber-500",        ring: "border-amber-500/30" },
  red:    { bar: "#ef4444", badge: "destructive" as const, text: "text-red-500",          ring: "border-red-500/30" },
  gray:   { bar: "#64748b", badge: "secondary"   as const, text: "text-muted-foreground", ring: "" },
};

export default function DashboardsEstrategico() {
  const { canAdmin } = useAuth();
  const { data, isLoading } = useDashEstrategico(12);

  // Meta do time (mesmo RPC do Placar) — realizado vs meta do mês corrente.
  const month = startOfMonth(new Date());
  const weekStart = commercialWeekStartOf(new Date());
  const { data: metas = [] } = useMetasVendedores(month, weekStart);

  if (!canAdmin) {
    return (
      <main className="mx-auto max-w-6xl px-4 sm:px-6 py-8">
        <RestrictedNotice />
      </main>
    );
  }

  // ── Comercial vs Meta ──────────────────────────────────────────────────────
  const teamPct = metas[0]?.team_pct ?? 0;
  const teamActual = metas[0]?.team_actual ?? 0;
  const teamTarget = metas[0]?.team_target ?? 0;
  const today = new Date();
  const expectedPct = (getDate(today) / getDaysInMonth(today)) * 100;
  const metaKey: keyof typeof META_COLORS =
    teamTarget <= 0 ? "gray"
    : teamPct >= expectedPct ? "green"
    : teamPct >= expectedPct - 15 ? "yellow"
    : "red";
  const metaColors = META_COLORS[metaKey];

  // ── Alertas críticos consolidados ─────────────────────────────────────────
  const overdueOS = data?.overdueOS ?? 0;
  const offlineMachines = Math.max(0, (data?.totalMachines ?? 0) - (data?.activeMachines ?? 0));
  const criticalCount = overdueOS + offlineMachines;

  // ── KPIs macro (cards com sub-texto) ───────────────────────────────────────
  const macroCards = [
    { title: "Receita do mês", value: fmtK(data?.monthlyRevenue ?? 0), sub: "Faturamento da rede (mês corrente)", icon: DollarSign, accent: "border-l-green-500", iconBg: "bg-green-500/10 text-green-600" },
    { title: "Licenciados ativos", value: (data?.activeLicensees ?? 0).toLocaleString("pt-BR"), sub: (data?.newLicensees ?? 0) > 0 ? `+${data?.newLicensees} novos no mês` : "Nenhum novo no mês", icon: Users, accent: "border-l-blue-400", iconBg: "bg-blue-400/10 text-blue-500" },
    { title: "OP ativas", value: (data?.activeOS ?? 0).toLocaleString("pt-BR"), sub: "Ordens de produção em aberto", icon: FileText, accent: "border-l-violet-400", iconBg: "bg-violet-400/10 text-violet-500" },
    { title: "OP atrasadas", value: overdueOS.toLocaleString("pt-BR"), sub: overdueOS > 0 ? "SLA vencido — atenção" : "Nenhuma atrasada", icon: AlertTriangle, accent: overdueOS > 0 ? "border-l-red-500" : "border-l-green-500", iconBg: overdueOS > 0 ? "bg-red-500/10 text-red-500" : "bg-green-500/10 text-green-600" },
    { title: "Máquinas operacionais", value: `${(data?.activeMachines ?? 0)}/${(data?.totalMachines ?? 0)}`, sub: offlineMachines > 0 ? `${offlineMachines} fora de operação` : "Todas operacionais", icon: Cpu, accent: "border-l-blue-400", iconBg: "bg-blue-400/10 text-blue-500" },
  ];

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
        description="Visão de dono · saúde do ecossistema Carbo num só lugar"
      />

      {/* ── Flagship: Comercial vs Meta ───────────────────────────────────── */}
      <div className={`rounded-2xl border bg-card p-5 ${metaColors.ring}`}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <TrendingUp className="h-3.5 w-3.5" /> Comercial do mês · realizado vs meta
            </p>
            <div className="flex items-end gap-2 mt-1">
              <p className={`text-3xl font-bold tabular-nums ${metaColors.text}`}>{fmtK(teamActual)}</p>
              <p className="text-muted-foreground mb-1">/ {fmtK(teamTarget)}</p>
            </div>
          </div>
          <div className="text-right shrink-0">
            <CarboBadge variant={metaColors.badge} size="lg">{teamPct.toFixed(1)}% da meta</CarboBadge>
            <p className="text-[11px] text-muted-foreground mt-1">Esperado hoje: {expectedPct.toFixed(0)}%</p>
          </div>
        </div>
        <div className="relative h-2.5 bg-muted rounded-full overflow-hidden mt-3">
          <div className="h-full rounded-full transition-all duration-700" style={{ width: `${Math.min(100, teamPct)}%`, backgroundColor: metaColors.bar }} />
          {expectedPct > 0 && expectedPct < 100 && <div className="absolute top-0 bottom-0 w-0.5 bg-foreground/40" style={{ left: `${expectedPct}%` }} />}
        </div>
      </div>

      {/* ── KPIs macro ────────────────────────────────────────────────────── */}
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-5">
        {macroCards.map(({ title, value, sub, icon: Icon, accent, iconBg }) => {
          const valLen = String(value).length;
          const valSize = valLen <= 6 ? "text-2xl" : valLen <= 10 ? "text-xl" : "text-base";
          return (
            <div key={title} className={`relative overflow-hidden rounded-xl bg-card p-4 border border-border border-l-4 ${accent} transition-all hover:-translate-y-0.5`}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-muted-foreground truncate">{title}</p>
                  <p className={`mt-1.5 font-bold text-foreground leading-tight break-words ${valSize}`}>{isLoading ? "…" : value}</p>
                  {sub && <p className="mt-1 text-xs text-muted-foreground leading-snug line-clamp-2" title={sub}>{sub}</p>}
                </div>
                <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${iconBg}`}>
                  <Icon className="h-[18px] w-[18px]" />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Alertas críticos ──────────────────────────────────────────────── */}
      <div className={`rounded-2xl border p-5 ${criticalCount > 0 ? "border-red-500/30 bg-red-500/5" : "border-green-500/25 bg-green-500/5"}`}>
        <div className="flex items-center gap-3">
          <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${criticalCount > 0 ? "bg-red-500/10 text-red-500" : "bg-green-500/10 text-green-600"}`}>
            {criticalCount > 0 ? <ShieldAlert className="h-6 w-6" /> : <ShieldCheck className="h-6 w-6" />}
          </div>
          <div className="min-w-0">
            <h2 className="text-base font-bold text-foreground">
              {criticalCount > 0 ? `${criticalCount} alerta${criticalCount > 1 ? "s" : ""} crítico${criticalCount > 1 ? "s" : ""}` : "Operação estável"}
            </h2>
            <p className="text-sm text-muted-foreground">
              {criticalCount > 0
                ? "Itens que exigem atenção imediata da gestão."
                : "Nenhum alerta crítico no momento."}
            </p>
          </div>
        </div>
        {criticalCount > 0 && (
          <div className="grid gap-2 sm:grid-cols-2 mt-4">
            {overdueOS > 0 && (
              <div className="flex items-center justify-between rounded-lg border border-border bg-card px-3 py-2">
                <span className="text-sm text-foreground flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-red-500" /> OP atrasadas (SLA vencido)</span>
                <CarboBadge variant="destructive" size="sm">{overdueOS}</CarboBadge>
              </div>
            )}
            {offlineMachines > 0 && (
              <div className="flex items-center justify-between rounded-lg border border-border bg-card px-3 py-2">
                <span className="text-sm text-foreground flex items-center gap-2"><Cpu className="h-4 w-4 text-red-500" /> Máquinas fora de operação</span>
                <CarboBadge variant="destructive" size="sm">{offlineMachines}</CarboBadge>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Receita por mês (rede) ────────────────────────────────────────── */}
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

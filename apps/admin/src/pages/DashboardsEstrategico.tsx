import { useState } from "react";
import {
  Target, FileText, AlertTriangle, Users, DollarSign, Cpu, TrendingUp, TrendingDown,
  ShieldAlert, ShieldCheck, BarChart3, Trophy, CheckCircle2,
} from "lucide-react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from "recharts";
import { startOfMonth, getDaysInMonth, getDate } from "date-fns";
import { CarboPageHeader } from "@/components/ui/carbo-page-header";
import { CarboBadge } from "@/components/ui/carbo-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/contexts/AuthContext";
import { fmtBRL } from "@/lib/dash-format";
import { useDashEstrategico } from "@/hooks/useDashEstrategico";
import { useMetasVendedores } from "@/hooks/useMetasVendedores";
import {
  useCeoSales, useOsByDepartment, useCeoAlerts, useCeoAchievements,
  usePartnerRanking, useRuptureData, type SalesPeriod,
} from "@/hooks/useCeoCockpit";
import { OperationalFlowMap } from "@/components/cockpit/OperationalFlowMap";
import { StockRuptureAlert } from "@/components/cockpit/StockRuptureAlert";

function RestrictedNotice() {
  return (
    <div className="rounded-xl border border-dashed border-amber-500/40 bg-amber-500/5 p-6 flex flex-col items-center gap-2 text-center">
      <AlertTriangle className="h-8 w-8 text-amber-500/70" />
      <p className="text-sm font-medium">Área restrita a gestores.</p>
    </div>
  );
}

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

const PIE_COLORS = ["#22c55e", "#3b82f6", "#8b5cf6", "#f59e0b", "#14b8a6", "#ef4444"];

export default function DashboardsEstrategico() {
  const { canAdmin } = useAuth();
  const { data, isLoading } = useDashEstrategico(12);

  const month = startOfMonth(new Date());
  const weekStart = commercialWeekStartOf(new Date());
  const { data: metas = [] } = useMetasVendedores(month, weekStart);

  // Blocos espelhados do CeoDashboard
  const [salesPeriod, setSalesPeriod] = useState<SalesPeriod>("semanas");
  const [periodFrom, setPeriodFrom] = useState("");
  const [periodTo, setPeriodTo] = useState("");
  const { data: salesData = [] } = useCeoSales(salesPeriod, periodFrom, periodTo);
  const { data: osByDept = [] } = useOsByDepartment();
  const { data: alerts = [] } = useCeoAlerts();
  const { data: achievements = [] } = useCeoAchievements();
  const { data: ranking = [] } = usePartnerRanking();
  const { machines: ruptureMachines, consumptionHistory } = useRuptureData();

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

  // ── Alertas críticos consolidados (semáforo topo) ─────────────────────────
  const overdueOS = data?.overdueOS ?? 0;
  const offlineMachines = Math.max(0, (data?.totalMachines ?? 0) - (data?.activeMachines ?? 0));
  const growth = data?.growthPercent ?? 0;

  // ── KPIs macro (cards com sub-texto) ───────────────────────────────────────
  const macroCards = [
    { title: "Receita do mês", value: fmtK(data?.monthlyRevenue ?? 0), sub: "Faturamento da rede (mês corrente)", icon: DollarSign, accent: "border-l-green-500", iconBg: "bg-green-500/10 text-green-600" },
    { title: "Crescimento", value: `${growth >= 0 ? "+" : ""}${growth}%`, sub: "vs mês anterior", icon: growth >= 0 ? TrendingUp : TrendingDown, accent: growth >= 0 ? "border-l-green-500" : "border-l-red-500", iconBg: growth >= 0 ? "bg-green-500/10 text-green-600" : "bg-red-500/10 text-red-500" },
    { title: "Licenciados ativos", value: (data?.activeLicensees ?? 0).toLocaleString("pt-BR"), sub: (data?.newLicensees ?? 0) > 0 ? `+${data?.newLicensees} novos no mês` : "Nenhum novo no mês", icon: Users, accent: "border-l-blue-400", iconBg: "bg-blue-400/10 text-blue-500" },
    { title: "OP ativas", value: (data?.activeOS ?? 0).toLocaleString("pt-BR"), sub: "Ordens de produção em aberto", icon: FileText, accent: "border-l-violet-400", iconBg: "bg-violet-400/10 text-violet-500" },
    { title: "OP atrasadas", value: overdueOS.toLocaleString("pt-BR"), sub: overdueOS > 0 ? "SLA vencido — atenção" : "Nenhuma atrasada", icon: AlertTriangle, accent: overdueOS > 0 ? "border-l-red-500" : "border-l-green-500", iconBg: overdueOS > 0 ? "bg-red-500/10 text-red-500" : "bg-green-500/10 text-green-600" },
    { title: "Máquinas operacionais", value: `${(data?.activeMachines ?? 0)}/${(data?.totalMachines ?? 0)}`, sub: offlineMachines > 0 ? `${offlineMachines} fora de operação` : "Todas operacionais", icon: Cpu, accent: "border-l-blue-400", iconBg: "bg-blue-400/10 text-blue-500" },
  ];

  const revChart = (salesData as { name: string; vendas: number; receita: number }[]);
  const hasSales = revChart.some((d) => d.receita > 0);
  const hasDept = (osByDept as { name: string; value: number }[]).length > 0;

  const sevColor = (s: string) => s === "high" ? "text-red-500 bg-red-500/10 border-red-500/20"
    : s === "medium" ? "text-amber-500 bg-amber-500/10 border-amber-500/20"
    : "text-muted-foreground bg-muted/40 border-border";

  return (
    <main className="mx-auto max-w-6xl px-4 sm:px-6 py-8 space-y-6">
      <CarboPageHeader
        icon={Target}
        iconColor="gradient"
        title="Cockpit Estratégico"
        description="Visão global do ecossistema Carbo · saúde da operação num só lugar"
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
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-6">
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

      {/* ── Performance de Vendas + OP por Departamento ───────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2 rounded-2xl border-0 shadow-sm">
          <CardHeader className="pb-1 pt-5 px-5">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-primary" /> Performance de Vendas
              </CardTitle>
              <div className="flex items-center gap-2 flex-wrap">
                <div className="flex gap-1 bg-muted/40 rounded-lg p-1">
                  {(["semanas", "meses", "periodo"] as SalesPeriod[]).map((p) => (
                    <button key={p} onClick={() => setSalesPeriod(p)}
                      className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors capitalize ${salesPeriod === p ? "bg-carbo-green text-white" : "text-muted-foreground hover:text-foreground"}`}>
                      {p === "periodo" ? "Período" : p}
                    </button>
                  ))}
                </div>
                {salesPeriod === "periodo" && (
                  <div className="flex items-center gap-1">
                    <Input type="date" className="h-8 w-[130px] text-xs" value={periodFrom} onChange={(e) => setPeriodFrom(e.target.value)} />
                    <span className="text-xs text-muted-foreground">até</span>
                    <Input type="date" className="h-8 w-[130px] text-xs" value={periodTo} onChange={(e) => setPeriodTo(e.target.value)} />
                  </div>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent className="px-2 pb-4">
            {!hasSales ? (
              <p className="px-3 py-16 text-center text-sm text-muted-foreground">Sem vendas no período.</p>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <AreaChart data={revChart} margin={{ top: 8, right: 12, left: -6, bottom: 0 }}>
                  <defs>
                    <linearGradient id="ceoSales" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#22c55e" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false}
                    tickFormatter={(x: number) => (x >= 1000 ? `${Math.round(x / 1000)}k` : String(x))} />
                  <Tooltip
                    contentStyle={{ background: "var(--background)", border: "1px solid var(--border)", borderRadius: 10, fontSize: 12 }}
                    formatter={(v: number, n: string) => n === "receita" ? [fmtBRL(v), "Receita"] : [v, "Vendas"]} />
                  <Area type="monotone" dataKey="receita" stroke="#22c55e" strokeWidth={2} fill="url(#ceoSales)" />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-0 shadow-sm">
          <CardHeader className="pb-1 pt-5 px-5">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <FileText className="h-4 w-4 text-primary" /> OP por Departamento
            </CardTitle>
          </CardHeader>
          <CardContent className="px-2 pb-4">
            {!hasDept ? (
              <p className="px-3 py-16 text-center text-sm text-muted-foreground">Sem OP ativa.</p>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie data={osByDept} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={45} outerRadius={80} paddingAngle={2}>
                    {(osByDept as any[]).map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Pie>
                  <Tooltip contentStyle={{ background: "var(--background)", border: "1px solid var(--border)", borderRadius: 10, fontSize: 12 }} formatter={(v: number) => [`${v} OP`, ""]} />
                  <Legend formatter={(v) => <span className="text-xs">{v}</span>} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Fluxo Operacional ─────────────────────────────────────────────── */}
      <Card className="rounded-2xl border-0 shadow-sm">
        <CardContent className="p-5">
          <OperationalFlowMap />
        </CardContent>
      </Card>

      {/* ── Gargalos + Conquistas ─────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="rounded-2xl border-0 shadow-sm">
          <CardHeader className="pb-2 pt-5 px-5">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-amber-500" /> Gargalos Identificados
            </CardTitle>
          </CardHeader>
          <CardContent className="px-5 pb-5 space-y-2">
            {(alerts as { title: string; description: string; severity: string }[]).map((a, i) => (
              <div key={i} className={`flex items-start gap-3 rounded-lg border px-3 py-2.5 ${sevColor(a.severity)}`}>
                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground">{a.title}</p>
                  <p className="text-xs text-muted-foreground">{a.description}</p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-0 shadow-sm">
          <CardHeader className="pb-2 pt-5 px-5">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-green-600" /> Conquistas Recentes
            </CardTitle>
          </CardHeader>
          <CardContent className="px-5 pb-5 space-y-2">
            {(achievements as { title: string; description: string }[]).map((a, i) => (
              <div key={i} className="flex items-start gap-3 rounded-lg border border-green-500/20 bg-green-500/5 px-3 py-2.5">
                <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0 text-green-600" />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground">{a.title}</p>
                  <p className="text-xs text-muted-foreground">{a.description}</p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* ── Ranking de Parceiros ──────────────────────────────────────────── */}
      <Card className="rounded-2xl border-0 shadow-sm">
        <CardHeader className="pb-2 pt-5 px-5">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Trophy className="h-4 w-4 text-amber-500" /> Ranking de Parceiros
          </CardTitle>
        </CardHeader>
        <CardContent className="px-5 pb-5">
          {(ranking as any[]).length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Sem dados de gamificação.</p>
          ) : (
            <div className="divide-y divide-border">
              {(ranking as any[]).map((p, idx) => (
                <div key={p.licensee_id ?? idx} className="flex items-center justify-between py-2.5">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="w-6 text-center shrink-0 text-sm font-bold text-muted-foreground">
                      {idx === 0 ? "🥇" : idx === 1 ? "🥈" : idx === 2 ? "🥉" : `${idx + 1}º`}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-foreground truncate">{p.licensees?.name || "—"}</p>
                      <p className="text-xs text-muted-foreground">Nível {p.level ?? 0} · {p.total_orders ?? 0} pedidos</p>
                    </div>
                  </div>
                  <CarboBadge variant="success" size="sm">{(p.total_score ?? 0).toLocaleString("pt-BR")} pts</CarboBadge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Risco de Ruptura de Estoque (read-only) ───────────────────────── */}
      <StockRuptureAlert machines={ruptureMachines} consumptionHistory={consumptionHistory} />
    </main>
  );
}

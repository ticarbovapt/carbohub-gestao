import { useState, useMemo } from "react";
import { BoardLayout } from "@/components/layouts/BoardLayout";
import { CarboCard, CarboCardContent, CarboCardHeader, CarboCardTitle } from "@/components/ui/carbo-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { CarboBadge } from "@/components/ui/carbo-badge";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Cell,
} from "recharts";
import { format, startOfMonth, addMonths, subMonths, getDaysInMonth, getDate } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ChevronLeft, ChevronRight, Settings, TrendingUp, TrendingDown, Target, AlertTriangle, CheckCircle2 } from "lucide-react";
import {
  useMetaStats,
  useMetaTargets,
  useMetaDailyActuals,
  useUpsertMetaTarget,
  ALL_PLATFORMS,
  PLATFORM_META,
  type MetaPlatform,
  type PlatformMetaStats,
} from "@/hooks/useMetaEcommerce";
import { useCanSeeAdminMenu } from "@/hooks/useActionPermissions";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function fmtBRL(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function fmtPct(v: number) {
  return `${v.toFixed(1)}%`;
}

const COLOR_MAP = {
  green:  { bar: "#22c55e", badge: "success"  as const, text: "text-green-500",  bg: "bg-green-500/10"  },
  yellow: { bar: "#f59e0b", badge: "warning"  as const, text: "text-amber-500",  bg: "bg-amber-500/10"  },
  red:    { bar: "#ef4444", badge: "destructive" as const, text: "text-red-500", bg: "bg-red-500/10"    },
  gray:   { bar: "#64748b", badge: "secondary" as const, text: "text-muted-foreground", bg: "bg-muted/30" },
};

// ─────────────────────────────────────────────────────────────────────────────
// Smart progress bar
// ─────────────────────────────────────────────────────────────────────────────

function SmartProgressBar({
  actual,
  target,
  color,
  showExpected,
  expectedPct,
}: {
  actual: number;
  target: number;
  color: "green" | "yellow" | "red" | "gray";
  showExpected?: boolean;
  expectedPct?: number;
}) {
  const pct = target > 0 ? Math.min(100, (actual / target) * 100) : 0;
  const barColor = COLOR_MAP[color].bar;

  return (
    <div className="relative h-3 bg-muted rounded-full overflow-hidden">
      {/* Actual fill */}
      <div
        className="h-full rounded-full transition-all duration-700"
        style={{ width: `${pct}%`, backgroundColor: barColor }}
      />
      {/* Expected marker */}
      {showExpected && expectedPct !== undefined && expectedPct > 0 && expectedPct < 100 && (
        <div
          className="absolute top-0 bottom-0 w-0.5 bg-foreground/40"
          style={{ left: `${Math.min(100, expectedPct)}%` }}
          title={`Esperado hoje: ${expectedPct.toFixed(0)}%`}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Platform card
// ─────────────────────────────────────────────────────────────────────────────

function PlatformCard({
  stats,
  onEdit,
  canEdit,
}: {
  stats: PlatformMetaStats;
  onEdit: () => void;
  canEdit: boolean;
}) {
  const colors = COLOR_MAP[stats.progressColor];
  const Icon = stats.progressColor === "green"
    ? CheckCircle2
    : stats.progressColor === "red"
      ? AlertTriangle
      : TrendingUp;

  return (
    <CarboCard className={`border ${stats.progressColor === "red" ? "border-red-500/30" : stats.progressColor === "yellow" ? "border-amber-500/30" : ""}`}>
      <CarboCardContent className="p-4 space-y-3">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xl">{stats.emoji}</span>
            <div>
              <p className="font-semibold text-sm leading-tight">{stats.label}</p>
              {stats.target > 0 ? (
                <p className="text-xs text-muted-foreground">Meta: {fmtBRL(stats.target)}</p>
              ) : (
                <p className="text-xs text-muted-foreground italic">Sem meta definida</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <CarboBadge variant={colors.badge} size="sm">
              {fmtPct(stats.actualPct)}
            </CarboBadge>
            {canEdit && (
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onEdit}>
                <Settings className="h-3 w-3" />
              </Button>
            )}
          </div>
        </div>

        {/* Amount */}
        <div>
          <p className={`text-2xl font-bold tabular-nums ${colors.text}`}>
            {fmtBRL(stats.actual)}
          </p>
        </div>

        {/* Progress bar */}
        <SmartProgressBar
          actual={stats.actual}
          target={stats.target}
          color={stats.progressColor}
          showExpected
          expectedPct={stats.expectedPct}
        />

        {/* Footer metrics */}
        <div className="grid grid-cols-2 gap-2 pt-1">
          <div className={`rounded-lg p-2 ${colors.bg} text-center`}>
            <p className="text-[10px] text-muted-foreground">Projeção FDM</p>
            <p className="text-sm font-bold tabular-nums">{fmtBRL(stats.projectedEOM)}</p>
          </div>
          <div className="rounded-lg p-2 bg-muted/30 text-center">
            <p className="text-[10px] text-muted-foreground">Faltam</p>
            <p className="text-sm font-bold tabular-nums">{stats.remaining > 0 ? fmtBRL(stats.remaining) : "✓ Batida"}</p>
          </div>
        </div>
      </CarboCardContent>
    </CarboCard>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Daily chart
// ─────────────────────────────────────────────────────────────────────────────

function DailyChart({
  month,
  totalTarget,
  progressColor,
}: {
  month: Date;
  totalTarget: number;
  progressColor: "green" | "yellow" | "red" | "gray";
}) {
  const { data: daily = [] } = useMetaDailyActuals(month);
  const daysInMonth = getDaysInMonth(month);
  const dailyTarget = totalTarget > 0 ? totalTarget / daysInMonth : 0;

  const data = daily.map((d) => ({
    ...d,
    label: String(d.day),
    color: dailyTarget > 0
      ? d.revenue >= dailyTarget
        ? "#22c55e"
        : d.revenue >= dailyTarget * 0.7
          ? "#f59e0b"
          : "#ef4444"
      : "#6366f1",
  }));

  return (
    <div className="w-full h-64">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
            width={40}
          />
          <Tooltip
            formatter={(v: number) => [fmtBRL(v), "Faturamento"]}
            labelFormatter={(l) => `Dia ${l}`}
            contentStyle={{
              background: "hsl(var(--popover))",
              border: "1px solid hsl(var(--border))",
              borderRadius: "8px",
              fontSize: 12,
            }}
          />
          {dailyTarget > 0 && (
            <ReferenceLine
              y={dailyTarget}
              stroke="hsl(var(--muted-foreground))"
              strokeDasharray="4 4"
              label={{ value: "Meta/dia", position: "insideTopRight", fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
            />
          )}
          <Bar dataKey="revenue" radius={[3, 3, 0, 0]}>
            {data.map((entry, i) => (
              <Cell key={i} fill={entry.color} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Edit target dialog
// ─────────────────────────────────────────────────────────────────────────────

function EditTargetDialog({
  open,
  onClose,
  month,
  platform,
  currentTarget,
}: {
  open: boolean;
  onClose: () => void;
  month: Date;
  platform: MetaPlatform;
  currentTarget: number;
}) {
  const [value, setValue] = useState(String(currentTarget));
  const upsert = useUpsertMetaTarget();
  const meta = platform ? PLATFORM_META[platform] : { label: "Total Geral", emoji: "🎯", color: "#22c55e" };

  const handleSave = async () => {
    const amount = Number(value.replace(",", ".").replace(/[^0-9.]/g, ""));
    if (isNaN(amount) || amount < 0) return;
    await upsert.mutateAsync({ month, platform, target_amount: amount });
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span>{meta.emoji}</span> Meta {meta.label}
          </DialogTitle>
          <DialogDescription>
            {format(month, "MMMM 'de' yyyy", { locale: ptBR })}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <p className="text-sm text-muted-foreground">Meta de faturamento (R$)</p>
          <Input
            type="number"
            min={0}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="text-xl font-bold"
            placeholder="0"
            autoFocus
          />
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSave} disabled={upsert.isPending}>Salvar</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main page
// ─────────────────────────────────────────────────────────────────────────────

export default function MetaEcommercePage() {
  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const [editDialog, setEditDialog] = useState<{ platform: MetaPlatform; target: number } | null>(null);
  const canEdit = useCanSeeAdminMenu();

  const { totalStats, platformStats, isLoading } = useMetaStats(month);

  const isCurrentMonth =
    month.getFullYear() === new Date().getFullYear() &&
    month.getMonth() === new Date().getMonth();

  const totalColors = COLOR_MAP[totalStats.progressColor];

  return (
    <BoardLayout>
      <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto">

        {/* Page header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              🎯 Meta Ecommerce
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Faturamento real vs metas mensais por plataforma
            </p>
          </div>

          {/* Month selector */}
          <div className="flex items-center gap-2 bg-muted/40 rounded-lg px-3 py-1.5">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => setMonth((m) => startOfMonth(subMonths(m, 1)))}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm font-semibold w-36 text-center capitalize">
              {format(month, "MMMM 'de' yyyy", { locale: ptBR })}
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => setMonth((m) => startOfMonth(addMonths(m, 1)))}
              disabled={isCurrentMonth}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* ── TOTAL HERO CARD ─────────────────────────────────────────────── */}
        <CarboCard className={`border-2 ${totalStats.progressColor === "green" ? "border-green-500/40" : totalStats.progressColor === "yellow" ? "border-amber-500/40" : totalStats.progressColor === "red" ? "border-red-500/40" : "border-border"}`}>
          <CarboCardContent className="p-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              {/* Left: numbers */}
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground font-medium uppercase tracking-wider">
                  Faturamento Total do Mês
                </p>
                <div className="flex items-end gap-3">
                  <p className={`text-4xl font-bold tabular-nums ${totalColors.text}`}>
                    {fmtBRL(totalStats.actual)}
                  </p>
                  {totalStats.target > 0 && (
                    <p className="text-lg text-muted-foreground mb-1">
                      / {fmtBRL(totalStats.target)}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <CarboBadge variant={totalColors.badge} size="sm">
                    {fmtPct(totalStats.actualPct)} realizado
                  </CarboBadge>
                  <CarboBadge variant="secondary" size="sm">
                    Esperado hoje: {fmtPct(totalStats.expectedPct)}
                  </CarboBadge>
                  {canEdit && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 text-xs gap-1"
                      onClick={() => setEditDialog({ platform: null, target: totalStats.target })}
                    >
                      <Settings className="h-3 w-3" />
                      Definir meta total
                    </Button>
                  )}
                </div>
              </div>

              {/* Right: projection */}
              <div className="grid grid-cols-2 gap-3 min-w-[240px]">
                <div className={`rounded-xl p-3 ${totalColors.bg} text-center`}>
                  <p className="text-[11px] text-muted-foreground">Projeção FDM</p>
                  <p className={`text-lg font-bold tabular-nums ${totalColors.text}`}>
                    {fmtBRL(totalStats.projectedEOM)}
                  </p>
                  {totalStats.target > 0 && (
                    <p className="text-[10px] text-muted-foreground">
                      {fmtPct((totalStats.projectedEOM / totalStats.target) * 100)} da meta
                    </p>
                  )}
                </div>
                <div className="rounded-xl p-3 bg-muted/30 text-center">
                  <p className="text-[11px] text-muted-foreground">Faltam</p>
                  <p className="text-lg font-bold tabular-nums">
                    {totalStats.remaining > 0 ? fmtBRL(totalStats.remaining) : "✓"}
                  </p>
                  {totalStats.remaining === 0 && (
                    <p className="text-[10px] text-green-500 font-medium">Meta batida!</p>
                  )}
                </div>
              </div>
            </div>

            {/* Progress bar total */}
            <div className="mt-4 space-y-1">
              <SmartProgressBar
                actual={totalStats.actual}
                target={totalStats.target}
                color={totalStats.progressColor}
                showExpected
                expectedPct={totalStats.expectedPct}
              />
              <div className="flex justify-between text-[10px] text-muted-foreground">
                <span>R$ 0</span>
                {totalStats.target > 0 && (
                  <>
                    <span className="flex items-center gap-1">
                      <span className="inline-block w-0.5 h-2.5 bg-foreground/40 rounded" />
                      Esperado hoje ({fmtPct(totalStats.expectedPct)})
                    </span>
                    <span>{fmtBRL(totalStats.target)}</span>
                  </>
                )}
              </div>
            </div>
          </CarboCardContent>
        </CarboCard>

        {/* ── PLATFORM CARDS GRID ─────────────────────────────────────────── */}
        <div>
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
            Por Plataforma
          </h2>
          {isLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
              {ALL_PLATFORMS.map((p) => (
                <div key={String(p)} className="h-52 rounded-xl bg-muted/40 animate-pulse" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
              {platformStats.map((stats) => (
                <PlatformCard
                  key={String(stats.platform)}
                  stats={stats}
                  canEdit={canEdit}
                  onEdit={() =>
                    setEditDialog({ platform: stats.platform, target: stats.target })
                  }
                />
              ))}
            </div>
          )}
        </div>

        {/* ── DAILY CHART ─────────────────────────────────────────────────── */}
        <CarboCard>
          <CarboCardHeader>
            <CarboCardTitle className="text-base flex items-center gap-2">
              📊 Faturamento Diário — {format(month, "MMMM/yy", { locale: ptBR })}
              <span className="text-xs font-normal text-muted-foreground ml-1">
                (barra verde = acima da meta diária · amarela = próximo · vermelha = abaixo)
              </span>
            </CarboCardTitle>
          </CarboCardHeader>
          <CarboCardContent>
            <DailyChart
              month={month}
              totalTarget={totalStats.target}
              progressColor={totalStats.progressColor}
            />
          </CarboCardContent>
        </CarboCard>

        {/* ── HORIZONTAL RANKING ──────────────────────────────────────────── */}
        {!isLoading && platformStats.some((s) => s.target > 0) && (
          <CarboCard>
            <CarboCardHeader>
              <CarboCardTitle className="text-base">
                📈 Ranking de Performance por Plataforma
              </CarboCardTitle>
            </CarboCardHeader>
            <CarboCardContent>
              <div className="space-y-3">
                {[...platformStats]
                  .sort((a, b) => b.actualPct - a.actualPct)
                  .map((stats) => {
                    const colors = COLOR_MAP[stats.progressColor];
                    return (
                      <div key={String(stats.platform)} className="flex items-center gap-3">
                        <span className="text-base w-6 text-center">{stats.emoji}</span>
                        <div className="w-28 text-sm font-medium truncate">{stats.label}</div>
                        <div className="flex-1 relative h-6 bg-muted rounded-md overflow-hidden">
                          <div
                            className="h-full rounded-md transition-all duration-700 flex items-center justify-end pr-2"
                            style={{
                              width: `${Math.min(100, stats.actualPct)}%`,
                              backgroundColor: colors.bar,
                              minWidth: stats.actual > 0 ? "2px" : "0",
                            }}
                          >
                            {stats.actualPct > 15 && (
                              <span className="text-white text-xs font-bold">
                                {fmtPct(stats.actualPct)}
                              </span>
                            )}
                          </div>
                          {stats.expectedPct > 0 && stats.expectedPct < 100 && (
                            <div
                              className="absolute top-0 bottom-0 w-0.5 bg-foreground/40"
                              style={{ left: `${stats.expectedPct}%` }}
                            />
                          )}
                        </div>
                        <div className="w-24 text-right text-sm tabular-nums font-semibold">
                          {fmtBRL(stats.actual)}
                        </div>
                      </div>
                    );
                  })}
              </div>
              <p className="text-[10px] text-muted-foreground mt-3 text-center">
                Linha vertical = % esperado para hoje com base no dia do mês
              </p>
            </CarboCardContent>
          </CarboCard>
        )}

        {/* Edit target dialog */}
        {editDialog && (
          <EditTargetDialog
            open={!!editDialog}
            onClose={() => setEditDialog(null)}
            month={month}
            platform={editDialog.platform}
            currentTarget={editDialog.target}
          />
        )}
      </div>
    </BoardLayout>
  );
}

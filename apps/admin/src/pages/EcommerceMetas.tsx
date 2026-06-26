import { useState } from "react";
import { CarboCard, CarboCardContent, CarboCardHeader, CarboCardTitle } from "@/components/ui/carbo-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { CarboBadge } from "@/components/ui/carbo-badge";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, Cell, LabelList,
  LineChart, Line, ComposedChart, ReferenceDot,
} from "recharts";
import {
  format, startOfMonth, addMonths, subMonths,
  getDaysInMonth, getDate,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  ChevronLeft, ChevronRight, TrendingUp,
  TrendingDown, RefreshCw,
  Calendar, Zap,
} from "lucide-react";
import {
  useMetaStats,
  useMetaActuals,
  useMetaDailyActuals,
  useMetaMonthlyHistory,
  useUpsertMetaTarget,
  ALL_PLATFORMS,
  PLATFORM_META,
  type MetaPlatform,
  type PlatformMetaStats,
} from "@/hooks/useMetaEcommerce";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function fmtBRL(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 0, maximumFractionDigits: 0 });
}
function fmtPct(v: number) { return `${v.toFixed(1)}%`; }

const COLOR_MAP = {
  green:  { bar: "#22c55e", badge: "success"     as const, text: "text-green-500",        bg: "bg-green-500/10"  },
  yellow: { bar: "#f59e0b", badge: "warning"     as const, text: "text-amber-500",        bg: "bg-amber-500/10"  },
  red:    { bar: "#ef4444", badge: "destructive" as const, text: "text-red-500",          bg: "bg-red-500/10"    },
  gray:   { bar: "#64748b", badge: "secondary"   as const, text: "text-muted-foreground", bg: "bg-muted/30"      },
};

function barColor(revenue: number, target: number) {
  if (target <= 0) return "#6366f1";
  if (revenue >= target) return "#22c55e";
  if (revenue >= target * 0.7) return "#f59e0b";
  return "#ef4444";
}

// Formata string de dígitos brutos → "R$ 150.000"
function formatBRLInput(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (!digits) return "";
  const num = parseInt(digits, 10);
  return num.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

// Delta badge vs mês anterior
function DeltaBadge({ current, prev }: { current: number; prev: number }) {
  if (prev <= 0 && current <= 0) return null;
  if (prev <= 0) return <span className="text-[10px] text-muted-foreground">novo</span>;
  const delta = ((current - prev) / prev) * 100;
  const up = delta >= 0;
  return (
    <span className={`inline-flex items-center gap-0.5 text-[10px] font-semibold ${up ? "text-green-500" : "text-red-500"}`}>
      {up ? <TrendingUp className="h-2.5 w-2.5" /> : <TrendingDown className="h-2.5 w-2.5" />}
      {up ? "+" : ""}{delta.toFixed(1)}%
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Smart progress bar
// ─────────────────────────────────────────────────────────────────────────────

function SmartProgressBar({
  actual, target, color, showExpected, expectedPct,
}: {
  actual: number; target: number;
  color: "green" | "yellow" | "red" | "gray";
  showExpected?: boolean; expectedPct?: number;
}) {
  const pct = target > 0 ? Math.min(100, (actual / target) * 100) : 0;
  return (
    <div className="relative h-3 bg-muted rounded-full overflow-hidden">
      <div className="h-full rounded-full transition-all duration-700"
        style={{ width: `${pct}%`, backgroundColor: COLOR_MAP[color].bar }} />
      {showExpected && expectedPct !== undefined && expectedPct > 0 && expectedPct < 100 && (
        <div className="absolute top-0 bottom-0 w-0.5 bg-foreground/40"
          style={{ left: `${Math.min(100, expectedPct)}%` }}
          title={`Esperado hoje: ${expectedPct.toFixed(0)}%`} />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Platform card (now receives prevRevenue for delta)
// ─────────────────────────────────────────────────────────────────────────────

function PlatformCard({
  stats, prevRevenue,
}: {
  stats: PlatformMetaStats; prevRevenue: number;
}) {
  const colors = COLOR_MAP[stats.progressColor];
  return (
    <CarboCard className={`border ${stats.progressColor === "red" ? "border-red-500/30" : stats.progressColor === "yellow" ? "border-amber-500/30" : ""}`}>
      <CarboCardContent className="p-4 space-y-3">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xl">{stats.emoji}</span>
            <div>
              <p className="font-semibold text-sm leading-tight">{stats.label}</p>
              {stats.target > 0
                ? <p className="text-xs text-muted-foreground">Meta: {fmtBRL(stats.target)}</p>
                : <p className="text-xs text-muted-foreground italic">Sem meta definida</p>}
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <CarboBadge variant={colors.badge} size="sm">{fmtPct(stats.actualPct)}</CarboBadge>
          </div>
        </div>

        {/* Amount + delta */}
        <div className="flex items-end justify-between">
          <p className={`text-2xl font-bold tabular-nums ${colors.text}`}>{fmtBRL(stats.actual)}</p>
          <div className="flex flex-col items-end gap-0.5">
            <DeltaBadge current={stats.actual} prev={prevRevenue} />
            {prevRevenue > 0 && (
              <span className="text-[9px] text-muted-foreground">vs mês ant.</span>
            )}
          </div>
        </div>

        {/* Progress */}
        <SmartProgressBar actual={stats.actual} target={stats.target}
          color={stats.progressColor} showExpected expectedPct={stats.expectedPct} />

        {/* Footer */}
        <div className="grid grid-cols-2 gap-2 pt-1">
          <div className={`rounded-lg p-2 ${colors.bg} text-center`}>
            <p className="text-[10px] text-muted-foreground">Projeção FDM</p>
            <p className="text-sm font-bold tabular-nums">{fmtBRL(stats.projectedEOM)}</p>
          </div>
          <div className="rounded-lg p-2 bg-muted/30 text-center">
            <p className="text-[10px] text-muted-foreground">Faltam</p>
            <p className="text-sm font-bold tabular-nums">
              {stats.remaining > 0 ? fmtBRL(stats.remaining) : "✓ Batida"}
            </p>
          </div>
        </div>
      </CarboCardContent>
    </CarboCard>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Tooltip style compartilhado
// ─────────────────────────────────────────────────────────────────────────────

const TOOLTIP_STYLE = {
  background: "hsl(var(--popover))",
  border: "1px solid hsl(var(--border))",
  borderRadius: "8px",
  fontSize: 12,
};

// ─────────────────────────────────────────────────────────────────────────────
// Chart type: "daily" | "cumulative" | "history"
// ─────────────────────────────────────────────────────────────────────────────

type ChartTab    = "daily" | "cumulative" | "history";
type ChartFilter = "all" | MetaPlatform;

const FILTER_OPTIONS: { value: ChartFilter; emoji: string; label: string }[] = [
  { value: "all",          emoji: "🎯", label: "Total"      },
  { value: "mercadolivre", emoji: "🛒", label: "ML"         },
  { value: "amazon",       emoji: "📦", label: "Amazon"     },
  { value: "tiktok",       emoji: "🎵", label: "TikTok"     },
  { value: "shopee",       emoji: "🧡", label: "Shopee"     },
  { value: "vindi",        emoji: "📄", label: "LPs/Assin." },
];

// ─────────────────────────────────────────────────────────────────────────────
// Daily bars chart (receives filter from parent)
// ─────────────────────────────────────────────────────────────────────────────

function DailyBarsChart({ month, activeTarget, hookPlatform }: {
  month: Date; activeTarget: number; hookPlatform: MetaPlatform;
}) {
  const { data: daily = [] } = useMetaDailyActuals(month, hookPlatform);
  const daysInMonth = getDaysInMonth(month);
  const dailyTarget = activeTarget > 0 ? activeTarget / daysInMonth : 0;
  const totalRevenue = daily.reduce((s, d) => s + d.revenue, 0);

  const data = daily.map((d) => ({
    ...d,
    label: String(d.day),
    color: barColor(d.revenue, dailyTarget),
    contributionPct: totalRevenue > 0 ? (d.revenue / totalRevenue) * 100 : 0,
  }));

  const renderPctLabel = (props: any) => {
    const { x, y, width, value } = props;
    if (!value || value < 0.3) return null;
    return (
      <text x={x + width / 2} y={y - 3} textAnchor="middle"
        fontSize={9} fill="hsl(var(--muted-foreground))">
        {value.toFixed(1)}%
      </text>
    );
  };

  return (
    <div className="w-full h-72">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 22, right: 4, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} />
          <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false}
            tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} width={40} />
          <Tooltip formatter={(v: number) => [fmtBRL(v), "Faturamento"]}
            labelFormatter={(l) => `Dia ${l}`} contentStyle={TOOLTIP_STYLE} />
          {dailyTarget > 0 && (
            <ReferenceLine y={dailyTarget} stroke="hsl(var(--muted-foreground))" strokeDasharray="4 4"
              label={{ value: "Meta/dia", position: "insideTopRight", fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
          )}
          <Bar dataKey="revenue" radius={[3, 3, 0, 0]}>
            {data.map((entry, i) => <Cell key={i} fill={entry.color} />)}
            <LabelList dataKey="contributionPct" content={renderPctLabel} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Cumulative line chart
// ─────────────────────────────────────────────────────────────────────────────

function CumulativeLineChart({ month, activeTarget, hookPlatform }: {
  month: Date; activeTarget: number; hookPlatform: MetaPlatform;
}) {
  const { data: daily = [] } = useMetaDailyActuals(month, hookPlatform);
  const daysInMonth = getDaysInMonth(month);

  let cumSum = 0;
  const data = daily.map((d) => {
    cumSum += d.revenue;
    return {
      label: String(d.day),
      cumRevenue: cumSum,
      cumTarget: activeTarget > 0 ? Math.round((d.day / daysInMonth) * activeTarget) : undefined,
    };
  });

  // Cor da linha de realizado: compara último ponto com meta acumulada
  const last = data[data.length - 1];
  const lineColor = !last || !activeTarget
    ? "#6366f1"
    : last.cumRevenue >= (last.cumTarget ?? 0) ? "#22c55e"
      : last.cumRevenue >= (last.cumTarget ?? 0) * 0.85 ? "#f59e0b"
      : "#ef4444";

  // Primeiro dia em que a meta mensal foi batida
  const targetHitPoint = activeTarget > 0
    ? data.find((d) => d.cumRevenue >= activeTarget)
    : null;

  return (
    <div className="w-full h-72">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 28, right: 16, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} />
          <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false}
            tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} width={40} />
          <Tooltip
            formatter={(v: number, name: string) => [
              fmtBRL(v),
              name === "cumRevenue" ? "Realizado acumulado" : "Meta acumulada",
            ]}
            labelFormatter={(l) => `Dia ${l}`}
            contentStyle={TOOLTIP_STYLE}
          />
          {activeTarget > 0 && (
            <Line type="linear" dataKey="cumTarget" stroke="hsl(var(--muted-foreground))"
              strokeDasharray="5 5" strokeWidth={1.5} dot={false} name="cumTarget" />
          )}
          <Line type="monotone" dataKey="cumRevenue" stroke={lineColor}
            strokeWidth={2.5} dot={false} name="cumRevenue" />
          {/* Marcador no dia em que a meta foi batida */}
          {targetHitPoint && (
            <ReferenceDot
              x={targetHitPoint.label}
              y={targetHitPoint.cumRevenue}
              r={7}
              fill="#22c55e"
              stroke="white"
              strokeWidth={2.5}
              label={{
                value: `🎯 Dia ${targetHitPoint.label}`,
                position: "top",
                fontSize: 11,
                fontWeight: 600,
                fill: "#22c55e",
              }}
            />
          )}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Historical bar chart — com seletor de período
// ─────────────────────────────────────────────────────────────────────────────

const PERIOD_OPTIONS = [
  { value: 3,   label: "3 meses"  },
  { value: 6,   label: "6 meses"  },
  { value: 12,  label: "12 meses" },
  { value: 999, label: "Tudo"     },
];

function HistoryBarChart({ hookPlatform }: { hookPlatform: MetaPlatform }) {
  const [periodMonths, setPeriodMonths] = useState(12);
  const { data: history = [], isLoading } = useMetaMonthlyHistory(hookPlatform);

  if (isLoading) return (
    <div className="h-72 flex items-center justify-center text-muted-foreground text-sm">
      Carregando histórico…
    </div>
  );
  if (history.length === 0) return (
    <div className="h-72 flex items-center justify-center text-muted-foreground text-sm">
      Sem dados históricos disponíveis
    </div>
  );

  // Filtra pelos últimos N meses
  const sliced = periodMonths >= 999 ? history : history.slice(-periodMonths);

  const data = sliced.map((h) => ({
    ...h,
    color: barColor(h.revenue, h.target),
  }));
  const hasTargets = data.some((d) => d.target > 0);

  return (
    <div className="w-full space-y-3">
      {/* Seletor de período */}
      <div className="flex items-center gap-1.5">
        <span className="text-xs text-muted-foreground mr-1">Período:</span>
        {PERIOD_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => setPeriodMonths(opt.value)}
            className={`px-2.5 py-0.5 rounded-full text-xs font-medium border transition-colors
              ${periodMonths === opt.value
                ? "bg-foreground text-background border-foreground"
                : "bg-muted/40 text-muted-foreground border-transparent hover:border-border hover:text-foreground"
              }`}
          >
            {opt.label}
          </button>
        ))}
        <span className="text-[10px] text-muted-foreground ml-2">
          {sliced.length} {sliced.length === 1 ? "mês" : "meses"} exibidos
        </span>
      </div>

      <div className="w-full h-72">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} />
            <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false}
              tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} width={40} />
            <Tooltip
              formatter={(v: number, name: string) => [
                fmtBRL(v),
                name === "revenue" ? "Faturamento" : "Meta",
              ]}
              labelFormatter={(l) => String(l)}
              contentStyle={TOOLTIP_STYLE}
            />
            <Bar dataKey="revenue" radius={[3, 3, 0, 0]} name="revenue">
              {data.map((entry, i) => <Cell key={i} fill={entry.color} />)}
            </Bar>
            {hasTargets && (
              <Line type="monotone" dataKey="target" stroke="hsl(var(--muted-foreground))"
                strokeDasharray="4 4" strokeWidth={1.5} dot={{ r: 3, fill: "hsl(var(--muted-foreground))" }}
                name="target" />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Charts section: filtro de plataforma + tabs de tipo de gráfico
// ─────────────────────────────────────────────────────────────────────────────

function ChartsSection({ month, totalTarget, platformStats }: {
  month: Date; totalTarget: number; platformStats: PlatformMetaStats[];
}) {
  const [filter, setFilter]     = useState<ChartFilter>("all");
  const [chartTab, setChartTab] = useState<ChartTab>("daily");

  const hookPlatform: MetaPlatform = filter === "all" ? null : filter;
  const activeTarget = filter === "all"
    ? totalTarget
    : (platformStats.find((s) => s.platform === filter)?.target ?? 0);

  const CHART_TABS: { value: ChartTab; label: string }[] = [
    { value: "daily",      label: "📊 Diário"    },
    { value: "cumulative", label: "📈 Acumulado" },
    { value: "history",    label: "🗓️ Histórico" },
  ];

  return (
    <CarboCard>
      <CarboCardHeader className="pb-2">
        <CarboCardTitle className="text-base">
          Faturamento — {format(month, "MMMM/yy", { locale: ptBR })}
          <span className="text-xs font-normal text-muted-foreground ml-2">
            verde = acima da meta · amarela = próximo · vermelha = abaixo
          </span>
        </CarboCardTitle>
      </CarboCardHeader>
      <CarboCardContent className="space-y-3">

        {/* Filtro de plataforma */}
        <div className="flex flex-wrap gap-1.5">
          {FILTER_OPTIONS.map((opt) => {
            const ps = opt.value !== "all"
              ? platformStats.find((s) => s.platform === opt.value)
              : null;
            return (
              <button
                key={String(opt.value)}
                onClick={() => setFilter(opt.value)}
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors
                  ${filter === opt.value
                    ? "bg-foreground text-background border-foreground"
                    : "bg-muted/40 text-muted-foreground border-transparent hover:border-border hover:text-foreground"
                  }`}
              >
                <span>{opt.emoji}</span> {opt.label}
                {ps && ps.target > 0 && (
                  <span className={`ml-0.5 ${
                    ps.progressColor === "green" ? "text-green-500" :
                    ps.progressColor === "yellow" ? "text-amber-500" :
                    ps.progressColor === "red" ? "text-red-500" : ""
                  }`}>
                    {ps.actualPct.toFixed(0)}%
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Tabs de tipo de gráfico */}
        <div className="flex gap-1 border-b border-border pb-2">
          {CHART_TABS.map((tab) => (
            <button
              key={tab.value}
              onClick={() => setChartTab(tab.value)}
              className={`px-3 py-1 text-xs rounded-md font-medium transition-colors
                ${chartTab === tab.value
                  ? "bg-muted text-foreground"
                  : "text-muted-foreground hover:text-foreground"
                }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Gráfico ativo */}
        {chartTab === "daily" && (
          <DailyBarsChart month={month} activeTarget={activeTarget} hookPlatform={hookPlatform} />
        )}
        {chartTab === "cumulative" && (
          <CumulativeLineChart month={month} activeTarget={activeTarget} hookPlatform={hookPlatform} />
        )}
        {chartTab === "history" && (
          <HistoryBarChart hookPlatform={hookPlatform} />
        )}
      </CarboCardContent>
    </CarboCard>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Edit target dialog
// ─────────────────────────────────────────────────────────────────────────────

function EditTargetDialog({ open, onClose, month, platform, currentTarget }: {
  open: boolean; onClose: () => void;
  month: Date; platform: MetaPlatform; currentTarget: number;
}) {
  const [digits, setDigits] = useState(String(currentTarget > 0 ? currentTarget : ""));
  const upsert = useUpsertMetaTarget();
  const meta = platform ? PLATFORM_META[platform] : { label: "Total Geral", emoji: "🎯", color: "#22c55e" };

  const numericValue = parseInt(digits.replace(/\D/g, "") || "0", 10);
  const displayValue = formatBRLInput(digits);

  const handleSave = async () => {
    if (numericValue < 0) return;
    await upsert.mutateAsync({ month, platform, target_amount: numericValue });
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span>{meta.emoji}</span> Meta {meta.label}
          </DialogTitle>
          <DialogDescription>{format(month, "MMMM 'de' yyyy", { locale: ptBR })}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <p className="text-sm text-muted-foreground">Meta de faturamento</p>
          <Input
            type="text" inputMode="numeric"
            value={displayValue}
            onChange={(e) => setDigits(e.target.value.replace(/\D/g, ""))}
            className="text-2xl font-bold tracking-wide"
            placeholder="R$ 0" autoFocus
          />
          {numericValue > 0 && (
            <p className="text-xs text-muted-foreground text-right">
              {numericValue.toLocaleString("pt-BR")} unidades monetárias
            </p>
          )}
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

export default function EcommerceMetas() {
  const [month, setMonth]       = useState(() => startOfMonth(new Date()));

  const { totalStats, platformStats, isLoading } = useMetaStats(month);

  // Dados do mês anterior para comparativo
  const { data: prevActuals } = useMetaActuals(subMonths(month, 1));

  // dataUpdatedAt para "atualizado às HH:mm"
  const { dataUpdatedAt } = useMetaActuals(month);
  const updatedAt = dataUpdatedAt
    ? new Date(dataUpdatedAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
    : null;

  // Contexto de dias
  const today = new Date();
  const isCurrentMonth =
    month.getFullYear() === today.getFullYear() &&
    month.getMonth() === today.getMonth();
  const daysInMonth  = getDaysInMonth(month);
  const dayOfMonth   = isCurrentMonth ? getDate(today) : daysInMonth;
  const remainingDays = isCurrentMonth ? daysInMonth - dayOfMonth : 0;
  const dailyNeeded  = isCurrentMonth && remainingDays > 0 && totalStats.remaining > 0
    ? Math.ceil(totalStats.remaining / remainingDays)
    : 0;

  const totalColors = COLOR_MAP[totalStats.progressColor];
  const prevTotal   = prevActuals?.total ?? 0;

  return (
    <div className="p-4 md:p-6">
      <div className="space-y-6 max-w-7xl mx-auto">

        {/* Page header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">🎯 Meta Ecommerce</h1>
            <div className="flex items-center gap-3 mt-0.5">
              <p className="text-sm text-muted-foreground">
                Faturamento real vs metas mensais por plataforma
              </p>
              {updatedAt && (
                <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                  <RefreshCw className="h-3 w-3" /> Atualizado às {updatedAt}
                </span>
              )}
            </div>
          </div>

          {/* Month selector */}
          <div className="flex items-center gap-2 bg-muted/40 rounded-lg px-3 py-1.5">
            <Button variant="ghost" size="icon" className="h-7 w-7"
              onClick={() => setMonth((m) => startOfMonth(subMonths(m, 1)))}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm font-semibold w-36 text-center capitalize">
              {format(month, "MMMM 'de' yyyy", { locale: ptBR })}
            </span>
            <Button variant="ghost" size="icon" className="h-7 w-7"
              onClick={() => setMonth((m) => startOfMonth(addMonths(m, 1)))}
              disabled={isCurrentMonth}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* ── TOTAL HERO CARD ─────────────────────────────────────────────── */}
        <CarboCard className={`border-2 ${
          totalStats.progressColor === "green" ? "border-green-500/40" :
          totalStats.progressColor === "yellow" ? "border-amber-500/40" :
          totalStats.progressColor === "red" ? "border-red-500/40" : "border-border"
        }`}>
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
                  {/* Delta mês anterior */}
                  {prevTotal > 0 && (
                    <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-muted/40">
                      <DeltaBadge current={totalStats.actual} prev={prevTotal} />
                      <span className="text-muted-foreground text-[10px]">vs mês ant.</span>
                    </span>
                  )}
                </div>
              </div>

              {/* Right: metrics */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 min-w-[320px]">
                <div className={`rounded-xl p-3 ${totalColors.bg} text-center`}>
                  <p className="text-[10px] text-muted-foreground">Projeção FDM</p>
                  <p className={`text-base font-bold tabular-nums ${totalColors.text}`}>
                    {fmtBRL(totalStats.projectedEOM)}
                  </p>
                  {totalStats.target > 0 && (
                    <p className="text-[9px] text-muted-foreground">
                      {fmtPct((totalStats.projectedEOM / totalStats.target) * 100)} da meta
                    </p>
                  )}
                </div>
                <div className="rounded-xl p-3 bg-muted/30 text-center">
                  <p className="text-[10px] text-muted-foreground">Faltam</p>
                  <p className="text-base font-bold tabular-nums">
                    {totalStats.remaining > 0 ? fmtBRL(totalStats.remaining) : "✓"}
                  </p>
                  {totalStats.remaining === 0 && (
                    <p className="text-[9px] text-green-500 font-medium">Meta batida!</p>
                  )}
                </div>
                {/* Dias restantes */}
                {isCurrentMonth && (
                  <div className="rounded-xl p-3 bg-muted/30 text-center">
                    <p className="text-[10px] text-muted-foreground flex items-center justify-center gap-0.5">
                      <Calendar className="h-2.5 w-2.5" /> Dias restantes
                    </p>
                    <p className="text-base font-bold tabular-nums">{remainingDays}</p>
                    <p className="text-[9px] text-muted-foreground">de {daysInMonth}</p>
                  </div>
                )}
                {/* R$/dia necessário */}
                {isCurrentMonth && dailyNeeded > 0 && (
                  <div className="rounded-xl p-3 bg-amber-500/10 text-center">
                    <p className="text-[10px] text-muted-foreground flex items-center justify-center gap-0.5">
                      <Zap className="h-2.5 w-2.5" /> Precisa/dia
                    </p>
                    <p className="text-base font-bold tabular-nums text-amber-500">
                      {fmtBRL(dailyNeeded)}
                    </p>
                    <p className="text-[9px] text-muted-foreground">p/ bater a meta</p>
                  </div>
                )}
              </div>
            </div>

            {/* Progress bar total */}
            <div className="mt-4 space-y-1">
              <SmartProgressBar actual={totalStats.actual} target={totalStats.target}
                color={totalStats.progressColor} showExpected expectedPct={totalStats.expectedPct} />
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

        {/* ── PLATFORM CARDS ───────────────────────────────────────────────── */}
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
                  prevRevenue={prevActuals?.platformRevenue[stats.platform as string] ?? 0}
                />
              ))}
            </div>
          )}
        </div>

        {/* ── CHARTS SECTION (diário / acumulado / histórico) ──────────────── */}
        <ChartsSection
          month={month}
          totalTarget={totalStats.target}
          platformStats={platformStats}
        />

        {/* ── RANKING ─────────────────────────────────────────────────────── */}
        {!isLoading && platformStats.some((s) => s.target > 0) && (
          <CarboCard>
            <CarboCardHeader>
              <CarboCardTitle className="text-base">📈 Ranking de Performance por Plataforma</CarboCardTitle>
            </CarboCardHeader>
            <CarboCardContent>
              <div className="space-y-3">
                {[...platformStats].sort((a, b) => b.actualPct - a.actualPct).map((stats) => {
                  const colors = COLOR_MAP[stats.progressColor];
                  const prev = prevActuals?.platformRevenue[stats.platform as string] ?? 0;
                  return (
                    <div key={String(stats.platform)} className="flex items-center gap-3">
                      <span className="text-base w-6 text-center">{stats.emoji}</span>
                      <div className="w-24 min-w-0">
                        <p className="text-sm font-medium truncate">{stats.label}</p>
                        <DeltaBadge current={stats.actual} prev={prev} />
                      </div>
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
                            <span className="text-white text-xs font-bold">{fmtPct(stats.actualPct)}</span>
                          )}
                        </div>
                        {stats.expectedPct > 0 && stats.expectedPct < 100 && (
                          <div className="absolute top-0 bottom-0 w-0.5 bg-foreground/40"
                            style={{ left: `${stats.expectedPct}%` }} />
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

      </div>
    </div>
  );
}

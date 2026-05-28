import { useState } from "react";
import { format, startOfMonth, addMonths, subMonths, getDaysInMonth, getDate } from "date-fns";
import { ptBR } from "date-fns/locale";
import { BoardLayout } from "@/components/layouts/BoardLayout";
import { CarboCard, CarboCardContent } from "@/components/ui/carbo-card";
import { CarboBadge } from "@/components/ui/carbo-badge";
import { Button } from "@/components/ui/button";
import {
  ChevronLeft, ChevronRight, Trophy, TrendingUp, TrendingDown,
  Target, RefreshCw, Calendar, Zap, Settings,
} from "lucide-react";
import {
  useSalesTargetsWithProgress,
  useWeeklyVendedoresData,
  type WeeklyVendedorEntry,
} from "@/hooks/useSalesTargets";
import { useAuth } from "@/contexts/AuthContext";
import { getProgressColor } from "@/hooks/useMetaEcommerce";
import { useNavigate } from "react-router-dom";

function useCanSetTargets(): boolean {
  const { profile } = useAuth();
  if (!profile) return false;
  if (profile.department === "command") return true;
  if (profile.funcao === "head") return true;
  if (profile.secondary_funcao === "head") return true;
  return false;
}

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

const BAR_COLORS = ["#22c55e", "#3b82f6", "#f59e0b", "#64748b"];

function DeltaBadge({ current, prev }: { current: number; prev: number }) {
  if (prev <= 0 && current <= 0) return null;
  if (prev <= 0) return <span className="text-[10px] text-muted-foreground italic">primeiro mês</span>;
  const delta = ((current - prev) / prev) * 100;
  const up = delta >= 0;
  return (
    <span className={`inline-flex items-center gap-0.5 text-[10px] font-semibold ${up ? "text-green-500" : "text-red-500"}`}>
      {up ? <TrendingUp className="h-2.5 w-2.5" /> : <TrendingDown className="h-2.5 w-2.5" />}
      {up ? "+" : ""}{delta.toFixed(1)}% vs mês ant.
    </span>
  );
}

type TeamFilter = "todos" | "cgc" | "expansao";
type PeriodView = "mensal" | "semanal";

// ─────────────────────────────────────────────────────────────────────────────
// Top3Card
// ─────────────────────────────────────────────────────────────────────────────
function Top3Card({ entries, label, canSeeValues }: {
  entries: Array<{rank:number;vendedor_id:string;total:number;profile:{full_name:string|null;avatar_url:string|null}|null}>;
  label: string;
  canSeeValues: boolean;
}) {
  if (entries.length === 0) return null;
  return (
    <CarboCard>
      <CarboCardContent className="p-4">
        <p className="text-xs uppercase tracking-wider text-muted-foreground mb-3 font-medium">{label}</p>
        <div className="flex gap-4 justify-center">
          {entries.slice(0, 3).map(entry => (
            <div key={entry.vendedor_id} className="flex flex-col items-center gap-1.5">
              <div className="relative">
                <div className={`w-14 h-14 rounded-full overflow-hidden border-2 ${
                  entry.rank === 1 ? "border-yellow-400" : entry.rank === 2 ? "border-gray-400" : "border-amber-600"
                }`}>
                  {entry.profile?.avatar_url
                    ? <img src={entry.profile.avatar_url} alt="" className="w-full h-full object-cover" />
                    : <div className="w-full h-full bg-muted flex items-center justify-center text-lg font-bold text-muted-foreground">
                        {(entry.profile?.full_name || "?")[0].toUpperCase()}
                      </div>
                  }
                </div>
                <span className="absolute -bottom-1 -right-1 text-sm">
                  {entry.rank === 1 ? "🥇" : entry.rank === 2 ? "🥈" : "🥉"}
                </span>
              </div>
              <p className="text-xs font-medium text-center max-w-[80px] truncate">
                {entry.profile?.full_name?.split(" ")[0] || "—"}
              </p>
              {canSeeValues && (
                <p className="text-[10px] text-muted-foreground">
                  {fmtBRL(entry.total)}
                </p>
              )}
            </div>
          ))}
        </div>
      </CarboCardContent>
    </CarboCard>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// WeeklyBarChart
// ─────────────────────────────────────────────────────────────────────────────
function WeeklyBarChart({ entries, targetMap, canSeeValues }: {
  entries: WeeklyVendedorEntry[];
  targetMap: Record<string, number>;
  canSeeValues: boolean;
}) {
  if (entries.length === 0) return null;
  const maxTotal = Math.max(...entries.map(e => e.total), 1);
  const MAX_BAR_H = 120;

  return (
    <CarboCard>
      <CarboCardContent className="p-4">
        <p className="text-xs uppercase tracking-wider text-muted-foreground mb-4 font-medium">
          Desempenho da Semana
        </p>
        <div className="overflow-x-auto">
          <div className="flex gap-2 justify-center min-w-fit px-2">
            {entries.map((entry, idx) => {
              const barH     = Math.max(8, Math.round((entry.total / maxTotal) * MAX_BAR_H));
              const target   = targetMap[entry.vendedor_id] || 0;
              const pctMeta  = target > 0 ? Math.round((entry.total / target) * 100) : null;
              const barColor = BAR_COLORS[Math.min(idx, BAR_COLORS.length - 1)];
              const medal    = idx === 0 ? "🥇" : idx === 1 ? "🥈" : idx === 2 ? "🥉" : null;

              return (
                <div key={entry.vendedor_id} className="flex flex-col items-center gap-1 w-14">
                  {/* Avatar */}
                  <div className={`w-9 h-9 rounded-full overflow-hidden border-2 shrink-0 ${
                    idx === 0 ? "border-yellow-400" : idx === 1 ? "border-gray-400" : idx === 2 ? "border-amber-600" : "border-transparent"
                  }`}>
                    {entry.profile?.avatar_url
                      ? <img src={entry.profile.avatar_url} alt="" className="w-full h-full object-cover" />
                      : <div className="w-full h-full bg-muted flex items-center justify-center text-sm font-bold text-muted-foreground">
                          {(entry.profile?.full_name || "?")[0].toUpperCase()}
                        </div>
                    }
                  </div>

                  {/* Bar container — fixed height, bar anchored to bottom */}
                  <div
                    className="flex flex-col items-center justify-end gap-0.5"
                    style={{ height: `${MAX_BAR_H + 32}px` }}
                  >
                    {canSeeValues && (
                      <p className="text-[9px] text-muted-foreground tabular-nums text-center leading-tight">
                        {entry.total >= 1000
                          ? `R$${(entry.total / 1000).toFixed(0)}k`
                          : fmtBRL(entry.total)}
                      </p>
                    )}
                    {pctMeta !== null && (
                      <p className="text-[9px] font-bold leading-tight text-center" style={{ color: barColor }}>
                        {pctMeta}%
                      </p>
                    )}
                    <div
                      className="w-9 rounded-t-lg transition-all duration-700"
                      style={{ height: `${barH}px`, backgroundColor: barColor }}
                    />
                  </div>

                  {/* Name */}
                  <p className="text-[10px] font-semibold truncate max-w-[56px] text-center leading-tight">
                    {entry.profile?.full_name?.split(" ")[0] || "—"}
                  </p>

                  {/* Rank */}
                  {medal
                    ? <span className="text-sm leading-none">{medal}</span>
                    : <span className="text-[10px] font-bold text-muted-foreground">{idx + 1}º</span>
                  }
                </div>
              );
            })}
          </div>
        </div>
      </CarboCardContent>
    </CarboCard>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main page
// ─────────────────────────────────────────────────────────────────────────────
export default function MetaVendedoresPage() {
  const [month, setMonth]           = useState(() => startOfMonth(new Date()));
  const [teamFilter, setTeamFilter] = useState<TeamFilter>("todos");
  const [periodView, setPeriodView] = useState<PeriodView>("mensal");

  const canManage    = useCanSetTargets();
  const canSeeValues = canManage;
  const navigate     = useNavigate();
  const monthStr     = month.toISOString().slice(0, 10);

  const prevMonth    = startOfMonth(subMonths(month, 1));
  const prevMonthStr = prevMonth.toISOString().slice(0, 10);

  // Current month targets (needed for weekly chart even when viewing past months)
  const currentMonthStr = startOfMonth(new Date()).toISOString().slice(0, 10);

  const { data: targets = [], isLoading, dataUpdatedAt } = useSalesTargetsWithProgress(monthStr);
  const { data: prevTargets = [] }                       = useSalesTargetsWithProgress(prevMonthStr);
  const { data: currentTargets = [] }                    = useSalesTargetsWithProgress(currentMonthStr);
  const { data: weeklyAll = [], isLoading: weeklyLoading } = useWeeklyVendedoresData(teamFilter);

  // Monthly target map for weekly chart
  const currentMonthTargetMap: Record<string, number> = {};
  for (const t of currentTargets) {
    currentMonthTargetMap[t.vendedor_id] =
      (currentMonthTargetMap[t.vendedor_id] || 0) + Number(t.target_amount || 0);
  }

  // Mapa vendedor → actual do mês anterior
  const prevActualMap: Record<string, number> = {};
  for (const t of prevTargets) {
    prevActualMap[t.vendedor_id] = (prevActualMap[t.vendedor_id] || 0) + (t.actual_amount || 0);
  }

  // Contexto de dias
  const today = new Date();
  const isCurrentMonth =
    month.getFullYear() === today.getFullYear() &&
    month.getMonth() === today.getMonth();
  const daysInMonth    = getDaysInMonth(month);
  const dayOfMonth     = isCurrentMonth ? getDate(today) : daysInMonth;
  const remainingDays  = isCurrentMonth ? daysInMonth - dayOfMonth : 0;
  const expectedPct    = (dayOfMonth / daysInMonth) * 100;

  const updatedAt = dataUpdatedAt
    ? new Date(dataUpdatedAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
    : null;

  const sorted = [...targets].sort((a, b) => (b.pct_amount || 0) - (a.pct_amount || 0));
  const filteredTargets = teamFilter === "todos" ? sorted : sorted.filter(t => {
    const dept    = t.vendedor?.department;
    const secDept = t.vendedor?.secondary_department;
    return dept === teamFilter || secDept === teamFilter;
  });

  const totalTarget  = targets.reduce((s, t) => s + Number(t.target_amount), 0);
  const totalActual  = targets.reduce((s, t) => s + (t.actual_amount || 0), 0);
  const totalPct     = totalTarget > 0 ? (totalActual / totalTarget) * 100 : 0;
  const hitting      = targets.filter(t => (t.pct_amount || 0) >= 100).length;
  const totalColor   = getProgressColor(totalActual, totalTarget, dayOfMonth, daysInMonth);
  const totalColors  = COLOR_MAP[totalColor];

  const teamRemaining   = Math.max(0, totalTarget - totalActual);
  const teamDailyNeeded = isCurrentMonth && remainingDays > 0 && teamRemaining > 0
    ? Math.ceil(teamRemaining / remainingDays)
    : 0;

  // Team projection
  const teamProjected = isCurrentMonth && dayOfMonth > 2 && totalActual > 0 && totalTarget > 0
    ? Math.round((totalActual / dayOfMonth) * daysInMonth)
    : null;
  const teamProjPct     = teamProjected !== null ? (teamProjected / totalTarget) * 100 : null;
  const teamProjKey     = teamProjPct === null ? "gray" : teamProjPct >= 100 ? "green" : teamProjPct >= 85 ? "yellow" : "red" as keyof typeof COLOR_MAP;
  const teamProjColors  = COLOR_MAP[teamProjKey];

  const monthlyTop3 = filteredTargets.slice(0, 3).map((t, idx) => ({
    rank: idx + 1,
    vendedor_id: t.vendedor_id,
    total: t.actual_amount || 0,
    profile: t.vendedor || null,
  }));

  return (
    <BoardLayout>
      <div className="p-4 md:p-6 space-y-5 max-w-4xl mx-auto">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">🏆 Meta de Vendedores</h1>
            <div className="flex items-center gap-3 mt-0.5">
              <p className="text-sm text-muted-foreground">Performance e metas mensais por vendedor</p>
              {updatedAt && (
                <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                  <RefreshCw className="h-3 w-3" /> Atualizado às {updatedAt}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {/* Period toggle */}
            <div className="flex gap-1 bg-muted/40 rounded-lg p-1">
              {(["mensal", "semanal"] as PeriodView[]).map(v => (
                <button key={v} onClick={() => setPeriodView(v)}
                  className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors ${
                    periodView === v ? "bg-carbo-green text-white" : "text-muted-foreground hover:text-foreground"
                  }`}>
                  {v === "mensal" ? "Mensal" : "Semanal"}
                </button>
              ))}
            </div>

            {periodView === "mensal" && (
              <div className="flex items-center gap-1 bg-muted/40 rounded-lg px-2 py-1.5">
                <Button variant="ghost" size="icon" className="h-7 w-7"
                  onClick={() => setMonth(m => startOfMonth(subMonths(m, 1)))}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-sm font-semibold w-32 text-center capitalize">
                  {format(month, "MMM 'de' yyyy", { locale: ptBR })}
                </span>
                <Button variant="ghost" size="icon" className="h-7 w-7"
                  onClick={() => setMonth(m => startOfMonth(addMonths(m, 1)))}
                  disabled={isCurrentMonth}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            )}

            {canManage && (
              <Button size="sm" variant="outline" className="gap-1.5"
                onClick={() => navigate("/dashboards/metas/config")}>
                <Settings className="h-4 w-4" /> Configurar Metas
              </Button>
            )}
          </div>
        </div>

        {/* Department filter */}
        <div className="flex gap-1">
          {(["todos", "cgc", "expansao"] as const).map(opt => (
            <button key={opt} onClick={() => setTeamFilter(opt)}
              className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors ${
                teamFilter === opt
                  ? "bg-carbo-green text-white"
                  : "bg-muted/40 text-muted-foreground hover:bg-muted"
              }`}>
              {opt === "todos" ? "Todos" : opt === "cgc" ? "CGC" : "Expansão"}
            </button>
          ))}
        </div>

        {/* Info bar */}
        <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-blue-500/10 border border-blue-500/20 text-sm text-blue-400">
          <TrendingUp className="h-4 w-4 shrink-0" />
          <span>
            Esperado hoje: <strong>{fmtPct(expectedPct)}</strong> (dia {dayOfMonth}/{daysInMonth}) ·{" "}
            <span className="text-green-400 font-medium">verde</span> = na meta ·{" "}
            <span className="text-amber-400 font-medium">amarelo</span> = atenção ·{" "}
            <span className="text-red-400 font-medium">vermelho</span> = abaixo
          </span>
        </div>

        {/* ── SEMANAL VIEW ── */}
        {periodView === "semanal" && (
          <>
            {weeklyLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map(i => <div key={i} className="h-20 rounded-xl bg-muted/40 animate-pulse" />)}
              </div>
            ) : weeklyAll.length === 0 ? (
              <CarboCard>
                <CarboCardContent className="py-16 text-center space-y-3">
                  <Trophy className="h-12 w-12 mx-auto text-muted-foreground/30" />
                  <p className="text-muted-foreground">Nenhuma venda registrada esta semana.</p>
                </CarboCardContent>
              </CarboCard>
            ) : (
              <>
                {/* Bar chart */}
                <WeeklyBarChart
                  entries={weeklyAll}
                  targetMap={currentMonthTargetMap}
                  canSeeValues={canSeeValues}
                />

                {/* Top 3 podium */}
                <Top3Card
                  entries={weeklyAll.slice(0, 3).map((e, i) => ({ ...e, rank: i + 1 }))}
                  label="Top 3 da Semana"
                  canSeeValues={canSeeValues}
                />
              </>
            )}
          </>
        )}

        {/* ── MENSAL VIEW ── */}
        {periodView === "mensal" && (
          <>
            {/* Team total */}
            {targets.length > 0 && (
              <CarboCard className={`border ${totalColor === "green" ? "border-green-500/30" : totalColor === "yellow" ? "border-amber-500/30" : totalColor === "red" ? "border-red-500/30" : ""}`}>
                <CarboCardContent className="p-4">
                  <div className="flex items-center justify-between gap-4 mb-3">
                    <div>
                      <p className="text-xs text-muted-foreground uppercase tracking-wider">Total do Time</p>
                      {canSeeValues ? (
                        <div className="flex items-end gap-2 mt-0.5">
                          <p className={`text-2xl font-bold tabular-nums ${totalColors.text}`}>{fmtBRL(totalActual)}</p>
                          <p className="text-muted-foreground mb-0.5">/ {fmtBRL(totalTarget)}</p>
                        </div>
                      ) : (
                        <p className={`text-2xl font-bold tabular-nums mt-0.5 ${totalColors.text}`}>{fmtPct(totalPct)}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      {isCurrentMonth && remainingDays > 0 && (
                        <div className="text-center">
                          <p className="text-sm font-bold tabular-nums flex items-center gap-0.5">
                            <Calendar className="h-3 w-3 text-muted-foreground" /> {remainingDays}d
                          </p>
                          <p className="text-[10px] text-muted-foreground">restantes</p>
                        </div>
                      )}
                      {canSeeValues && teamDailyNeeded > 0 && (
                        <div className="text-center">
                          <p className="text-sm font-bold tabular-nums text-amber-500 flex items-center gap-0.5">
                            <Zap className="h-3 w-3" /> {fmtBRL(teamDailyNeeded)}
                          </p>
                          <p className="text-[10px] text-muted-foreground">precisa/dia</p>
                        </div>
                      )}
                      <div className="text-center">
                        <p className="text-lg font-bold tabular-nums">{hitting}/{targets.length}</p>
                        <p className="text-[10px] text-muted-foreground">na meta</p>
                      </div>
                      <CarboBadge variant={totalColors.badge}>{fmtPct(totalPct)}</CarboBadge>
                    </div>
                  </div>
                  <div className="relative h-2.5 bg-muted rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-700"
                      style={{ width: `${Math.min(100, totalPct)}%`, backgroundColor: totalColors.bar }} />
                    {expectedPct > 0 && expectedPct < 100 && (
                      <div className="absolute top-0 bottom-0 w-0.5 bg-foreground/40"
                        style={{ left: `${expectedPct}%` }} />
                    )}
                  </div>
                  {/* Team projection */}
                  {teamProjected !== null && teamProjPct !== null && (
                    <div className="flex items-center gap-1.5 text-xs mt-2 pt-2 border-t border-border/50">
                      <TrendingUp className="h-3 w-3 text-muted-foreground shrink-0" />
                      <span className="text-muted-foreground">Projeção do time ao fim do mês:</span>
                      {canSeeValues && (
                        <span className={`font-bold ${teamProjColors.text}`}>{fmtBRL(teamProjected)}</span>
                      )}
                      <CarboBadge variant={teamProjColors.badge} size="sm">{fmtPct(teamProjPct)}</CarboBadge>
                    </div>
                  )}
                </CarboCardContent>
              </CarboCard>
            )}

            {/* Monthly Top 3 */}
            <Top3Card entries={monthlyTop3} label="Top 3 do Mês" canSeeValues={canSeeValues} />

            {/* List */}
            {isLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map(i => <div key={i} className="h-28 rounded-xl bg-muted/40 animate-pulse" />)}
              </div>
            ) : filteredTargets.length === 0 ? (
              <CarboCard>
                <CarboCardContent className="py-16 text-center space-y-3">
                  <Trophy className="h-12 w-12 mx-auto text-muted-foreground/30" />
                  <p className="text-muted-foreground">
                    {sorted.length === 0
                      ? "Nenhuma meta definida para este mês."
                      : "Nenhuma meta para o filtro selecionado."}
                  </p>
                  {canManage && sorted.length === 0 && (
                    <Button variant="outline" onClick={() => navigate("/dashboards/metas/config")}>
                      <Target className="h-4 w-4 mr-1" /> Configurar metas
                    </Button>
                  )}
                </CarboCardContent>
              </CarboCard>
            ) : (
              <div className="space-y-3">
                {filteredTargets.map((t, idx) => {
                  const pct         = t.pct_amount || 0;
                  const color       = getProgressColor(pct, 100, dayOfMonth, daysInMonth);
                  const colors      = COLOR_MAP[color];
                  const actual      = t.actual_amount || 0;
                  const target      = Number(t.target_amount);
                  const remaining   = Math.max(0, target - actual);
                  const dailyNeeded = isCurrentMonth && remainingDays > 0 && remaining > 0
                    ? Math.ceil(remaining / remainingDays)
                    : 0;
                  const prevActual  = prevActualMap[t.vendedor_id] ?? 0;

                  // Projection
                  const projected    = isCurrentMonth && dayOfMonth > 2 && actual > 0 && target > 0
                    ? Math.round((actual / dayOfMonth) * daysInMonth)
                    : null;
                  const projPct      = projected !== null && target > 0 ? (projected / target) * 100 : null;
                  const projKey      = projPct === null ? "gray" : projPct >= 100 ? "green" : projPct >= 85 ? "yellow" : "red" as keyof typeof COLOR_MAP;
                  const projColors   = COLOR_MAP[projKey];

                  return (
                    <CarboCard key={t.id}
                      className={`border ${color === "red" ? "border-red-500/30" : color === "yellow" ? "border-amber-500/30" : ""}`}>
                      <CarboCardContent className="p-4">
                        <div className="flex items-center gap-3">
                          {/* Avatar */}
                          <div className="w-8 h-8 rounded-full overflow-hidden bg-muted shrink-0">
                            {t.vendedor?.avatar_url
                              ? <img src={t.vendedor.avatar_url} alt="" className="w-full h-full object-cover" />
                              : <div className="w-full h-full flex items-center justify-center text-xs font-bold text-muted-foreground">
                                  {(t.vendedor?.full_name || "?")[0].toUpperCase()}
                                </div>
                            }
                          </div>
                          {/* Rank */}
                          <div className="w-7 text-center shrink-0">
                            {idx === 0 ? "🥇" : idx === 1 ? "🥈" : idx === 2 ? "🥉"
                              : <span className="text-sm font-bold text-muted-foreground">{idx + 1}º</span>}
                          </div>
                          <div className="flex-1 space-y-2 min-w-0">
                            {/* Row 1: nome + valor + badge */}
                            <div className="flex items-center justify-between gap-2">
                              <div className="min-w-0">
                                <p className="font-semibold text-sm truncate">{t.vendedor?.full_name || "—"}</p>
                                {t.linha && <p className="text-xs text-muted-foreground">{t.linha}</p>}
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                {canSeeValues ? (
                                  <div className="text-right">
                                    <p className={`text-lg font-bold tabular-nums ${colors.text}`}>{fmtBRL(actual)}</p>
                                    <p className="text-xs text-muted-foreground">/ {fmtBRL(target)}</p>
                                  </div>
                                ) : null}
                                <CarboBadge variant={colors.badge} size="sm">{fmtPct(pct)}</CarboBadge>
                              </div>
                            </div>

                            {/* Progress bar */}
                            <div className="relative h-2 bg-muted rounded-full overflow-hidden">
                              <div className="h-full rounded-full transition-all duration-700"
                                style={{ width: `${Math.min(100, pct)}%`, backgroundColor: colors.bar }} />
                              {expectedPct > 0 && expectedPct < 100 && (
                                <div className="absolute top-0 bottom-0 w-0.5 bg-foreground/40"
                                  style={{ left: `${expectedPct}%` }} />
                              )}
                            </div>

                            {/* Row 3: métricas */}
                            <div className="flex items-center justify-between flex-wrap gap-x-4 gap-y-0.5 text-xs text-muted-foreground">
                              {canSeeValues && <span>Faltam {fmtBRL(remaining)}</span>}
                              {canSeeValues && dailyNeeded > 0 && (
                                <span className="inline-flex items-center gap-0.5 text-amber-500 font-medium">
                                  <Zap className="h-3 w-3" /> {fmtBRL(dailyNeeded)}/dia
                                </span>
                              )}
                              {canSeeValues && <DeltaBadge current={actual} prev={prevActual} />}
                              {t.target_qty > 0 && (
                                <span>{t.actual_qty || 0} / {t.target_qty} pedidos</span>
                              )}
                            </div>

                            {/* Projection */}
                            {projected !== null && projPct !== null && (
                              <div className="flex items-center gap-1.5 text-xs pt-1 border-t border-border/40">
                                <TrendingUp className="h-3 w-3 text-muted-foreground shrink-0" />
                                <span className="text-muted-foreground">Projeção:</span>
                                {canSeeValues && (
                                  <span className={`font-bold ${projColors.text}`}>{fmtBRL(projected)}</span>
                                )}
                                <CarboBadge variant={projColors.badge} size="sm">{fmtPct(projPct)}</CarboBadge>
                                <span className="text-muted-foreground">ao fim do mês</span>
                              </div>
                            )}
                          </div>
                        </div>
                      </CarboCardContent>
                    </CarboCard>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
    </BoardLayout>
  );
}

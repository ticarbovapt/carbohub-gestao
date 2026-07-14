import { useState, useMemo } from "react";
import { format, startOfMonth, addMonths, subMonths, getDaysInMonth, getDate } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CarboCard, CarboCardContent } from "@/components/ui/carbo-card";
import { CarboBadge } from "@/components/ui/carbo-badge";
import { CarboPageHeader } from "@/components/ui/carbo-page-header";
import { Button } from "@/components/ui/button";
import {
  ChevronLeft, ChevronRight, Trophy, TrendingUp, TrendingDown,
  Calendar, Zap, Lock,
} from "lucide-react";
import { ProfileAvatar } from "@/components/ui/profile-avatar";
import { useMetasVendedores } from "@/hooks/useMetasVendedores";
import { useAuth } from "@/contexts/AuthContext";

// ─────────────────────────────────────────────────────────────────────────────
// Placar de Metas (ESPELHO no Carbo Admin) — SOMENTE LEITURA.
// Porto visual/lógico de apps/crm/src/pages/Metas.tsx. Lê a RPC crm_metas_board
// (mesma base do Carbo Sales). Não escreve nada: configurar metas é no Carbo Ops.
// ─────────────────────────────────────────────────────────────────────────────

// ── Tipos ─────────────────────────────────────────────────────────────────
interface VendedorProfile { full_name: string | null; avatar_url: string | null; department?: string; secondary_department?: string; }
interface MetaTarget {
  id: string; vendedor_id: string; target_amount: number; actual_amount: number;
  pct_amount: number; target_qty: number; actual_qty: number; vendedor: VendedorProfile;
}
interface WeeklyEntry { vendedor_id: string; total: number; pct: number | null; profile: VendedorProfile; }

// ── Helpers ───────────────────────────────────────────────────────────────
function getProgressColor(actual: number, target: number, dayOfMonth: number, daysInMonth: number): "green" | "yellow" | "red" | "gray" {
  if (target === 0) return "gray";
  const actualPct = (actual / target) * 100;
  const expectedPct = (dayOfMonth / daysInMonth) * 100;
  if (actualPct >= expectedPct) return "green";
  if (actualPct >= expectedPct - 15) return "yellow";
  return "red";
}
function commercialWeekStartOf(d: Date): Date {
  // Semana comercial começa na sexta (getDay()===5)
  const n = new Date(d);
  const diff = (n.getDay() - 5 + 7) % 7;
  n.setDate(n.getDate() - diff);
  n.setHours(0, 0, 0, 0);
  return n;
}
function fmtBRL(v: number) { return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 0, maximumFractionDigits: 0 }); }
function fmtPct(v: number) { return `${v.toFixed(1)}%`; }

const COLOR_MAP = {
  green:  { bar: "#22c55e", badge: "success"     as const, text: "text-green-500",        bg: "bg-green-500/10" },
  yellow: { bar: "#f59e0b", badge: "warning"     as const, text: "text-amber-500",        bg: "bg-amber-500/10" },
  red:    { bar: "#ef4444", badge: "destructive" as const, text: "text-red-500",          bg: "bg-red-500/10" },
  gray:   { bar: "#64748b", badge: "secondary"   as const, text: "text-muted-foreground", bg: "bg-muted/30" },
};

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

type PeriodView = "mensal" | "semanal";

// ── RestrictedNotice ──────────────────────────────────────────────────────
function RestrictedNotice() {
  return (
    <CarboCard>
      <CarboCardContent className="py-16 text-center space-y-3">
        <Lock className="h-12 w-12 mx-auto text-muted-foreground/30" />
        <p className="text-muted-foreground">Acesso restrito a gestores.</p>
      </CarboCardContent>
    </CarboCard>
  );
}

// ── Top3Card (mensal) ────────────────────────────────────────────────────
function Top3Card({ entries, label, canSeeValues }: {
  entries: Array<{ rank: number; vendedor_id: string; total: number; profile: VendedorProfile | null }>;
  label: string; canSeeValues: boolean;
}) {
  if (entries.length === 0) return null;
  return (
    <CarboCard>
      <CarboCardContent className="p-4">
        <p className="text-xs uppercase tracking-wider text-muted-foreground mb-3 font-medium">{label}</p>
        {(() => {
          // Ordem do pódio: 2º à esquerda, 1º no meio (mais alto), 3º à direita.
          const order = [
            { e: entries[1], place: 2 },
            { e: entries[0], place: 1 },
            { e: entries[2], place: 3 },
          ].filter((x) => x.e) as { e: typeof entries[number]; place: number }[];
          const stepH: Record<number, string> = { 1: "h-20", 2: "h-14", 3: "h-10" };
          const stepBg: Record<number, string> = {
            1: "bg-yellow-400/15 border-yellow-400",
            2: "bg-gray-400/15 border-gray-400",
            3: "bg-amber-600/15 border-amber-600",
          };
          const border: Record<number, string> = { 1: "border-yellow-400", 2: "border-gray-400", 3: "border-amber-600" };
          const medal: Record<number, string> = { 1: "🥇", 2: "🥈", 3: "🥉" };
          return (
            <div className="flex items-end justify-center gap-3 sm:gap-5 pt-4">
              {order.map(({ e, place }) => (
                <div key={e.vendedor_id} className="flex flex-col items-center w-24">
                  <span className="text-xl leading-none mb-1">{medal[place]}</span>
                  <div className={`border-2 rounded-xl overflow-hidden shadow-md ${border[place]}`}>
                    <ProfileAvatar avatarUrl={e.profile?.avatar_url} fullName={e.profile?.full_name} userId={e.vendedor_id} size={place === 1 ? 76 : 56} square />
                  </div>
                  <p className="text-xs font-semibold text-center max-w-[88px] truncate mt-1.5">{e.profile?.full_name?.split(" ")[0] || "—"}</p>
                  {canSeeValues && <p className="text-[11px] text-muted-foreground tabular-nums">{fmtBRL(e.total)}</p>}
                  <div className={`mt-1.5 w-full ${stepH[place]} rounded-t-lg border-t-2 ${stepBg[place]} flex items-start justify-center pt-1`}>
                    <span className="text-lg font-black text-foreground/60">{place}º</span>
                  </div>
                </div>
              ))}
            </div>
          );
        })()}
      </CarboCardContent>
    </CarboCard>
  );
}

// ── WeeklyPanel ─────────────────────────────────────────────────────────
function weeklyBarColor(projPct: number | null): string {
  if (projPct === null) return "#64748b";
  if (projPct >= 100) return "#22c55e";
  if (projPct >= 70) return "#f59e0b";
  return "#ef4444";
}
function WeeklyPanel({ entries, elapsedDays, canSeeValues }: {
  entries: WeeklyEntry[]; elapsedDays: number; canSeeValues: boolean;
}) {
  if (entries.length === 0) {
    return (
      <CarboCard>
        <CarboCardContent className="py-16 text-center space-y-3">
          <Trophy className="h-12 w-12 mx-auto text-muted-foreground/30" />
          <p className="text-muted-foreground">Sem dados para a semana selecionada.</p>
        </CarboCardContent>
      </CarboCard>
    );
  }
  const top3 = entries.slice(0, 3);
  const alphabetical = [...entries].sort((a, b) => (a.profile?.full_name || "").localeCompare(b.profile?.full_name || "", "pt-BR"));
  const maxTotal = Math.max(...entries.map((e) => e.total), 1);
  const MAX_BAR_H = 160;
  return (
    <CarboCard>
      <CarboCardContent className="p-0">
        <div className="flex flex-col sm:flex-row">
          {/* Top 3 vertical */}
          <div className="sm:w-44 shrink-0 p-4 border-b sm:border-b-0 sm:border-r border-border">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-4 font-medium">Top 3 da Semana</p>
            <div className="space-y-3">
              {top3.map((entry, idx) => (
                <div key={entry.vendedor_id} className="flex items-center gap-3">
                  <div className="relative shrink-0">
                    <ProfileAvatar avatarUrl={entry.profile?.avatar_url} fullName={entry.profile?.full_name} userId={entry.vendedor_id} size={52} square />
                    <span className="absolute -top-1.5 -right-1.5 text-base leading-none">{idx === 0 ? "🥇" : idx === 1 ? "🥈" : "🥉"}</span>
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-bold truncate">{entry.profile?.full_name?.split(" ")[0] || "—"}</p>
                    {canSeeValues
                      ? <p className="text-xs text-muted-foreground tabular-nums">{entry.total >= 1000 ? `R$${(entry.total / 1000).toFixed(1)}k` : fmtBRL(entry.total)}</p>
                      : entry.pct != null && <p className="text-xs text-muted-foreground tabular-nums">{entry.pct.toFixed(0)}%</p>}
                  </div>
                </div>
              ))}
            </div>
          </div>
          {/* Bar chart */}
          <div className="flex-1 min-w-0 p-4">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-3">Desempenho da Semana</p>
            <div className="overflow-x-auto pb-1">
              <div className="flex gap-3 items-end px-1">
                {alphabetical.map((entry) => {
                  const attainPct = entry.pct;
                  const projPct = attainPct != null && elapsedDays > 0 ? Math.round((attainPct / elapsedDays) * 7) : null;
                  const barFill = weeklyBarColor(projPct);
                  const fillRatio = attainPct != null ? Math.min(1, attainPct / 100) : entry.total / maxTotal;
                  const barH = Math.max(6, Math.round(fillRatio * MAX_BAR_H));
                  const perfRank = entries.findIndex((e) => e.vendedor_id === entry.vendedor_id) + 1;
                  const medal = perfRank === 1 ? "🥇" : perfRank === 2 ? "🥈" : perfRank === 3 ? "🥉" : null;
                  return (
                    <div key={entry.vendedor_id} className="flex flex-col items-center gap-1 w-14 shrink-0">
                      <div className="flex flex-col items-center justify-end gap-1" style={{ height: `${MAX_BAR_H + 70}px` }}>
                        <p className="text-[11px] font-bold leading-none" style={{ color: attainPct == null ? "#64748b" : barFill }}>{attainPct == null ? "—" : `${Math.round(attainPct)}%`}</p>
                        <ProfileAvatar avatarUrl={entry.profile?.avatar_url} fullName={entry.profile?.full_name} userId={entry.vendedor_id} size={34} />
                        <div className="w-9 rounded-t-lg transition-[height] duration-1000 ease-out" style={{ height: `${barH}px`, backgroundColor: barFill }} />
                      </div>
                      <p className="text-[10px] font-semibold truncate max-w-[56px] text-center leading-tight">{entry.profile?.full_name?.split(" ")[0] || "—"}</p>
                      {medal ? <span className="text-xs leading-none">{medal}</span> : <span className="text-[10px] font-bold text-muted-foreground">{perfRank}º</span>}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </CarboCardContent>
    </CarboCard>
  );
}

// ── Página ───────────────────────────────────────────────────────────────
export default function DashboardsMetas() {
  const { canAdmin } = useAuth();
  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const [periodView, setPeriodView] = useState<PeriodView>("mensal");
  const [weekStart, setWeekStart] = useState(() => commercialWeekStartOf(new Date()));

  // No Admin, o gestor (canAdmin) enxerga os valores em R$.
  const canSeeValues = canAdmin;

  // ── Dados reais (RPC crm_metas_board — mesma base do Carbo Sales) ──
  const { data: metas = [], isLoading } = useMetasVendedores(month, weekStart);
  const targetsData: MetaTarget[] = useMemo(() => metas.map((m) => ({
    id: m.vendedor_id,
    vendedor_id: m.vendedor_id,
    target_amount: m.target_amount,
    actual_amount: m.actual_amount,
    pct_amount: m.pct_amount,
    target_qty: m.target_qty,
    actual_qty: m.actual_qty,
    vendedor: {
      full_name: m.full_name, avatar_url: m.avatar_url,
      department: m.department ?? undefined, secondary_department: m.secondary_department ?? undefined,
    },
  })), [metas]);
  const prevMap: Record<string, number> = useMemo(
    () => Object.fromEntries(metas.map((m) => [m.vendedor_id, m.prev_amount])), [metas]);
  // Ranking semanal por % de meta (nulls por último); R$ só existe para gestor.
  const weeklyData: WeeklyEntry[] = useMemo(() => metas
    .filter((m) => m.pct_week != null || m.week_amount > 0)
    .map((m) => ({ vendedor_id: m.vendedor_id, total: m.week_amount, pct: m.pct_week, profile: { full_name: m.full_name, avatar_url: m.avatar_url } }))
    .sort((a, b) => (b.pct ?? -1) - (a.pct ?? -1) || b.total - a.total), [metas]);

  const currentWeekStart = commercialWeekStartOf(new Date());
  const isCurrentWeek = weekStart.toISOString().slice(0, 10) === currentWeekStart.toISOString().slice(0, 10);

  // Contexto de dias
  const today = new Date();
  const isCurrentMonth = month.getFullYear() === today.getFullYear() && month.getMonth() === today.getMonth();
  const daysInMonth = getDaysInMonth(month);
  const dayOfMonth = isCurrentMonth ? getDate(today) : daysInMonth;
  const remainingDays = isCurrentMonth ? daysInMonth - dayOfMonth : 0;
  const expectedPct = (dayOfMonth / daysInMonth) * 100;

  // Dias decorridos da semana (semana atual)
  const elapsedDays = isCurrentWeek ? Math.min(7, Math.max(1, Math.ceil((today.getTime() - weekStart.getTime()) / 86400000))) : 7;

  const sorted = [...targetsData].sort((a, b) => (b.pct_amount || 0) - (a.pct_amount || 0));

  const totalTarget = targetsData.reduce((s, t) => s + t.target_amount, 0);
  const totalActual = targetsData.reduce((s, t) => s + (t.actual_amount || 0), 0);
  // % do time vem do servidor — funciona mesmo sem os R$ (não-gestor).
  const teamPct = metas[0]?.team_pct ?? 0;
  const hitting = targetsData.filter((t) => (t.pct_amount || 0) >= 100).length;
  const totalColor = canSeeValues
    ? getProgressColor(totalActual, totalTarget, dayOfMonth, daysInMonth)
    : (teamPct > 0 ? getProgressColor(teamPct, 100, dayOfMonth, daysInMonth) : "gray");
  const totalColors = COLOR_MAP[totalColor];

  const teamRemaining = Math.max(0, totalTarget - totalActual);
  const teamDailyNeeded = isCurrentMonth && remainingDays > 0 && teamRemaining > 0 ? Math.ceil(teamRemaining / remainingDays) : 0;
  const teamProjPct = isCurrentMonth && dayOfMonth > 2 && teamPct > 0 ? (teamPct * daysInMonth) / dayOfMonth : null;
  const teamProjected = canSeeValues && teamProjPct !== null && totalActual > 0 ? Math.round((totalActual / dayOfMonth) * daysInMonth) : null;
  const teamProjKey = (teamProjPct === null ? "gray" : teamProjPct >= 100 ? "green" : teamProjPct >= 85 ? "yellow" : "red") as keyof typeof COLOR_MAP;
  const teamProjColors = COLOR_MAP[teamProjKey];

  const monthlyTop3 = sorted.slice(0, 3).map((t, idx) => ({ rank: idx + 1, vendedor_id: t.vendedor_id, total: t.actual_amount || 0, profile: t.vendedor || null }));

  if (!canAdmin) {
    return (
      <main className="mx-auto max-w-4xl px-4 sm:px-6 py-8">
        <RestrictedNotice />
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-4xl px-4 sm:px-6 py-8 space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <CarboPageHeader
          icon={Trophy}
          iconColor="green"
          title="Metas — Placar de Vendedores"
          description="Espelho (somente leitura) da performance e metas mensais por vendedor"
        />
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex gap-1 bg-muted/40 rounded-lg p-1">
            {(["mensal", "semanal"] as PeriodView[]).map((v) => (
              <button key={v} onClick={() => setPeriodView(v)} className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors ${periodView === v ? "bg-carbo-green text-white" : "text-muted-foreground hover:text-foreground"}`}>
                {v === "mensal" ? "Mensal" : "Semanal"}
              </button>
            ))}
          </div>

          {periodView === "mensal" && (
            <div className="flex items-center gap-1 bg-muted/40 rounded-lg px-2 py-1.5">
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setMonth((m) => startOfMonth(subMonths(m, 1)))}><ChevronLeft className="h-4 w-4" /></Button>
              <span className="text-sm font-semibold w-32 text-center capitalize">{format(month, "MMM 'de' yyyy", { locale: ptBR })}</span>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setMonth((m) => startOfMonth(addMonths(m, 1)))} disabled={isCurrentMonth}><ChevronRight className="h-4 w-4" /></Button>
            </div>
          )}

          {periodView === "semanal" && (
            <div className="flex items-center gap-1 bg-muted/40 rounded-lg px-2 py-1.5">
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setWeekStart((w) => { const n = new Date(w); n.setDate(w.getDate() - 7); return n; })}><ChevronLeft className="h-4 w-4" /></Button>
              <span className="text-sm font-semibold w-40 text-center">
                {format(weekStart, "dd/MM", { locale: ptBR })} — {format(new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + 6), "dd/MM", { locale: ptBR })}
              </span>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setWeekStart((w) => { const n = new Date(w); n.setDate(w.getDate() + 7); return n; })} disabled={isCurrentWeek}><ChevronRight className="h-4 w-4" /></Button>
            </div>
          )}
        </div>
      </div>

      {isLoading ? (
        <CarboCard>
          <CarboCardContent className="py-16 text-center text-muted-foreground">Carregando…</CarboCardContent>
        </CarboCard>
      ) : (
      <>
      {/* Info bar — mensal */}
      {periodView === "mensal" && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-blue-500/10 border border-blue-500/20 text-sm text-blue-400">
          <TrendingUp className="h-4 w-4 shrink-0" />
          <span>
            Esperado hoje: <strong>{fmtPct(expectedPct)}</strong> (dia {dayOfMonth}/{daysInMonth}) ·{" "}
            <span className="text-green-400 font-medium">verde</span> = na meta ·{" "}
            <span className="text-amber-400 font-medium">amarelo</span> = atenção ·{" "}
            <span className="text-red-400 font-medium">vermelho</span> = abaixo
          </span>
        </div>
      )}

      {/* SEMANAL */}
      {periodView === "semanal" && (
        <WeeklyPanel entries={weeklyData} elapsedDays={elapsedDays} canSeeValues={canSeeValues} />
      )}

      {/* MENSAL */}
      {periodView === "mensal" && (
        <>
          {/* Team total */}
          <CarboCard className={`border ${totalColor === "green" ? "border-green-500/30" : totalColor === "yellow" ? "border-amber-500/30" : totalColor === "red" ? "border-red-500/30" : ""}`}>
            <CarboCardContent className="p-4">
              <div className="flex items-center justify-between gap-4 mb-3">
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider">{canSeeValues ? "Total do Time" : "Meta do mês"}</p>
                  {canSeeValues ? (
                    <div className="flex items-end gap-2 mt-0.5">
                      <p className={`text-2xl font-bold tabular-nums ${totalColors.text}`}>{fmtBRL(totalActual)}</p>
                      <p className="text-muted-foreground mb-0.5">/ {fmtBRL(totalTarget)}</p>
                    </div>
                  ) : (
                    <p className={`text-2xl font-bold tabular-nums mt-0.5 ${totalColors.text}`}>{fmtPct(teamPct)} <span className="text-sm font-normal text-muted-foreground">cumprido</span></p>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  {isCurrentMonth && remainingDays > 0 && (
                    <div className="text-center">
                      <p className="text-sm font-bold tabular-nums flex items-center gap-0.5"><Calendar className="h-3 w-3 text-muted-foreground" /> {remainingDays}d</p>
                      <p className="text-[10px] text-muted-foreground">restantes</p>
                    </div>
                  )}
                  {canSeeValues && teamDailyNeeded > 0 && (
                    <div className="text-center">
                      <p className="text-sm font-bold tabular-nums text-amber-500 flex items-center gap-0.5"><Zap className="h-3 w-3" /> {fmtBRL(teamDailyNeeded)}</p>
                      <p className="text-[10px] text-muted-foreground">precisa/dia</p>
                    </div>
                  )}
                  {canSeeValues && (
                    <div className="text-center">
                      <p className="text-lg font-bold tabular-nums">{hitting}/{targetsData.length}</p>
                      <p className="text-[10px] text-muted-foreground">na meta</p>
                    </div>
                  )}
                  <CarboBadge variant={totalColors.badge}>{fmtPct(teamPct)}</CarboBadge>
                </div>
              </div>
              <div className="relative h-2.5 bg-muted rounded-full overflow-hidden">
                <div className="h-full rounded-full transition-all duration-700" style={{ width: `${Math.min(100, teamPct)}%`, backgroundColor: totalColors.bar }} />
                {expectedPct > 0 && expectedPct < 100 && <div className="absolute top-0 bottom-0 w-0.5 bg-foreground/40" style={{ left: `${expectedPct}%` }} />}
              </div>
              {teamProjPct !== null && (
                <div className="flex items-center gap-1.5 text-xs mt-2 pt-2 border-t border-border/50">
                  <TrendingUp className="h-3 w-3 text-muted-foreground shrink-0" />
                  <span className="text-muted-foreground">Projeção {canSeeValues ? "do time " : ""}ao fim do mês:</span>
                  {canSeeValues && teamProjected !== null && <span className={`font-bold ${teamProjColors.text}`}>{fmtBRL(teamProjected)}</span>}
                  <CarboBadge variant={teamProjColors.badge} size="sm">{fmtPct(teamProjPct)}</CarboBadge>
                </div>
              )}
            </CarboCardContent>
          </CarboCard>

          {/* Top 3 do Mês */}
          <Top3Card entries={monthlyTop3} label="Top 3 do Mês" canSeeValues={canSeeValues} />

          {/* Lista */}
          {sorted.length === 0 ? (
            <CarboCard>
              <CarboCardContent className="py-16 text-center space-y-3">
                <Trophy className="h-12 w-12 mx-auto text-muted-foreground/30" />
                <p className="text-muted-foreground">Nenhuma meta para o mês selecionado.</p>
              </CarboCardContent>
            </CarboCard>
          ) : (
            <div className="space-y-3">
              {sorted.map((t, idx) => {
                const pctVal = t.pct_amount || 0;
                const color = getProgressColor(pctVal, 100, dayOfMonth, daysInMonth);
                const colors = COLOR_MAP[color];
                const actual = t.actual_amount || 0;
                const target = t.target_amount;
                const remaining = Math.max(0, target - actual);
                const dailyNeeded = isCurrentMonth && remainingDays > 0 && remaining > 0 ? Math.ceil(remaining / remainingDays) : 0;
                const prevActual = prevMap[t.vendedor_id] ?? 0;
                // Projeção a partir do % (server) — mostra para todos, sem depender do R$.
                const projPct = isCurrentMonth && dayOfMonth > 2 && pctVal > 0 ? (pctVal * daysInMonth) / dayOfMonth : null;
                const projKey = (projPct === null ? "gray" : projPct >= 100 ? "green" : projPct >= 85 ? "yellow" : "red") as keyof typeof COLOR_MAP;
                const projColors = COLOR_MAP[projKey];
                const rankBadge = idx === 0 ? "🥇" : idx === 1 ? "🥈" : idx === 2 ? "🥉" : `${idx + 1}º`;
                return (
                  <CarboCard key={t.id} className={`border-l-2 ${color === "red" ? "border-l-red-500" : color === "yellow" ? "border-l-amber-500" : color === "green" ? "border-l-green-500" : "border-l-transparent"}`}>
                    <CarboCardContent className="px-3 py-2">
                      <div className="flex items-center gap-2.5">
                        <span className="w-6 text-center shrink-0 text-sm font-bold text-muted-foreground">{rankBadge}</span>
                        <ProfileAvatar avatarUrl={t.vendedor?.avatar_url} fullName={t.vendedor?.full_name} userId={t.vendedor_id} size={28} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <p className="font-semibold text-sm truncate">{t.vendedor?.full_name || "—"}</p>
                            <div className="flex items-center gap-2 shrink-0">
                              {canSeeValues && <span className={`text-sm font-bold tabular-nums ${colors.text}`}>{fmtBRL(actual)}<span className="text-[10px] font-normal text-muted-foreground"> /{fmtBRL(target)}</span></span>}
                              <CarboBadge variant={colors.badge} size="sm">{fmtPct(pctVal)}</CarboBadge>
                            </div>
                          </div>
                          <div className="relative h-1.5 bg-muted rounded-full overflow-hidden mt-1">
                            <div className="h-full rounded-full transition-all duration-700" style={{ width: `${Math.min(100, pctVal)}%`, backgroundColor: colors.bar }} />
                            {expectedPct > 0 && expectedPct < 100 && <div className="absolute top-0 bottom-0 w-0.5 bg-foreground/40" style={{ left: `${expectedPct}%` }} />}
                          </div>
                          <div className="flex items-center gap-x-3 gap-y-0 flex-wrap text-[11px] text-muted-foreground mt-0.5">
                            {canSeeValues && remaining > 0 && <span>Faltam {fmtBRL(remaining)}</span>}
                            {canSeeValues && dailyNeeded > 0 && <span className="inline-flex items-center gap-0.5 text-amber-500 font-medium"><Zap className="h-2.5 w-2.5" /> {fmtBRL(dailyNeeded)}/dia</span>}
                            {projPct !== null && <span style={{ color: projColors.bar }} className="font-medium">proj. {fmtPct(projPct)}</span>}
                            {canSeeValues && t.target_qty > 0 && <span>{t.actual_qty || 0}/{t.target_qty} ped.</span>}
                            {canSeeValues && <DeltaBadge current={actual} prev={prevActual} />}
                          </div>
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

      <p className="text-xs text-muted-foreground text-center pt-1">
        Espelho somente leitura do Carbo Sales. Realizado das vendas salvas (status “pedido”). A configuração de metas é no Carbo Ops.
      </p>
      </>
      )}
    </main>
  );
}

import { useState } from "react";
import { format, startOfMonth, addMonths, subMonths, getDaysInMonth, getDate } from "date-fns";
import { ptBR } from "date-fns/locale";
import { BoardLayout } from "@/components/layouts/BoardLayout";
import { CarboCard, CarboCardContent, CarboCardHeader, CarboCardTitle } from "@/components/ui/carbo-card";
import { CarboBadge } from "@/components/ui/carbo-badge";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Trophy, TrendingUp, AlertTriangle, ExternalLink } from "lucide-react";
import { useSalesTargetsWithProgress } from "@/hooks/useSalesTargets";
import { Link } from "react-router-dom";
import { getProgressColor, type PlatformMetaStats } from "@/hooks/useMetaEcommerce";

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
  green:  { bar: "#22c55e", badge: "success"     as const, text: "text-green-500"  },
  yellow: { bar: "#f59e0b", badge: "warning"     as const, text: "text-amber-500"  },
  red:    { bar: "#ef4444", badge: "destructive" as const, text: "text-red-500"    },
  gray:   { bar: "#64748b", badge: "secondary"   as const, text: "text-muted-foreground" },
};

// ─────────────────────────────────────────────────────────────────────────────
// Main page
// ─────────────────────────────────────────────────────────────────────────────

export default function MetaVendedoresPage() {
  const [month, setMonth] = useState(() => startOfMonth(new Date()));

  const monthStr = month.toISOString().slice(0, 10);
  const { data: targetsWithProgress = [], isLoading } = useSalesTargetsWithProgress(monthStr);

  const today = new Date();
  const isCurrentMonth =
    month.getFullYear() === today.getFullYear() &&
    month.getMonth() === today.getMonth();

  const dayOfMonth  = isCurrentMonth ? getDate(today) : getDaysInMonth(month);
  const daysInMonth = getDaysInMonth(month);
  const expectedPct = (dayOfMonth / daysInMonth) * 100;

  // Sort by progress descending
  const sorted = [...targetsWithProgress].sort((a, b) => (b.pct_amount || 0) - (a.pct_amount || 0));

  return (
    <BoardLayout>
      <div className="p-4 md:p-6 space-y-6 max-w-5xl mx-auto">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              🏆 Meta de Vendedores
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Performance dos vendedores vs metas mensais (RV / pedidos)
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

        {/* Context info */}
        <div className="flex items-start gap-2 px-3 py-2.5 rounded-md bg-blue-500/10 border border-blue-500/20 text-sm text-blue-400">
          <TrendingUp className="h-4 w-4 shrink-0 mt-0.5" />
          <span>
            Progresso esperado hoje: <strong>{fmtPct(expectedPct)}</strong> ({dayOfMonth}/{daysInMonth} dias)
            · Barra <span className="text-green-400 font-medium">verde</span> = projetando bater ·{" "}
            <span className="text-amber-400 font-medium">amarela</span> = atenção ·{" "}
            <span className="text-red-400 font-medium">vermelha</span> = abaixo da projeção
          </span>
        </div>

        {/* Manage link */}
        <div className="flex justify-end">
          <Button variant="outline" size="sm" asChild className="gap-1.5">
            <Link to="/sales-targets">
              <ExternalLink className="h-3.5 w-3.5" />
              Gerenciar metas
            </Link>
          </Button>
        </div>

        {/* Content */}
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-24 rounded-xl bg-muted/40 animate-pulse" />
            ))}
          </div>
        ) : sorted.length === 0 ? (
          <CarboCard>
            <CarboCardContent className="py-12 text-center space-y-3">
              <Trophy className="h-12 w-12 mx-auto text-muted-foreground/30" />
              <p className="text-muted-foreground">
                Nenhuma meta cadastrada para este mês.
              </p>
              <Button variant="outline" asChild>
                <Link to="/sales-targets">Cadastrar metas em Metas de Vendas</Link>
              </Button>
            </CarboCardContent>
          </CarboCard>
        ) : (
          <div className="space-y-3">
            {sorted.map((t, idx) => {
              const pct   = t.pct_amount || 0;
              const color = getProgressColor(pct, 100, dayOfMonth, daysInMonth);
              const colors = COLOR_MAP[color];

              return (
                <CarboCard key={t.id} className={`border ${color === "red" ? "border-red-500/30" : color === "yellow" ? "border-amber-500/30" : ""}`}>
                  <CarboCardContent className="p-4">
                    <div className="flex items-center gap-4">
                      {/* Rank */}
                      <div className="w-7 text-center">
                        {idx === 0 ? <span className="text-xl">🥇</span>
                         : idx === 1 ? <span className="text-xl">🥈</span>
                         : idx === 2 ? <span className="text-xl">🥉</span>
                         : <span className="text-sm font-bold text-muted-foreground">{idx + 1}º</span>}
                      </div>

                      {/* Name + progress */}
                      <div className="flex-1 space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <div>
                            <p className="font-semibold text-sm">
                              {t.vendedor?.full_name || "—"}
                            </p>
                            {t.linha && (
                              <p className="text-xs text-muted-foreground">{t.linha}</p>
                            )}
                          </div>
                          <div className="flex items-center gap-2 text-right">
                            <div>
                              <p className={`text-lg font-bold tabular-nums ${colors.text}`}>
                                {fmtBRL(t.actual_amount || 0)}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                / {fmtBRL(Number(t.target_amount))}
                              </p>
                            </div>
                            <CarboBadge variant={colors.badge} size="sm">
                              {fmtPct(pct)}
                            </CarboBadge>
                          </div>
                        </div>

                        {/* Progress bar */}
                        <div className="relative h-2.5 bg-muted rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-700"
                            style={{
                              width: `${Math.min(100, pct)}%`,
                              backgroundColor: colors.bar,
                            }}
                          />
                          {/* Expected marker */}
                          {expectedPct > 0 && expectedPct < 100 && (
                            <div
                              className="absolute top-0 bottom-0 w-0.5 bg-foreground/40"
                              style={{ left: `${expectedPct}%` }}
                            />
                          )}
                        </div>

                        {/* Footer */}
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                          <span>Faltam {fmtBRL(Math.max(0, Number(t.target_amount) - (t.actual_amount || 0)))}</span>
                          {t.target_qty > 0 && (
                            <span>{t.actual_qty || 0} / {t.target_qty} pedidos</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </CarboCardContent>
                </CarboCard>
              );
            })}
          </div>
        )}

      </div>
    </BoardLayout>
  );
}

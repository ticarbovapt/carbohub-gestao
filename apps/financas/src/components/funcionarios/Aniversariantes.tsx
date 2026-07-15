import { useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Cake, Gift, PartyPopper, CalendarDays, Users, CheckCircle2,
  AlertCircle, ChevronDown, ChevronRight, Clock, Sparkles,
} from "lucide-react";
import { CarboCard, CarboCardContent } from "@/components/ui/carbo-card";
import { CarboKPI } from "@/components/ui/carbo-kpi";
import { CarboBadge } from "@/components/ui/carbo-badge";
import { Progress } from "@/components/ui/progress";
import { CarboEmptyState } from "@/components/ui/carbo-empty-state";
import { Separator } from "@/components/ui/separator";
import type { EmployeeRow } from "@/hooks/useEmployeeFinance";
import { useOrgLabels } from "@/hooks/useTeamMembers";
import { useBirthdays, type BirthdayEntry } from "@/hooks/useBirthdays";
import { MESES, MESES_ABREV, tierOf } from "@/lib/birthdays";

// ── Avatar local (foto ou iniciais) ─────────────────────────────────────────
const initials = (name: string) =>
  name.split(" ").filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("");

function Avatar({ url, name, className = "h-9 w-9" }: { url: string | null; name: string; className?: string }) {
  return url
    ? <img src={url} alt={name} className={`${className} rounded-full object-cover shrink-0`} />
    : <div className={`${className} rounded-full bg-muted flex items-center justify-center text-xs font-semibold text-muted-foreground shrink-0`}>{initials(name) || "?"}</div>;
}

// Helpers de rótulo ----------------------------------------------------------
const diasLabel = (d: number) => (d === 0 ? "Hoje" : d === 1 ? "amanhã" : `em ${d} dias`);
const dataLabel = (d: Date) => format(d, "EEE, dd 'de' MMM", { locale: ptBR });

// Tokens de destaque progressivo (hoje > semana > mês > futuro).
const tierRing: Record<string, string> = {
  today: "ring-2 ring-emerald-500/60 bg-emerald-500/10",
  week: "ring-1 ring-amber-500/50 bg-amber-500/[0.07]",
  month: "bg-muted/40",
  future: "bg-muted/30",
};
const tierText: Record<string, string> = {
  today: "text-emerald-600 dark:text-emerald-400",
  week: "text-amber-600 dark:text-amber-400",
  month: "text-muted-foreground",
  future: "text-muted-foreground",
};

// ── Linha rica de pessoa (usada em "Chegando") ───────────────────────────────
function PersonRow({ entry, deptLabel }: { entry: BirthdayEntry; deptLabel: Record<string, string> }) {
  const { row, info } = entry;
  const tier = tierOf(info);
  const dept = row.department ? (deptLabel[row.department] ?? row.department) : row.origin === "avulso" ? "Avulso" : null;
  return (
    <div className={`flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors ${tierRing[tier]}`}>
      <Avatar url={row.avatarUrl} name={row.displayName} />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold truncate leading-tight">{row.displayName}</p>
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground mt-0.5">
          <CalendarDays className="h-3 w-3 shrink-0" />
          <span className="capitalize truncate">{dataLabel(info.nextDate)}</span>
          {dept && <span className="text-muted-foreground/50">·</span>}
          {dept && <span className="truncate">{dept}</span>}
        </div>
      </div>
      <div className="text-right shrink-0">
        <p className={`text-xs font-bold capitalize ${tierText[tier]}`}>{diasLabel(info.daysUntil)}</p>
        {info.turningAge != null && (
          <p className="text-[11px] text-muted-foreground">faz {info.turningAge}</p>
        )}
      </div>
    </div>
  );
}

// ── Linha compacta (usada no calendário anual) ───────────────────────────────
function CompactRow({ entry }: { entry: BirthdayEntry }) {
  const { row, info } = entry;
  const tier = tierOf(info);
  return (
    <li className="flex items-center gap-2 text-xs py-0.5">
      <span className="tabular-nums text-muted-foreground w-6 shrink-0 text-right">{String(info.day).padStart(2, "0")}</span>
      <span className="truncate flex-1">{row.displayName}</span>
      {info.turningAge != null && <span className="text-[10px] text-muted-foreground shrink-0">{info.turningAge}</span>}
      {tier === "today" && <Cake className="h-3.5 w-3.5 text-emerald-500 shrink-0" />}
      {tier === "week" && <Clock className="h-3.5 w-3.5 text-amber-500 shrink-0" />}
    </li>
  );
}

export function Aniversariantes({ rows }: { rows: EmployeeRow[] }) {
  const { data: labels } = useOrgLabels();
  const deptLabel = labels?.deptLabel ?? {};
  const bd = useBirthdays(rows);
  const curMonth = new Date().getMonth(); // 0-based
  const [showNoDate, setShowNoDate] = useState(false);

  // Meses que não são o corrente (grid compacto).
  const otherMonths = Array.from({ length: 12 }, (_, i) => i).filter((i) => i !== curMonth);

  return (
    <div className="space-y-6">
      {/* ── KPIs ─────────────────────────────────────────────────────────── */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <CarboKPI title="Funcionários" value={bd.total} icon={Users} iconColor="blue" />
        <CarboKPI title={`Aniversariantes de ${MESES[curMonth]}`} value={bd.thisMonth.length} icon={Cake} iconColor="green" />
        {/* Cobertura de cadastro com barra de progresso */}
        <CarboCard variant="kpi" padding="none" className="p-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-success/10 text-success flex items-center justify-center shrink-0">
              <CheckCircle2 className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-2xl font-bold text-foreground truncate">{bd.withDate}<span className="text-sm font-medium text-muted-foreground">/{bd.total}</span></p>
              <p className="text-xs text-muted-foreground truncate">Com data cadastrada</p>
            </div>
          </div>
          <div className="mt-3 flex items-center gap-2">
            <Progress value={bd.coveragePct} className="h-1.5 flex-1" />
            <span className="text-[11px] font-semibold text-muted-foreground tabular-nums">{bd.coveragePct}%</span>
          </div>
        </CarboCard>
        {/* Próximo aniversário */}
        <CarboCard variant="kpi" padding="none" className="p-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-carbo-blue/10 text-carbo-blue flex items-center justify-center shrink-0">
              <Gift className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              {bd.next ? (
                <>
                  <p className="text-lg font-bold text-foreground truncate leading-tight">{bd.next.row.displayName}</p>
                  <p className="text-xs text-muted-foreground truncate capitalize">
                    Próximo · {diasLabel(bd.next.info.daysUntil)}
                  </p>
                </>
              ) : (
                <>
                  <p className="text-lg font-bold text-muted-foreground leading-tight">—</p>
                  <p className="text-xs text-muted-foreground">Próximo aniversário</p>
                </>
              )}
            </div>
          </div>
        </CarboCard>
      </div>

      {/* ── Banner de HOJE ───────────────────────────────────────────────── */}
      {bd.todays.length > 0 && (
        <CarboCard variant="gradient" className="border-emerald-500/30">
          <CarboCardContent className="py-5">
            <div className="flex items-start gap-3">
              <div className="h-11 w-11 rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                <PartyPopper className="h-6 w-6" />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-base font-bold flex items-center gap-1.5">
                  <Sparkles className="h-4 w-4 text-emerald-500" />
                  {bd.todays.length === 1 ? "Aniversário hoje!" : `${bd.todays.length} aniversários hoje!`}
                </h3>
                <p className="text-sm text-muted-foreground mt-0.5">
                  Não esqueça de parabenizar{bd.todays.length === 1 ? "" : ":"}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {bd.todays.map((e) => (
                    <div key={e.row.key} className="flex items-center gap-2 rounded-full bg-background/60 border border-emerald-500/20 pl-1 pr-3 py-1">
                      <Avatar url={e.row.avatarUrl} name={e.row.displayName} className="h-7 w-7" />
                      <span className="text-sm font-semibold">{e.row.displayName}</span>
                      {e.info.turningAge != null && (
                        <CarboBadge variant="success" size="sm">faz {e.info.turningAge}</CarboBadge>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </CarboCardContent>
        </CarboCard>
      )}

      {/* ── Chegando (próximos 30 dias) ──────────────────────────────────── */}
      <CarboCard>
        <CarboCardContent className="pt-6 space-y-3">
          <div className="flex items-center gap-2">
            <PartyPopper className="h-4 w-4 text-amber-500" />
            <h3 className="text-sm font-semibold">Chegando</h3>
            <CarboBadge variant="outline">{bd.upcoming.length}</CarboBadge>
            <span className="text-xs text-muted-foreground ml-auto">próximos 30 dias</span>
          </div>
          {bd.upcoming.length === 0 ? (
            <p className="text-sm text-muted-foreground py-2">Nenhum aniversário nos próximos 30 dias.</p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {bd.upcoming.map((e) => <PersonRow key={e.row.key} entry={e} deptLabel={deptLabel} />)}
            </div>
          )}
        </CarboCardContent>
      </CarboCard>

      {/* ── Calendário anual: mês corrente em destaque + demais compactos ── */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <CalendarDays className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">Calendário anual</h3>
        </div>

        {/* Mês corrente — card destacado */}
        <CarboCard variant="highlight">
          <CarboCardContent className="pt-6 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-base font-bold text-carbo-green flex items-center gap-2">
                <Cake className="h-4 w-4" />
                {MESES[curMonth]}
                <span className="text-xs font-normal text-muted-foreground">mês atual</span>
              </h4>
              <CarboBadge variant="success">{bd.thisMonth.length}</CarboBadge>
            </div>
            {bd.thisMonth.length === 0 ? (
              <p className="text-sm text-muted-foreground py-1">Ninguém faz aniversário este mês.</p>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {bd.thisMonth.map((e) => <PersonRow key={e.row.key} entry={e} deptLabel={deptLabel} />)}
              </div>
            )}
          </CarboCardContent>
        </CarboCard>

        {/* Demais meses — grid compacto */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {otherMonths.map((i) => {
            const lista = bd.byMonth[i];
            const vazio = lista.length === 0;
            return (
              <CarboCard key={i} className={vazio ? "opacity-60" : ""}>
                <CarboCardContent className="pt-4 pb-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-semibold text-muted-foreground">
                      <span className="text-foreground">{MESES_ABREV[i]}</span>
                      <span className="ml-1 text-xs">{MESES[i].slice(3)}</span>
                    </h4>
                    <CarboBadge variant={vazio ? "outline" : "secondary"} size="sm">{lista.length}</CarboBadge>
                  </div>
                  {vazio ? (
                    <p className="text-xs text-muted-foreground/60">—</p>
                  ) : (
                    <ul className="divide-y divide-border/50">
                      {lista.map((e) => <CompactRow key={e.row.key} entry={e} />)}
                    </ul>
                  )}
                </CarboCardContent>
              </CarboCard>
            );
          })}
        </div>
      </div>

      {/* ── Sem data cadastrada (colapsável e acionável) ─────────────────── */}
      {bd.noDate.length > 0 && (
        <CarboCard>
          <CarboCardContent className="py-4 space-y-2">
            <button
              type="button"
              onClick={() => setShowNoDate((v) => !v)}
              className="flex items-center gap-2 w-full text-left group"
            >
              {showNoDate ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
              <AlertCircle className="h-4 w-4 text-amber-500" />
              <h3 className="text-sm font-semibold">Sem data de aniversário</h3>
              <CarboBadge variant="warning" size="sm">{bd.noDate.length}</CarboBadge>
              <span className="text-xs text-muted-foreground ml-auto group-hover:text-foreground transition-colors">
                {showNoDate ? "ocultar" : "ver quem falta"}
              </span>
            </button>
            {showNoDate && (
              <>
                <Separator className="my-1" />
                <div className="flex flex-wrap gap-1.5">
                  {bd.noDate.map((r) => (
                    <div key={r.key} className="flex items-center gap-1.5 rounded-full bg-muted/50 border border-border pl-1 pr-2.5 py-0.5">
                      <Avatar url={r.avatarUrl} name={r.displayName} className="h-5 w-5" />
                      <span className="text-xs">{r.displayName}</span>
                    </div>
                  ))}
                </div>
                <p className="text-[11px] text-muted-foreground pt-1">
                  Edite o funcionário na aba “Equipe” para preencher a data de aniversário.
                </p>
              </>
            )}
          </CarboCardContent>
        </CarboCard>
      )}

      {/* Empty state geral (nenhum funcionário com data e nenhum sem data = sem gente) */}
      {bd.total === 0 && (
        <CarboEmptyState icon={Cake} title="Nenhum funcionário" description="Cadastre funcionários na aba Equipe para acompanhar os aniversários." />
      )}
    </div>
  );
}

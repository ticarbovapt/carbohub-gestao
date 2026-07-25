import { useNavigate } from "react-router-dom";
import { CarboPageHeader } from "@/components/ui/carbo-page-header";
import { Users, AlertTriangle, Flame, Trophy, BarChart3, KanbanSquare, ArrowRight } from "lucide-react";
import { useCRMAllStats } from "@/hooks/useCRMLeads";
import { FUNNEL_CONFIG, FUNIS_VISIVEIS, SEGMENTS } from "@/types/crm";

// Visão geral do CRM. Depois da consolidação das pipelines, o recorte principal
// deixou de ser "funil" e passou a ser SEGMENTO (o que o lead É) — as 9
// pipelines antigas viraram etiqueta, e contá-las aqui só mostraria zeros.
const KPI_CARDS = [
  { key: "abertos", title: "Leads em aberto", icon: Users, accent: "#3b82f6", sub: "ainda em negociação" },
  { key: "hot", title: "Leads Quentes", icon: Flame, accent: "#f59e0b", sub: "prioridade de contato" },
  { key: "stale", title: "Sem Atividade > 3d", icon: AlertTriangle, accent: "#f43f5e", sub: "precisam de follow-up" },
  { key: "ganhos", title: "Ganhos", icon: Trophy, accent: "#22c55e", sub: "negócios fechados" },
] as const;

const brl = (v: number) =>
  v >= 1000
    ? `R$ ${(v / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}k`
    : `R$ ${v.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}`;

export default function CRM() {
  const navigate = useNavigate();
  const { data: stats, isLoading } = useCRMAllStats();

  const kpiValue = (key: string) => {
    if (key === "abertos") return stats?.abertos ?? 0;
    if (key === "hot") return stats?.hot ?? 0;
    if (key === "stale") return stats?.stale ?? 0;
    return stats?.ganhos ?? 0;
  };

  // Só segmentos com lead, do maior pro menor — a tela não nasce poluída de zeros.
  const segmentos = SEGMENTS
    .map((sg) => ({ cfg: sg, d: stats?.bySegment?.[sg.id] }))
    .filter((x) => (x.d?.total ?? 0) > 0)
    .sort((a, b) => (b.d!.abertos - a.d!.abertos) || (b.d!.total - a.d!.total));

  const maxAbertos = Math.max(1, ...segmentos.map((s) => s.d!.abertos));

  return (
    <div className="p-4 md:p-6">
      <div className="space-y-6 max-w-[1500px] mx-auto">
        <CarboPageHeader
          title="CRM — Visão Geral"
          description="Leads por segmento, prospecção e pipeline comercial"
          icon={BarChart3}
        />

        {/* KPIs globais */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
          {KPI_CARDS.map(({ key, title, icon: Icon, accent, sub }) => (
            <div key={key} className="relative overflow-hidden rounded-2xl border border-border bg-board-surface p-4 kpi-glow transition-all hover:-translate-y-0.5">
              <div className="absolute top-0 left-0 h-full w-1" style={{ background: accent }} />
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-xs font-medium text-board-muted">{title}</p>
                  <p className="mt-1 text-3xl font-bold tabular-nums leading-none" style={{ color: accent }}>
                    {isLoading ? "—" : kpiValue(key)}
                  </p>
                  <p className="mt-1.5 text-[11px] text-board-muted">{sub}</p>
                </div>
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl" style={{ background: accent + "1a", color: accent }}>
                  <Icon className="h-5 w-5" />
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Por segmento — o recorte que substituiu as pipelines por tipo */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-sm font-semibold uppercase text-muted-foreground tracking-wider">Por segmento</h3>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Clique para abrir o quadro já filtrado
              </p>
            </div>
            <button onClick={() => navigate("/crm/pipelines")} className="text-xs font-semibold text-primary hover:underline inline-flex items-center gap-1">
              <KanbanSquare className="h-3.5 w-3.5" /> Ver pipelines
            </button>
          </div>

          {isLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-32 rounded-2xl bg-muted/40 animate-pulse" />)}
            </div>
          ) : segmentos.length === 0 ? (
            <div className="rounded-2xl border border-dashed p-10 text-center text-sm text-muted-foreground">
              Nenhum lead ainda.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {segmentos.map(({ cfg, d }) => {
                const s = d!;
                const share = Math.round((s.abertos / maxAbertos) * 100);
                const conv = s.ganhos + s.perdidos > 0
                  ? Math.round((s.ganhos / (s.ganhos + s.perdidos)) * 100) : null;
                return (
                  <button
                    key={cfg.id}
                    onClick={() => navigate(`/crm/pipelines?funil=f13&seg=${cfg.id}`)}
                    className="group relative overflow-hidden rounded-2xl border border-border bg-board-surface p-4 text-left transition-all hover:-translate-y-1 hover:shadow-lg"
                  >
                    <div className="absolute top-0 left-0 h-1 w-full" style={{ background: cfg.color }} />

                    <div className="flex items-start justify-between gap-2 mb-3">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-lg shrink-0">{cfg.icon}</span>
                        <span className="text-sm font-semibold truncate">{cfg.shortName}</span>
                      </div>
                      <ArrowRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                    </div>

                    <div className="flex items-baseline gap-1.5">
                      <span className="text-3xl font-bold tabular-nums leading-none" style={{ color: cfg.color }}>
                        {s.abertos}
                      </span>
                      <span className="text-[11px] text-muted-foreground">em aberto</span>
                    </div>

                    <div className="mt-2 h-1.5 w-full rounded-full bg-muted overflow-hidden">
                      <div className="h-full rounded-full transition-all" style={{ width: `${share}%`, background: cfg.color }} />
                    </div>

                    <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                      {s.quentes > 0 && (
                        <span className="text-amber-500 font-medium">🔥 {s.quentes}</span>
                      )}
                      {s.parados > 0 && (
                        <span className="text-destructive font-medium">⚠ {s.parados} parado(s)</span>
                      )}
                      <span className="ml-auto">
                        {s.ganhos} ganho(s){conv !== null ? ` · ${conv}%` : ""}
                      </span>
                    </div>

                    {s.receita > 0 && (
                      <p className="mt-1.5 text-[11px] text-muted-foreground border-t pt-1.5">
                        Receita ganha: <strong className="text-foreground">{brl(s.receita)}</strong>
                      </p>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Pipelines vivas — atalho, com a contagem real */}
        <div>
          <h3 className="text-sm font-semibold uppercase text-muted-foreground tracking-wider mb-3">Pipelines</h3>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {FUNIS_VISIVEIS.map((id) => {
              const cfg = FUNNEL_CONFIG[id];
              return (
                <button key={id} onClick={() => navigate(`/crm/pipelines?funil=${id}`)}
                  className="flex items-center gap-2 rounded-xl border border-border bg-board-surface px-3 py-2.5 text-left transition-all hover:-translate-y-0.5 hover:shadow">
                  <span className="text-base shrink-0">{cfg.icon}</span>
                  <span className="text-xs font-medium truncate flex-1">{cfg.shortName}</span>
                  <span className="text-[11px] font-semibold tabular-nums shrink-0" style={{ color: cfg.color }}>
                    {stats?.byFunnel?.[id] ?? 0}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

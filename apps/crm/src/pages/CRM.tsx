import { useNavigate } from "react-router-dom";
import { CarboPageHeader } from "@/components/ui/carbo-page-header";
import { Users, TrendingUp, AlertTriangle, Flame, ArrowRight, BarChart3, KanbanSquare } from "lucide-react";
import { useCRMAllStats } from "@/hooks/useCRMLeads";
import { FUNNEL_CONFIG } from "@/types/crm";

// PORT FIEL ao Controle (/crm → CRMDashboard) — visão geral dos funis (dashboard de atalhos).
const KPI_CARDS = [
  { key: "total", title: "Total de Leads", icon: Users, accent: "#3b82f6", sub: "em todos os funis" },
  { key: "hot", title: "Leads Quentes", icon: Flame, accent: "#f59e0b", sub: "prioridade de contato" },
  { key: "stale", title: "Sem Atividade > 3d", icon: AlertTriangle, accent: "#f43f5e", sub: "precisam de follow-up" },
  { key: "funnels", title: "Funis Ativos", icon: TrendingUp, accent: "#22c55e", sub: "com leads em aberto" },
] as const;

export default function CRM() {
  const navigate = useNavigate();
  const { data: stats, isLoading } = useCRMAllStats();
  const funnels = Object.values(FUNNEL_CONFIG);
  const totalLeads = stats?.total || 0;

  const kpiValue = (key: string) => {
    if (key === "total") return stats?.total || 0;
    if (key === "hot") return stats?.hot || 0;
    if (key === "stale") return stats?.stale || 0;
    return Object.keys(stats?.byFunnel || {}).length;
  };

  return (
    <div className="p-4 md:p-6">
      <div className="space-y-6 max-w-[1500px] mx-auto">
        <CarboPageHeader
          title="CRM — Funis de Venda"
          description="Gestão de leads, prospecção e pipeline comercial"
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

        {/* Cards de funil */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold uppercase text-muted-foreground tracking-wider">Funis de Venda</h3>
            <button onClick={() => navigate("/crm/pipelines")} className="text-xs font-semibold text-primary hover:underline inline-flex items-center gap-1">
              <KanbanSquare className="h-3.5 w-3.5" /> Ver todas as pipelines
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {funnels.map((funnel) => {
              const count = stats?.byFunnel?.[funnel.id] || 0;
              const share = totalLeads > 0 ? Math.round((count / totalLeads) * 100) : 0;
              return (
                <button
                  key={funnel.id}
                  onClick={() => navigate(`/crm/pipelines?funil=${funnel.id}`)}
                  className="group relative overflow-hidden rounded-2xl border border-border bg-board-surface p-4 text-left transition-all hover:-translate-y-1 hover:shadow-lg"
                >
                  {/* faixa de cor no topo */}
                  <div className="absolute inset-x-0 top-0 h-1" style={{ background: funnel.color }} />
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-2.5">
                      <div className="h-11 w-11 rounded-xl flex items-center justify-center text-xl" style={{ background: funnel.color + "1a" }}>
                        {funnel.icon}
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold text-sm leading-tight">{funnel.shortName}</p>
                        <p className="text-[10px] text-muted-foreground">ciclo {funnel.cycleLabel}</p>
                      </div>
                    </div>
                    <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
                  </div>

                  <div className="flex items-end justify-between mb-2">
                    <div>
                      <p className="text-3xl font-bold tabular-nums leading-none" style={{ color: funnel.color }}>{count}</p>
                      <p className="text-[10px] text-muted-foreground mt-1">leads ativos</p>
                    </div>
                    <span className="text-[11px] font-semibold text-muted-foreground tabular-nums">{share}%</span>
                  </div>
                  {/* barra de participação */}
                  <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                    <div className="h-full rounded-full transition-all" style={{ width: `${share}%`, background: funnel.color }} />
                  </div>
                  <p className="mt-2 text-[10px] text-muted-foreground truncate">{funnel.description}</p>
                </button>
              );
            })}
          </div>
        </div>

        {/* Ações rápidas */}
        <div className="rounded-2xl border border-border bg-board-surface p-4">
          <h3 className="text-sm font-semibold mb-3">Ações Rápidas</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {([["f4", "🏪", "PDVs CarboZé"], ["f2", "🏢", "Licenciados"], ["f1", "🛒", "B2C"], ["f3", "🚛", "Frotistas"]] as const).map(([id, icon, label]) => {
              const cfg = FUNNEL_CONFIG[id];
              return (
                <button
                  key={id}
                  onClick={() => navigate(`/crm/pipelines?funil=${id}`)}
                  className="flex flex-col items-center gap-1 rounded-xl border border-border py-3.5 transition-all hover:-translate-y-0.5 hover:shadow-md"
                >
                  <span className="text-2xl">{icon}</span>
                  <span className="text-xs font-medium">{label}</span>
                  <span className="text-[10px] font-semibold tabular-nums" style={{ color: cfg.color }}>{stats?.byFunnel?.[id] || 0} leads</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

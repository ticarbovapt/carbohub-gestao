import { useState } from "react";
import { BoardLayout } from "@/components/layouts/BoardLayout";
import { KPICard } from "@/components/board/KPICard";
import { StatusBadge } from "@/components/board/StatusBadge";
import { Button } from "@/components/ui/button";
import {
  ClipboardCheck,
  AlertTriangle,
  TrendingUp,
  Clock,
  Building2,
  Calendar,
  Download,
  Filter,
  MoreHorizontal,
  Factory,
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useDashboardStats, useRecentChecklists } from "@/hooks/useDashboardStats";
import { useChecklistTrend, useOSTrend, useDepartmentDistribution } from "@/hooks/useDashboardCharts";
import { TrendChart } from "@/components/dashboard/TrendChart";
import { DepartmentChart } from "@/components/dashboard/DepartmentChart";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CarboPageHeader } from "@/components/ui/carbo-page-header";

const DEPARTMENT_LABELS: Record<string, string> = {
  venda: "Venda",
  preparacao: "Preparação",
  expedicao: "Expedição",
  operacao: "Operação",
  pos_venda: "Pós-Venda",
};

export default function DashboardProducao() {
  const [period, setPeriod] = useState<"today" | "week" | "month">("week");
  const { data: stats, isLoading: statsLoading } = useDashboardStats(period);
  const { data: recentChecklists, isLoading: checklistsLoading } = useRecentChecklists(10);
  const { data: checklistTrend, isLoading: trendLoading } = useChecklistTrend(7);
  const { data: osTrend, isLoading: osTrendLoading } = useOSTrend(7);
  const { data: deptDistribution, isLoading: deptLoading } = useDepartmentDistribution();

  const formatTime = (minutes: number | null) => {
    if (minutes === null) return "—";
    if (minutes < 60) return `${minutes}min`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}h ${mins}min`;
  };

  const getChecklistStatus = (checklist: { is_completed: boolean; completed_at: string | null }) => {
    if (checklist.is_completed) return "completed" as const;
    return "pending" as const;
  };

  return (
    <BoardLayout>
      <div className="space-y-8">
        {/* Header */}
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <CarboPageHeader
            title="Dashboard — Produção"
            description="Checklists, Ordens de Produção e eficiência operacional"
            icon={Factory}
          />
          <div className="flex items-center gap-3">
            <Select value={period} onValueChange={(v) => setPeriod(v as typeof period)}>
              <SelectTrigger className="w-40">
                <Calendar className="mr-2 h-4 w-4" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="today">Hoje</SelectItem>
                <SelectItem value="week">Esta semana</SelectItem>
                <SelectItem value="month">Este mês</SelectItem>
              </SelectContent>
            </Select>
            <Select defaultValue="all">
              <SelectTrigger className="w-44">
                <Building2 className="mr-2 h-4 w-4" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas unidades</SelectItem>
                <SelectItem value="venda">Venda</SelectItem>
                <SelectItem value="preparacao">Preparação</SelectItem>
                <SelectItem value="expedicao">Expedição</SelectItem>
                <SelectItem value="operacao">Operação</SelectItem>
                <SelectItem value="pos_venda">Pós-Venda</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="board" className="dark:bg-slate-700 dark:text-white dark:hover:bg-slate-600">
              <Download className="h-4 w-4" />
              Exportar
            </Button>
          </div>
        </div>

        {/* KPI Grid */}
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          {statsLoading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="rounded-xl border border-border bg-board-surface p-6">
                <Skeleton className="h-6 w-32 mb-2" />
                <Skeleton className="h-10 w-20 mb-2" />
                <Skeleton className="h-4 w-24" />
              </div>
            ))
          ) : (
            <>
              <KPICard
                title="Taxa de Conclusão"
                value={stats ? `${stats.completionRate}%` : "—"}
                subtitle={stats ? `${stats.completedChecklists} de ${stats.completedChecklists + stats.pendingChecklists} checklists` : "Sem dados"}
                icon={<ClipboardCheck className="h-6 w-6" />}
                variant={stats && stats.completionRate >= 90 ? "success" : stats && stats.completionRate >= 70 ? "warning" : "default"}
              />
              <KPICard
                title="Alertas Pendentes"
                value={stats ? stats.pendingChecklists.toString() : "—"}
                subtitle="Checklists pendentes"
                icon={<AlertTriangle className="h-6 w-6" />}
                variant={stats && stats.pendingChecklists > 5 ? "warning" : "default"}
              />
              <KPICard
                title="Tempo Médio"
                value={stats ? formatTime(stats.avgCompletionTime) : "—"}
                subtitle="Por checklist"
                icon={<Clock className="h-6 w-6" />}
              />
              <KPICard
                title="OP Ativas"
                value={stats ? stats.activeOS.toString() : "—"}
                subtitle={stats ? `${stats.completedOS} concluídas de ${stats.totalOS}` : "Sem dados"}
                icon={<TrendingUp className="h-6 w-6" />}
                variant={stats && stats.weeklyEfficiency >= 95 ? "success" : "default"}
              />
            </>
          )}
        </div>

        {/* Charts */}
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          <TrendChart
            title="Checklists — Últimos 7 dias"
            description="Evolução de conclusão de checklists"
            data={checklistTrend}
            isLoading={trendLoading}
            variant="checklist"
          />
          <TrendChart
            title="Ordens de Produção — Últimos 7 dias"
            description="Evolução de criação e conclusão de OP"
            data={osTrend}
            isLoading={osTrendLoading}
            variant="os"
          />
          <DepartmentChart data={deptDistribution} isLoading={deptLoading} />
        </div>

        {/* Recent checklists table */}
        <div className="rounded-xl border border-border bg-board-surface overflow-hidden">
          <div className="flex items-center justify-between border-b border-border px-6 py-4">
            <div>
              <h2 className="text-lg font-semibold text-board-text">Checklists Recentes</h2>
              <p className="text-sm text-board-muted">Últimas atividades registradas</p>
            </div>
            <Button variant="board-ghost" size="sm">
              <Filter className="h-4 w-4" />
              Filtrar
            </Button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-secondary/30">
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-board-muted">Departamento</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-board-muted">OS</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-board-muted">Operador</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-board-muted">Horário</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-board-muted">Status</th>
                  <th className="px-6 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {checklistsLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i}>
                      {Array.from({ length: 6 }).map((_, j) => (
                        <td key={j} className="px-6 py-4"><Skeleton className="h-5 w-24" /></td>
                      ))}
                    </tr>
                  ))
                ) : recentChecklists && recentChecklists.length > 0 ? (
                  recentChecklists.map((item) => (
                    <tr key={item.id} className="hover:bg-secondary/20 transition-colors">
                      <td className="px-6 py-4 text-sm font-medium text-board-text">
                        {DEPARTMENT_LABELS[item.department] || item.department}
                      </td>
                      <td className="px-6 py-4 text-sm text-board-muted">
                        <div>
                          <span className="font-medium text-board-text">{item.os_number}</span>
                          <p className="text-xs text-board-muted truncate max-w-[200px]">{item.os_title}</p>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-board-muted">{item.completed_by_name || "—"}</td>
                      <td className="px-6 py-4 text-sm text-board-muted">
                        {item.completed_at
                          ? format(new Date(item.completed_at), "HH:mm", { locale: ptBR })
                          : "—"}
                      </td>
                      <td className="px-6 py-4">
                        <StatusBadge status={getChecklistStatus(item)} />
                      </td>
                      <td className="px-6 py-4">
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center">
                      <div className="flex flex-col items-center text-board-muted">
                        <ClipboardCheck className="h-12 w-12 mb-4 opacity-50" />
                        <p className="font-medium">Nenhum checklist registrado</p>
                        <p className="text-sm">Os checklists aparecerão aqui quando forem criados</p>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between border-t border-border px-6 py-4">
            <p className="text-sm text-board-muted">
              {recentChecklists ? `Mostrando ${recentChecklists.length} checklists recentes` : "Carregando..."}
            </p>
            <Button variant="board-ghost" size="sm">Ver todos</Button>
          </div>
        </div>

        {/* AI Assistant Card */}
        <div className="rounded-xl border border-board-blue/20 bg-gradient-to-r from-board-blue/5 to-transparent p-6">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-board-blue/10 text-board-blue">
              <span className="text-2xl">🤖</span>
            </div>
            <div>
              <h3 className="font-semibold text-board-text">Assistente de Anomalias</h3>
              <p className="mt-1 text-sm text-board-muted">
                {stats && stats.pendingChecklists > 0
                  ? `Existem ${stats.pendingChecklists} checklists pendentes que precisam de atenção.`
                  : "Tudo em ordem! Nenhuma anomalia detectada no momento."}
              </p>
              <div className="mt-3 flex gap-2">
                <Button variant="board-outline" size="sm">Ver detalhes</Button>
                <Button variant="board-ghost" size="sm">Dispensar</Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </BoardLayout>
  );
}

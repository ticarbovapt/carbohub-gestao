import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { BoardLayout } from "@/components/layouts/BoardLayout";
import { OSKanbanBoard } from "@/components/os/OSKanbanBoard";
import { CreateOSDialog } from "@/components/os/CreateOSDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Search,
  Plus,
  RefreshCw,
  LayoutGrid,
  List,
  ClipboardList,
  Calendar,
  Zap,
  CheckCircle2,
  Loader2,
} from "lucide-react";
import { useServiceOrders, useOSStats, useAdvanceOSStage, useMarkOSCancelled } from "@/hooks/useServiceOrders";
import type { ServiceOrderCarboVAPT } from "@/types/os";
import { OS_STAGES } from "@/types/os";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

export default function OSBoard() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<"kanban" | "list">("kanban");
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  // Check for action=new in URL
  useEffect(() => {
    if (searchParams.get("action") === "new") {
      setIsCreateOpen(true);
      searchParams.delete("action");
      setSearchParams(searchParams, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const { data: orders = [], isLoading, refetch } = useServiceOrders();
  const { data: stats } = useOSStats();
  const advanceMutation = useAdvanceOSStage();
  const cancelMutation = useMarkOSCancelled();

  // Filter by search
  const filtered = orders.filter((o) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      o.os_number?.toLowerCase().includes(q) ||
      o.title?.toLowerCase().includes(q) ||
      o.customer?.name?.toLowerCase().includes(q) ||
      o.customer_name?.toLowerCase().includes(q) ||
      o.vehicle_plate?.toLowerCase().includes(q)
    );
  });

  const handleCardClick = (order: ServiceOrderCarboVAPT) => {
    navigate(`/os/${order.id}`);
  };

  const handleAdvance = (order: ServiceOrderCarboVAPT) => {
    advanceMutation.mutate(order);
  };

  const handleCancel = (order: ServiceOrderCarboVAPT) => {
    if (confirm(`Cancelar a OS ${order.os_number || ""}?`)) {
      cancelMutation.mutate({ id: order.id });
    }
  };

  const stageConfig = (id: string) => OS_STAGES.find((s) => s.id === id);

  return (
    <BoardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-3">
              <ClipboardList className="h-6 w-6 text-purple-500" />
              Ordens de Serviço
            </h1>
            <p className="text-muted-foreground mt-1">
              Descarbonização CarboVAPT — B2C · B2B · Frota
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              className="gap-1"
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </Button>
            <Button
              size="sm"
              onClick={() => setIsCreateOpen(true)}
              className="gap-2 bg-purple-600 hover:bg-purple-700 text-white"
            >
              <Plus className="h-4 w-4" />
              Nova OS
            </Button>
          </div>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="rounded-xl border bg-card p-4 space-y-1">
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <ClipboardList className="h-4 w-4" />
              <span>OS Ativas</span>
            </div>
            <p className="text-2xl font-bold">{stats?.total ?? "—"}</p>
          </div>
          <div className="rounded-xl border bg-card p-4 space-y-1">
            <div className="flex items-center gap-2 text-amber-500 text-sm">
              <Calendar className="h-4 w-4" />
              <span>Agendadas Hoje</span>
            </div>
            <p className="text-2xl font-bold text-amber-600">{stats?.agendadasHoje ?? "—"}</p>
          </div>
          <div className="rounded-xl border bg-card p-4 space-y-1">
            <div className="flex items-center gap-2 text-purple-500 text-sm">
              <Zap className="h-4 w-4" />
              <span>Em Execução</span>
            </div>
            <p className="text-2xl font-bold text-purple-600">{stats?.emExecucao ?? "—"}</p>
          </div>
          <div className="rounded-xl border bg-card p-4 space-y-1">
            <div className="flex items-center gap-2 text-green-500 text-sm">
              <CheckCircle2 className="h-4 w-4" />
              <span>Concluídas (mês)</span>
            </div>
            <p className="text-2xl font-bold text-green-600">{stats?.concluidasMes ?? "—"}</p>
          </div>
        </div>

        {/* Search + View Toggle */}
        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por OS, cliente, placa..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          <div className="flex rounded-lg border overflow-hidden">
            <button
              onClick={() => setViewMode("kanban")}
              className={`px-3 py-2 text-xs flex items-center gap-1.5 transition-colors ${
                viewMode === "kanban"
                  ? "bg-primary text-primary-foreground"
                  : "hover:bg-muted text-muted-foreground"
              }`}
            >
              <LayoutGrid className="h-3.5 w-3.5" />
              Kanban
            </button>
            <button
              onClick={() => setViewMode("list")}
              className={`px-3 py-2 text-xs flex items-center gap-1.5 border-l transition-colors ${
                viewMode === "list"
                  ? "bg-primary text-primary-foreground"
                  : "hover:bg-muted text-muted-foreground"
              }`}
            >
              <List className="h-3.5 w-3.5" />
              Lista
            </button>
          </div>
        </div>

        {/* Content */}
        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : viewMode === "kanban" ? (
          <OSKanbanBoard
            orders={filtered}
            onAdvance={handleAdvance}
            onCancel={handleCancel}
            onCardClick={handleCardClick}
          />
        ) : (
          /* List View */
          <div className="rounded-xl border bg-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium">OS #</th>
                    <th className="px-4 py-3 text-left font-medium">Cliente</th>
                    <th className="px-4 py-3 text-left font-medium">Tipo</th>
                    <th className="px-4 py-3 text-left font-medium">Veículo</th>
                    <th className="px-4 py-3 text-left font-medium">Agendamento</th>
                    <th className="px-4 py-3 text-left font-medium">Etapa</th>
                    <th className="px-4 py-3 w-24" />
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">
                        <ClipboardList className="h-10 w-10 mx-auto mb-3 opacity-30" />
                        <p className="font-medium">Nenhuma OS encontrada</p>
                        <p className="text-xs mt-1">Crie a primeira Ordem de Serviço CarboVAPT.</p>
                      </td>
                    </tr>
                  ) : (
                    filtered.map((order) => {
                      const stage = stageConfig(order.os_stage);
                      return (
                        <tr
                          key={order.id}
                          className="border-t hover:bg-muted/30 cursor-pointer"
                          onClick={() => handleCardClick(order)}
                        >
                          <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                            {order.os_number || "—"}
                          </td>
                          <td className="px-4 py-3 font-medium">
                            {order.customer?.name || order.customer_name || "—"}
                          </td>
                          <td className="px-4 py-3">
                            {order.service_type ? (
                              <Badge variant="outline" className="text-xs uppercase">
                                {order.service_type}
                              </Badge>
                            ) : "—"}
                          </td>
                          <td className="px-4 py-3 text-muted-foreground text-xs">
                            {[order.vehicle_plate, order.vehicle_model]
                              .filter(Boolean)
                              .join(" · ") || "—"}
                          </td>
                          <td className="px-4 py-3 text-muted-foreground text-xs">
                            {order.scheduled_at
                              ? format(new Date(order.scheduled_at), "dd/MM/yy HH:mm", { locale: ptBR })
                              : "—"}
                          </td>
                          <td className="px-4 py-3">
                            {stage ? (
                              <span className="flex items-center gap-1 text-xs">
                                {stage.emoji} {stage.label}
                              </span>
                            ) : order.os_stage}
                          </td>
                          <td
                            className="px-4 py-3"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs"
                              onClick={() => handleAdvance(order)}
                              disabled={
                                order.os_stage === "concluida" ||
                                order.os_stage === "cancelada" ||
                                advanceMutation.isPending
                              }
                            >
                              Avançar
                            </Button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Create OS Dialog */}
      <CreateOSDialog
        defaultOpen={isCreateOpen}
        onOpenChange={setIsCreateOpen}
        onSuccess={() => refetch()}
      />
    </BoardLayout>
  );
}

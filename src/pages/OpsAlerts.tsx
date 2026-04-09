import { useState } from "react";
import { BoardLayout } from "@/components/layouts/BoardLayout";
import {
  useOpsAlerts,
  useUpdateAlertStatus,
  PRIORIDADE_CONFIG,
  STATUS_CONFIG,
  type AlertFilters,
  type AlertStatus,
  type AlertPrioridade,
  type OpsAlert,
} from "@/hooks/useOpsAlerts";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { CarboCard } from "@/components/ui/carbo-card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Bell, AlertTriangle, CheckCircle2, Clock, XCircle,
  ChevronDown, Filter, Building2, Wrench, FlaskConical,
  MoreVertical, RefreshCw,
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";

// ── Priority badge ─────────────────────────────────────────────────────────────
function PrioridadeBadge({ p }: { p: OpsAlert["prioridade"] }) {
  const cfg = PRIORIDADE_CONFIG[p];
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold"
      style={{ backgroundColor: cfg.color + "20", color: cfg.color }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: cfg.color }} />
      {cfg.label}
    </span>
  );
}

// ── Tipo icon ─────────────────────────────────────────────────────────────────
function TipoIcon({ tipo }: { tipo: string }) {
  if (tipo.includes("reagent") || tipo.includes("estoque")) {
    return <FlaskConical className="h-4 w-4 text-area-licensee" />;
  }
  if (tipo.includes("machine") || tipo.includes("maquina")) {
    return <Wrench className="h-4 w-4 text-amber-500" />;
  }
  return <Building2 className="h-4 w-4 text-blue-500" />;
}

// ── Status icon ───────────────────────────────────────────────────────────────
function getStatusIcon(status: AlertStatus) {
  switch (status) {
    case "open":        return <AlertTriangle className="h-4 w-4 text-destructive" />;
    case "in_progress": return <Clock         className="h-4 w-4 text-amber-500" />;
    case "resolved":    return <CheckCircle2  className="h-4 w-4 text-green-500" />;
    case "dismissed":   return <XCircle       className="h-4 w-4 text-muted-foreground" />;
  }
}

// ── Alert row ─────────────────────────────────────────────────────────────────
function AlertRow({ alert }: { alert: OpsAlert }) {
  const update = useUpdateAlertStatus();
  const cfg = PRIORIDADE_CONFIG[alert.prioridade];

  return (
    <div
      className={cn(
        "flex gap-3 rounded-xl border border-border bg-card px-4 py-3 transition-all",
        alert.prioridade === "critical" && "border-red-300 dark:border-red-800",
        alert.status === "resolved" && "opacity-50",
      )}
    >
      {/* Priority strip */}
      <div
        className="w-1 rounded-full flex-shrink-0"
        style={{ backgroundColor: cfg.color }}
      />

      {/* Icon */}
      <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-muted">
        <TipoIcon tipo={alert.tipo} />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="font-semibold text-sm text-foreground truncate">{alert.titulo}</p>
          <PrioridadeBadge p={alert.prioridade} />
          {alert.status !== "resolved" && alert.status !== "dismissed" && (
            <span className="text-[10px] text-muted-foreground">
              {getStatusIcon(alert.status)}
            </span>
          )}
        </div>

        {alert.descricao && (
          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{alert.descricao}</p>
        )}

        <div className="flex items-center gap-3 mt-1 flex-wrap">
          {alert.licensees?.name && (
            <span className="text-[11px] text-muted-foreground flex items-center gap-1">
              <Building2 className="h-3 w-3" />
              {alert.licensees.name}
            </span>
          )}
          <span className="text-[11px] text-muted-foreground">
            {format(new Date(alert.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
          </span>
          <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-auto">
            {alert.tipo}
          </Badge>
        </div>
      </div>

      {/* Actions */}
      <div className="flex-shrink-0 self-start">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-7 w-7">
              <MoreVertical className="h-3.5 w-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {alert.status === "open" && (
              <DropdownMenuItem onClick={() => update.mutate({ id: alert.id, status: "in_progress" })}>
                <Clock className="h-4 w-4 mr-2 text-amber-500" />
                Marcar Em Andamento
              </DropdownMenuItem>
            )}
            {alert.status !== "resolved" && (
              <DropdownMenuItem onClick={() => update.mutate({ id: alert.id, status: "resolved" })}>
                <CheckCircle2 className="h-4 w-4 mr-2 text-green-500" />
                Marcar Resolvido
              </DropdownMenuItem>
            )}
            {alert.status !== "dismissed" && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-muted-foreground"
                  onClick={() => update.mutate({ id: alert.id, status: "dismissed" })}
                >
                  <XCircle className="h-4 w-4 mr-2" />
                  Ignorar
                </DropdownMenuItem>
              </>
            )}
            {(alert.status === "resolved" || alert.status === "dismissed") && (
              <DropdownMenuItem onClick={() => update.mutate({ id: alert.id, status: "open" })}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Reabrir
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function OpsAlerts() {
  const [filters, setFilters] = useState<AlertFilters>({
    status: "open",
    prioridade: "all",
  });

  const { data: alerts = [], isLoading, refetch } = useOpsAlerts(filters);

  // KPI counts (use unfiltered for totals)
  const { data: allAlerts = [] } = useOpsAlerts({});
  const openCount     = allAlerts.filter(a => a.status === "open").length;
  const inProgCount   = allAlerts.filter(a => a.status === "in_progress").length;
  const criticalCount = allAlerts.filter(a => a.prioridade === "critical" && a.status !== "resolved" && a.status !== "dismissed").length;
  const resolvedToday = allAlerts.filter(a => {
    return a.status === "resolved" && a.resolved_at &&
      new Date(a.resolved_at).toDateString() === new Date().toDateString();
  }).length;

  return (
    <BoardLayout>
      <div className="space-y-6">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <Bell className="h-6 w-6" />
              Central de Alertas
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">Monitoramento da rede CarboOPS</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-2">
            <RefreshCw className="h-4 w-4" />
            Atualizar
          </Button>
        </div>

        {/* KPI cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { label: "Abertos",     value: openCount,     icon: AlertTriangle, color: "text-destructive",    bg: "bg-red-50 dark:bg-red-950/30" },
            { label: "Em Andamento",value: inProgCount,   icon: Clock,         color: "text-amber-500",      bg: "bg-amber-50 dark:bg-amber-950/30" },
            { label: "Críticos",    value: criticalCount, icon: AlertTriangle, color: "text-red-500 font-bold", bg: "bg-red-50 dark:bg-red-950/30" },
            { label: "Resolvidos Hoje", value: resolvedToday, icon: CheckCircle2, color: "text-green-600", bg: "bg-green-50 dark:bg-green-950/30" },
          ].map((k, i) => (
            <CarboCard key={i} className="p-4">
              <div className="flex items-center gap-3">
                <div className={cn("flex h-9 w-9 items-center justify-center rounded-lg", k.bg)}>
                  <k.icon className={cn("h-5 w-5", k.color)} />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{k.label}</p>
                  <p className={cn("text-xl font-bold", k.color)}>{k.value}</p>
                </div>
              </div>
            </CarboCard>
          ))}
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3 flex-wrap">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <Select
            value={filters.status ?? "all"}
            onValueChange={v => setFilters(f => ({ ...f, status: v as AlertStatus | "all" }))}
          >
            <SelectTrigger className="w-44 h-8 text-sm">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os status</SelectItem>
              <SelectItem value="open">Abertos</SelectItem>
              <SelectItem value="in_progress">Em Andamento</SelectItem>
              <SelectItem value="resolved">Resolvidos</SelectItem>
              <SelectItem value="dismissed">Ignorados</SelectItem>
            </SelectContent>
          </Select>

          <Select
            value={filters.prioridade ?? "all"}
            onValueChange={v => setFilters(f => ({ ...f, prioridade: v as AlertPrioridade | "all" }))}
          >
            <SelectTrigger className="w-36 h-8 text-sm">
              <SelectValue placeholder="Prioridade" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as prioridades</SelectItem>
              <SelectItem value="critical">Crítico</SelectItem>
              <SelectItem value="high">Alta</SelectItem>
              <SelectItem value="medium">Média</SelectItem>
              <SelectItem value="low">Baixa</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Alert list */}
        {isLoading ? (
          <div className="space-y-2">
            {[1,2,3,4].map(i => <Skeleton key={i} className="h-20 rounded-xl" />)}
          </div>
        ) : alerts.length === 0 ? (
          <CarboCard className="flex flex-col items-center justify-center py-14 gap-3">
            <CheckCircle2 className="h-10 w-10 text-green-500/30" />
            <p className="text-muted-foreground font-medium">
              {filters.status === "open"
                ? "Nenhum alerta aberto — tudo em ordem 🎉"
                : "Nenhum alerta encontrado"}
            </p>
          </CarboCard>
        ) : (
          <div className="space-y-2">
            {alerts.map(a => <AlertRow key={a.id} alert={a} />)}
          </div>
        )}

      </div>
    </BoardLayout>
  );
}

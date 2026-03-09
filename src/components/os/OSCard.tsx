import React from "react";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Clock, AlertTriangle, User, Calendar, CheckCircle2, Eye, Lock } from "lucide-react";
import { ServiceOrder, DEPARTMENT_INFO, OsStatus } from "@/types/os";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { SlaIndicator } from "./SlaIndicator";
import { formatTimeRemaining, FlowValidationResult } from "@/hooks/useOsFlowValidation";

interface OSCardProps {
  order: ServiceOrder & {
    stage_sla_deadline?: string | null;
    checklist_completed?: boolean;
    stage_validated_at?: string | null;
  };
  onClick?: () => void;
  isDragging?: boolean;
  className?: string;
}

const STATUS_CONFIG: Record<OsStatus, { label: string; variant: "default" | "secondary" | "destructive" | "outline"; color: string }> = {
  draft: { label: "Rascunho", variant: "secondary", color: "bg-muted" },
  active: { label: "Em Andamento", variant: "default", color: "bg-carbo-blue" },
  paused: { label: "Pausada", variant: "outline", color: "bg-warning" },
  completed: { label: "Concluída", variant: "default", color: "bg-success" },
  cancelled: { label: "Cancelada", variant: "destructive", color: "bg-destructive" },
};

const PRIORITY_CONFIG: Record<number, { label: string; color: string }> = {
  1: { label: "Baixa", color: "bg-slate-400" },
  2: { label: "Normal", color: "bg-carbo-blue" },
  3: { label: "Média", color: "bg-warning" },
  4: { label: "Alta", color: "bg-destructive/70" },
  5: { label: "Urgente", color: "bg-destructive" },
};

// Calculate SLA status from deadline
function calculateSlaStatus(deadline: string | null): FlowValidationResult["sla_status"] {
  if (!deadline) return "ok";
  
  const now = new Date();
  const slaDate = new Date(deadline);
  const diffMs = slaDate.getTime() - now.getTime();
  const hoursRemaining = diffMs / (1000 * 60 * 60);
  
  if (hoursRemaining < 0) return "breached";
  if (hoursRemaining < 2) return "critical";
  if (hoursRemaining < 6) return "warning";
  return "ok";
}

export function OSCard({ order, onClick, isDragging, className }: OSCardProps) {
  const deptInfo = DEPARTMENT_INFO[order.current_department];
  const statusConfig = STATUS_CONFIG[order.status];
  const priorityConfig = PRIORITY_CONFIG[order.priority] || PRIORITY_CONFIG[2];

  // Calculate SLA from stage_sla_deadline or due_date
  const slaDeadline = order.stage_sla_deadline || order.due_date;
  const slaStatus = calculateSlaStatus(slaDeadline);
  
  const isOverdue = slaStatus === "breached" && order.status !== "completed";
  const isCritical = slaStatus === "critical";
  const isCompleted = order.status === "completed";
  
  // Check if stage is blocked (no checklist completed)
  const isBlocked = !order.checklist_completed && order.status === "active";

  return (
    <Card
      onClick={onClick}
      className={cn(
        "cursor-pointer group transition-all duration-200 hover:shadow-carbo hover:translate-y-[-2px] border-2 border-transparent",
        isDragging && "opacity-50 rotate-2 shadow-lg",
        isOverdue && "border-destructive/50 bg-destructive/5",
        isCritical && !isOverdue && "border-warning/50 bg-warning/5",
        isCompleted && "border-success/30 bg-success/5",
        !isOverdue && !isCompleted && !isCritical && "hover:border-carbo-green/30",
        className
      )}
    >
      <CardContent className="p-4">
        {/* Header with OS number and priority */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <span className="text-lg">{deptInfo.icon}</span>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-mono font-medium text-muted-foreground">{order.os_number}</p>
              <h3 className="font-semibold text-foreground line-clamp-1 group-hover:text-carbo-green transition-colors">
                {order.title}
              </h3>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {isBlocked && (
              <Lock className="h-3.5 w-3.5 text-muted-foreground" aria-label="Checklist pendente" />
            )}
            <div className={cn("w-2.5 h-2.5 rounded-full", priorityConfig.color)} />
          </div>
        </div>

        {/* Customer */}
        {order.customer && (
          <div className="flex items-center gap-2 mb-3 text-sm text-muted-foreground">
            <User className="h-3.5 w-3.5" />
            <span className="line-clamp-1">{order.customer.name}</span>
          </div>
        )}

        {/* Status and Department Badges */}
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <Badge 
            variant={statusConfig.variant} 
            className={cn(
              "text-xs",
              order.status === "active" && "bg-gradient-to-r from-carbo-green to-carbo-blue text-white",
              order.status === "completed" && "bg-success text-success-foreground"
            )}
          >
            {order.status === "completed" && <CheckCircle2 className="h-3 w-3 mr-1" />}
            {statusConfig.label}
          </Badge>
          <Badge variant="outline" className="text-xs">
            {deptInfo.name}
          </Badge>
        </div>

        {/* Footer with SLA and assignee */}
        <div className="flex items-center justify-between text-xs text-muted-foreground pt-2 border-t border-border/50">
          {/* SLA Indicator */}
          {slaDeadline && order.status !== "completed" ? (
            <SlaIndicator
              deadline={slaDeadline}
              status={slaStatus}
              size="sm"
              showLabel={true}
            />
          ) : order.due_date ? (
            <div className={cn(
              "flex items-center gap-1.5 px-2 py-1 rounded-md",
              isOverdue && "bg-destructive/10 text-destructive font-medium"
            )}>
              {isOverdue && <AlertTriangle className="h-3 w-3" />}
              <Calendar className="h-3 w-3" />
              <span>
                {formatDistanceToNow(new Date(order.due_date), {
                  locale: ptBR,
                  addSuffix: true,
                })}
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5">
              <Clock className="h-3 w-3" />
              <span>
                {formatDistanceToNow(new Date(order.created_at), {
                  locale: ptBR,
                  addSuffix: true,
                })}
              </span>
            </div>
          )}

          {/* Actions and Assignee */}
          <div className="flex items-center gap-2">
            {/* Quick action on hover */}
            <div className="opacity-0 group-hover:opacity-100 transition-opacity">
              <div className="flex items-center gap-1 text-carbo-green text-xs font-medium">
                <Eye className="h-3 w-3" />
                <span>Ver</span>
              </div>
            </div>

            {/* Assigned user avatar */}
            {order.assigned_to && (
              <Avatar className="h-6 w-6">
                <AvatarFallback className="text-[10px] carbo-gradient text-white">
                  AS
                </AvatarFallback>
              </Avatar>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

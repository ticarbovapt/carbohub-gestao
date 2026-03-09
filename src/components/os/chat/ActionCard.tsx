import React from "react";
import { OsAction } from "@/hooks/useOsActions";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { 
  Calendar, 
  CheckCircle2, 
  Clock, 
  User, 
  XCircle,
  AlertTriangle
} from "lucide-react";
import { format, isPast, isToday } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { Database } from "@/integrations/supabase/types";

type ActionPriority = Database["public"]["Enums"]["action_priority"];

interface ActionCardProps {
  action: OsAction;
  onComplete: () => void;
  onCancel: () => void;
  compact?: boolean;
}

const PRIORITY_CONFIG: Record<ActionPriority, { label: string; className: string }> = {
  high: {
    label: "Alta",
    className: "bg-destructive/10 text-destructive border-destructive/30",
  },
  medium: {
    label: "Média",
    className: "bg-warning/10 text-warning border-warning/30",
  },
  low: {
    label: "Baixa",
    className: "bg-muted text-muted-foreground border-muted",
  },
};

export function ActionCard({ action, onComplete, onCancel, compact = false }: ActionCardProps) {
  const priorityConfig = PRIORITY_CONFIG[action.priority];
  const isOverdue = action.due_date && isPast(new Date(action.due_date)) && action.status === "pending";
  const isDueToday = action.due_date && isToday(new Date(action.due_date));

  if (compact) {
    return (
      <div
        className={cn(
          "flex items-center gap-2 p-2 rounded-lg border transition-colors",
          action.status === "completed" && "opacity-60",
          action.status === "pending" && priorityConfig.className
        )}
      >
        {action.status === "completed" ? (
          <CheckCircle2 className="h-4 w-4 text-success flex-shrink-0" />
        ) : action.status === "cancelled" ? (
          <XCircle className="h-4 w-4 text-muted-foreground flex-shrink-0" />
        ) : (
          <Clock className="h-4 w-4 flex-shrink-0" />
        )}

        <span className={cn(
          "text-sm flex-1 truncate",
          action.status === "completed" && "line-through"
        )}>
          {action.description}
        </span>

        {action.status === "pending" && (
          <Button size="icon" variant="ghost" className="h-6 w-6" onClick={onComplete}>
            <CheckCircle2 className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "p-4 rounded-lg border transition-all",
        action.status === "completed" && "bg-success/5 border-success/30",
        action.status === "cancelled" && "bg-muted opacity-60",
        action.status === "pending" && priorityConfig.className,
        isOverdue && "border-destructive"
      )}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className={cn("text-xs", priorityConfig.className)}>
            {priorityConfig.label}
          </Badge>
          {isOverdue && (
            <Badge variant="destructive" className="text-xs gap-1">
              <AlertTriangle className="h-3 w-3" />
              Atrasada
            </Badge>
          )}
          {isDueToday && !isOverdue && (
            <Badge variant="secondary" className="text-xs">Hoje</Badge>
          )}
        </div>

        <div className="flex items-center gap-1">
          {action.status === "completed" && (
            <Badge variant="outline" className="bg-success/10 text-success text-xs gap-1">
              <CheckCircle2 className="h-3 w-3" />
              Concluída
            </Badge>
          )}
          {action.status === "cancelled" && (
            <Badge variant="outline" className="text-muted-foreground text-xs gap-1">
              <XCircle className="h-3 w-3" />
              Cancelada
            </Badge>
          )}
        </div>
      </div>

      {/* Description */}
      <p className={cn(
        "text-sm mb-3",
        action.status === "completed" && "line-through text-muted-foreground"
      )}>
        {action.description}
      </p>

      {/* Meta info */}
      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground mb-3">
        <div className="flex items-center gap-1">
          <User className="h-3 w-3" />
          <Avatar className="h-4 w-4">
            <AvatarImage src={action.assignee?.avatar_url || undefined} />
            <AvatarFallback className="text-[8px]">
              {action.assignee?.full_name?.charAt(0) || "U"}
            </AvatarFallback>
          </Avatar>
          <span>{action.assignee?.full_name || "Não atribuído"}</span>
        </div>

        {action.due_date && (
          <div className={cn(
            "flex items-center gap-1",
            isOverdue && "text-destructive"
          )}>
            <Calendar className="h-3 w-3" />
            <span>{format(new Date(action.due_date), "dd/MM/yyyy", { locale: ptBR })}</span>
          </div>
        )}
      </div>

      {/* Actions */}
      {action.status === "pending" && (
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="default"
            className="flex-1 gap-1.5"
            onClick={onComplete}
          >
            <CheckCircle2 className="h-4 w-4" />
            Concluir
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="gap-1.5"
            onClick={onCancel}
          >
            <XCircle className="h-4 w-4" />
            Cancelar
          </Button>
        </div>
      )}
    </div>
  );
}

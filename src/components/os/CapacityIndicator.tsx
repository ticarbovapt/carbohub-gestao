import React from "react";
import { cn } from "@/lib/utils";
import { Users, AlertCircle, CheckCircle2 } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { CapacityCheck } from "@/hooks/useOsFlowValidation";

interface CapacityIndicatorProps {
  capacity: CapacityCheck;
  departmentName: string;
  date?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}

export function CapacityIndicator({
  capacity,
  departmentName,
  date,
  size = "md",
  className,
}: CapacityIndicatorProps) {
  const usagePercent = Math.min(
    100,
    Math.round((capacity.scheduled_orders / capacity.max_orders) * 100)
  );

  const getStatusColor = () => {
    if (!capacity.has_capacity) return "text-destructive";
    if (usagePercent >= 80) return "text-warning";
    return "text-success";
  };

  const getProgressColor = () => {
    if (!capacity.has_capacity) return "bg-destructive";
    if (usagePercent >= 80) return "bg-warning";
    return "bg-success";
  };

  const sizeClasses = {
    sm: "text-xs",
    md: "text-sm",
    lg: "text-base",
  };

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className={cn(
              "flex items-center gap-2 p-2 rounded-lg border",
              !capacity.has_capacity
                ? "bg-destructive/5 border-destructive/30"
                : usagePercent >= 80
                ? "bg-warning/5 border-warning/30"
                : "bg-success/5 border-success/30",
              sizeClasses[size],
              className
            )}
          >
            <div className={cn("flex-shrink-0", getStatusColor())}>
              {!capacity.has_capacity ? (
                <AlertCircle className="h-4 w-4" />
              ) : (
                <Users className="h-4 w-4" />
              )}
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-1">
                <span className={cn("font-medium truncate", getStatusColor())}>
                  {departmentName}
                </span>
                <span className={cn("font-mono", getStatusColor())}>
                  {capacity.available_slots}/{capacity.max_orders}
                </span>
              </div>
              <div className="relative h-1.5 w-full bg-muted rounded-full overflow-hidden">
                <div 
                  className={cn("h-full rounded-full transition-all", getProgressColor())}
                  style={{ width: `${usagePercent}%` }}
                />
              </div>
            </div>
          </div>
        </TooltipTrigger>
        <TooltipContent>
          <div className="space-y-1">
            <p className="font-medium">
              {capacity.has_capacity ? "Capacidade disponível" : "Sem capacidade!"}
            </p>
            <p className="text-xs text-muted-foreground">
              {capacity.scheduled_orders} de {capacity.max_orders} slots ocupados
            </p>
            {date && (
              <p className="text-xs text-muted-foreground">
                Data: {new Date(date).toLocaleDateString("pt-BR")}
              </p>
            )}
            {!capacity.has_capacity && (
              <p className="text-xs text-destructive font-medium mt-1">
                ⚠️ Não é possível criar novas OP nesta data
              </p>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

// Compact version for cards
export function CapacityBadge({ capacity }: { capacity: CapacityCheck }) {
  if (capacity.has_capacity && capacity.available_slots > 3) {
    return null; // Don't show if plenty of capacity
  }

  return (
    <div
      className={cn(
        "inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full",
        !capacity.has_capacity
          ? "bg-destructive/10 text-destructive"
          : "bg-warning/10 text-warning"
      )}
    >
      {!capacity.has_capacity ? (
        <>
          <AlertCircle className="h-3 w-3" />
          <span>Sem vagas</span>
        </>
      ) : (
        <>
          <Users className="h-3 w-3" />
          <span>{capacity.available_slots} vagas</span>
        </>
      )}
    </div>
  );
}

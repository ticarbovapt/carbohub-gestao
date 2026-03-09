import React from "react";
import { cn } from "@/lib/utils";
import { Clock, AlertTriangle, XCircle, CheckCircle2 } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  getSlaStatusColor,
  getSlaStatusBg,
  formatTimeRemaining,
  FlowValidationResult,
} from "@/hooks/useOsFlowValidation";

interface SlaIndicatorProps {
  deadline: string | null;
  status: FlowValidationResult["sla_status"];
  size?: "sm" | "md" | "lg";
  showLabel?: boolean;
  className?: string;
}

export function SlaIndicator({
  deadline,
  status,
  size = "md",
  showLabel = true,
  className,
}: SlaIndicatorProps) {
  const timeRemaining = formatTimeRemaining(deadline);

  const sizeClasses = {
    sm: "text-xs px-1.5 py-0.5",
    md: "text-xs px-2 py-1",
    lg: "text-sm px-3 py-1.5",
  };

  const iconSizes = {
    sm: "h-3 w-3",
    md: "h-3.5 w-3.5",
    lg: "h-4 w-4",
  };

  const StatusIcon = () => {
    switch (status) {
      case "ok":
        return <CheckCircle2 className={cn(iconSizes[size], "text-success")} />;
      case "warning":
        return <Clock className={cn(iconSizes[size], "text-warning")} />;
      case "critical":
        return <AlertTriangle className={cn(iconSizes[size], "text-destructive")} />;
      case "breached":
        return <XCircle className={cn(iconSizes[size], "text-destructive")} />;
      default:
        return <Clock className={cn(iconSizes[size], "text-muted-foreground")} />;
    }
  };

  const statusLabels: Record<FlowValidationResult["sla_status"], string> = {
    ok: "Dentro do SLA",
    warning: "SLA em alerta",
    critical: "SLA crítico",
    breached: "SLA estourado!",
  };

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md border font-medium",
              sizeClasses[size],
              getSlaStatusBg(status),
              getSlaStatusColor(status),
              className
            )}
          >
            <StatusIcon />
            {showLabel && <span>{timeRemaining}</span>}
          </div>
        </TooltipTrigger>
        <TooltipContent>
          <p className="font-medium">{statusLabels[status]}</p>
          {deadline && (
            <p className="text-xs text-muted-foreground">
              Prazo: {new Date(deadline).toLocaleString("pt-BR")}
            </p>
          )}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

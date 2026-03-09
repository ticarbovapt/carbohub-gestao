import React from "react";
import { motion } from "framer-motion";
import { 
  ShoppingCart, 
  Settings, 
  Truck, 
  FileText, 
  Receipt, 
  DollarSign, 
  HeadphonesIcon,
  Check,
  Lock,
  Clock,
  SkipForward
} from "lucide-react";
import { cn } from "@/lib/utils";
import { 
  useStageConfigs, 
  useOsStageValidations,
  OsWorkflowStage,
  StageValidation
} from "@/hooks/useStageValidation";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

const STAGE_ICONS: Record<OsWorkflowStage, React.ReactNode> = {
  comercial: <ShoppingCart className="h-4 w-4" />,
  operacoes: <Settings className="h-4 w-4" />,
  logistica: <Truck className="h-4 w-4" />,
  administrativo: <FileText className="h-4 w-4" />,
  fiscal: <Receipt className="h-4 w-4" />,
  financeiro: <DollarSign className="h-4 w-4" />,
  pos_venda: <HeadphonesIcon className="h-4 w-4" />,
};

const STAGE_COLORS: Record<OsWorkflowStage, { bg: string; text: string; border: string }> = {
  comercial: { bg: "bg-blue-500/10", text: "text-blue-600 dark:text-blue-400", border: "border-blue-500" },
  operacoes: { bg: "bg-purple-500/10", text: "text-purple-600 dark:text-purple-400", border: "border-purple-500" },
  logistica: { bg: "bg-amber-500/10", text: "text-amber-600 dark:text-amber-400", border: "border-amber-500" },
  administrativo: { bg: "bg-slate-500/10", text: "text-slate-600 dark:text-slate-400", border: "border-slate-500" },
  fiscal: { bg: "bg-rose-500/10", text: "text-rose-600 dark:text-rose-400", border: "border-rose-500" },
  financeiro: { bg: "bg-emerald-500/10", text: "text-emerald-600 dark:text-emerald-400", border: "border-emerald-500" },
  pos_venda: { bg: "bg-teal-500/10", text: "text-teal-600 dark:text-teal-400", border: "border-teal-500" },
};

interface StageFlowTimelineProps {
  osId: string;
  currentStage?: OsWorkflowStage;
  onStageClick?: (stage: OsWorkflowStage) => void;
  compact?: boolean;
}

export function StageFlowTimeline({ 
  osId, 
  currentStage,
  onStageClick,
  compact = false 
}: StageFlowTimelineProps) {
  const { data: configs, isLoading: configsLoading } = useStageConfigs();
  const { data: validations, isLoading: validationsLoading } = useOsStageValidations(osId);

  if (configsLoading || validationsLoading) {
    return (
      <div className="flex items-center gap-2 overflow-x-auto py-2">
        {Array.from({ length: 7 }).map((_, i) => (
          <React.Fragment key={i}>
            <Skeleton className={cn("rounded-lg flex-shrink-0", compact ? "h-10 w-10" : "h-16 w-24")} />
            {i < 6 && <Skeleton className="h-1 w-4 flex-shrink-0" />}
          </React.Fragment>
        ))}
      </div>
    );
  }

  const getStageStatus = (stage: OsWorkflowStage): "completed" | "current" | "skipped" | "locked" => {
    const validation = validations?.find(v => v.stage === stage);
    
    if (validation?.is_complete) return "completed";
    if (validation?.skipped) return "skipped";
    if (stage === currentStage) return "current";
    
    // Check if stage is locked (previous stage not complete)
    const stageConfig = configs?.find(c => c.stage === stage);
    if (!stageConfig) return "locked";
    
    const prevConfig = configs?.find(c => c.display_order === stageConfig.display_order - 1);
    if (!prevConfig) return stage === "comercial" ? "current" : "locked";
    
    const prevValidation = validations?.find(v => v.stage === prevConfig.stage);
    if (!prevValidation?.is_complete && !prevValidation?.skipped) return "locked";
    
    return "current";
  };

  const getValidation = (stage: OsWorkflowStage): StageValidation | undefined => {
    return validations?.find(v => v.stage === stage);
  };

  return (
    <div className={cn(
      "flex items-center overflow-x-auto py-2",
      compact ? "gap-1" : "gap-2"
    )}>
      {configs?.map((config, index) => {
        const status = getStageStatus(config.stage);
        const validation = getValidation(config.stage);
        const colors = STAGE_COLORS[config.stage];

        return (
          <React.Fragment key={config.stage}>
            <Tooltip>
              <TooltipTrigger asChild>
                <motion.button
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: index * 0.05 }}
                  onClick={() => status !== "locked" && onStageClick?.(config.stage)}
                  disabled={status === "locked"}
                  className={cn(
                    "relative flex flex-col items-center rounded-xl border transition-all flex-shrink-0",
                    compact ? "p-2" : "p-3 min-w-[100px]",
                    status === "completed" && "bg-success/10 border-success/50",
                    status === "skipped" && "bg-muted/50 border-muted-foreground/30",
                    status === "current" && `${colors.bg} ${colors.border} border-2`,
                    status === "locked" && "bg-muted/30 border-border opacity-50 cursor-not-allowed",
                    status !== "locked" && "hover:shadow-md cursor-pointer"
                  )}
                >
                  {/* Icon */}
                  <div className={cn(
                    "flex items-center justify-center rounded-lg",
                    compact ? "h-6 w-6" : "h-8 w-8 mb-1",
                    status === "completed" && "bg-success/20 text-success",
                    status === "skipped" && "bg-muted text-muted-foreground",
                    status === "current" && `${colors.bg} ${colors.text}`,
                    status === "locked" && "bg-muted text-muted-foreground"
                  )}>
                    {status === "completed" ? (
                      <Check className="h-4 w-4" />
                    ) : status === "skipped" ? (
                      <SkipForward className="h-4 w-4" />
                    ) : status === "locked" ? (
                      <Lock className="h-3 w-3" />
                    ) : (
                      STAGE_ICONS[config.stage]
                    )}
                  </div>

                  {/* Label (only in non-compact mode) */}
                  {!compact && (
                    <>
                      <span className={cn(
                        "text-xs font-medium text-center",
                        status === "completed" && "text-success",
                        status === "skipped" && "text-muted-foreground",
                        status === "current" && colors.text,
                        status === "locked" && "text-muted-foreground"
                      )}>
                        {config.stage_label}
                      </span>

                      {/* Optional badge */}
                      {config.is_optional && status === "current" && (
                        <Badge variant="outline" className="text-[10px] mt-1 px-1 py-0">
                          Opcional
                        </Badge>
                      )}
                    </>
                  )}

                  {/* Current indicator */}
                  {status === "current" && (
                    <motion.div
                      className="absolute -bottom-1 left-1/2 transform -translate-x-1/2"
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                    >
                      <Clock className="h-3 w-3 text-warning animate-pulse" />
                    </motion.div>
                  )}
                </motion.button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-[200px]">
                <div className="space-y-1">
                  <p className="font-medium">{config.stage_label}</p>
                  <p className="text-xs text-muted-foreground">{config.description}</p>
                  {validation?.validated_at && (
                    <p className="text-xs text-success">
                      Validado em {format(new Date(validation.validated_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                    </p>
                  )}
                  {validation?.skipped && (
                    <p className="text-xs text-muted-foreground">
                      Ignorado: {validation.skip_reason}
                    </p>
                  )}
                  {status === "locked" && (
                    <p className="text-xs text-destructive">
                      Etapa anterior pendente
                    </p>
                  )}
                </div>
              </TooltipContent>
            </Tooltip>

            {/* Connector line */}
            {index < (configs?.length || 0) - 1 && (
              <div className={cn(
                "h-0.5 flex-shrink-0 transition-colors",
                compact ? "w-2" : "w-4",
                status === "completed" || status === "skipped" 
                  ? "bg-success/50" 
                  : "bg-border"
              )} />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

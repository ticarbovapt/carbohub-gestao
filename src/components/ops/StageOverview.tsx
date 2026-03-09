import { Button } from "@/components/ui/button";
import { Check, ChevronRight, FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ChecklistTemplate } from "@/data/checklistData";
import { getTotalItems } from "@/data/checklistData";

interface StageStatus {
  stageId: string;
  completed: boolean;
  itemsCompleted: number;
  totalItems: number;
  flaggedItems: number;
  completedAt?: string;
}

interface StageOverviewProps {
  template: ChecklistTemplate;
  status: StageStatus;
  isCurrent: boolean;
  isLocked: boolean;
  onStart: () => void;
  onContinue: () => void;
  onView: () => void;
}

export function StageOverview({
  template,
  status,
  isCurrent,
  isLocked,
  onStart,
  onContinue,
  onView,
}: StageOverviewProps) {
  const totalItems = getTotalItems(template);
  const progress = status.totalItems > 0 
    ? Math.round((status.itemsCompleted / status.totalItems) * 100) 
    : 0;
  const isStarted = status.itemsCompleted > 0;
  const isCompleted = status.completed;

  return (
    <div className={cn(
      "rounded-2xl border-2 p-5 transition-all duration-300",
      isCompleted && "bg-ops-green/5 border-ops-green/30",
      isCurrent && !isCompleted && "bg-ops-yellow/10 border-ops-yellow shadow-lg",
      !isCurrent && !isCompleted && "bg-gray-50 border-gray-200",
      isLocked && "opacity-60"
    )}>
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className={cn(
            "w-12 h-12 rounded-xl flex items-center justify-center text-2xl",
            isCompleted && "bg-ops-green/20",
            isCurrent && !isCompleted && "bg-ops-yellow/30",
            !isCurrent && !isCompleted && "bg-gray-200"
          )}>
            {isCompleted ? <Check className="w-6 h-6 text-ops-green" /> : template.icon}
          </div>
          <div>
            <h3 className={cn(
              "font-bold text-lg",
              isCompleted && "text-ops-green",
              isCurrent && !isCompleted && "text-ops-text",
              !isCurrent && !isCompleted && "text-gray-500"
            )}>
              {template.name}
            </h3>
            <p className="text-sm text-ops-muted">
              {totalItems} itens • {template.description}
            </p>
          </div>
        </div>
      </div>

      {/* Progress bar */}
      {(isStarted || isCompleted) && (
        <div className="mb-4">
          <div className="flex justify-between text-sm mb-1">
            <span className="text-ops-muted">
              {status.itemsCompleted} de {status.totalItems} itens
            </span>
            <span className={cn(
              "font-bold",
              isCompleted ? "text-ops-green" : "text-ops-yellow"
            )}>
              {progress}%
            </span>
          </div>
          <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
            <div 
              className={cn(
                "h-full transition-all duration-500",
                isCompleted ? "bg-ops-green" : "bg-ops-yellow"
              )}
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      {/* Stats for completed */}
      {isCompleted && (
        <div className="flex items-center gap-4 mb-4 text-sm">
          <div className="flex items-center gap-1 text-ops-green">
            <Check className="w-4 h-4" />
            <span>Concluído {status.completedAt}</span>
          </div>
          {status.flaggedItems > 0 && (
            <div className="flex items-center gap-1 text-amber-600">
              <span>⚠️ {status.flaggedItems} sinalizados</span>
            </div>
          )}
        </div>
      )}

      {/* Sections preview */}
      <div className="space-y-2 mb-4">
        {template.sections.slice(0, 3).map((section) => (
          <div 
            key={section.id}
            className="flex items-center gap-2 text-sm text-ops-muted"
          >
            <FileText className="w-4 h-4" />
            <span>{section.title}</span>
            <span className="text-xs bg-gray-100 px-2 py-0.5 rounded-full">
              {section.items.length} itens
            </span>
          </div>
        ))}
        {template.sections.length > 3 && (
          <p className="text-xs text-ops-muted pl-6">
            +{template.sections.length - 3} seções...
          </p>
        )}
      </div>

      {/* Action button */}
      {isCompleted ? (
        <Button
          variant="ops-outline"
          className="w-full"
          onClick={onView}
        >
          <FileText className="w-4 h-4 mr-2" />
          Ver Detalhes
        </Button>
      ) : isCurrent ? (
        <Button
          variant="ops"
          size="ops-full"
          onClick={isStarted ? onContinue : onStart}
        >
          {isStarted ? "Continuar" : "Iniciar Etapa"}
          <ChevronRight className="w-5 h-5 ml-2" />
        </Button>
      ) : (
        <Button
          variant="ops-outline"
          className="w-full"
          disabled={isLocked}
        >
          {isLocked ? "🔒 Aguardando etapa anterior" : "Disponível"}
        </Button>
      )}
    </div>
  );
}

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export interface PipelineStage {
  id: string;
  name: string;
  shortName: string;
  icon: string;
  status: "completed" | "current" | "pending";
}

interface SalesPipelineProps {
  stages: PipelineStage[];
  onStageClick?: (stageId: string) => void;
  onMarkComplete?: () => void;
  currentStageName?: string;
}

export function SalesPipeline({ stages, onStageClick, onMarkComplete, currentStageName }: SalesPipelineProps) {
  return (
    <div className="w-full bg-white border-b border-gray-200">
      {/* Chevron Pipeline */}
      <div className="flex items-stretch h-10 overflow-x-auto">
        {stages.map((stage, index) => (
          <div 
            key={stage.id}
            className="relative flex-1 min-w-0 cursor-pointer group"
            onClick={() => onStageClick?.(stage.id)}
          >
            {/* Chevron shape */}
            <div 
              className={cn(
                "h-full flex items-center justify-center px-2 text-xs font-medium transition-all relative",
                // Background colors
                stage.status === "completed" && "bg-ops-green text-white",
                stage.status === "current" && "bg-blue-600 text-white",
                stage.status === "pending" && "bg-gray-200 text-gray-500",
                // Clip path for chevron shape
                index === 0 && "rounded-l-md",
                index === stages.length - 1 && "rounded-r-md",
              )}
              style={{
                clipPath: index === stages.length - 1 
                  ? 'polygon(0 0, calc(100% - 8px) 0, 100% 50%, calc(100% - 8px) 100%, 0 100%, 8px 50%)'
                  : index === 0
                  ? 'polygon(0 0, calc(100% - 8px) 0, 100% 50%, calc(100% - 8px) 100%, 0 100%)'
                  : 'polygon(0 0, calc(100% - 8px) 0, 100% 50%, calc(100% - 8px) 100%, 0 100%, 8px 50%)',
              }}
            >
              {stage.status === "completed" ? (
                <Check className="w-4 h-4 flex-shrink-0" />
              ) : (
                <span className="truncate text-[10px] sm:text-xs leading-tight text-center">
                  {stage.shortName}
                </span>
              )}
            </div>
            
            {/* Chevron arrow overlay for separation */}
            {index < stages.length - 1 && (
              <div 
                className="absolute right-0 top-0 h-full w-2 z-10"
                style={{
                  background: 'linear-gradient(to right, transparent 0%, white 100%)',
                }}
              />
            )}
          </div>
        ))}
      </div>
      
      {/* Current stage info bar */}
      <div className="flex items-center justify-between px-4 py-2 bg-gray-50 border-t border-gray-100">
        <div className="flex items-center gap-2 text-sm">
          <span className="text-gray-500">Etapa:</span>
          <span className="font-semibold text-gray-900">
            {currentStageName || stages.find(s => s.status === "current")?.name || "Concluído"}
          </span>
        </div>
        
        {onMarkComplete && stages.some(s => s.status === "current") && (
          <button
            onClick={onMarkComplete}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded hover:bg-blue-700 transition-colors"
          >
            <Check className="w-3.5 h-3.5" />
            Marcar como Concluída
          </button>
        )}
      </div>
    </div>
  );
}

import React from "react";
import { cn } from "@/lib/utils";
import { Check } from "lucide-react";
import { DepartmentType, DEPARTMENT_INFO, DEPARTMENT_ORDER, getDepartmentIndex } from "@/types/os";

interface OSProgressBarProps {
  currentDepartment: DepartmentType;
  completedDepartments?: DepartmentType[];
  className?: string;
  onStageClick?: (dept: DepartmentType) => void;
}

export function OSProgressBar({
  currentDepartment,
  completedDepartments = [],
  className,
  onStageClick,
}: OSProgressBarProps) {
  const currentIndex = getDepartmentIndex(currentDepartment);

  return (
    <div className={cn("w-full", className)}>
      {/* Salesforce-style progress bar */}
      <div className="flex items-center">
        {DEPARTMENT_ORDER.map((dept, index) => {
          const info = DEPARTMENT_INFO[dept];
          const isCompleted = completedDepartments.includes(dept) || index < currentIndex;
          const isCurrent = dept === currentDepartment;
          const isPending = index > currentIndex;

          return (
            <React.Fragment key={dept}>
              {/* Stage item */}
              <button
                onClick={() => onStageClick?.(dept)}
                className={cn(
                  "relative flex-1 group transition-all duration-200",
                  onStageClick && "cursor-pointer hover:scale-[1.02]",
                  !onStageClick && "cursor-default"
                )}
              >
                {/* Chevron shape */}
                <div
                  className={cn(
                    "relative flex items-center justify-center py-3 px-4 text-sm font-medium transition-colors",
                    // Clip path for chevron effect
                    index === 0 && "rounded-l-lg",
                    index === DEPARTMENT_ORDER.length - 1 && "rounded-r-lg",
                    // States
                    isCompleted && "bg-success text-success-foreground",
                    isCurrent && "bg-board-navy text-white",
                    isPending && "bg-muted text-muted-foreground"
                  )}
                  style={{
                    clipPath: index < DEPARTMENT_ORDER.length - 1
                      ? "polygon(0 0, calc(100% - 12px) 0, 100% 50%, calc(100% - 12px) 100%, 0 100%, 12px 50%)"
                      : index > 0
                      ? "polygon(0 0, 100% 0, 100% 100%, 0 100%, 12px 50%)"
                      : undefined,
                    marginLeft: index > 0 ? "-12px" : "0",
                  }}
                >
                  <span className="flex items-center gap-2">
                    {isCompleted ? (
                      <Check className="h-4 w-4" />
                    ) : (
                      <span>{info.icon}</span>
                    )}
                    <span className="hidden md:inline">{info.name}</span>
                  </span>
                </div>

                {/* Tooltip on hover */}
                <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                  <span className="bg-board-navy text-white text-xs px-2 py-1 rounded whitespace-nowrap">
                    {info.name}
                  </span>
                </div>
              </button>
            </React.Fragment>
          );
        })}
      </div>

      {/* Progress percentage */}
      <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
        <span>
          Etapa {currentIndex + 1} de {DEPARTMENT_ORDER.length}
        </span>
        <span>
          {Math.round(((currentIndex + 1) / DEPARTMENT_ORDER.length) * 100)}% concluído
        </span>
      </div>
    </div>
  );
}

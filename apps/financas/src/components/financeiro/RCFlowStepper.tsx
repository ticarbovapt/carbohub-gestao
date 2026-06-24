import { cn } from "@/lib/utils";
import { CheckCircle2 } from "lucide-react";
import { RC_FLOW_STEPS, type RCStatus } from "@/types/rcPurchasing";

interface Props {
  currentStatus: RCStatus;
}

export function RCFlowStepper({ currentStatus }: Props) {
  const currentIndex = RC_FLOW_STEPS.findIndex(s => s.key === currentStatus);
  const isRejected = currentStatus === 'rejeitada';

  return (
    <div className="w-full overflow-x-auto">
      <div className="flex items-center min-w-[600px] px-2">
        {RC_FLOW_STEPS.map((step, i) => {
          const isCompleted = !isRejected && i < currentIndex;
          const isCurrent = step.key === currentStatus || (isRejected && step.key === 'aguardando_aprovacao');
          const isFuture = !isCompleted && !isCurrent;

          return (
            <div key={step.key} className="flex items-center flex-1">
              <div className="flex flex-col items-center gap-1.5 min-w-0">
                <div
                  className={cn(
                    "h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold transition-all border-2",
                    isCompleted && "bg-carbo-green border-carbo-green text-white",
                    isCurrent && !isRejected && "bg-primary border-primary text-primary-foreground animate-pulse",
                    isCurrent && isRejected && "bg-destructive border-destructive text-white",
                    isFuture && "bg-muted border-border text-muted-foreground",
                  )}
                >
                  {isCompleted ? <CheckCircle2 className="h-4 w-4" /> : i + 1}
                </div>
                <div className="text-center">
                  <p className={cn(
                    "text-[10px] font-semibold leading-tight",
                    isCompleted && "text-carbo-green",
                    isCurrent && !isRejected && "text-primary",
                    isCurrent && isRejected && "text-destructive",
                    isFuture && "text-muted-foreground",
                  )}>
                    {isRejected && isCurrent ? 'Rejeitada' : step.label}
                  </p>
                  <p className="text-[9px] text-muted-foreground leading-tight mt-0.5 max-w-[90px]">
                    {step.description}
                  </p>
                </div>
              </div>
              {i < RC_FLOW_STEPS.length - 1 && (
                <div className={cn(
                  "flex-1 h-0.5 mx-1 rounded-full",
                  isCompleted ? "bg-carbo-green" : "bg-border"
                )} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

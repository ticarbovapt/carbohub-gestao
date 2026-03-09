import React from "react";
import { useOsActions } from "@/hooks/useOsActions";
import { ActionCard } from "./ActionCard";
import { StageCompletionSuggestion } from "./StageCompletionSuggestion";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { CheckCircle2, Clock, ListTodo } from "lucide-react";
import { AnimatePresence } from "framer-motion";

interface ActionListProps {
  serviceOrderId: string;
  currentDepartment?: string;
  onCompleteStage?: () => void;
}

export function ActionList({ serviceOrderId, currentDepartment, onCompleteStage }: ActionListProps) {
  const { pendingActions, completedActions, hasActions, allActionsCompleted, isLoading, updateStatus } = useOsActions(serviceOrderId);

  if (isLoading) {
    return (
      <div className="p-4 space-y-3">
        {[1, 2].map((i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
    );
  }

  if (!hasActions) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm p-8 text-center">
        <div>
          <ListTodo className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p className="font-medium">Nenhuma ação ainda</p>
          <p className="text-xs mt-1">Clique em "Adicionar ação" para criar</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto">
      {/* Stage completion suggestion */}
      <AnimatePresence>
        {allActionsCompleted && onCompleteStage && (
          <StageCompletionSuggestion
            onCompleteStage={onCompleteStage}
            stageName={currentDepartment}
          />
        )}
      </AnimatePresence>

      <div className="p-4 space-y-4">
        {/* Pending Actions */}
        {pendingActions.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Clock className="h-4 w-4 text-warning" />
              <span className="text-sm font-medium">Pendentes</span>
              <Badge variant="secondary" className="h-5 text-xs">
                {pendingActions.length}
              </Badge>
            </div>
            <div className="space-y-3">
              {pendingActions.map((action) => (
                <ActionCard
                  key={action.id}
                  action={action}
                  onComplete={() => updateStatus({ actionId: action.id, status: "completed" })}
                  onCancel={() => updateStatus({ actionId: action.id, status: "cancelled" })}
                />
              ))}
            </div>
          </div>
        )}

        {/* Separator if both sections exist */}
        {pendingActions.length > 0 && completedActions.length > 0 && (
          <Separator />
        )}

        {/* Completed Actions */}
        {completedActions.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <CheckCircle2 className="h-4 w-4 text-success" />
              <span className="text-sm font-medium">Concluídas</span>
              <Badge variant="secondary" className="h-5 text-xs">
                {completedActions.length}
              </Badge>
            </div>
            <div className="space-y-2">
              {completedActions.slice(0, 5).map((action) => (
                <ActionCard
                  key={action.id}
                  action={action}
                  onComplete={() => {}}
                  onCancel={() => {}}
                  compact
                />
              ))}
              {completedActions.length > 5 && (
                <p className="text-xs text-muted-foreground text-center py-2">
                  +{completedActions.length - 5} ações concluídas
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

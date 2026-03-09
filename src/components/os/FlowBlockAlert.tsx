import React from "react";
import { cn } from "@/lib/utils";
import { AlertTriangle, Lock, CheckSquare, Clock, XCircle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FlowValidationResult } from "@/hooks/useOsFlowValidation";

interface FlowBlockAlertProps {
  validation: FlowValidationResult;
  onStartChecklist?: () => void;
  onValidate?: () => void;
  isValidating?: boolean;
  className?: string;
}

export function FlowBlockAlert({
  validation,
  onStartChecklist,
  onValidate,
  isValidating,
  className,
}: FlowBlockAlertProps) {
  if (validation.can_advance) {
    return null;
  }

  const isChecklistBlock = !validation.checklist_complete;
  const isValidationBlock = validation.checklist_complete && validation.block_reason?.includes("validação");

  return (
    <Alert
      variant="destructive"
      className={cn(
        "border-2 bg-destructive/5",
        className
      )}
    >
      <Lock className="h-5 w-5" />
      <AlertTitle className="flex items-center gap-2 text-base font-semibold">
        <span>🚫 Avanço Bloqueado</span>
      </AlertTitle>
      <AlertDescription className="mt-2 space-y-3">
        <p className="text-sm font-medium">
          {validation.block_reason}
        </p>

        {/* SLA Warning */}
        {validation.sla_status === "breached" && (
          <div className="flex items-center gap-2 text-destructive bg-destructive/10 rounded-md px-3 py-2">
            <XCircle className="h-4 w-4" />
            <span className="text-sm font-medium">SLA estourado - ação urgente necessária!</span>
          </div>
        )}

        {validation.sla_status === "critical" && (
          <div className="flex items-center gap-2 text-warning bg-warning/10 rounded-md px-3 py-2">
            <Clock className="h-4 w-4" />
            <span className="text-sm font-medium">SLA crítico - menos de 2h restantes!</span>
          </div>
        )}

        {/* Action buttons */}
        <div className="flex flex-wrap gap-2 pt-1">
          {isChecklistBlock && onStartChecklist && (
            <Button size="sm" variant="outline" onClick={onStartChecklist}>
              <CheckSquare className="h-4 w-4 mr-1" />
              Completar Checklist
            </Button>
          )}

          {isValidationBlock && onValidate && (
            <Button size="sm" onClick={onValidate} disabled={isValidating}>
              {isValidating ? (
                "Validando..."
              ) : (
                <>
                  <CheckSquare className="h-4 w-4 mr-1" />
                  Validar Etapa
                </>
              )}
            </Button>
          )}
        </div>

        <p className="text-xs text-muted-foreground mt-2">
          💡 O sistema protege a operação garantindo que todas as etapas sejam concluídas corretamente.
        </p>
      </AlertDescription>
    </Alert>
  );
}

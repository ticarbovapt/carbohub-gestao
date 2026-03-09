import { ReactNode, useState } from "react";
import { Check, X, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ChecklistStepProps {
  stepNumber: number;
  totalSteps: number;
  title: string;
  description?: string;
  icon?: ReactNode;
  sensorData?: {
    label: string;
    value: string;
    status: "ok" | "warning" | "error";
  };
  onComplete: (passed: boolean) => void;
}

export function ChecklistStep({
  stepNumber,
  totalSteps,
  title,
  description,
  icon,
  sensorData,
  onComplete,
}: ChecklistStepProps) {
  const [answered, setAnswered] = useState(false);

  const handleAnswer = (passed: boolean) => {
    setAnswered(true);
    setTimeout(() => {
      onComplete(passed);
    }, 300);
  };

  const getSensorStatusColor = (status: "ok" | "warning" | "error") => {
    switch (status) {
      case "ok": return "bg-ops-green/10 text-ops-green border-ops-green/30";
      case "warning": return "bg-amber-100 text-amber-700 border-amber-300";
      case "error": return "bg-ops-coral/10 text-ops-coral border-ops-coral/30";
    }
  };

  const getSensorIcon = (status: "ok" | "warning" | "error") => {
    switch (status) {
      case "ok": return <Check className="h-4 w-4" />;
      case "warning": return <AlertTriangle className="h-4 w-4" />;
      case "error": return <X className="h-4 w-4" />;
    }
  };

  return (
    <div className="flex min-h-[calc(100vh-8rem)] flex-col items-center justify-center px-6 py-8">
      {/* Progress indicator */}
      <div className="mb-8 flex items-center gap-2">
        {Array.from({ length: totalSteps }).map((_, i) => (
          <div
            key={i}
            className={cn(
              "h-2.5 rounded-full transition-all duration-300",
              i < stepNumber - 1 
                ? "w-2.5 bg-ops-green" 
                : i === stepNumber - 1 
                  ? "w-8 bg-ops-yellow" 
                  : "w-2.5 bg-gray-200"
            )}
          />
        ))}
      </div>

      {/* Step counter */}
      <p className="mb-4 text-lg font-semibold text-ops-muted">
        Passo {stepNumber} de {totalSteps}
      </p>

      {/* Icon */}
      {icon && (
        <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-3xl bg-ops-yellow/20 text-5xl ops-bounce-in">
          {icon}
        </div>
      )}

      {/* Title */}
      <h2 className="mb-3 text-center text-2xl font-bold text-ops-text max-w-sm">
        {title}
      </h2>

      {/* Description */}
      {description && (
        <p className="mb-6 text-center text-lg text-ops-muted max-w-sm">
          {description}
        </p>
      )}

      {/* Sensor data */}
      {sensorData && (
        <div className={cn(
          "mb-8 flex items-center gap-3 rounded-2xl border-2 px-5 py-4",
          getSensorStatusColor(sensorData.status)
        )}>
          {getSensorIcon(sensorData.status)}
          <span className="font-semibold">{sensorData.label}:</span>
          <span className="font-bold">{sensorData.value}</span>
          {sensorData.status === "ok" && <span>✅</span>}
          {sensorData.status === "warning" && <span>⚠️</span>}
          {sensorData.status === "error" && <span>❌</span>}
        </div>
      )}

      {/* Action buttons */}
      <div className={cn(
        "flex gap-4 w-full max-w-sm transition-opacity duration-300",
        answered && "opacity-50 pointer-events-none"
      )}>
        <Button 
          variant="ops-coral" 
          size="ops-full"
          onClick={() => handleAnswer(false)}
          className="flex-1"
        >
          ❌ Não
        </Button>
        <Button 
          variant="ops-green" 
          size="ops-full"
          onClick={() => handleAnswer(true)}
          className="flex-1"
        >
          ✅ Sim
        </Button>
      </div>

      {/* Encouragement */}
      {stepNumber < totalSteps && (
        <p className="mt-8 text-center text-base text-ops-muted">
          {totalSteps - stepNumber === 1 
            ? "🎯 Falta só mais 1 passo!" 
            : `📋 Faltam ${totalSteps - stepNumber} passos!`}
        </p>
      )}
    </div>
  );
}

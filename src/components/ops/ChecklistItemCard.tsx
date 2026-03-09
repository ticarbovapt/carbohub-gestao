import { useState } from "react";
import { Check, X, MinusCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { ChecklistItem } from "@/data/checklistData";

interface ChecklistItemCardProps {
  item: ChecklistItem;
  stepNumber: number;
  totalSteps: number;
  sectionTitle: string;
  onComplete: (result: { 
    passed: boolean; 
    nsa?: boolean; 
    quantity?: string; 
    observation?: string;
  }) => void;
}

export function ChecklistItemCard({
  item,
  stepNumber,
  totalSteps,
  sectionTitle,
  onComplete,
}: ChecklistItemCardProps) {
  const [answered, setAnswered] = useState(false);
  const [quantity, setQuantity] = useState("");
  const [observation, setObservation] = useState("");
  const [showNSAInput, setShowNSAInput] = useState(false);
  const [nsaReason, setNsaReason] = useState("");

  const handleAnswer = (passed: boolean, nsa: boolean = false) => {
    setAnswered(true);
    setTimeout(() => {
      onComplete({ 
        passed, 
        nsa, 
        quantity: item.hasQuantity ? quantity : undefined,
        observation: nsa ? nsaReason : (item.hasObservation ? observation : undefined),
      });
    }, 300);
  };

  const handleNSA = () => {
    if (showNSAInput && nsaReason.trim()) {
      handleAnswer(true, true);
    } else {
      setShowNSAInput(true);
    }
  };

  return (
    <div className="flex min-h-[calc(100vh-8rem)] flex-col items-center justify-center px-6 py-8">
      {/* Progress indicator */}
      <div className="mb-4 w-full max-w-sm">
        <div className="flex justify-between text-sm text-ops-muted mb-2">
          <span>{stepNumber} de {totalSteps}</span>
          <span>{Math.round((stepNumber / totalSteps) * 100)}%</span>
        </div>
        <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
          <div 
            className="h-full bg-ops-green transition-all duration-500 ease-out"
            style={{ width: `${(stepNumber / totalSteps) * 100}%` }}
          />
        </div>
      </div>

      {/* Section title */}
      <p className="mb-2 text-sm font-medium text-ops-yellow bg-ops-yellow/10 px-3 py-1 rounded-full">
        {sectionTitle}
      </p>

      {/* Icon */}
      <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-3xl bg-ops-yellow/20 text-5xl ops-bounce-in">
        {item.icon}
      </div>

      {/* Title */}
      <h2 className="mb-3 text-center text-2xl font-bold text-ops-text max-w-sm">
        {item.title}
      </h2>

      {/* Description */}
      {item.description && (
        <p className="mb-4 text-center text-lg text-ops-muted max-w-sm">
          {item.description}
        </p>
      )}

      {/* Quantity input */}
      {item.hasQuantity && (
        <div className="mb-4 w-full max-w-sm">
          <label className="block text-sm font-medium text-ops-muted mb-2">
            Quantidade:
          </label>
          <Input
            type="number"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            placeholder="Digite a quantidade..."
            className="text-lg text-center h-14 rounded-xl border-2 border-ops-yellow/30 focus:border-ops-yellow"
          />
        </div>
      )}

      {/* Observation input */}
      {item.hasObservation && !showNSAInput && (
        <div className="mb-4 w-full max-w-sm">
          <label className="block text-sm font-medium text-ops-muted mb-2">
            Observações (opcional):
          </label>
          <Textarea
            value={observation}
            onChange={(e) => setObservation(e.target.value)}
            placeholder="Adicione uma observação..."
            className="text-base rounded-xl border-2 border-gray-200 focus:border-ops-yellow min-h-[80px]"
          />
        </div>
      )}

      {/* NSA reason input */}
      {showNSAInput && (
        <div className="mb-4 w-full max-w-sm ops-slide-up">
          <label className="block text-sm font-medium text-ops-muted mb-2">
            Motivo do NSA:
          </label>
          <Textarea
            value={nsaReason}
            onChange={(e) => setNsaReason(e.target.value)}
            placeholder="Digite o motivo..."
            className="text-base rounded-xl border-2 border-amber-300 focus:border-amber-500 min-h-[80px]"
            autoFocus
          />
          <div className="flex gap-3 mt-3">
            <Button
              variant="ops-outline"
              onClick={() => setShowNSAInput(false)}
              className="flex-1"
            >
              Cancelar
            </Button>
            <Button
              variant="ops"
              onClick={() => handleAnswer(true, true)}
              disabled={!nsaReason.trim()}
              className="flex-1"
            >
              Confirmar NSA
            </Button>
          </div>
        </div>
      )}

      {/* Action buttons */}
      {!showNSAInput && (
        <div className={cn(
          "flex flex-col gap-3 w-full max-w-sm transition-opacity duration-300",
          answered && "opacity-50 pointer-events-none"
        )}>
          {/* Main buttons */}
          <div className="flex gap-4">
            <Button 
              variant="ops-coral" 
              size="ops-full"
              onClick={() => handleAnswer(false)}
              className="flex-1"
            >
              <X className="h-5 w-5 mr-2" />
              Não
            </Button>
            <Button 
              variant="ops-green" 
              size="ops-full"
              onClick={() => handleAnswer(true)}
              className="flex-1"
            >
              <Check className="h-5 w-5 mr-2" />
              Sim
            </Button>
          </div>

          {/* NSA button */}
          {item.hasNSA && (
            <Button 
              variant="ops-outline"
              onClick={handleNSA}
              className="w-full text-amber-600 border-amber-300 hover:bg-amber-50"
            >
              <MinusCircle className="h-5 w-5 mr-2" />
              NSA - Não Se Aplica
            </Button>
          )}
        </div>
      )}

      {/* Encouragement */}
      {stepNumber < totalSteps && !showNSAInput && (
        <p className="mt-6 text-center text-base text-ops-muted">
          {totalSteps - stepNumber === 1 
            ? "🎯 Falta só mais 1 item!" 
            : totalSteps - stepNumber <= 5
              ? `📋 Faltam ${totalSteps - stepNumber} itens!`
              : `📋 ${totalSteps - stepNumber} itens restantes`}
        </p>
      )}
    </div>
  );
}

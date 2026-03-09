import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { Home, RotateCcw } from "lucide-react";

interface ChecklistCompleteProps {
  checklistName: string;
  completionTime: string;
  stepsCompleted: number;
  flaggedSteps: number;
  nsaSteps?: number;
  onRestart?: () => void;
}

export function ChecklistComplete({
  checklistName,
  completionTime,
  stepsCompleted,
  flaggedSteps,
  nsaSteps = 0,
  onRestart,
}: ChecklistCompleteProps) {
  const [showConfetti, setShowConfetti] = useState(false);

  useEffect(() => {
    setShowConfetti(true);
    const timer = setTimeout(() => setShowConfetti(false), 3000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="flex min-h-[calc(100vh-4rem)] flex-col items-center justify-center px-6 py-8">
      {/* Confetti animation */}
      {showConfetti && (
        <div className="fixed inset-0 pointer-events-none overflow-hidden">
          {Array.from({ length: 50 }).map((_, i) => (
            <div
              key={i}
              className="absolute text-2xl confetti-burst"
              style={{
                left: `${Math.random() * 100}%`,
                top: `${Math.random() * 60}%`,
                animationDelay: `${Math.random() * 0.5}s`,
              }}
            >
              {["🎉", "✨", "⭐", "🎊", "💫"][Math.floor(Math.random() * 5)]}
            </div>
          ))}
        </div>
      )}

      {/* Success icon */}
      <div className="mb-6 flex h-28 w-28 items-center justify-center rounded-full bg-ops-green text-6xl ops-bounce-in shadow-lg">
        🎉
      </div>

      {/* Title */}
      <h1 className="mb-2 text-center text-3xl font-extrabold text-ops-text">
        Checklist Completo!
      </h1>
      
      <p className="mb-8 text-center text-xl text-ops-muted">
        Bom trabalho! 👏
      </p>

      {/* Stats card */}
      <div className="mb-8 w-full max-w-sm rounded-3xl bg-ops-surface p-6 shadow-lg ops-card-shadow">
        <h3 className="mb-4 text-lg font-bold text-ops-text">{checklistName}</h3>
        
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-ops-muted">⏰ Finalizado às</span>
            <span className="font-bold text-ops-text">{completionTime}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-ops-muted">✅ Passos completados</span>
            <span className="font-bold text-ops-green">{stepsCompleted}</span>
          </div>
          {flaggedSteps > 0 && (
            <div className="flex items-center justify-between">
              <span className="text-ops-muted">❌ Itens não conformes</span>
              <span className="font-bold text-ops-coral">{flaggedSteps}</span>
            </div>
          )}
          {nsaSteps > 0 && (
            <div className="flex items-center justify-between">
              <span className="text-ops-muted">⚪ Não se aplica (NSA)</span>
              <span className="font-bold text-gray-500">{nsaSteps}</span>
            </div>
          )}
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex w-full max-w-sm flex-col gap-3">
        <Link to="/" className="w-full">
          <Button variant="ops" size="ops-full" className="w-full">
            <Home className="h-5 w-5" />
            Voltar ao Início
          </Button>
        </Link>
        {onRestart && (
          <Button 
            variant="ops-outline" 
            size="ops-full" 
            onClick={onRestart}
            className="w-full"
          >
            <RotateCcw className="h-5 w-5" />
            Fazer Outro Checklist
          </Button>
        )}
      </div>
    </div>
  );
}

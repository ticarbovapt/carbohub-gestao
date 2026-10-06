import { cn } from "@/lib/utils";
import { ReactNode } from "react";

interface MicroInteractionProps {
  children: ReactNode;
  type?: "bounce" | "pulse" | "shake" | "pop" | "slide-up" | "fade-in";
  delay?: number;
  className?: string;
  trigger?: "mount" | "hover" | "click";
}

export function MicroInteraction({
  children,
  type = "pop",
  delay = 0,
  className,
  trigger = "mount",
}: MicroInteractionProps) {
  const animationClasses = {
    bounce: "animate-bounce",
    pulse: "animate-pulse",
    shake: "animate-shake",
    pop: "ops-bounce-in",
    "slide-up": "ops-slide-up",
    "fade-in": "board-fade-in",
  };

  const hoverClasses = {
    bounce: "hover:animate-bounce",
    pulse: "hover:animate-pulse",
    shake: "hover:animate-shake",
    pop: "hover:scale-105 transition-transform",
    "slide-up": "hover:-translate-y-1 transition-transform",
    "fade-in": "hover:opacity-80 transition-opacity",
  };

  const clickClasses = {
    bounce: "active:scale-95 transition-transform",
    pulse: "active:scale-95 transition-transform",
    shake: "active:scale-95 transition-transform",
    pop: "active:scale-95 transition-transform",
    "slide-up": "active:scale-95 transition-transform",
    "fade-in": "active:opacity-70 transition-opacity",
  };

  return (
    <div
      className={cn(
        trigger === "mount" && animationClasses[type],
        trigger === "hover" && hoverClasses[type],
        trigger === "click" && clickClasses[type],
        className
      )}
      style={{
        animationDelay: trigger === "mount" ? `${delay}ms` : undefined,
        animationFillMode: "backwards",
      }}
    >
      {children}
    </div>
  );
}

// Toast-like success message
interface ToastSuccessProps {
  show: boolean;
  message: string;
  emoji?: string;
}

export function ToastSuccess({ show, message, emoji = "🚀" }: ToastSuccessProps) {
  if (!show) return null;

  return (
    <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 ops-slide-up">
      <div className="bg-ops-green text-white px-6 py-3 rounded-full shadow-lg flex items-center gap-2 font-semibold">
        <span className="text-xl">{emoji}</span>
        <span>{message}</span>
      </div>
    </div>
  );
}

// Floating action feedback
interface FloatingFeedbackProps {
  show: boolean;
  message: string;
  position?: { x: number; y: number };
}

export function FloatingFeedback({ show, message, position }: FloatingFeedbackProps) {
  if (!show || !position) return null;

  return (
    <div
      className="fixed z-50 pointer-events-none"
      style={{
        left: position.x,
        top: position.y,
      }}
    >
      <div className="animate-float-up text-ops-green font-bold text-lg">
        {message}
      </div>
    </div>
  );
}

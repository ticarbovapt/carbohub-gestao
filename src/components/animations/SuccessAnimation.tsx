import { useEffect, useState } from "react";
import { CheckCircle2, Sparkles, PartyPopper } from "lucide-react";
import { cn } from "@/lib/utils";

interface SuccessAnimationProps {
  show: boolean;
  message?: string;
  subMessage?: string;
  onComplete?: () => void;
  variant?: "default" | "celebration" | "subtle";
  duration?: number;
}

export function SuccessAnimation({
  show,
  message = "Sucesso!",
  subMessage,
  onComplete,
  variant = "default",
  duration = 2500,
}: SuccessAnimationProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);

  useEffect(() => {
    if (show) {
      setIsVisible(true);
      setIsAnimating(true);

      const timer = setTimeout(() => {
        setIsAnimating(false);
        setTimeout(() => {
          setIsVisible(false);
          onComplete?.();
        }, 300);
      }, duration);

      return () => clearTimeout(timer);
    }
  }, [show, duration, onComplete]);

  if (!isVisible) return null;

  return (
    <div
      className={cn(
        "fixed inset-0 z-50 flex items-center justify-center transition-all duration-300",
        isAnimating ? "opacity-100" : "opacity-0"
      )}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />

      {/* Content */}
      <div
        className={cn(
          "relative z-10 flex flex-col items-center text-center transition-all",
          isAnimating ? "scale-100" : "scale-90"
        )}
      >
        {/* Icon Container */}
        <div
          className={cn(
            "relative mb-6",
            variant === "celebration" && "animate-bounce"
          )}
        >
          {/* Glow effect */}
          <div className="absolute inset-0 rounded-full bg-ops-green/30 blur-xl animate-pulse" />

          {/* Icon */}
          <div
            className={cn(
              "relative h-24 w-24 rounded-full flex items-center justify-center",
              variant === "celebration"
                ? "bg-gradient-to-br from-ops-yellow to-ops-green"
                : variant === "subtle"
                ? "bg-ops-green/20"
                : "bg-ops-green"
            )}
          >
            {variant === "celebration" ? (
              <PartyPopper className="h-12 w-12 text-white" />
            ) : (
              <CheckCircle2 className="h-12 w-12 text-white" />
            )}
          </div>

          {/* Sparkles around icon */}
          {variant !== "subtle" && (
            <>
              <Sparkles
                className="absolute -top-2 -right-2 h-6 w-6 text-ops-yellow animate-spin"
                style={{ animationDuration: "3s" }}
              />
              <Sparkles
                className="absolute -bottom-1 -left-3 h-5 w-5 text-ops-green animate-spin"
                style={{ animationDuration: "2s", animationDirection: "reverse" }}
              />
            </>
          )}
        </div>

        {/* Message */}
        <h2
          className={cn(
            "text-2xl font-bold text-white mb-2",
            variant === "celebration" && "text-3xl"
          )}
        >
          {message}
        </h2>

        {subMessage && (
          <p className="text-white/80 text-lg max-w-sm">{subMessage}</p>
        )}

        {/* Floating particles */}
        {variant === "celebration" && (
          <div className="absolute inset-0 pointer-events-none overflow-hidden">
            {[...Array(12)].map((_, i) => (
              <div
                key={i}
                className="absolute w-2 h-2 rounded-full animate-float"
                style={{
                  backgroundColor: ["#FFCB05", "#A7E868", "#3B9AFF", "#fff"][i % 4],
                  left: `${10 + Math.random() * 80}%`,
                  top: `${10 + Math.random() * 80}%`,
                  animationDelay: `${i * 0.1}s`,
                  animationDuration: `${2 + Math.random() * 2}s`,
                }}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

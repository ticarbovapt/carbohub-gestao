import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";

/**
 * Minimalista top progress bar — dispara em cada troca de rota.
 * Sem deps pesadas, sem impacto de performance.
 */
export function PageProgressBar() {
  const location = useLocation();
  const [active, setActive] = useState(false);
  const [complete, setComplete] = useState(false);

  useEffect(() => {
    setActive(true);
    setComplete(false);

    const completeTimer = setTimeout(() => {
      setComplete(true);
    }, 400);

    const clearTimer = setTimeout(() => {
      setActive(false);
      setComplete(false);
    }, 700);

    return () => {
      clearTimeout(completeTimer);
      clearTimeout(clearTimer);
    };
  }, [location.pathname]);

  if (!active && !complete) return null;

  return (
    <div
      className={cn(
        "fixed top-0 left-0 z-[9999] h-[2px] pointer-events-none",
        "bg-gradient-to-r from-carbo-green via-carbo-blue to-carbo-green",
        "transition-all duration-300 ease-out",
        complete ? "w-full opacity-0" : "opacity-100"
      )}
      style={{
        width: complete ? "100%" : active ? "85%" : "0%",
        transition: complete
          ? "width 0.1s ease-out, opacity 0.25s ease-out 0.1s"
          : "width 0.5s cubic-bezier(0.1, 0.6, 0.4, 1)",
      }}
    />
  );
}

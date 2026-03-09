import { useEffect, useRef, useState } from "react";

interface UseCountUpOptions {
  from?: number;
  to: number;
  duration?: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  enabled?: boolean;
}

/**
 * Lightweight count-up hook — no external deps, RAF-based.
 * Triggers on mount (when enabled).
 */
export function useCountUp({
  from = 0,
  to,
  duration = 1000,
  decimals = 0,
  prefix = "",
  suffix = "",
  enabled = true,
}: UseCountUpOptions): string {
  const [value, setValue] = useState(from);
  const rafRef = useRef<number>(0);
  const startTimeRef = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled || typeof to !== "number" || isNaN(to)) return;

    const start = from;
    const end = to;

    const step = (timestamp: number) => {
      if (!startTimeRef.current) startTimeRef.current = timestamp;
      const elapsed = timestamp - startTimeRef.current;
      const progress = Math.min(elapsed / duration, 1);
      // ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = start + (end - start) * eased;
      setValue(current);

      if (progress < 1) {
        rafRef.current = requestAnimationFrame(step);
      } else {
        setValue(end);
      }
    };

    startTimeRef.current = null;
    rafRef.current = requestAnimationFrame(step);

    return () => cancelAnimationFrame(rafRef.current);
  }, [from, to, duration, enabled]);

  const formatted =
    prefix +
    value.toLocaleString("pt-BR", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }) +
    suffix;

  return formatted;
}

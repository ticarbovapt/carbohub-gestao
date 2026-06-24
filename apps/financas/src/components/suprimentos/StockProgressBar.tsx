import { useMemo } from "react";

interface StockProgressBarProps {
  current: number;
  safety: number;
  hubName: string;
  unit?: string;
  onClick?: () => void;
}

function interpolateColor(color1: string, color2: string, t: number): string {
  const hex = (c: string) => parseInt(c, 16);
  const r1 = hex(color1.slice(1, 3)), g1 = hex(color1.slice(3, 5)), b1 = hex(color1.slice(5, 7));
  const r2 = hex(color2.slice(1, 3)), g2 = hex(color2.slice(3, 5)), b2 = hex(color2.slice(5, 7));
  const r = Math.round(r1 + (r2 - r1) * t);
  const g = Math.round(g1 + (g2 - g1) * t);
  const b = Math.round(b1 + (b2 - b1) * t);
  return `rgb(${r}, ${g}, ${b})`;
}

/**
 * Gradient logic:
 * 0%   → #DC2626 (red)
 * 50%  → #F97316 (orange)  
 * 80%  → #FACC15 (yellow)
 * 100% → #22C55E (green) ← safety stock = midpoint
 * 150% → #1D4ED8 (blue)
 * 200% → #0F172A (dark blue)
 */
function getBarColor(ratio: number): string {
  if (ratio <= 0) return "#DC2626";
  if (ratio < 1) {
    const stops: [number, string][] = [
      [0, "#DC2626"],
      [0.5, "#F97316"],
      [0.8, "#FACC15"],
      [1.0, "#22C55E"],
    ];
    for (let i = 0; i < stops.length - 1; i++) {
      const [r0, c0] = stops[i];
      const [r1, c1] = stops[i + 1];
      if (ratio >= r0 && ratio <= r1) {
        const t = (ratio - r0) / (r1 - r0);
        return interpolateColor(c0, c1, t);
      }
    }
    return "#22C55E";
  }
  // ratio >= 1: green → blue → dark
  const stops: [number, string][] = [
    [1.0, "#22C55E"],
    [1.5, "#1D4ED8"],
    [2.0, "#0F172A"],
  ];
  const capped = Math.min(ratio, 2);
  for (let i = 0; i < stops.length - 1; i++) {
    const [r0, c0] = stops[i];
    const [r1, c1] = stops[i + 1];
    if (capped >= r0 && capped <= r1) {
      const t = (capped - r0) / (r1 - r0);
      return interpolateColor(c0, c1, t);
    }
  }
  return "#0F172A";
}

/** Build a CSS linear-gradient string that fills from left to right with the correct color stops */
function getBarGradient(ratio: number): string {
  if (ratio <= 0) return "#DC2626";
  
  // The bar max = 200% safety. barWidth = cappedRatio/2 * 100
  // We want the gradient to show the full range from 0 to current ratio
  if (ratio < 1) {
    // Below safety: red → current color
    const endColor = getBarColor(ratio);
    return `linear-gradient(90deg, #DC2626 0%, ${endColor} 100%)`;
  }
  
  // At or above safety: red → green (at safety point) → current color
  const safetyPctInBar = (1 / Math.min(ratio, 2)) * 100; // where safety sits within the filled portion
  const endColor = getBarColor(ratio);
  return `linear-gradient(90deg, #DC2626 0%, #FACC15 ${safetyPctInBar * 0.8}%, #22C55E ${safetyPctInBar}%, ${endColor} 100%)`;
}

export function StockProgressBar({ current, safety, hubName, unit = "un", onClick }: StockProgressBarProps) {
  const { ratio, barWidth, gradient, displayText } = useMemo(() => {
    const safeSafety = Math.max(safety, 1);
    const ratio = current / safeSafety;
    const cappedRatio = Math.min(ratio, 2);
    const barWidth = (cappedRatio / 2) * 100; // 200% = 100% bar width
    const gradient = getBarGradient(ratio);

    let displayText: string;
    if (ratio < 1) {
      const pct = Math.round((1 - ratio) * 100);
      displayText = `${pct}% abaixo do nível mínimo`;
    } else if (ratio <= 1.05) {
      displayText = "No nível de segurança";
    } else {
      const mult = ratio.toFixed(1).replace(".", ",");
      displayText = `${mult}x o nível de segurança`;
    }

    return { ratio, barWidth, gradient, displayText };
  }, [current, safety]);

  return (
    <div
      className={`space-y-1.5 ${onClick ? "cursor-pointer hover:bg-muted/50 -mx-2 px-2 py-1.5 rounded-lg transition-colors" : ""}`}
      onClick={onClick}
    >
      {/* Hub label row */}
      <div className="flex items-center justify-between text-xs">
        <span className="font-semibold text-foreground">{hubName}</span>
        <span className="tabular-nums font-medium text-foreground">
          {current.toLocaleString("pt-BR")} {unit}
        </span>
      </div>

      {/* Progress bar */}
      <div className="relative h-2.5 w-full rounded-full bg-muted overflow-hidden">
        {/* Safety marker at 50% of total bar (= 100% of safety) */}
        <div
          className="absolute top-0 bottom-0 w-px z-10"
          style={{ left: "50%", backgroundColor: "hsl(var(--foreground) / 0.3)" }}
        />
        <div
          className="h-full rounded-full transition-all duration-500 ease-out"
          style={{
            width: `${Math.max(barWidth, 1)}%`,
            background: gradient,
          }}
        />
      </div>

      {/* Status text */}
      <div className="flex items-center justify-between text-[10px]">
        <span className="text-muted-foreground">{displayText}</span>
        <span className="text-muted-foreground tabular-nums">
          Seg: {safety.toLocaleString("pt-BR")} {unit}
        </span>
      </div>
    </div>
  );
}

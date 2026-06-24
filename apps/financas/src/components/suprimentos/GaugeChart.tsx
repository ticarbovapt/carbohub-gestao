import { useMemo } from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface GaugeChartProps {
  value: number;
  max: number;
  label: string;
  unit?: string;
  size?: number;
}

// Interpolate between two hex colors
function interpolateColor(color1: string, color2: string, t: number): string {
  const hex = (c: string) => parseInt(c, 16);
  const r1 = hex(color1.slice(1, 3)), g1 = hex(color1.slice(3, 5)), b1 = hex(color1.slice(5, 7));
  const r2 = hex(color2.slice(1, 3)), g2 = hex(color2.slice(3, 5)), b2 = hex(color2.slice(5, 7));
  const r = Math.round(r1 + (r2 - r1) * t);
  const g = Math.round(g1 + (g2 - g1) * t);
  const b = Math.round(b1 + (b2 - b1) * t);
  return `rgb(${r}, ${g}, ${b})`;
}

function getGradientColor(ratio: number): string {
  if (ratio < 1) {
    // Red → Orange → Yellow → Green
    const stops = ["#DC2626", "#F97316", "#FACC15", "#22C55E"];
    const t = Math.max(0, Math.min(ratio, 1));
    const segment = t * (stops.length - 1);
    const idx = Math.floor(segment);
    const frac = segment - idx;
    if (idx >= stops.length - 1) return stops[stops.length - 1];
    return interpolateColor(stops[idx], stops[idx + 1], frac);
  } else {
    // Green → Blue Grupo → Blue Dark
    const stops = ["#22C55E", "#1D4ED8", "#0F172A"];
    const t = Math.min((ratio - 1), 1); // 0 at 100%, 1 at 200%
    const segment = t * (stops.length - 1);
    const idx = Math.floor(segment);
    const frac = segment - idx;
    if (idx >= stops.length - 1) return stops[stops.length - 1];
    return interpolateColor(stops[idx], stops[idx + 1], frac);
  }
}

function getSmartText(ratio: number): { text: string; className: string } {
  if (ratio < 1) {
    const pct = Math.round((1 - ratio) * 100);
    return { text: `${pct}% abaixo do ideal`, className: "text-destructive" };
  }
  if (ratio === 1) {
    return { text: "Nível ideal atingido", className: "text-carbo-green" };
  }
  if (ratio <= 1.5) {
    const pct = Math.round((ratio - 1) * 100);
    return { text: `Acima do ideal (+${pct}%)`, className: "text-carbo-blue" };
  }
  const pct = Math.round((ratio - 1) * 100);
  return { text: `Excedente elevado (+${pct}%)`, className: "text-muted-foreground" };
}

export function GaugeChart({ value, max, label, unit = "un", size = 120 }: GaugeChartProps) {
  const { ratio, color, needleAngle, pctDisplay, smartText } = useMemo(() => {
    const safeMax = Math.max(max, 1);
    const ratio = value / safeMax;
    const cappedRatio = Math.min(ratio, 2);

    // Needle: 0% → -90deg, 200% → +90deg
    const normalizedForNeedle = Math.min(cappedRatio / 2, 1); // 0→1 range for 0%→200%
    const needleAngle = -90 + normalizedForNeedle * 180;

    const color = getGradientColor(ratio);
    const pctDisplay = Math.round(ratio * 100);
    const smartText = getSmartText(ratio);

    return { ratio, color, needleAngle, pctDisplay, smartText };
  }, [value, max]);

  const cx = size / 2;
  const cy = size / 2 + 4;
  const r = size / 2 - 12;
  const strokeWidth = 8;

  const polarToCartesian = (cx: number, cy: number, r: number, angleDeg: number) => {
    const angleRad = ((angleDeg - 90) * Math.PI) / 180;
    return {
      x: cx + r * Math.cos(angleRad),
      y: cy + r * Math.sin(angleRad),
    };
  };

  const describeArc = (startAngle: number, endAngle: number) => {
    const start = polarToCartesian(cx, cy, r, endAngle);
    const end = polarToCartesian(cx, cy, r, startAngle);
    const largeArc = endAngle - startAngle > 180 ? 1 : 0;
    return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 0 ${end.x} ${end.y}`;
  };

  // Needle endpoint
  const needleLen = r - 6;
  const needleEnd = polarToCartesian(cx, cy, needleLen, needleAngle + 90);

  // Arc fill: from 180 to position based on cappedRatio (0→200% maps to 180→360)
  const fillAngle = 180 + Math.min(ratio, 2) / 2 * 180;

  // Safety line at 50% of arc (ratio=1, which is 100% of safety)
  const safetyAngle = 180 + 90; // 270deg = midpoint
  const safetyStart = polarToCartesian(cx, cy, r + 4, safetyAngle);
  const safetyEnd = polarToCartesian(cx, cy, r - 4, safetyAngle);

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex flex-col items-center cursor-help">
            <svg width={size} height={size / 2 + 20} viewBox={`0 0 ${size} ${size / 2 + 20}`}>
              {/* Background arc (gray) */}
              <path
                d={describeArc(180, 360)}
                fill="none"
                stroke="hsl(var(--muted))"
                strokeWidth={strokeWidth}
                strokeLinecap="round"
              />

              {/* Filled arc up to current value */}
              {value > 0 && (
                <path
                  d={describeArc(180, Math.min(fillAngle, 360))}
                  fill="none"
                  stroke={color}
                  strokeWidth={strokeWidth}
                  strokeLinecap="round"
                />
              )}

              {/* Safety stock marker line */}
              <line
                x1={safetyStart.x}
                y1={safetyStart.y}
                x2={safetyEnd.x}
                y2={safetyEnd.y}
                stroke="hsl(var(--foreground))"
                strokeWidth={1.5}
                opacity={0.5}
              />

              {/* Needle */}
              <line
                x1={cx}
                y1={cy}
                x2={needleEnd.x}
                y2={needleEnd.y}
                stroke="hsl(var(--foreground))"
                strokeWidth={2}
                strokeLinecap="round"
              />

              {/* Center dot */}
              <circle cx={cx} cy={cy} r={3} fill="hsl(var(--foreground))" />

              {/* Percentage text */}
              <text
                x={cx}
                y={cy - 12}
                textAnchor="middle"
                fill={color}
                fontSize={16}
                fontWeight={800}
              >
                {pctDisplay}%
              </text>

              {/* Value text */}
              <text
                x={cx}
                y={cy + 14}
                textAnchor="middle"
                fill="currentColor"
                fontSize={9}
                opacity={0.6}
              >
                {value} {unit}
              </text>
            </svg>
            <span className="text-[10px] font-semibold text-muted-foreground -mt-1">{label}</span>
            <span className={`text-[9px] font-medium leading-tight ${smartText.className}`}>
              {smartText.text}
            </span>
          </div>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          <p className="text-xs">Baseado no estoque de segurança definido</p>
          <p className="text-xs text-muted-foreground">Meta por hub: {max} {unit}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

import { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

// Card de KPI dos dashboards (fiel ao Controle: src/components/board/KPICard.tsx).
interface KPICardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  trend?: { value: number; label: string };
  icon?: ReactNode;
  variant?: "default" | "success" | "warning" | "danger";
}

export function KPICard({ title, value, subtitle, trend, icon, variant = "default" }: KPICardProps) {
  const trendIcon = !trend ? null : trend.value > 0 ? <TrendingUp className="h-4 w-4" /> : trend.value < 0 ? <TrendingDown className="h-4 w-4" /> : <Minus className="h-4 w-4" />;
  const trendColor = !trend ? "" : trend.value > 0 ? "text-success" : trend.value < 0 ? "text-destructive" : "text-muted-foreground";
  const variantStyles = variant === "success" ? "border-l-4 border-l-success" : variant === "warning" ? "border-l-4 border-l-warning" : variant === "danger" ? "border-l-4 border-l-destructive" : "";

  return (
    <div className={cn("relative overflow-hidden rounded-xl bg-board-surface border border-border p-6 kpi-glow transition-all duration-200 hover:translate-y-[-2px]", variantStyles)}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-board-muted">{title}</p>
          <p className="mt-2 text-3xl font-bold text-board-text">{value}</p>
          {subtitle && <p className="mt-1 text-sm text-board-muted">{subtitle}</p>}
          {trend && (
            <div className={cn("mt-3 flex items-center gap-1.5 text-sm font-medium", trendColor)}>
              {trendIcon}
              <span>{trend.value > 0 ? "+" : ""}{trend.value}%</span>
              <span className="text-board-muted font-normal">{trend.label}</span>
            </div>
          )}
        </div>
        {icon && <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-board-navy/10 text-board-navy">{icon}</div>}
      </div>
    </div>
  );
}

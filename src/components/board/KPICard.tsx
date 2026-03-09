import { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

interface KPICardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  trend?: {
    value: number;
    label: string;
  };
  icon?: ReactNode;
  variant?: "default" | "success" | "warning" | "danger";
}

export function KPICard({ 
  title, 
  value, 
  subtitle, 
  trend, 
  icon,
  variant = "default" 
}: KPICardProps) {
  const getTrendIcon = () => {
    if (!trend) return null;
    if (trend.value > 0) return <TrendingUp className="h-4 w-4" />;
    if (trend.value < 0) return <TrendingDown className="h-4 w-4" />;
    return <Minus className="h-4 w-4" />;
  };

  const getTrendColor = () => {
    if (!trend) return "";
    if (trend.value > 0) return "text-success";
    if (trend.value < 0) return "text-destructive";
    return "text-muted-foreground";
  };

  const getVariantStyles = () => {
    switch (variant) {
      case "success":
        return "border-l-4 border-l-success";
      case "warning":
        return "border-l-4 border-l-warning";
      case "danger":
        return "border-l-4 border-l-destructive";
      default:
        return "";
    }
  };

  return (
    <div className={cn(
      "relative overflow-hidden rounded-xl bg-board-surface p-6 kpi-glow transition-all duration-200 hover:translate-y-[-2px]",
      getVariantStyles()
    )}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-board-muted">{title}</p>
          <p className="mt-2 text-3xl font-bold text-board-text">{value}</p>
          {subtitle && (
            <p className="mt-1 text-sm text-board-muted">{subtitle}</p>
          )}
          {trend && (
            <div className={cn("mt-3 flex items-center gap-1.5 text-sm font-medium", getTrendColor())}>
              {getTrendIcon()}
              <span>{trend.value > 0 ? "+" : ""}{trend.value}%</span>
              <span className="text-board-muted font-normal">{trend.label}</span>
            </div>
          )}
        </div>
        {icon && (
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-board-navy/10 text-board-navy">
            {icon}
          </div>
        )}
      </div>
    </div>
  );
}

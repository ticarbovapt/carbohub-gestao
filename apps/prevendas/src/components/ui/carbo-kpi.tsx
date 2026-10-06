import * as React from "react";
import { cn } from "@/lib/utils";
import { LucideIcon } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { MicroInteraction } from "@/components/animations/MicroInteraction";
import { useCountUp } from "@/hooks/useCountUp";

interface CarboKPIProps {
  title: string;
  value: string | number;
  icon?: LucideIcon;
  iconColor?: "green" | "blue" | "success" | "warning" | "destructive" | "muted";
  trend?: {
    value: number;
    label?: string;
    direction: "up" | "down" | "neutral";
  };
  loading?: boolean;
  highlight?: boolean;
  delay?: number;
  className?: string;
  onClick?: () => void;
  /** Animate numeric value on mount with count-up */
  animated?: boolean;
}

const iconColorMap = {
  green: "text-carbo-green bg-carbo-green/10",
  blue: "text-carbo-blue bg-carbo-blue/10",
  success: "text-success bg-success/10",
  warning: "text-warning bg-warning/10",
  destructive: "text-destructive bg-destructive/10",
  muted: "text-muted-foreground bg-muted",
};

/** Inner component that handles count-up — only called when value is numeric */
function AnimatedKPIValue({ value, prefix = "", suffix = "" }: { value: number; prefix?: string; suffix?: string }) {
  const display = useCountUp({ to: value, duration: 900, prefix, suffix });
  return <>{display}</>;
}

const CarboKPI = React.forwardRef<HTMLDivElement, CarboKPIProps>(
  (
    {
      title,
      value,
      icon: Icon,
      iconColor = "green",
      trend,
      loading,
      highlight,
      delay = 0,
      className,
      onClick,
      animated = true,
    },
    ref
  ) => {
    // Detect if value is numeric so we can animate it
    const numericValue = typeof value === "number" ? value : parseFloat(String(value).replace(/[^\d.-]/g, ""));
    const canAnimate = animated && !isNaN(numericValue) && typeof value === "number";

    return (
      <MicroInteraction type="pop" delay={delay}>
        <div
          ref={ref}
          className={cn(
            "rounded-xl border bg-card p-4 shadow-kpi kpi-glow",
            "transition-all duration-200 ease-out",
            "hover:shadow-card-hover hover:-translate-y-px",
            highlight && "border-l-4 border-l-carbo-green",
            onClick && "cursor-pointer hover:border-carbo-green/30 active:scale-[0.995] active:translate-y-0",
            className
          )}
          onClick={onClick}
        >
          <div className="flex items-center gap-3">
            {Icon && (
              <div
                className={cn(
                  "h-10 w-10 rounded-xl flex items-center justify-center shrink-0 transition-transform duration-200",
                  onClick && "group-hover:scale-110",
                  iconColorMap[iconColor]
                )}
              >
                <Icon className="h-5 w-5" />
              </div>
            )}
            <div className="min-w-0 flex-1">
              {loading ? (
                <>
                  <Skeleton className="h-8 w-20 mb-1" />
                  <Skeleton className="h-4 w-16" />
                </>
              ) : (
                <>
                  <p className="text-2xl font-bold text-foreground kpi-number truncate animate-count-up">
                    {canAnimate ? (
                      <AnimatedKPIValue value={numericValue} />
                    ) : (
                      value
                    )}
                  </p>
                  <div className="flex items-center gap-2">
                    <p className="text-xs text-muted-foreground truncate">{title}</p>
                    {trend && (
                      <span
                        className={cn(
                          "text-xs font-medium",
                          trend.direction === "up" && "text-success",
                          trend.direction === "down" && "text-destructive",
                          trend.direction === "neutral" && "text-muted-foreground"
                        )}
                      >
                        {trend.direction === "up" && "↑"}
                        {trend.direction === "down" && "↓"}
                        {trend.value}%
                      </span>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </MicroInteraction>
    );
  }
);
CarboKPI.displayName = "CarboKPI";

export { CarboKPI };


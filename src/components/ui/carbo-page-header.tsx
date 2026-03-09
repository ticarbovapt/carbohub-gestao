import * as React from "react";
import { cn } from "@/lib/utils";
import { LucideIcon } from "lucide-react";

interface CarboPageHeaderProps {
  title: string;
  description?: string;
  icon?: LucideIcon;
  iconColor?: "green" | "blue" | "gradient";
  actions?: React.ReactNode;
  className?: string;
}

const CarboPageHeader = React.forwardRef<HTMLDivElement, CarboPageHeaderProps>(
  ({ title, description, icon: Icon, iconColor = "gradient", actions, className }, ref) => {
    return (
      <div
        ref={ref}
        className={cn("flex flex-col md:flex-row md:items-center justify-between gap-4", className)}
      >
        <div className="flex items-center gap-3">
          {Icon && (
            <div
              className={cn(
                "h-10 w-10 rounded-xl flex items-center justify-center shrink-0",
                iconColor === "green" && "bg-carbo-green/10",
                iconColor === "blue" && "bg-carbo-blue/10",
                iconColor === "gradient" && "bg-gradient-to-br from-carbo-green/20 to-carbo-blue/20"
              )}
            >
              <Icon
                className={cn(
                  "h-5 w-5",
                  iconColor === "green" && "text-carbo-green",
                  iconColor === "blue" && "text-carbo-blue",
                  iconColor === "gradient" && "text-carbo-green"
                )}
              />
            </div>
          )}
          <div>
            <h1 className="text-2xl font-bold text-foreground font-plex">
              {title}
            </h1>
            {description && (
              <p className="text-muted-foreground text-sm">{description}</p>
            )}
          </div>
        </div>

        {actions && (
          <div className="flex items-center gap-3">{actions}</div>
        )}
      </div>
    );
  }
);
CarboPageHeader.displayName = "CarboPageHeader";

export { CarboPageHeader };

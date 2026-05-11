import * as React from "react";
import { cn } from "@/lib/utils";
import { LucideIcon, Inbox } from "lucide-react";
import { CarboButton } from "./carbo-button";

interface CarboEmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  className?: string;
  children?: React.ReactNode;
}

const CarboEmptyState = React.forwardRef<HTMLDivElement, CarboEmptyStateProps>(
  ({ icon: Icon = Inbox, title, description, action, className, children }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          "flex flex-col items-center justify-center py-12 px-6 text-center",
          className
        )}
      >
        <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-carbo-green/10 to-carbo-blue/10 flex items-center justify-center mb-4">
          <Icon className="h-8 w-8 text-muted-foreground" />
        </div>
        <h3 className="text-lg font-semibold text-foreground mb-1">{title}</h3>
        {description && (
          <p className="text-sm text-muted-foreground max-w-sm mb-4">
            {description}
          </p>
        )}
        {(action || children) && (
          <div className="flex flex-wrap items-center justify-center gap-2 mt-1">
            {action && (
              <CarboButton onClick={action.onClick} size="sm">
                {action.label}
              </CarboButton>
            )}
            {children}
          </div>
        )}
      </div>
    );
  }
);
CarboEmptyState.displayName = "CarboEmptyState";

export { CarboEmptyState };

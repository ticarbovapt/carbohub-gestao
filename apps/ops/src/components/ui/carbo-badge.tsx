import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const carboBadgeVariants = cva(
  "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default: "bg-carbo-green/10 text-carbo-green border border-carbo-green/20",
        secondary: "bg-secondary text-secondary-foreground border border-border",
        success: "bg-success/10 text-success border border-success/20",
        warning: "bg-warning/10 text-warning-foreground border border-warning/20",
        destructive: "bg-destructive/10 text-destructive border border-destructive/20",
        info: "bg-carbo-blue/10 text-carbo-blue border border-carbo-blue/20",
        outline: "bg-transparent border border-border text-muted-foreground",
        gradient: "bg-gradient-to-r from-carbo-green/10 to-carbo-blue/10 text-foreground border border-carbo-green/20",
        // Status badges
        draft: "bg-muted text-muted-foreground border border-border",
        active: "bg-carbo-blue/10 text-carbo-blue border border-carbo-blue/20",
        paused: "bg-warning/10 text-warning-foreground border border-warning/20",
        completed: "bg-success/10 text-success border border-success/20",
        cancelled: "bg-destructive/10 text-destructive border border-destructive/20",
        // Priority badges
        urgent: "bg-destructive text-destructive-foreground animate-pulse",
        high: "bg-destructive/10 text-destructive border border-destructive/20",
        medium: "bg-warning/10 text-warning-foreground border border-warning/20",
        low: "bg-muted text-muted-foreground border border-border",
      },
      size: {
        sm: "px-2 py-0.5 text-[10px]",
        default: "px-2.5 py-0.5 text-xs",
        lg: "px-3 py-1 text-sm",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface CarboBadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof carboBadgeVariants> {
  dot?: boolean;
  dotColor?: string;
}

const CarboBadge = React.forwardRef<HTMLDivElement, CarboBadgeProps>(
  ({ className, variant, size, dot, dotColor, children, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(carboBadgeVariants({ variant, size }), className)}
      {...props}
    >
      {dot && (
        <span
          className={cn(
            "mr-1.5 h-1.5 w-1.5 rounded-full",
            dotColor || "bg-current"
          )}
        />
      )}
      {children}
    </div>
  )
);
CarboBadge.displayName = "CarboBadge";

export { CarboBadge, carboBadgeVariants };

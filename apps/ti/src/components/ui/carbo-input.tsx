import * as React from "react";
import { cn } from "@/lib/utils";
import { LucideIcon, Search } from "lucide-react";

export interface CarboInputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  icon?: LucideIcon;
  iconPosition?: "left" | "right";
  error?: boolean;
  hint?: string;
}

const CarboInput = React.forwardRef<HTMLInputElement, CarboInputProps>(
  ({ className, type, icon: Icon, iconPosition = "left", error, hint, ...props }, ref) => {
    return (
      <div className="relative w-full">
        {Icon && iconPosition === "left" && (
          <Icon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        )}
        <input
          type={type}
          className={cn(
            "flex h-11 w-full rounded-xl border bg-background px-4 py-2 text-sm",
            "transition-all duration-150 ease-out",
            "placeholder:text-muted-foreground/60",
            "focus:outline-none focus:ring-2 focus:ring-carbo-green/25 focus:border-carbo-green focus:shadow-board",
            "hover:border-muted-foreground/40",
            "disabled:cursor-not-allowed disabled:opacity-50",
            error
              ? "border-destructive focus:ring-destructive/30 focus:border-destructive"
              : "border-input",
            Icon && iconPosition === "left" && "pl-10",
            Icon && iconPosition === "right" && "pr-10",
            className
          )}
          ref={ref}
          {...props}
        />
        {Icon && iconPosition === "right" && (
          <Icon className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        )}
        {hint && (
          <p className={cn(
            "mt-1.5 text-xs",
            error ? "text-destructive" : "text-muted-foreground"
          )}>
            {hint}
          </p>
        )}
      </div>
    );
  }
);
CarboInput.displayName = "CarboInput";

// Search Input variant
const CarboSearchInput = React.forwardRef<
  HTMLInputElement,
  Omit<CarboInputProps, "icon" | "iconPosition">
>(({ className, placeholder = "Buscar...", ...props }, ref) => (
  <CarboInput
    ref={ref}
    icon={Search}
    iconPosition="left"
    placeholder={placeholder}
    className={className}
    {...props}
  />
));
CarboSearchInput.displayName = "CarboSearchInput";

export { CarboInput, CarboSearchInput };

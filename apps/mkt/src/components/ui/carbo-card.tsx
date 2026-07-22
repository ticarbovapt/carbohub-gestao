import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const carboCardVariants = cva(
  "rounded-xl border bg-card text-card-foreground transition-all duration-200 ease-out",
  {
    variants: {
      variant: {
        default: "border-border shadow-board hover:shadow-card-hover hover:-translate-y-px",
        elevated: "border-border shadow-board-lg hover:shadow-board-xl hover:-translate-y-0.5",
        glass: "border-white/10 bg-white/80 backdrop-blur-md shadow-board-lg hover:shadow-card-hover",
        gradient: "border-carbo-green/20 bg-gradient-to-br from-carbo-green/5 to-carbo-blue/5 hover:from-carbo-green/8 hover:to-carbo-blue/8",
        interactive: "border-border shadow-board hover:border-carbo-green/40 hover:shadow-carbo cursor-pointer hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.995]",
        kpi: "border-border shadow-kpi kpi-glow hover:shadow-card-hover hover:-translate-y-px",
        highlight: "border-l-4 border-l-carbo-green border-t border-r border-b shadow-board hover:shadow-board-lg",
      },
      padding: {
        none: "",
        sm: "p-4",
        default: "p-6",
        lg: "p-8",
      },
    },
    defaultVariants: {
      variant: "default",
      padding: "default",
    },
  }
);

export interface CarboCardProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof carboCardVariants> {}

const CarboCard = React.forwardRef<HTMLDivElement, CarboCardProps>(
  ({ className, variant, padding, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(carboCardVariants({ variant, padding, className }))}
      {...props}
    />
  )
);
CarboCard.displayName = "CarboCard";

const CarboCardHeader = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex flex-col space-y-1.5 pb-4", className)}
    {...props}
  />
));
CarboCardHeader.displayName = "CarboCardHeader";

const CarboCardTitle = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h3
    ref={ref}
    className={cn("text-lg font-semibold font-plex leading-none tracking-tight text-foreground", className)}
    {...props}
  />
));
CarboCardTitle.displayName = "CarboCardTitle";

const CarboCardDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
));
CarboCardDescription.displayName = "CarboCardDescription";

const CarboCardContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("", className)} {...props} />
));
CarboCardContent.displayName = "CarboCardContent";

const CarboCardFooter = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex items-center pt-4 border-t border-border", className)}
    {...props}
  />
));
CarboCardFooter.displayName = "CarboCardFooter";

export {
  CarboCard,
  CarboCardHeader,
  CarboCardFooter,
  CarboCardTitle,
  CarboCardDescription,
  CarboCardContent,
  carboCardVariants,
};

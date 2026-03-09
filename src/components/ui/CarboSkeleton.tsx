import { cn } from "@/lib/utils";

interface CarboSkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "card" | "text" | "circle" | "button";
}

export function CarboSkeleton({ 
  className, 
  variant = "default",
  ...props 
}: CarboSkeletonProps) {
  const variantClasses = {
    default: "h-4 w-full",
    card: "h-32 w-full rounded-xl",
    text: "h-4 w-3/4",
    circle: "h-12 w-12 rounded-full",
    button: "h-10 w-24 rounded-lg",
  };

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-md bg-muted",
        "before:absolute before:inset-0 before:-translate-x-full",
        "before:animate-[shimmer_2s_infinite]",
        "before:bg-gradient-to-r before:from-transparent before:via-white/20 before:to-transparent",
        variantClasses[variant],
        className
      )}
      {...props}
    />
  );
}

export function CarboSkeletonCard() {
  return (
    <div className="rounded-xl border border-border bg-card p-6 space-y-4 shadow-sm">
      <div className="flex items-center gap-4">
        <CarboSkeleton variant="circle" />
        <div className="flex-1 space-y-2">
          <CarboSkeleton className="h-4 w-1/2" />
          <CarboSkeleton className="h-3 w-1/3" />
        </div>
      </div>
      <CarboSkeleton className="h-20 w-full rounded-lg" />
      <div className="flex justify-between">
        <CarboSkeleton variant="button" />
        <CarboSkeleton variant="button" />
      </div>
    </div>
  );
}

export function CarboSkeletonKPI() {
  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-3 shadow-sm">
      <div className="flex items-center justify-between">
        <CarboSkeleton className="h-4 w-24" />
        <CarboSkeleton variant="circle" className="h-8 w-8" />
      </div>
      <CarboSkeleton className="h-8 w-20" />
      <CarboSkeleton className="h-3 w-16" />
    </div>
  );
}

export function CarboSkeletonTable() {
  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      {/* Header */}
      <div className="flex gap-4 p-4 border-b border-border bg-muted/50">
        <CarboSkeleton className="h-4 w-1/4" />
        <CarboSkeleton className="h-4 w-1/4" />
        <CarboSkeleton className="h-4 w-1/4" />
        <CarboSkeleton className="h-4 w-1/4" />
      </div>
      {/* Rows */}
      {[...Array(5)].map((_, i) => (
        <div key={i} className="flex gap-4 p-4 border-b border-border last:border-0">
          <CarboSkeleton className="h-4 w-1/4" />
          <CarboSkeleton className="h-4 w-1/4" />
          <CarboSkeleton className="h-4 w-1/4" />
          <CarboSkeleton className="h-4 w-1/4" />
        </div>
      ))}
    </div>
  );
}

export function CarboSkeletonList() {
  return (
    <div className="space-y-3">
      {[...Array(4)].map((_, i) => (
        <div key={i} className="flex items-center gap-4 p-4 rounded-xl border border-border bg-card">
          <CarboSkeleton variant="circle" />
          <div className="flex-1 space-y-2">
            <CarboSkeleton className="h-4 w-2/3" />
            <CarboSkeleton className="h-3 w-1/2" />
          </div>
          <CarboSkeleton variant="button" className="w-16" />
        </div>
      ))}
    </div>
  );
}

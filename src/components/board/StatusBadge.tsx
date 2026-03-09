import { cn } from "@/lib/utils";

interface StatusBadgeProps {
  status: "completed" | "pending" | "overdue" | "in-progress";
  label?: string;
}

const statusConfig = {
  completed: {
    label: "Completo",
    className: "bg-success/10 text-success border-success/20",
  },
  pending: {
    label: "Pendente",
    className: "bg-warning/10 text-warning border-warning/20",
  },
  overdue: {
    label: "Atrasado",
    className: "bg-destructive/10 text-destructive border-destructive/20",
  },
  "in-progress": {
    label: "Em andamento",
    className: "bg-accent/20 text-accent-foreground border-accent/30",
  },
};

export function StatusBadge({ status, label }: StatusBadgeProps) {
  const config = statusConfig[status];
  
  return (
    <span className={cn(
      "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium",
      config.className
    )}>
      {label || config.label}
    </span>
  );
}

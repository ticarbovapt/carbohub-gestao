import { useState } from "react";
import { ChevronDown, Check } from "lucide-react";
import { useDepartment } from "@/contexts/DepartmentContext";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";

interface DepartmentSelectorProps {
  variant?: "header" | "standalone";
  className?: string;
}

export function DepartmentSelector({ variant = "header", className }: DepartmentSelectorProps) {
  const { currentDepartment, setDepartment, departments } = useDepartment();
  const [open, setOpen] = useState(false);

  if (variant === "standalone") {
    return (
      <div className={cn("grid grid-cols-2 gap-4", className)}>
        {departments.map((dept) => (
          <button
            key={dept.id}
            onClick={() => setDepartment(dept.id)}
            className={cn(
              "flex flex-col items-center gap-3 p-6 rounded-2xl border-2 transition-all duration-200 ops-press",
              currentDepartment?.id === dept.id
                ? "border-primary bg-primary/5 shadow-lg scale-[1.02]"
                : "border-border bg-card hover:border-primary/50 hover:bg-primary/5"
            )}
          >
            <span className="text-4xl">{dept.icon}</span>
            <span className="font-semibold text-foreground">{dept.name}</span>
            <span className="text-xs text-muted-foreground text-center">{dept.description}</span>
            {currentDepartment?.id === dept.id && (
              <div className="absolute top-2 right-2 w-6 h-6 rounded-full bg-primary flex items-center justify-center">
                <Check className="w-4 h-4 text-primary-foreground" />
              </div>
            )}
          </button>
        ))}
      </div>
    );
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className={cn(
            "flex items-center gap-2 px-3 py-2 h-auto",
            className
          )}
        >
          {currentDepartment ? (
            <>
              <span className="text-lg">{currentDepartment.icon}</span>
              <span className="font-medium">{currentDepartment.name}</span>
            </>
          ) : (
            <span className="text-muted-foreground">Selecionar Depto</span>
          )}
          <ChevronDown className={cn(
            "h-4 w-4 transition-transform",
            open && "rotate-180"
          )} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        {departments.map((dept) => (
          <DropdownMenuItem
            key={dept.id}
            onClick={() => {
              setDepartment(dept.id);
              setOpen(false);
            }}
            className={cn(
              "flex items-center gap-3 py-3 cursor-pointer",
              currentDepartment?.id === dept.id && "bg-primary/10"
            )}
          >
            <span className="text-xl">{dept.icon}</span>
            <div className="flex-1">
              <p className="font-medium">{dept.name}</p>
              <p className="text-xs text-muted-foreground">{dept.description}</p>
            </div>
            {currentDepartment?.id === dept.id && (
              <Check className="h-4 w-4 text-primary" />
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

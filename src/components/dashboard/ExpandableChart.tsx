import { useState, type ReactNode } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Maximize2 } from "lucide-react";

interface ExpandableChartProps {
  title: string;
  subtitle?: ReactNode;
  /** Conteúdo de filtros mostrado no popup (ex: <DashboardFilterBar/>). */
  filters?: ReactNode;
  /** O gráfico (ResponsiveContainer). É renderizado inline e, ampliado, no popup. */
  children: ReactNode;
  className?: string;
}

/**
 * Envolve um gráfico adicionando um botão de "expandir" no canto.
 * Ao clicar, abre um popup com o mesmo gráfico ampliado + filtros.
 * Reutilizável em qualquer dashboard.
 */
export function ExpandableChart({ title, subtitle, filters, children, className }: ExpandableChartProps) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <div className={`relative ${className ?? ""}`}>
        <button
          type="button"
          onClick={() => setOpen(true)}
          title="Expandir gráfico"
          className="absolute right-1 top-1 z-10 p-1.5 rounded-lg text-board-muted hover:text-foreground hover:bg-muted/60 transition-colors"
        >
          <Maximize2 className="h-3.5 w-3.5" />
        </button>
        {children}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-[96vw] w-[1100px] max-h-[94vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            {subtitle && <DialogDescription>{subtitle}</DialogDescription>}
          </DialogHeader>
          {filters && <div className="mb-3 flex flex-wrap gap-2">{filters}</div>}
          {/* Força o gráfico do popup a ocupar bastante altura. */}
          <div className="[&_.recharts-responsive-container]:!h-[60vh] [&_.recharts-responsive-container]:!min-h-[380px]">
            {children}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

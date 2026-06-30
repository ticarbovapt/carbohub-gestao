import { useState, isValidElement, cloneElement, type ReactNode, type ReactElement } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Maximize2 } from "lucide-react";

interface ExpandableChartProps {
  title: string;
  subtitle?: ReactNode;
  /** Conteúdo de filtros mostrado no popup (ex: <DashboardFilterBar/>). */
  filters?: ReactNode;
  /** O gráfico (idealmente um <ResponsiveContainer>). Renderizado inline e, ampliado, no popup. */
  children: ReactNode;
  className?: string;
}

/**
 * Envolve um gráfico adicionando um botão de "expandir" no canto.
 * Ao clicar, abre um popup LARGO com o mesmo gráfico ampliado + filtros.
 *
 * Como o ResponsiveContainer só torna a LARGURA responsiva (altura fica fixa
 * pela prop `height`), no popup clonamos o gráfico forçando `height="100%"`
 * dentro de um container alto — assim ele realmente cresce.
 */
export function ExpandableChart({ title, subtitle, filters, children, className }: ExpandableChartProps) {
  const [open, setOpen] = useState(false);

  // Gráfico ampliado: força height="100%" no ResponsiveContainer (raiz do children).
  const bigChart = isValidElement(children)
    ? cloneElement(children as ReactElement<any>, { height: "100%" })
    : children;

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
        {/* Largura forçada por style inline (vence a classe base max-w-lg do Dialog) */}
        <DialogContent
          className="max-h-[95vh] overflow-y-auto"
          style={{ width: "min(1500px, 96vw)", maxWidth: "96vw" }}
        >
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            {subtitle && <DialogDescription>{subtitle}</DialogDescription>}
          </DialogHeader>
          {filters && <div className="mb-3 flex flex-wrap gap-2">{filters}</div>}
          <div style={{ height: "70vh", minHeight: 440, width: "100%" }}>
            {bigChart}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

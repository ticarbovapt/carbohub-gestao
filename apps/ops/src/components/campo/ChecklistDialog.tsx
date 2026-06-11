// ⚠️ Form em port visual — campos MOCK; submit liga na fase de lógica.
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { CarboBadge } from "@/components/ui/carbo-badge";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

interface Etapa { nome: string; concluida: boolean; }

interface ChecklistDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  nome: string;
  etapas: Etapa[];
}

export function ChecklistDialog({ open, onOpenChange, nome, etapas }: ChecklistDialogProps) {
  const done = etapas.filter((e) => e.concluida).length;
  const total = etapas.length;
  const pct = total ? Math.round((done / total) * 100) : 0;
  const completo = total > 0 && done === total;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100%-2rem)] sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Checklist — {nome}</DialogTitle>
          <DialogDescription>Etapas do checklist operacional (visualização).</DialogDescription>
        </DialogHeader>

        {/* Progresso */}
        <div className="space-y-1.5 pt-1">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{done}/{total} etapas concluídas</span>
            <CarboBadge variant={completo ? "success" : "warning"} size="sm">{pct}%</CarboBadge>
          </div>
          <div className="h-1.5 rounded-full bg-muted overflow-hidden">
            <div
              className={cn("h-full rounded-full transition-all", completo ? "bg-success" : "bg-carbo-green")}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>

        {/* Etapas */}
        <div className="max-h-[50vh] overflow-y-auto space-y-2 py-2 border rounded-lg px-3">
          {etapas.map((e, i) => (
            <label key={i} className="flex items-start gap-2.5 cursor-default py-1">
              <Checkbox checked={e.concluida} className="mt-0.5 pointer-events-none" />
              <span className={cn("text-sm leading-snug", e.concluida && "line-through text-muted-foreground")}>
                {e.nome}
              </span>
            </label>
          ))}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

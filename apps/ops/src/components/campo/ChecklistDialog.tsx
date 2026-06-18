import { useEffect, useState } from "react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { CarboBadge } from "@/components/ui/carbo-badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useChecklistMutations, type Checklist, type Etapa } from "@/hooks/useChecklists";

interface ChecklistDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  checklist: Checklist | null;
}

export function ChecklistDialog({ open, onOpenChange, checklist }: ChecklistDialogProps) {
  const { saveEtapas } = useChecklistMutations();
  const [etapas, setEtapas] = useState<Etapa[]>([]);

  useEffect(() => {
    setEtapas(checklist?.etapas ?? []);
  }, [checklist?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const done = etapas.filter((e) => e.concluida).length;
  const total = etapas.length;
  const pct = total ? Math.round((done / total) * 100) : 0;
  const completo = total > 0 && done === total;
  const toggle = (i: number) => setEtapas((arr) => arr.map((e, idx) => (idx === i ? { ...e, concluida: !e.concluida } : e)));

  const handleSave = async () => {
    if (!checklist) return;
    try {
      await saveEtapas.mutateAsync({ id: checklist.id, etapas });
      toast.success("Checklist atualizado.");
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível salvar o checklist.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100%-2rem)] sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Checklist — {checklist?.nome ?? ""}</DialogTitle>
          <DialogDescription>Marque as etapas concluídas e salve.</DialogDescription>
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
            <label key={i} className="flex items-start gap-2.5 cursor-pointer py-1">
              <Checkbox checked={e.concluida} onCheckedChange={() => toggle(i)} className="mt-0.5" />
              <span className={cn("text-sm leading-snug", e.concluida && "line-through text-muted-foreground")}>
                {e.nome}
              </span>
            </label>
          ))}
          {etapas.length === 0 && <p className="text-sm text-muted-foreground py-2">Nenhuma etapa.</p>}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saveEtapas.isPending}>Cancelar</Button>
          <Button type="button" onClick={handleSave} disabled={saveEtapas.isPending}>
            {saveEtapas.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Salvando…</> : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

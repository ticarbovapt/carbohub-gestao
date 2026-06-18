import { useState } from "react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useChecklistMutations } from "@/hooks/useChecklists";

const DEPARTAMENTOS = [
  { key: "preparacao", label: "Preparação" },
  { key: "operacao", label: "Operação" },
  { key: "expedicao", label: "Expedição" },
  { key: "pos_venda", label: "Pós-Venda" },
];

export function ChecklistFormDialog({ open, onOpenChange, defaultDepartamento }: { open: boolean; onOpenChange: (v: boolean) => void; defaultDepartamento?: string }) {
  const { create } = useChecklistMutations();
  const [nome, setNome] = useState("");
  const [departamento, setDepartamento] = useState(defaultDepartamento ?? "preparacao");
  const [etapas, setEtapas] = useState<string[]>([""]);

  const reset = () => { setNome(""); setDepartamento(defaultDepartamento ?? "preparacao"); setEtapas([""]); };
  const close = (v: boolean) => { if (!v) reset(); onOpenChange(v); };

  const setEtapa = (i: number, v: string) => setEtapas((arr) => arr.map((e, idx) => (idx === i ? v : e)));
  const addEtapa = () => setEtapas((arr) => [...arr, ""]);
  const removeEtapa = (i: number) => setEtapas((arr) => arr.filter((_, idx) => idx !== i));

  const handleSubmit = async () => {
    try {
      await create.mutateAsync({ nome, departamento, etapas });
      toast.success("Checklist criado.");
      reset();
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível criar o checklist.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="w-[calc(100%-2rem)] sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Novo Checklist</DialogTitle>
          <DialogDescription>Defina o nome, o departamento e as etapas.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Nome *</Label>
            <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Conferência de expedição" />
          </div>
          <div className="space-y-2">
            <Label>Departamento *</Label>
            <Select value={departamento} onValueChange={setDepartamento}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {DEPARTAMENTOS.map((d) => <SelectItem key={d.key} value={d.key}>{d.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Etapas *</Label>
              <Button type="button" variant="outline" size="sm" onClick={addEtapa} className="gap-1"><Plus className="h-3.5 w-3.5" /> Etapa</Button>
            </div>
            <div className="space-y-2">
              {etapas.map((e, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input value={e} onChange={(ev) => setEtapa(i, ev.target.value)} placeholder={`Etapa ${i + 1}`} />
                  {etapas.length > 1 && (
                    <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-destructive shrink-0" onClick={() => removeEtapa(i)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={create.isPending}>Cancelar</Button>
          <Button type="button" onClick={handleSubmit} disabled={create.isPending}>
            {create.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Criando…</> : "Criar Checklist"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

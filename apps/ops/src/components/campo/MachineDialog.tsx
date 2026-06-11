// ⚠️ Form em port visual — campos MOCK; submit liga na fase de lógica.
import { useState } from "react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { DatePickerInput } from "@/components/ui/date-picker-input";
import { toast } from "sonner";

// Selects MOCK
const LICENCIADOS = ["Licenciado Natal", "Licenciado Recife", "Licenciado Fortaleza", "Licenciado SP"];
const STATUS = [
  { value: "operational", label: "Operacional" },
  { value: "maintenance", label: "Manutenção" },
  { value: "offline", label: "Offline" },
  { value: "retired", label: "Aposentada" },
];

export interface MachineDialogValues {
  modelo?: string;
  serie?: string;
  licenciado?: string;
  instalacao?: string;
  status?: string;
}

interface MachineDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "create" | "edit";
  initial?: MachineDialogValues;
}

export function MachineDialog({ open, onOpenChange, mode, initial }: MachineDialogProps) {
  const [instalacao, setInstalacao] = useState(initial?.instalacao ?? "");

  const handleOpenChange = (isOpen: boolean) => {
    onOpenChange(isOpen);
    if (!isOpen) setTimeout(() => setInstalacao(initial?.instalacao ?? ""), 200);
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    toast.info("Disponível na fase de lógica");
    handleOpenChange(false);
  };

  const isEdit = mode === "edit";

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="w-[calc(100%-2rem)] sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Editar Máquina" : "Nova Máquina"}</DialogTitle>
          <DialogDescription>
            {isEdit ? "Atualize os dados da máquina" : "Cadastre uma nova máquina na rede"}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="modelo">Modelo *</Label>
            <Input id="modelo" placeholder="Ex: CarboVAPT Pro" defaultValue={initial?.modelo} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="serie">Número de série</Label>
            <Input id="serie" placeholder="S/N" className="font-mono" defaultValue={initial?.serie} />
          </div>

          <div className="space-y-1.5">
            <Label>Licenciado / Cliente</Label>
            <Select defaultValue={initial?.licenciado}>
              <SelectTrigger><SelectValue placeholder="Selecione o licenciado" /></SelectTrigger>
              <SelectContent>
                {LICENCIADOS.map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Data de instalação</Label>
              <DatePickerInput value={instalacao} onChange={setInstalacao} placeholder="Selecione a data" />
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select defaultValue={initial?.status ?? "operational"}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {STATUS.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>Cancelar</Button>
            <Button type="submit">{isEdit ? "Salvar alterações" : "Criar Máquina"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

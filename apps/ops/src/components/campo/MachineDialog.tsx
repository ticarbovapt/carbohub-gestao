import { useEffect, useState } from "react";
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
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useLicensees, useMachineMutations, type MachineStatus } from "@/hooks/useMachines";

const STATUS = [
  { value: "operational", label: "Operacional" },
  { value: "maintenance", label: "Manutenção" },
  { value: "offline", label: "Offline" },
  { value: "retired", label: "Aposentada" },
];
const NO_LICENSEE = "__none__";

export interface MachineDialogValues {
  id?: string;
  codigo?: string;
  modelo?: string;
  serie?: string;
  licenseeId?: string | null;
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
  const { data: licensees = [] } = useLicensees();
  const { create, update } = useMachineMutations();

  const [codigo, setCodigo] = useState("");
  const [modelo, setModelo] = useState("");
  const [serie, setSerie] = useState("");
  const [licenseeId, setLicenseeId] = useState<string>(NO_LICENSEE);
  const [instalacao, setInstalacao] = useState("");
  const [status, setStatus] = useState<string>("operational");

  useEffect(() => {
    if (!open) return;
    setCodigo(initial?.codigo ?? "");
    setModelo(initial?.modelo ?? "");
    setSerie(initial?.serie ?? "");
    setLicenseeId(initial?.licenseeId ?? NO_LICENSEE);
    setInstalacao(initial?.instalacao ?? "");
    setStatus(initial?.status ?? "operational");
  }, [open, initial]);

  const isEdit = mode === "edit";
  const pending = create.isPending || update.isPending;

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const payload = {
      machine_id: codigo,
      model: modelo,
      serial_number: serie,
      licensee_id: licenseeId === NO_LICENSEE ? null : licenseeId,
      installation_date: instalacao || null,
      status: status as MachineStatus,
    };
    try {
      if (isEdit && initial?.id) await update.mutateAsync({ id: initial.id, ...payload });
      else await create.mutateAsync(payload);
      toast.success(isEdit ? "Máquina atualizada." : "Máquina criada.");
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível salvar a máquina.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100%-2rem)] sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Editar Máquina" : "Nova Máquina"}</DialogTitle>
          <DialogDescription>
            {isEdit ? "Atualize os dados da máquina" : "Cadastre uma nova máquina na rede"}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="codigo">Código *</Label>
              <Input id="codigo" placeholder="MCH-00001" className="font-mono" value={codigo} onChange={(e) => setCodigo(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="modelo">Modelo *</Label>
              <Input id="modelo" placeholder="Ex: CarboVAPT Pro" value={modelo} onChange={(e) => setModelo(e.target.value)} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="serie">Número de série</Label>
            <Input id="serie" placeholder="S/N" className="font-mono" value={serie} onChange={(e) => setSerie(e.target.value)} />
          </div>

          <div className="space-y-1.5">
            <Label>Licenciado / Cliente</Label>
            <Select value={licenseeId} onValueChange={setLicenseeId}>
              <SelectTrigger><SelectValue placeholder="Selecione o licenciado" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_LICENSEE}>— Sem licenciado —</SelectItem>
                {licensees.map((l) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
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
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {STATUS.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>Cancelar</Button>
            <Button type="submit" disabled={pending}>
              {pending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Salvando…</> : (isEdit ? "Salvar alterações" : "Criar Máquina")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

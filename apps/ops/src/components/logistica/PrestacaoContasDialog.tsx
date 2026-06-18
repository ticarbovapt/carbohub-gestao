import { useEffect, useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Receipt, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useViagemMutations, type Viagem, type PcStatus } from "@/hooks/useViagens";

const PC_OPTIONS: { value: PcStatus; label: string }[] = [
  { value: "aberta", label: "Em preenchimento" },
  { value: "enviada", label: "Enviada para aprovação" },
  { value: "aprovada", label: "Aprovada" },
  { value: "reprovada", label: "Reprovada" },
  { value: "encerrada", label: "Encerrada" },
];

export function PrestacaoContasDialog({ open, onOpenChange, viagem }: { open: boolean; onOpenChange: (v: boolean) => void; viagem: Viagem | null }) {
  const { savePC } = useViagemMutations();
  const [pcStatus, setPcStatus] = useState<PcStatus>("aberta");
  const [pcTotal, setPcTotal] = useState("");
  const [pcNotas, setPcNotas] = useState("");

  useEffect(() => {
    setPcStatus((viagem?.pc_status as PcStatus) ?? "aberta");
    setPcTotal(viagem ? String(viagem.pc_total ?? 0) : "");
    setPcNotas(viagem?.pc_notas ?? "");
  }, [viagem?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSave = async () => {
    if (!viagem) return;
    try {
      await savePC.mutateAsync({ id: viagem.id, pcStatus, pcTotal: Number(pcTotal) || 0, pcNotas });
      toast.success("Prestação de contas salva.");
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível salvar a prestação de contas.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Receipt className="h-4 w-4" /> Prestação de Contas</DialogTitle>
          <DialogDescription>{viagem ? `${viagem.destino} — ${viagem.solicitante}` : ""}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Total comprovado (R$)</Label>
            <Input type="number" min={0} step={0.01} value={pcTotal} onChange={(e) => setPcTotal(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Status</Label>
            <Select value={pcStatus} onValueChange={(v) => setPcStatus(v as PcStatus)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {PC_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Observações</Label>
            <Textarea rows={3} value={pcNotas} onChange={(e) => setPcNotas(e.target.value)} placeholder="Detalhe os gastos comprovados..." />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={savePC.isPending}>Cancelar</Button>
          <Button onClick={handleSave} disabled={savePC.isPending}>
            {savePC.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Salvando…</> : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// TODO: ligar em viagens (Supabase)
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DatePickerInput } from "@/components/ui/date-picker-input";
import { Plane, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useViagemMutations } from "@/hooks/useViagens";

interface SolicitacaoViagemDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const CENTROS_CUSTO = [
  "Comercial — Prospecção",
  "Comercial — Pós-venda",
  "Operações — Logística",
  "Operações — Manutenção",
  "Treinamento PDV",
  "Diretoria",
];

export function SolicitacaoViagemDialog({ open, onOpenChange }: SolicitacaoViagemDialogProps) {
  const { create } = useViagemMutations();
  const [solicitante, setSolicitante] = useState("");
  const [destino, setDestino] = useState("");
  const [ida, setIda] = useState("");
  const [volta, setVolta] = useState("");
  const [centroCusto, setCentroCusto] = useState("");
  const [valor, setValor] = useState("");
  const [motivo, setMotivo] = useState("");

  const reset = () => { setSolicitante(""); setDestino(""); setIda(""); setVolta(""); setCentroCusto(""); setValor(""); setMotivo(""); };

  const handleSubmit = async () => {
    try {
      await create.mutateAsync({
        solicitante, destino, objetivo: motivo, centroCusto,
        dataIda: ida, dataVolta: volta, valorEstimado: Number(valor) || 0,
      });
      toast.success("Solicitação de viagem enviada.");
      reset();
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível enviar a solicitação.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plane className="h-4 w-4" /> Nova Solicitação de Viagem
          </DialogTitle>
          <DialogDescription>
            Preencha os dados da viagem corporativa para aprovação.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Solicitante</Label>
            <Input value={solicitante} onChange={(e) => setSolicitante(e.target.value)} />
          </div>

          <div className="space-y-1.5">
            <Label>Destino</Label>
            <Input
              placeholder="Cidade/UF"
              value={destino}
              onChange={(e) => setDestino(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Data de ida</Label>
              <DatePickerInput value={ida} onChange={setIda} disablePast />
            </div>
            <div className="space-y-1.5">
              <Label>Data de volta</Label>
              <DatePickerInput value={volta} onChange={setVolta} disablePast />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Centro de custo</Label>
            <Select value={centroCusto} onValueChange={setCentroCusto}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione o centro de custo" />
              </SelectTrigger>
              <SelectContent>
                {CENTROS_CUSTO.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Valor estimado (R$)</Label>
            <Input
              type="number"
              min={0}
              step={0.01}
              placeholder="ex: 1500.00"
              value={valor}
              onChange={(e) => setValor(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Motivo / Objetivo</Label>
            <Textarea
              placeholder="Descreva o objetivo da viagem..."
              rows={3}
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={create.isPending}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={create.isPending}>
            {create.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Enviando…</> : "Enviar Solicitação"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ⚠️ Form em port visual — campos MOCK; submit liga na fase de lógica.
import { useState } from "react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { DatePickerInput } from "@/components/ui/date-picker-input";
import { toast } from "sonner";

interface CreateEventDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// Selects MOCK
const EVENT_TYPES = [
  { value: "os", label: "Ordem de Serviço", color: "#8b5cf6" },
  { value: "manutencao", label: "Manutenção", color: "#ef4444" },
  { value: "viagem", label: "Viagem", color: "#06b6d4" },
  { value: "reuniao", label: "Reunião", color: "#a855f7" },
  { value: "prazo", label: "Prazo", color: "#f59e0b" },
  { value: "geral", label: "Geral", color: "#6b7280" },
];
const RESPONSAVEIS = ["Carlos Andrade", "Marina Souza", "Pedro Lima", "Sem responsável"];

export function CreateEventDialog({ open, onOpenChange }: CreateEventDialogProps) {
  const [dataInicio, setDataInicio] = useState("");
  const [dataFim, setDataFim] = useState("");

  const handleOpenChange = (isOpen: boolean) => {
    onOpenChange(isOpen);
    if (!isOpen) setTimeout(() => { setDataInicio(""); setDataFim(""); }, 200);
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    toast.info("Disponível na fase de lógica");
    handleOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="w-[calc(100%-2rem)] sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Novo Evento</DialogTitle>
          <DialogDescription>Crie um novo evento no calendário. Vincule a uma OS se necessário.</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="titulo">Título *</Label>
            <Input id="titulo" placeholder="Nome do evento" />
          </div>

          <div className="space-y-1.5">
            <Label>Tipo de evento *</Label>
            <Select defaultValue="geral">
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                {EVENT_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    <div className="flex items-center gap-2">
                      <span className="h-3 w-3 rounded-full" style={{ backgroundColor: t.color }} />
                      {t.label}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Data/hora início *</Label>
              <DatePickerInput value={dataInicio} onChange={setDataInicio} placeholder="Selecione" />
            </div>
            <div className="space-y-1.5">
              <Label>Data/hora fim</Label>
              <DatePickerInput value={dataFim} onChange={setDataFim} placeholder="Opcional" />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Responsável</Label>
            <Select>
              <SelectTrigger><SelectValue placeholder="Sem responsável definido" /></SelectTrigger>
              <SelectContent>
                {RESPONSAVEIS.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="descricao">Descrição</Label>
            <Textarea id="descricao" placeholder="Detalhes do evento..." rows={2} />
          </div>

          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>Cancelar</Button>
            <Button type="submit">Criar Evento</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

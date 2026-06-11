// ⚠️ Form em port visual — campos MOCK; submit liga na fase de lógica.
// Espelho fiel do CreateOSDialog do Carbo Ops (Nova Descarbonização / OS CarboVAPT).
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
import { Car, Building2, Truck } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface NovaDescarbonizacaoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const SERVICE_TYPES = [
  { value: "b2c", label: "B2C — Eventual", description: "Descarbonização pontual para pessoa física", icon: <Car className="h-5 w-5" />, color: "bg-emerald-500/10 border-emerald-500/30 hover:bg-emerald-500/20 text-emerald-700" },
  { value: "b2b", label: "B2B — Eventual", description: "Descarbonização para empresa / frota eventual", icon: <Building2 className="h-5 w-5" />, color: "bg-blue-500/10 border-blue-500/30 hover:bg-blue-500/20 text-blue-700" },
  { value: "frota", label: "Frota — Agendamento", description: "Agendamento recorrente de frota", icon: <Truck className="h-5 w-5" />, color: "bg-purple-500/10 border-purple-500/30 hover:bg-purple-500/20 text-purple-700" },
];

// Selects MOCK
const LICENCIADOS = ["Licenciado Natal", "Licenciado Recife", "Licenciado Fortaleza", "Licenciado SP"];
const MAQUINAS = ["MAQ-014 — CarboVAPT Pro", "MAQ-013 — CarboVAPT Pro", "MAQ-012 — CarboVAPT Lite", "MAQ-011 — CarboVAPT Lite"];
const TECNICOS = ["Carlos Andrade", "Marina Souza", "Pedro Lima", "Não atribuído"];

export function NovaDescarbonizacaoDialog({ open, onOpenChange }: NovaDescarbonizacaoDialogProps) {
  const [step, setStep] = useState<"type" | "form">("type");
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [agendamento, setAgendamento] = useState("");

  const handleOpenChange = (isOpen: boolean) => {
    onOpenChange(isOpen);
    if (!isOpen) {
      setTimeout(() => {
        setStep("type");
        setSelectedType(null);
        setAgendamento("");
      }, 200);
    }
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    toast.info("Disponível na fase de lógica");
    handleOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="w-[calc(100%-2rem)] sm:max-w-lg">
        {step === "type" && (
          <>
            <DialogHeader>
              <DialogTitle>Nova Descarbonização</DialogTitle>
              <DialogDescription>Selecione o tipo de OS CarboVAPT</DialogDescription>
            </DialogHeader>
            <div className="grid gap-3 py-2">
              {SERVICE_TYPES.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => { setSelectedType(opt.value); setStep("form"); }}
                  className={cn("flex items-start gap-4 rounded-xl border-2 p-4 text-left transition-all", opt.color)}
                >
                  <div className="mt-0.5 flex-shrink-0">{opt.icon}</div>
                  <div>
                    <p className="font-semibold text-sm">{opt.label}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{opt.description}</p>
                  </div>
                </button>
              ))}
            </div>
          </>
        )}

        {step === "form" && selectedType && (
          <form onSubmit={handleSubmit}>
            <DialogHeader>
              <DialogTitle>{SERVICE_TYPES.find((t) => t.value === selectedType)?.label}</DialogTitle>
              <DialogDescription>Preencha as informações da Ordem de Serviço</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-1.5">
                <Label htmlFor="cliente">{selectedType === "frota" ? "Empresa / Frota (Licenciado)" : "Cliente / Licenciado"}</Label>
                {selectedType === "b2c" ? (
                  <Input id="cliente" placeholder="Nome do cliente" />
                ) : (
                  <Select>
                    <SelectTrigger><SelectValue placeholder="Selecione o licenciado" /></SelectTrigger>
                    <SelectContent>
                      {LICENCIADOS.map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}
                    </SelectContent>
                  </Select>
                )}
              </div>

              <div className="space-y-1.5">
                <Label>Tipo de serviço</Label>
                <Select defaultValue={selectedType}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {SERVICE_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>Máquina</Label>
                <Select>
                  <SelectTrigger><SelectValue placeholder="Selecione a máquina" /></SelectTrigger>
                  <SelectContent>
                    {MAQUINAS.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>{selectedType === "frota" ? "Data agendada *" : "Data agendada (opcional)"}</Label>
                <DatePickerInput value={agendamento} onChange={setAgendamento} placeholder="Selecione a data" />
              </div>

              <div className="space-y-1.5">
                <Label>Técnico</Label>
                <Select>
                  <SelectTrigger><SelectValue placeholder="Selecione o técnico" /></SelectTrigger>
                  <SelectContent>
                    {TECNICOS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="obs">Observações</Label>
                <Textarea id="obs" placeholder="Informações adicionais..." rows={2} />
              </div>
            </div>
            <DialogFooter className="gap-2">
              <Button type="button" variant="outline" onClick={() => setStep("type")}>Voltar</Button>
              <Button type="submit">Criar OS</Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

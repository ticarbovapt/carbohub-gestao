// Nova Descarbonização — B2C / B2B / Frota. Cria uma OS real (crm_os).
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
import { DateTimePicker } from "@/components/ui/date-time-picker";
import { Car, Building2, Truck, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useCreateOS, type OsTipo } from "@/hooks/useOS";

interface NovaDescarbonizacaoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const SERVICE_TYPES: { value: OsTipo; label: string; description: string; icon: React.ReactNode; color: string }[] = [
  {
    value: "b2c",
    label: "B2C — Eventual",
    description: "Descarbonização pontual para pessoa física / consumidor",
    icon: <Car className="h-5 w-5" />,
    color: "bg-emerald-500/10 border-emerald-500/30 hover:bg-emerald-500/20 text-emerald-700",
  },
  {
    value: "b2b",
    label: "B2B — Eventual",
    description: "Descarbonização para empresa / frota corporativa eventual",
    icon: <Building2 className="h-5 w-5" />,
    color: "bg-blue-500/10 border-blue-500/30 hover:bg-blue-500/20 text-blue-700",
  },
  {
    value: "frota",
    label: "Frota — Agendamento",
    description: "Agendamento recorrente de frota (agenda + máquina alocada)",
    icon: <Truck className="h-5 w-5" />,
    color: "bg-purple-500/10 border-purple-500/30 hover:bg-purple-500/20 text-purple-700",
  },
];

export function NovaDescarbonizacaoDialog({ open, onOpenChange }: NovaDescarbonizacaoDialogProps) {
  const [step, setStep] = useState<"type" | "form">("type");
  const [selectedType, setSelectedType] = useState<OsTipo | null>(null);
  const [clienteNome, setClienteNome] = useState("");
  const [cnpj, setCnpj] = useState("");
  const [placa, setPlaca] = useState("");
  const [modelo, setModelo] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [prioridade, setPrioridade] = useState("3");
  const [titulo, setTitulo] = useState("");
  const [observacoes, setObservacoes] = useState("");

  const createOS = useCreateOS();

  const reset = () => {
    setStep("type"); setSelectedType(null);
    setClienteNome(""); setCnpj(""); setPlaca(""); setModelo("");
    setScheduledAt(""); setPrioridade("3"); setTitulo(""); setObservacoes("");
  };

  const handleOpenChange = (isOpen: boolean) => {
    onOpenChange(isOpen);
    if (!isOpen) setTimeout(reset, 200);
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!selectedType) return;
    try {
      await createOS.mutateAsync({
        tipo: selectedType,
        cliente_nome: clienteNome.trim() || undefined,
        cnpj: cnpj.trim() || undefined,
        placa: placa.trim() || undefined,
        modelo: modelo.trim() || undefined,
        data_prevista: scheduledAt || null,
        prioridade: Number(prioridade),
        titulo: titulo.trim() || undefined,
        observacoes: observacoes.trim() || undefined,
      });
      toast.success("OS criada com sucesso");
      handleOpenChange(false);
    } catch (err) {
      toast.error("Erro ao criar OS", { description: (err as Error)?.message });
    }
  };

  const current = SERVICE_TYPES.find((t) => t.value === selectedType);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="w-[calc(100%-2rem)] sm:max-w-lg">
        {/* ── Step 1: Tipo ── */}
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

        {/* ── Step 2: Formulário (B2C / B2B / Frota) ── */}
        {step === "form" && selectedType && (
          <form onSubmit={handleSubmit}>
            <DialogHeader>
              <DialogTitle>{current?.label}</DialogTitle>
              <DialogDescription>Preencha as informações da Ordem de Serviço</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">

              {/* CNPJ (B2B e Frota) */}
              {(selectedType === "b2b" || selectedType === "frota") && (
                <div className="space-y-1.5">
                  <Label>CNPJ</Label>
                  <div className="flex gap-2">
                    <Input value={cnpj} onChange={(e) => setCnpj(e.target.value)} placeholder="00.000.000/0000-00" maxLength={18} className="font-mono" />
                    <Button type="button" variant="outline" size="sm" className="shrink-0 px-3" onClick={() => toast.info("Busca de CNPJ disponível em breve")}>
                      <Search className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}

              <div className="space-y-1.5">
                <Label htmlFor="customer_name">{selectedType === "frota" ? "Empresa / Frota" : "Nome do Cliente"}</Label>
                <Input
                  id="customer_name"
                  value={clienteNome}
                  onChange={(e) => setClienteNome(e.target.value)}
                  placeholder={selectedType === "frota" ? "Ex: Transportadora XYZ" : "Nome do cliente"}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="vehicle_plate" className="flex items-center gap-1">
                    Placa <span className="text-[10px] text-muted-foreground font-normal">(preencher depois)</span>
                  </Label>
                  <Input id="vehicle_plate" value={placa} onChange={(e) => setPlaca(e.target.value)} placeholder="ABC-1234" className="uppercase" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="vehicle_model" className="flex items-center gap-1">
                    Modelo <span className="text-[10px] text-muted-foreground font-normal">(preencher depois)</span>
                  </Label>
                  <Input id="vehicle_model" value={modelo} onChange={(e) => setModelo(e.target.value)} placeholder="Ex: Caminhão, Fiat Uno" />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>{selectedType === "frota" ? "Data do Agendamento *" : "Data Prevista (opcional)"}</Label>
                <DateTimePicker
                  value={scheduledAt}
                  onChange={setScheduledAt}
                  placeholder={selectedType === "frota" ? "Selecione data e hora" : "Opcional — selecione se houver"}
                />
              </div>

              <div className="space-y-1.5">
                <Label>Prioridade</Label>
                <Select value={prioridade} onValueChange={setPrioridade}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">🔴 Urgente</SelectItem>
                    <SelectItem value="2">🟠 Alta</SelectItem>
                    <SelectItem value="3">⚪ Normal</SelectItem>
                    <SelectItem value="4">🔵 Baixa</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="title" className="flex items-center gap-1">
                  Título da OS <span className="text-[10px] text-muted-foreground font-normal">(gerado automaticamente se vazio)</span>
                </Label>
                <Input
                  id="title"
                  value={titulo}
                  onChange={(e) => setTitulo(e.target.value)}
                  placeholder={
                    selectedType === "b2b" ? "Ex: DESC_B2B_00012 — Café Santa Clara" :
                    selectedType === "b2c" ? "Ex: DESC_B2C_00015 — João Silva" :
                    "Ex: DESC_FRT_00008 — Transportadora XYZ"
                  }
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="description">Observações</Label>
                <Textarea id="description" value={observacoes} onChange={(e) => setObservacoes(e.target.value)} placeholder="Informações adicionais..." rows={2} />
              </div>
            </div>
            <DialogFooter className="gap-2">
              <Button type="button" variant="outline" onClick={() => setStep("type")}>Voltar</Button>
              <Button type="submit" disabled={createOS.isPending}>
                {createOS.isPending ? "Criando..." : "Criar OS"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

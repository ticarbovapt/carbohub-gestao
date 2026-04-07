import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
import { Car, Users, Truck, Building2, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCreateServiceOrder } from "@/hooks/useServiceOrders";
import type { OsServiceType } from "@/types/os";

interface ServiceTypeOption {
  value: OsServiceType;
  label: string;
  description: string;
  icon: React.ReactNode;
  color: string;
}

const SERVICE_TYPES: ServiceTypeOption[] = [
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

interface CreateOSDialogProps {
  trigger?: React.ReactNode;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  onSuccess?: () => void;
}

export function CreateOSDialog({
  trigger,
  defaultOpen = false,
  onOpenChange,
  onSuccess,
}: CreateOSDialogProps) {
  const { user } = useAuth();
  const [open, setOpen] = useState(defaultOpen);
  const [step, setStep] = useState<"type" | "form">("type");
  const [selectedType, setSelectedType] = useState<OsServiceType | null>(null);

  const createMutation = useCreateServiceOrder();

  const handleOpenChange = (isOpen: boolean) => {
    setOpen(isOpen);
    onOpenChange?.(isOpen);
    if (!isOpen) {
      setTimeout(() => {
        setStep("type");
        setSelectedType(null);
      }, 200);
    }
  };

  const handleTypeSelect = (type: OsServiceType) => {
    setSelectedType(type);
    setStep("form");
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!user || !selectedType) return;

    const fd = new FormData(e.currentTarget);

    await createMutation.mutateAsync({
      title: (fd.get("title") as string) || `OS ${selectedType.toUpperCase()} — ${fd.get("customer_name")}`,
      service_type: selectedType,
      customer_name: (fd.get("customer_name") as string) || undefined,
      vehicle_plate: (fd.get("vehicle_plate") as string) || undefined,
      vehicle_model: (fd.get("vehicle_model") as string) || undefined,
      priority: parseInt(fd.get("priority") as string) || 3,
      scheduled_at: (fd.get("scheduled_at") as string) || undefined,
      description: (fd.get("description") as string) || undefined,
    });

    handleOpenChange(false);
    onSuccess?.();
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}

      <DialogContent className="max-w-lg">
        {/* ── Step 1: Tipo de Serviço ── */}
        {step === "type" && (
          <>
            <DialogHeader>
              <DialogTitle>Nova Ordem de Serviço</DialogTitle>
              <DialogDescription>
                Selecione o tipo de descarbonização CarboVAPT
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-3 py-2">
              {SERVICE_TYPES.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => handleTypeSelect(opt.value)}
                  className={cn(
                    "flex items-start gap-4 rounded-xl border-2 p-4 text-left transition-all",
                    opt.color
                  )}
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

        {/* ── Step 2: Formulário ── */}
        {step === "form" && selectedType && (
          <form onSubmit={handleSubmit}>
            <DialogHeader>
              <DialogTitle>
                {SERVICE_TYPES.find((t) => t.value === selectedType)?.label}
              </DialogTitle>
              <DialogDescription>
                Preencha as informações da Ordem de Serviço
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              {/* Cliente */}
              <div className="space-y-1.5">
                <Label htmlFor="customer_name">
                  {selectedType === "frota" ? "Empresa / Frota" : "Nome do Cliente"}
                </Label>
                <Input
                  id="customer_name"
                  name="customer_name"
                  placeholder={
                    selectedType === "frota"
                      ? "Ex: Transportadora XYZ"
                      : "Nome do cliente"
                  }
                />
              </div>

              {/* Veículo */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="vehicle_plate">Placa do Veículo</Label>
                  <Input
                    id="vehicle_plate"
                    name="vehicle_plate"
                    placeholder="ABC-1234"
                    className="uppercase"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="vehicle_model">Modelo</Label>
                  <Input
                    id="vehicle_model"
                    name="vehicle_model"
                    placeholder="Ex: Fiat Uno 1.0"
                  />
                </div>
              </div>

              {/* Agendamento */}
              <div className="space-y-1.5">
                <Label htmlFor="scheduled_at">
                  {selectedType === "frota" ? "Data do Agendamento" : "Data Prevista (opcional)"}
                </Label>
                <Input
                  id="scheduled_at"
                  name="scheduled_at"
                  type="datetime-local"
                  required={selectedType === "frota"}
                />
              </div>

              {/* Prioridade */}
              <div className="space-y-1.5">
                <Label>Prioridade</Label>
                <Select name="priority" defaultValue="3">
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">🔴 Urgente</SelectItem>
                    <SelectItem value="2">🟠 Alta</SelectItem>
                    <SelectItem value="3">⚪ Normal</SelectItem>
                    <SelectItem value="4">🔵 Baixa</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Título / Observações */}
              <div className="space-y-1.5">
                <Label htmlFor="title">Título da OS</Label>
                <Input
                  id="title"
                  name="title"
                  placeholder="Ex: Descarbonização motor Honda Fit"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="description">Observações</Label>
                <Textarea
                  id="description"
                  name="description"
                  placeholder="Informações adicionais..."
                  rows={2}
                />
              </div>
            </div>

            <DialogFooter className="gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setStep("type")}
                disabled={createMutation.isPending}
              >
                Voltar
              </Button>
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Criando...
                  </>
                ) : (
                  "Criar OS"
                )}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

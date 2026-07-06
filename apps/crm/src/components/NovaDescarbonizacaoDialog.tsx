// Nova Ordem de Serviço — ESPELHO da tela do portal Licenciados (mesma UX nos
// dois sistemas): tipo (B2C/B2B/Frota) → cliente PF/PJ (autofill de recorrente
// por telefone/CNPJ) → nome/razão, nome fantasia (PJ), telefone (WhatsApp),
// e-mail → veículo (placa/ano/modelo) → data prevista. Cria na fonte de verdade
// (licenciados.service_orders via os_create).
import { useState } from "react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useCreateOS, findOsCustomer, type OsTipo, type OsPersonType } from "@/hooks/useOS";

interface NovaDescarbonizacaoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const SERVICE_LABELS: Record<OsTipo, string> = {
  b2c: "B2C — Pessoa física",
  b2b: "B2B — Empresa",
  frota: "Frota — Agendado",
};

export function NovaDescarbonizacaoDialog({ open, onOpenChange }: NovaDescarbonizacaoDialogProps) {
  const [serviceType, setServiceType] = useState<OsTipo>("b2c");
  // PF/PJ é DERIVADO do tipo: B2C = pessoa física; B2B/Frota = empresa (CNPJ).
  const personType: OsPersonType = serviceType === "b2c" ? "pf" : "pj";
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [federalCode, setFederalCode] = useState("");
  const [company, setCompany] = useState("");
  const [email, setEmail] = useState("");
  const [plate, setPlate] = useState("");
  const [model, setModel] = useState("");
  const [vehicleYear, setVehicleYear] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [recurring, setRecurring] = useState(false);

  const createOS = useCreateOS();

  // Auto-preenchimento: PF por telefone, PJ por CNPJ (mesma UX do Licenciados).
  async function lookup() {
    const key = personType === "pf" ? phone.trim() : federalCode.trim();
    if (!key) return;
    const c = await findOsCustomer(personType, key);
    if (c) {
      setName(c.name ?? "");
      setCompany(c.company ?? "");
      setEmail(c.email ?? "");
      if (c.phone) setPhone(c.phone);
      if (c.federal_code) setFederalCode(c.federal_code);
      setRecurring(true);
    } else {
      setRecurring(false);
    }
  }

  function reset() {
    setServiceType("b2c");
    setName(""); setPhone(""); setFederalCode(""); setCompany(""); setEmail("");
    setPlate(""); setModel(""); setVehicleYear(""); setScheduledAt(""); setRecurring(false);
  }

  function handleOpenChange(isOpen: boolean) {
    onOpenChange(isOpen);
    if (!isOpen) setTimeout(reset, 200);
  }

  const canSubmit =
    name.trim().length >= 2 &&
    (personType === "pf" ? phone.trim().length >= 8 : federalCode.trim().length >= 11) &&
    (serviceType !== "frota" || !!scheduledAt) &&
    !createOS.isPending;

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!canSubmit) return;
    try {
      const { numero } = await createOS.mutateAsync({
        service_type: serviceType,
        person_type: personType,
        customer_name: name.trim(),
        phone: phone.trim() || null,
        federal_code: federalCode.trim() || null,
        company: company.trim() || null,
        email: email.trim() || null,
        plate: plate.trim() || null,
        model: model.trim() || null,
        vehicle_year: vehicleYear.trim() ? Number(vehicleYear) : null,
        // Data só (sem hora): meia-noite LOCAL, evita "dia anterior" por fuso.
        scheduled_at: scheduledAt ? new Date(`${scheduledAt}T00:00:00`).toISOString() : null,
      });
      toast.success(`OS ${numero ?? ""} criada com sucesso`);
      handleOpenChange(false);
    } catch (err) {
      toast.error("Erro ao criar OS", { description: (err as Error)?.message });
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="w-[calc(100%-2rem)] sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Nova Ordem de Serviço</DialogTitle>
            <DialogDescription>
              Cadastre o cliente, o veículo e a data. As fotos são feitas no Carbox · o número é gerado automaticamente.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5 py-4">
            {/* Tipo de serviço */}
            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">Tipo de serviço</Label>
              <div className="flex flex-wrap gap-2">
                {(Object.keys(SERVICE_LABELS) as OsTipo[]).map((t) => (
                  <button key={t} type="button" onClick={() => { setServiceType(t); setRecurring(false); }}
                    className={cn(
                      "flex-1 min-w-[130px] rounded-lg border px-3 py-2 text-sm font-medium transition-colors",
                      serviceType === t
                        ? "bg-purple-600 border-purple-600 text-white"
                        : "bg-background hover:bg-muted text-foreground",
                    )}>
                    {SERVICE_LABELS[t]}
                  </button>
                ))}
              </div>
            </div>

            {/* Cliente */}
            <div className="space-y-3">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                Cliente {serviceType === "b2c" ? "(pessoa física)" : "(empresa · CNPJ)"}
              </Label>

              {personType === "pf" ? (
                <div className="space-y-1.5">
                  <Label htmlFor="phone">Telefone / WhatsApp <span className="text-destructive">*</span></Label>
                  <Input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} onBlur={lookup}
                    placeholder="(11) 99999-9999" inputMode="tel" />
                </div>
              ) : (
                <div className="space-y-1.5">
                  <Label htmlFor="cnpj">CNPJ <span className="text-destructive">*</span></Label>
                  <Input id="cnpj" value={federalCode} onChange={(e) => setFederalCode(e.target.value)} onBlur={lookup}
                    placeholder="00.000.000/0000-00" inputMode="numeric" />
                </div>
              )}

              {recurring && (
                <p className="text-xs font-medium text-emerald-600">✓ Cliente recorrente — dados preenchidos</p>
              )}

              <div className="space-y-1.5">
                <Label htmlFor="name">
                  {personType === "pj" ? "Razão social / nome" : "Nome"} <span className="text-destructive">*</span>
                </Label>
                <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome do cliente" />
              </div>

              {personType === "pj" && (
                <>
                  <div className="space-y-1.5">
                    <Label htmlFor="company">Nome fantasia</Label>
                    <Input id="company" value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Opcional" />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="phone-pj">Telefone / WhatsApp</Label>
                    <Input id="phone-pj" value={phone} onChange={(e) => setPhone(e.target.value)}
                      placeholder="(11) 99999-9999" inputMode="tel" />
                  </div>
                </>
              )}

              <div className="space-y-1.5">
                <Label htmlFor="email">E-mail</Label>
                <Input id="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Opcional" inputMode="email" />
              </div>
            </div>

            {/* Veículo */}
            <div className="space-y-3">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">Veículo</Label>
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2 space-y-1.5">
                  <Label htmlFor="plate">Placa</Label>
                  <Input id="plate" value={plate} onChange={(e) => setPlate(e.target.value.toUpperCase())}
                    placeholder="ABC-1234" className="uppercase" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="year">Ano</Label>
                  <Input id="year" type="number" value={vehicleYear} onChange={(e) => setVehicleYear(e.target.value)}
                    placeholder="2020" inputMode="numeric" />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="model">Modelo</Label>
                <Input id="model" value={model} onChange={(e) => setModel(e.target.value)} placeholder="Ex: Fiat Uno / Caminhão" />
              </div>
            </div>

            {/* Data prevista (obrigatória para frota) */}
            <div className="space-y-1.5">
              <Label htmlFor="sched">
                Data prevista {serviceType === "frota"
                  ? <><span className="text-destructive">*</span> (obrigatório para frota)</>
                  : <span className="text-muted-foreground font-normal">(opcional)</span>}
              </Label>
              <Input id="sched" type="date" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} />
              {serviceType === "frota" && (
                <p className="text-xs text-muted-foreground">Na frota você pode adicionar mais veículos na mesma OS depois, no Carbox.</p>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button type="submit" disabled={!canSubmit} className="w-full bg-purple-600 hover:bg-purple-700 text-white">
              {createOS.isPending ? "Criando…" : "Criar OS"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

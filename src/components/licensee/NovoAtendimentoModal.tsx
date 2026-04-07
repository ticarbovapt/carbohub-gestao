import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DatePickerInput } from "@/components/ui/date-picker-input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { ChevronRight, ChevronLeft, Plus, Search, Car, User, Wrench, CheckCircle2 } from "lucide-react";
import { useDescarbClients, useCreateDescarbClient, type DescarbClient } from "@/hooks/useDescarbClients";
import { useDescarbVehicles, useCreateDescarbVehicle, FUEL_TYPE_LABELS, type DescarbVehicle } from "@/hooks/useDescarbVehicles";
import { useCreateDescarbSale, MODALITY_INFO, PAYMENT_LABELS, REAGENT_TYPE_LABELS, type Modality, type ReagentType, type PaymentType } from "@/hooks/useDescarbSales";

interface Props {
  open: boolean;
  onClose: () => void;
  licenseeId: string;
}

type Step = 1 | 2 | 3;

const STEPS = [
  { id: 1, label: "Cliente", icon: User },
  { id: 2, label: "Veículo", icon: Car },
  { id: 3, label: "Serviço", icon: Wrench },
];

const INITIAL_CLIENTE = { name: "", phone: "", federal_code: "", email: "", city: "", state: "" };
const INITIAL_VEICULO = { license_plate: "", brand: "", model: "", year: "", fuel_type: "flex" };
const INITIAL_SERVICO = {
  modality: "M" as Modality,
  reagent_type: "flex" as ReagentType,
  reagent_qty_used: "0.5",
  payment_type: "money" as PaymentType,
  total_value: "",
  discount: "0",
  is_pre_sale: false,
  preferred_date: "",
  notes: "",
};

function StepIndicator({ current }: { current: Step }) {
  return (
    <div className="flex items-center justify-center gap-2 mb-6">
      {STEPS.map((s, i) => {
        const Icon = s.icon;
        const done = s.id < current;
        const active = s.id === current;
        return (
          <div key={s.id} className="flex items-center gap-2">
            <div className={cn(
              "flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold transition-all",
              done  ? "bg-green-500 text-white" :
              active ? "bg-primary text-primary-foreground" :
                       "bg-muted text-muted-foreground"
            )}>
              {done ? <CheckCircle2 className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
            </div>
            <span className={cn("text-xs font-medium hidden sm:block", active ? "text-foreground" : "text-muted-foreground")}>
              {s.label}
            </span>
            {i < STEPS.length - 1 && <div className="w-8 h-px bg-border" />}
          </div>
        );
      })}
    </div>
  );
}

export function NovoAtendimentoModal({ open, onClose, licenseeId }: Props) {
  const [step, setStep] = useState<Step>(1);

  // Step 1 — Cliente
  const [clienteSearch, setClienteSearch] = useState("");
  const [selectedCliente, setSelectedCliente] = useState<DescarbClient | null>(null);
  const [novoCliente, setNovoCliente] = useState(false);
  const [clienteForm, setClienteForm] = useState(INITIAL_CLIENTE);

  // Step 2 — Veículo
  const [veiculoSearch, setVeiculoSearch] = useState("");
  const [selectedVeiculo, setSelectedVeiculo] = useState<DescarbVehicle | null>(null);
  const [novoVeiculo, setNovoVeiculo] = useState(false);
  const [veiculoForm, setVeiculoForm] = useState(INITIAL_VEICULO);

  // Step 3 — Serviço
  const [servico, setServico] = useState(INITIAL_SERVICO);

  const { data: clientes = [] } = useDescarbClients(licenseeId);
  const { data: veiculos = [] } = useDescarbVehicles(licenseeId, selectedCliente?.id);
  const createCliente = useCreateDescarbClient();
  const createVeiculo = useCreateDescarbVehicle();
  const createSale = useCreateDescarbSale();

  const filteredClientes = clientes.filter(c =>
    c.name.toLowerCase().includes(clienteSearch.toLowerCase()) ||
    (c.phone ?? "").includes(clienteSearch) ||
    (c.federal_code ?? "").includes(clienteSearch)
  );

  const filteredVeiculos = veiculos.filter(v =>
    v.license_plate.toLowerCase().includes(veiculoSearch.toLowerCase()) ||
    (v.brand ?? "").toLowerCase().includes(veiculoSearch.toLowerCase()) ||
    (v.model ?? "").toLowerCase().includes(veiculoSearch.toLowerCase())
  );

  function reset() {
    setStep(1);
    setClienteSearch(""); setSelectedCliente(null); setNovoCliente(false); setClienteForm(INITIAL_CLIENTE);
    setVeiculoSearch(""); setSelectedVeiculo(null); setNovoVeiculo(false); setVeiculoForm(INITIAL_VEICULO);
    setServico(INITIAL_SERVICO);
  }

  function handleClose() { reset(); onClose(); }

  async function handleNext() {
    if (step === 1) {
      if (novoCliente) {
        if (!clienteForm.name.trim()) return;
        const c = await createCliente.mutateAsync({ licensee_id: licenseeId, ...clienteForm });
        setSelectedCliente(c);
        setNovoCliente(false);
      }
      if (!selectedCliente && !novoCliente) return;
      setStep(2);
    } else if (step === 2) {
      if (novoVeiculo) {
        if (!veiculoForm.license_plate.trim()) return;
        const v = await createVeiculo.mutateAsync({
          licensee_id: licenseeId,
          client_id: selectedCliente?.id ?? null,
          license_plate: veiculoForm.license_plate.toUpperCase(),
          brand: veiculoForm.brand || null,
          model: veiculoForm.model || null,
          year: veiculoForm.year ? parseInt(veiculoForm.year) : null,
          fuel_type: veiculoForm.fuel_type,
          kilometer: null,
        });
        setSelectedVeiculo(v);
        setNovoVeiculo(false);
      }
      setStep(3);
    }
  }

  async function handleSubmit() {
    const qty = parseFloat(servico.reagent_qty_used) || 0;
    const value = parseFloat(servico.total_value) || 0;
    const discount = parseFloat(servico.discount) || 0;

    await createSale.mutateAsync({
      licensee_id: licenseeId,
      client_id: selectedCliente?.id ?? null,
      vehicle_id: selectedVeiculo?.id ?? null,
      modality: servico.modality,
      reagent_type: servico.reagent_type,
      reagent_qty_used: qty,
      payment_type: servico.payment_type,
      total_value: value,
      discount,
      is_pre_sale: servico.is_pre_sale,
      preferred_date: servico.is_pre_sale && servico.preferred_date ? servico.preferred_date : null,
      notes: servico.notes || null,
    });
    handleClose();
  }

  const loading = createCliente.isPending || createVeiculo.isPending || createSale.isPending;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Novo Atendimento</DialogTitle>
        </DialogHeader>

        <StepIndicator current={step} />

        {/* ── STEP 1: Cliente ────────────────────────────────── */}
        {step === 1 && (
          <div className="space-y-4">
            {!novoCliente ? (
              <>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    className="pl-9"
                    placeholder="Buscar por nome, CPF ou telefone..."
                    value={clienteSearch}
                    onChange={e => setClienteSearch(e.target.value)}
                  />
                </div>

                {selectedCliente && (
                  <div className="flex items-center justify-between rounded-lg border border-primary/30 bg-primary/5 px-4 py-3">
                    <div>
                      <p className="font-semibold text-sm">{selectedCliente.name}</p>
                      <p className="text-xs text-muted-foreground">{selectedCliente.phone || selectedCliente.federal_code || "—"}</p>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => setSelectedCliente(null)}>Trocar</Button>
                  </div>
                )}

                {!selectedCliente && (
                  <div className="max-h-48 overflow-y-auto space-y-1">
                    {filteredClientes.length === 0 && clienteSearch && (
                      <p className="text-sm text-muted-foreground text-center py-4">Nenhum cliente encontrado</p>
                    )}
                    {filteredClientes.map(c => (
                      <button
                        key={c.id}
                        onClick={() => setSelectedCliente(c)}
                        className="w-full text-left rounded-lg border border-border px-4 py-3 hover:bg-muted transition-colors"
                      >
                        <p className="font-medium text-sm">{c.name}</p>
                        <p className="text-xs text-muted-foreground">{c.phone || c.federal_code || "—"} {c.city ? `· ${c.city}/${c.state}` : ""}</p>
                      </button>
                    ))}
                  </div>
                )}

                <Button variant="outline" size="sm" className="w-full gap-2" onClick={() => setNovoCliente(true)}>
                  <Plus className="h-4 w-4" /> Novo cliente
                </Button>
              </>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">Novo cliente</p>
                  <Button variant="ghost" size="sm" onClick={() => setNovoCliente(false)}>Cancelar</Button>
                </div>
                <div>
                  <Label>Nome *</Label>
                  <Input value={clienteForm.name} onChange={e => setClienteForm(f => ({ ...f, name: e.target.value }))} placeholder="Nome completo" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>CPF / CNPJ</Label><Input value={clienteForm.federal_code} onChange={e => setClienteForm(f => ({ ...f, federal_code: e.target.value }))} /></div>
                  <div><Label>Telefone</Label><Input value={clienteForm.phone} onChange={e => setClienteForm(f => ({ ...f, phone: e.target.value }))} placeholder="(00) 00000-0000" /></div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Cidade</Label><Input value={clienteForm.city} onChange={e => setClienteForm(f => ({ ...f, city: e.target.value }))} /></div>
                  <div><Label>UF</Label><Input maxLength={2} value={clienteForm.state} onChange={e => setClienteForm(f => ({ ...f, state: e.target.value.toUpperCase() }))} className="uppercase" /></div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── STEP 2: Veículo ────────────────────────────────── */}
        {step === 2 && (
          <div className="space-y-4">
            {selectedCliente && (
              <div className="flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-2 text-sm">
                <User className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                <span className="font-medium">{selectedCliente.name}</span>
              </div>
            )}

            {!novoVeiculo ? (
              <>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    className="pl-9"
                    placeholder="Buscar por placa ou modelo..."
                    value={veiculoSearch}
                    onChange={e => setVeiculoSearch(e.target.value)}
                  />
                </div>

                {selectedVeiculo && (
                  <div className="flex items-center justify-between rounded-lg border border-primary/30 bg-primary/5 px-4 py-3">
                    <div>
                      <p className="font-semibold text-sm font-mono">{selectedVeiculo.license_plate}</p>
                      <p className="text-xs text-muted-foreground">{[selectedVeiculo.brand, selectedVeiculo.model, selectedVeiculo.year].filter(Boolean).join(" · ")}</p>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => setSelectedVeiculo(null)}>Trocar</Button>
                  </div>
                )}

                {!selectedVeiculo && (
                  <div className="max-h-48 overflow-y-auto space-y-1">
                    {filteredVeiculos.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-4">
                        {selectedCliente ? "Nenhum veículo deste cliente. Cadastre abaixo." : "Busque ou cadastre um veículo."}
                      </p>
                    ) : filteredVeiculos.map(v => (
                      <button
                        key={v.id}
                        onClick={() => setSelectedVeiculo(v)}
                        className="w-full text-left rounded-lg border border-border px-4 py-3 hover:bg-muted transition-colors"
                      >
                        <p className="font-mono font-semibold text-sm">{v.license_plate}</p>
                        <p className="text-xs text-muted-foreground">{[v.brand, v.model, v.year].filter(Boolean).join(" · ")} · {FUEL_TYPE_LABELS[v.fuel_type] ?? v.fuel_type}</p>
                      </button>
                    ))}
                  </div>
                )}

                <Button variant="outline" size="sm" className="w-full gap-2" onClick={() => setNovoVeiculo(true)}>
                  <Plus className="h-4 w-4" /> Novo veículo
                </Button>
              </>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">Novo veículo</p>
                  <Button variant="ghost" size="sm" onClick={() => setNovoVeiculo(false)}>Cancelar</Button>
                </div>
                <div>
                  <Label>Placa *</Label>
                  <Input
                    value={veiculoForm.license_plate}
                    onChange={e => setVeiculoForm(f => ({ ...f, license_plate: e.target.value.toUpperCase() }))}
                    placeholder="ABC1D23"
                    className="uppercase font-mono"
                    maxLength={8}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Marca</Label><Input value={veiculoForm.brand} onChange={e => setVeiculoForm(f => ({ ...f, brand: e.target.value }))} placeholder="Ex: Toyota" /></div>
                  <div><Label>Modelo</Label><Input value={veiculoForm.model} onChange={e => setVeiculoForm(f => ({ ...f, model: e.target.value }))} placeholder="Ex: Hilux" /></div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Ano</Label><Input type="number" value={veiculoForm.year} onChange={e => setVeiculoForm(f => ({ ...f, year: e.target.value }))} placeholder="2022" min={1990} max={2030} /></div>
                  <div>
                    <Label>Combustível</Label>
                    <Select value={veiculoForm.fuel_type} onValueChange={v => setVeiculoForm(f => ({ ...f, fuel_type: v }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {Object.entries(FUEL_TYPE_LABELS).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── STEP 3: Serviço ────────────────────────────────── */}
        {step === 3 && (
          <div className="space-y-4">
            {/* Modalidade */}
            <div>
              <Label className="mb-2 block">Modalidade *</Label>
              <div className="grid grid-cols-4 gap-2">
                {(Object.entries(MODALITY_INFO) as [Modality, typeof MODALITY_INFO[Modality]][]).map(([key, info]) => (
                  <button
                    key={key}
                    onClick={() => setServico(s => ({ ...s, modality: key }))}
                    className={cn(
                      "flex flex-col items-center gap-1 rounded-xl border-2 p-3 text-center transition-all",
                      servico.modality === key
                        ? "border-primary bg-primary/10"
                        : "border-border hover:border-muted-foreground"
                    )}
                  >
                    <span className="text-lg font-black" style={{ color: info.color }}>{key}</span>
                    <span className="text-[10px] font-medium text-foreground">{info.label}</span>
                    <span className="text-[9px] text-muted-foreground leading-tight hidden sm:block">{info.desc}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {/* Reagente */}
              <div>
                <Label>Tipo de Reagente</Label>
                <Select value={servico.reagent_type} onValueChange={v => setServico(s => ({ ...s, reagent_type: v as ReagentType }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(REAGENT_TYPE_LABELS).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              {/* Qtd reagente */}
              <div>
                <Label>Qtd. Reagente (L)</Label>
                <Input
                  type="number"
                  step="0.1"
                  min="0"
                  value={servico.reagent_qty_used}
                  onChange={e => setServico(s => ({ ...s, reagent_qty_used: e.target.value }))}
                />
              </div>
            </div>

            {/* Pré-atendimento toggle */}
            <div className="flex items-center justify-between rounded-lg border border-border px-4 py-3">
              <div>
                <p className="text-sm font-medium">Pré-atendimento</p>
                <p className="text-xs text-muted-foreground">Agendado — ainda não executado</p>
              </div>
              <Switch
                checked={servico.is_pre_sale}
                onCheckedChange={v => setServico(s => ({ ...s, is_pre_sale: v }))}
              />
            </div>

            {servico.is_pre_sale && (
              <div>
                <Label>Data preferencial</Label>
                <DatePickerInput
                  value={servico.preferred_date}
                  onChange={v => setServico(s => ({ ...s, preferred_date: v }))}
                  placeholder="Selecionar data preferencial"
                />
              </div>
            )}

            {!servico.is_pre_sale && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Forma de Pagamento</Label>
                  <Select value={servico.payment_type} onValueChange={v => setServico(s => ({ ...s, payment_type: v as PaymentType }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(PAYMENT_LABELS).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Valor Total (R$)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0,00"
                    value={servico.total_value}
                    onChange={e => setServico(s => ({ ...s, total_value: e.target.value }))}
                  />
                </div>
              </div>
            )}

            <div>
              <Label>Observações</Label>
              <Textarea
                value={servico.notes}
                onChange={e => setServico(s => ({ ...s, notes: e.target.value }))}
                placeholder="Obs. sobre o veículo, serviço ou cliente..."
                rows={2}
              />
            </div>

            {/* Resumo */}
            <div className="rounded-lg bg-muted/50 border border-border p-3 space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Cliente</span>
                <span className="font-medium">{selectedCliente?.name || "—"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Veículo</span>
                <span className="font-mono font-medium">{selectedVeiculo?.license_plate || "—"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Modalidade</span>
                <Badge style={{ backgroundColor: MODALITY_INFO[servico.modality].color }} className="text-white border-0 text-[10px]">
                  {servico.modality} — {MODALITY_INFO[servico.modality].label}
                </Badge>
              </div>
              {!servico.is_pre_sale && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Valor</span>
                  <span className="font-semibold text-foreground">
                    R$ {(parseFloat(servico.total_value) || 0).toFixed(2)}
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Navigation ─────────────────────────────────────── */}
        <div className="flex justify-between pt-2 border-t border-border mt-4">
          {step > 1 ? (
            <Button variant="outline" onClick={() => setStep((s) => (s - 1) as Step)} disabled={loading}>
              <ChevronLeft className="h-4 w-4 mr-1" /> Voltar
            </Button>
          ) : (
            <Button variant="ghost" onClick={handleClose} disabled={loading}>Cancelar</Button>
          )}

          {step < 3 ? (
            <Button
              onClick={handleNext}
              disabled={loading || (step === 1 && !selectedCliente && !novoCliente)}
            >
              Próximo <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          ) : (
            <Button onClick={handleSubmit} disabled={loading}>
              {loading ? "Registrando..." : servico.is_pre_sale ? "Agendar Atendimento" : "Confirmar Atendimento"}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

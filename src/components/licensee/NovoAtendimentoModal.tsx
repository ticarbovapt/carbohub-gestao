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
import {
  ChevronRight, ChevronLeft, Plus, Search, Car, User, Wrench,
  CheckCircle2, Loader2, Check, AlertCircle,
} from "lucide-react";
import { useDescarbClients, useCreateDescarbClient, type DescarbClient } from "@/hooks/useDescarbClients";
import { useDescarbVehicles, useCreateDescarbVehicle, FUEL_TYPE_LABELS, type DescarbVehicle } from "@/hooks/useDescarbVehicles";
import {
  useCreateDescarbSale, MODALITY_INFO, PAYMENT_LABELS,
  type Modality, type PaymentType,
} from "@/hooks/useDescarbSales";

interface Props {
  open: boolean;
  onClose: () => void;
  licenseeId: string;
  defaultModality?: Modality;
}

type Step = 1 | 2 | 3;
type AutoFillStatus = "idle" | "loading" | "success" | "error";

const STEPS = [
  { id: 1, label: "Cliente", icon: User },
  { id: 2, label: "Veículo", icon: Car },
  { id: 3, label: "Serviço",  icon: Wrench },
];

const INITIAL_CLIENTE = {
  name: "", phone: "", federal_code: "", email: "",
  cep: "", city: "", state: "", notes: "",
};

const INITIAL_VEICULO = {
  license_plate: "", brand: "", model: "", year: "", fuel_type: "flex", kilometer: "",
};

function makeInitialServico(modality: Modality = "P") {
  return {
    modality,
    reagent_qty_used: "0.5",
    payment_type: "money" as PaymentType,
    total_value: "",
    discount: "0",
    is_pre_sale: false,
    preferred_date: "",
    notes: "",
    operador_name: "",
    indicador_name: "",
    machine_starts_used: "1",
    had_restart: false,
    restart_reason: "",
  };
}

// ── Step Indicator ──────────────────────────────────────────────────
function StepIndicator({ current }: { current: Step }) {
  return (
    <div className="flex items-center justify-center gap-1.5 mb-5">
      {STEPS.map((s, i) => {
        const Icon = s.icon;
        const done   = s.id < current;
        const active = s.id === current;
        return (
          <div key={s.id} className="flex items-center gap-1.5">
            <div className={cn(
              "flex h-9 w-9 items-center justify-center rounded-full text-xs font-bold transition-all",
              done   ? "bg-green-500 text-white" :
              active ? "bg-primary text-primary-foreground shadow-md" :
                       "bg-muted text-muted-foreground"
            )}>
              {done ? <CheckCircle2 className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
            </div>
            <span className={cn(
              "text-xs font-medium hidden sm:block",
              active ? "text-foreground" : "text-muted-foreground"
            )}>
              {s.label}
            </span>
            {i < STEPS.length - 1 && <div className="w-6 h-px bg-border" />}
          </div>
        );
      })}
    </div>
  );
}

// ── Auto-fill status icon ────────────────────────────────────────────
function AutoFillIcon({ status }: { status: AutoFillStatus }) {
  if (status === "loading") return <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />;
  if (status === "success") return <Check className="h-4 w-4 text-green-500" />;
  if (status === "error")   return <AlertCircle className="h-4 w-4 text-destructive" />;
  return null;
}

// ── Field wrapper with larger touch target ───────────────────────────
function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm font-medium">
        {label}{required && <span className="text-destructive ml-0.5">*</span>}
      </Label>
      {children}
    </div>
  );
}

// ── Main Component ───────────────────────────────────────────────────
export function NovoAtendimentoModal({ open, onClose, licenseeId, defaultModality }: Props) {
  const [step, setStep] = useState<Step>(1);

  // Step 1 — Cliente
  const [clienteSearch, setClienteSearch]     = useState("");
  const [selectedCliente, setSelectedCliente] = useState<DescarbClient | null>(null);
  const [novoCliente, setNovoCliente]         = useState(false);
  const [clienteForm, setClienteForm]         = useState(INITIAL_CLIENTE);
  const [cnpjStatus, setCnpjStatus]           = useState<AutoFillStatus>("idle");
  const [cepStatus,  setCepStatus]            = useState<AutoFillStatus>("idle");

  // Step 2 — Veículo
  const [veiculoSearch, setVeiculoSearch]     = useState("");
  const [selectedVeiculo, setSelectedVeiculo] = useState<DescarbVehicle | null>(null);
  const [novoVeiculo, setNovoVeiculo]         = useState(false);
  const [veiculoForm, setVeiculoForm]         = useState(INITIAL_VEICULO);

  // Step 3 — Serviço
  const [servico, setServico] = useState(() => makeInitialServico(defaultModality));

  const { data: clientes = [] } = useDescarbClients(licenseeId);
  const { data: veiculos = [] } = useDescarbVehicles(licenseeId, selectedCliente?.id);
  const createCliente = useCreateDescarbClient();
  const createVeiculo = useCreateDescarbVehicle();
  const createSale    = useCreateDescarbSale();

  const filteredClientes = clientes.filter(c =>
    c.name.toLowerCase().includes(clienteSearch.toLowerCase()) ||
    (c.phone ?? "").includes(clienteSearch) ||
    (c.federal_code ?? "").includes(clienteSearch)
  );

  const filteredVeiculos = veiculos.filter(v =>
    v.license_plate.toLowerCase().includes(veiculoSearch.toLowerCase()) ||
    (v.brand  ?? "").toLowerCase().includes(veiculoSearch.toLowerCase()) ||
    (v.model  ?? "").toLowerCase().includes(veiculoSearch.toLowerCase())
  );

  // ── Auto-fill: CNPJ ─────────────────────────────────────────────
  async function fetchCnpj(raw: string) {
    const cnpj = raw.replace(/\D/g, "");
    if (cnpj.length !== 14) return;
    setCnpjStatus("loading");
    try {
      const res  = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setClienteForm(f => ({
        ...f,
        name:  data.razao_social ?? data.nome_fantasia ?? f.name,
        phone: data.ddd_telefone_1
          ? data.ddd_telefone_1.replace(/\D/g, "").replace(/(\d{2})(\d{4,5})(\d{4})/, "($1) $2-$3")
          : f.phone,
        city:  data.municipio  ?? f.city,
        state: data.uf         ?? f.state,
      }));
      setCnpjStatus("success");
    } catch {
      setCnpjStatus("error");
    }
  }

  // ── Auto-fill: CEP ──────────────────────────────────────────────
  async function fetchCep(raw: string) {
    const cep = raw.replace(/\D/g, "");
    if (cep.length !== 8) return;
    setCepStatus("loading");
    try {
      const res  = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
      const data = await res.json();
      if (data.erro) throw new Error();
      setClienteForm(f => ({
        ...f,
        city:  data.localidade ?? f.city,
        state: data.uf         ?? f.state,
      }));
      setCepStatus("success");
    } catch {
      setCepStatus("error");
    }
  }

  // ── Reset ────────────────────────────────────────────────────────
  function reset() {
    setStep(1);
    setClienteSearch(""); setSelectedCliente(null); setNovoCliente(false);
    setClienteForm(INITIAL_CLIENTE); setCnpjStatus("idle"); setCepStatus("idle");
    setVeiculoSearch(""); setSelectedVeiculo(null); setNovoVeiculo(false);
    setVeiculoForm(INITIAL_VEICULO);
    setServico(makeInitialServico(defaultModality));
  }

  function handleClose() { reset(); onClose(); }

  // ── Navigation ───────────────────────────────────────────────────
  async function handleNext() {
    if (step === 1) {
      if (novoCliente) {
        if (!clienteForm.name.trim()) return;
        const c = await createCliente.mutateAsync({
          licensee_id: licenseeId,
          name:         clienteForm.name,
          phone:        clienteForm.phone   || undefined,
          federal_code: clienteForm.federal_code || undefined,
          email:        clienteForm.email   || undefined,
          city:         clienteForm.city    || undefined,
          state:        clienteForm.state   || undefined,
          notes:        clienteForm.notes   || undefined,
        });
        setSelectedCliente(c);
        setNovoCliente(false);
      }
      if (!selectedCliente && !novoCliente) return;
      setStep(2);
    } else if (step === 2) {
      if (novoVeiculo) {
        if (!veiculoForm.license_plate.trim()) return;
        const v = await createVeiculo.mutateAsync({
          licensee_id:   licenseeId,
          client_id:     selectedCliente?.id ?? null,
          license_plate: veiculoForm.license_plate.toUpperCase(),
          brand:         veiculoForm.brand     || null,
          model:         veiculoForm.model     || null,
          year:          veiculoForm.year  ? parseInt(veiculoForm.year)      : null,
          fuel_type:     veiculoForm.fuel_type,
          kilometer:     veiculoForm.kilometer ? parseFloat(veiculoForm.kilometer) : null,
        });
        setSelectedVeiculo(v);
        setNovoVeiculo(false);
      }
      setStep(3);
    }
  }

  async function handleSubmit() {
    const qty      = parseFloat(servico.reagent_qty_used) || 0;
    const value    = parseFloat(servico.total_value)      || 0;
    const discount = parseFloat(servico.discount)         || 0;
    const starts   = parseInt(servico.machine_starts_used) || 1;

    await createSale.mutateAsync({
      licensee_id:          licenseeId,
      client_id:            selectedCliente?.id  ?? null,
      vehicle_id:           selectedVeiculo?.id  ?? null,
      modality:             servico.modality,
      reagent_qty_used:     qty,
      payment_type:         servico.payment_type,
      total_value:          value,
      discount,
      is_pre_sale:          servico.is_pre_sale,
      preferred_date:       servico.is_pre_sale && servico.preferred_date ? servico.preferred_date : null,
      notes:                servico.notes || null,
      operador_name:        servico.operador_name  || null,
      indicador_name:       servico.indicador_name || null,
      machine_starts_used:  starts,
      had_restart:          servico.had_restart,
      restart_reason:       servico.had_restart && servico.restart_reason ? servico.restart_reason : null,
    });
    handleClose();
  }

  const loading = createCliente.isPending || createVeiculo.isPending || createSale.isPending;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      {/*
        Mobile: bottom-sheet (rounded top, full width, anchored at bottom)
        Desktop: centered dialog
      */}
      <DialogContent className={cn(
        "flex flex-col gap-0 p-0 overflow-hidden",
        // mobile bottom-sheet
        "fixed bottom-0 left-0 right-0 top-auto translate-y-0 rounded-t-2xl sm:rounded-2xl",
        // desktop centered
        "sm:relative sm:bottom-auto sm:left-auto sm:right-auto sm:top-auto sm:translate-y-0",
        "sm:max-w-lg sm:mx-auto",
        "max-h-[92vh] sm:max-h-[90vh]",
        "border-t border-white/10 sm:border"
      )}>
        {/* Handle bar (mobile) */}
        <div className="flex justify-center pt-3 pb-1 sm:hidden">
          <div className="w-10 h-1 rounded-full bg-muted-foreground/30" />
        </div>

        {/* Header */}
        <DialogHeader className="px-5 pt-4 pb-2 sm:pt-5 border-b border-border">
          <DialogTitle className="text-base font-semibold">Novo Atendimento</DialogTitle>
        </DialogHeader>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          <StepIndicator current={step} />

          {/* ── STEP 1: Cliente ──────────────────────────────────── */}
          {step === 1 && (
            <div className="space-y-4">
              {!novoCliente ? (
                <>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                    <Input
                      className="pl-9 h-12 text-base"
                      placeholder="Buscar por nome, CPF ou telefone..."
                      value={clienteSearch}
                      onChange={e => setClienteSearch(e.target.value)}
                      autoFocus
                    />
                  </div>

                  {selectedCliente && (
                    <div className="flex items-center justify-between rounded-xl border border-primary/30 bg-primary/5 px-4 py-3">
                      <div>
                        <p className="font-semibold text-sm">{selectedCliente.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {selectedCliente.phone || selectedCliente.federal_code || "—"}
                          {selectedCliente.city ? ` · ${selectedCliente.city}/${selectedCliente.state}` : ""}
                        </p>
                      </div>
                      <Button variant="ghost" size="sm" onClick={() => setSelectedCliente(null)}>Trocar</Button>
                    </div>
                  )}

                  {!selectedCliente && (
                    <div className="max-h-52 overflow-y-auto space-y-1.5 rounded-lg">
                      {filteredClientes.length === 0 && clienteSearch && (
                        <p className="text-sm text-muted-foreground text-center py-6">Nenhum cliente encontrado</p>
                      )}
                      {filteredClientes.map(c => (
                        <button
                          key={c.id}
                          onClick={() => setSelectedCliente(c)}
                          className="w-full text-left rounded-xl border border-border px-4 py-3.5 hover:bg-muted active:bg-muted/80 transition-colors min-h-[56px]"
                        >
                          <p className="font-medium text-sm">{c.name}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {c.phone || c.federal_code || "—"}
                            {c.city ? ` · ${c.city}/${c.state}` : ""}
                          </p>
                        </button>
                      ))}
                    </div>
                  )}

                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full gap-2 h-11"
                    onClick={() => setNovoCliente(true)}
                  >
                    <Plus className="h-4 w-4" /> Novo cliente
                  </Button>
                </>
              ) : (
                <div className="space-y-3.5">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold">Cadastrar cliente</p>
                    <Button variant="ghost" size="sm" onClick={() => setNovoCliente(false)}>Cancelar</Button>
                  </div>

                  <Field label="Nome" required>
                    <Input
                      className="h-12 text-base"
                      value={clienteForm.name}
                      onChange={e => setClienteForm(f => ({ ...f, name: e.target.value }))}
                      placeholder="Nome completo ou Razão Social"
                    />
                  </Field>

                  {/* CPF / CNPJ com auto-fill */}
                  <Field label="CPF / CNPJ">
                    <div className="relative">
                      <Input
                        className="h-12 text-base pr-10"
                        value={clienteForm.federal_code}
                        onChange={e => {
                          setCnpjStatus("idle");
                          setClienteForm(f => ({ ...f, federal_code: e.target.value }));
                        }}
                        onBlur={e => fetchCnpj(e.target.value)}
                        placeholder="000.000.000-00 ou 00.000.000/0000-00"
                        inputMode="numeric"
                      />
                      <div className="absolute right-3 top-1/2 -translate-y-1/2">
                        <AutoFillIcon status={cnpjStatus} />
                      </div>
                    </div>
                    {cnpjStatus === "success" && (
                      <p className="text-[11px] text-green-600">✓ Dados preenchidos automaticamente</p>
                    )}
                    {cnpjStatus === "error" && (
                      <p className="text-[11px] text-destructive">CNPJ não encontrado — preencha manualmente</p>
                    )}
                  </Field>

                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Telefone">
                      <Input
                        className="h-12 text-base"
                        value={clienteForm.phone}
                        onChange={e => setClienteForm(f => ({ ...f, phone: e.target.value }))}
                        placeholder="(00) 00000-0000"
                        inputMode="tel"
                      />
                    </Field>
                    <Field label="E-mail">
                      <Input
                        className="h-12 text-base"
                        value={clienteForm.email}
                        onChange={e => setClienteForm(f => ({ ...f, email: e.target.value }))}
                        placeholder="email@exemplo.com"
                        inputMode="email"
                        type="email"
                      />
                    </Field>
                  </div>

                  {/* CEP com auto-fill */}
                  <Field label="CEP">
                    <div className="relative">
                      <Input
                        className="h-12 text-base pr-10"
                        value={clienteForm.cep}
                        onChange={e => {
                          setCepStatus("idle");
                          setClienteForm(f => ({ ...f, cep: e.target.value }));
                        }}
                        onBlur={e => fetchCep(e.target.value)}
                        placeholder="00000-000"
                        inputMode="numeric"
                        maxLength={9}
                      />
                      <div className="absolute right-3 top-1/2 -translate-y-1/2">
                        <AutoFillIcon status={cepStatus} />
                      </div>
                    </div>
                  </Field>

                  <div className="grid grid-cols-3 gap-3">
                    <div className="col-span-2">
                      <Field label="Cidade">
                        <Input
                          className="h-12 text-base"
                          value={clienteForm.city}
                          onChange={e => setClienteForm(f => ({ ...f, city: e.target.value }))}
                        />
                      </Field>
                    </div>
                    <Field label="UF">
                      <Input
                        maxLength={2}
                        className="h-12 text-base uppercase"
                        value={clienteForm.state}
                        onChange={e => setClienteForm(f => ({ ...f, state: e.target.value.toUpperCase() }))}
                      />
                    </Field>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── STEP 2: Veículo ──────────────────────────────────── */}
          {step === 2 && (
            <div className="space-y-4">
              {selectedCliente && (
                <div className="flex items-center gap-2 rounded-xl bg-muted/50 px-3 py-2.5 text-sm border border-border">
                  <User className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  <span className="font-medium">{selectedCliente.name}</span>
                </div>
              )}

              {!novoVeiculo ? (
                <>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                    <Input
                      className="pl-9 h-12 text-base"
                      placeholder="Buscar por placa ou modelo..."
                      value={veiculoSearch}
                      onChange={e => setVeiculoSearch(e.target.value)}
                      autoFocus
                    />
                  </div>

                  {selectedVeiculo && (
                    <div className="flex items-center justify-between rounded-xl border border-primary/30 bg-primary/5 px-4 py-3">
                      <div>
                        <p className="font-semibold text-sm font-mono">{selectedVeiculo.license_plate}</p>
                        <p className="text-xs text-muted-foreground">
                          {[selectedVeiculo.brand, selectedVeiculo.model, selectedVeiculo.year].filter(Boolean).join(" · ")}
                        </p>
                      </div>
                      <Button variant="ghost" size="sm" onClick={() => setSelectedVeiculo(null)}>Trocar</Button>
                    </div>
                  )}

                  {!selectedVeiculo && (
                    <div className="max-h-52 overflow-y-auto space-y-1.5 rounded-lg">
                      {filteredVeiculos.length === 0 ? (
                        <p className="text-sm text-muted-foreground text-center py-6">
                          {selectedCliente
                            ? "Nenhum veículo deste cliente. Cadastre abaixo."
                            : "Busque ou cadastre um veículo."}
                        </p>
                      ) : filteredVeiculos.map(v => (
                        <button
                          key={v.id}
                          onClick={() => setSelectedVeiculo(v)}
                          className="w-full text-left rounded-xl border border-border px-4 py-3.5 hover:bg-muted active:bg-muted/80 transition-colors min-h-[56px]"
                        >
                          <p className="font-mono font-semibold text-sm">{v.license_plate}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {[v.brand, v.model, v.year].filter(Boolean).join(" · ")}
                            {v.fuel_type ? ` · ${FUEL_TYPE_LABELS[v.fuel_type] ?? v.fuel_type}` : ""}
                          </p>
                        </button>
                      ))}
                    </div>
                  )}

                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full gap-2 h-11"
                    onClick={() => setNovoVeiculo(true)}
                  >
                    <Plus className="h-4 w-4" /> Novo veículo
                  </Button>
                </>
              ) : (
                <div className="space-y-3.5">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold">Cadastrar veículo</p>
                    <Button variant="ghost" size="sm" onClick={() => setNovoVeiculo(false)}>Cancelar</Button>
                  </div>

                  <Field label="Placa" required>
                    <Input
                      className="h-12 text-base uppercase font-mono"
                      value={veiculoForm.license_plate}
                      onChange={e => setVeiculoForm(f => ({ ...f, license_plate: e.target.value.toUpperCase() }))}
                      placeholder="ABC1D23"
                      maxLength={8}
                    />
                  </Field>

                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Marca">
                      <Input
                        className="h-12 text-base"
                        value={veiculoForm.brand}
                        onChange={e => setVeiculoForm(f => ({ ...f, brand: e.target.value }))}
                        placeholder="Ex: Toyota"
                      />
                    </Field>
                    <Field label="Modelo">
                      <Input
                        className="h-12 text-base"
                        value={veiculoForm.model}
                        onChange={e => setVeiculoForm(f => ({ ...f, model: e.target.value }))}
                        placeholder="Ex: Hilux"
                      />
                    </Field>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Ano">
                      <Input
                        type="number"
                        className="h-12 text-base"
                        value={veiculoForm.year}
                        onChange={e => setVeiculoForm(f => ({ ...f, year: e.target.value }))}
                        placeholder="2022"
                        min={1990}
                        max={2030}
                        inputMode="numeric"
                      />
                    </Field>
                    <Field label="Km Atual">
                      <Input
                        type="number"
                        className="h-12 text-base"
                        value={veiculoForm.kilometer}
                        onChange={e => setVeiculoForm(f => ({ ...f, kilometer: e.target.value }))}
                        placeholder="Ex: 85000"
                        inputMode="numeric"
                      />
                    </Field>
                  </div>

                  <Field label="Combustível">
                    <Select
                      value={veiculoForm.fuel_type}
                      onValueChange={v => setVeiculoForm(f => ({ ...f, fuel_type: v }))}
                    >
                      <SelectTrigger className="h-12 text-base">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(FUEL_TYPE_LABELS).map(([k, l]) => (
                          <SelectItem key={k} value={k}>{l}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                </div>
              )}
            </div>
          )}

          {/* ── STEP 3: Serviço ──────────────────────────────────── */}
          {step === 3 && (
            <div className="space-y-4">
              {/* Modalidade */}
              <div>
                <Label className="text-sm font-medium mb-2 block">
                  Modalidade <span className="text-destructive">*</span>
                </Label>
                <div className="grid grid-cols-4 gap-2">
                  {(Object.entries(MODALITY_INFO) as [Modality, typeof MODALITY_INFO[Modality]][]).map(([key, info]) => (
                    <button
                      key={key}
                      onClick={() => setServico(s => ({ ...s, modality: key }))}
                      className={cn(
                        "flex flex-col items-center gap-1 rounded-xl border-2 p-3 text-center transition-all min-h-[72px]",
                        servico.modality === key
                          ? "border-primary bg-primary/10 shadow-sm"
                          : "border-border hover:border-muted-foreground"
                      )}
                    >
                      <span className="text-xl font-black" style={{ color: info.color }}>{key}</span>
                      <span className="text-[9px] font-semibold text-foreground leading-tight text-center line-clamp-2">
                        {info.label}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Operador + Indicador */}
              <div className="grid grid-cols-2 gap-3">
                <Field label="Operador" required>
                  <Input
                    className="h-12 text-base"
                    value={servico.operador_name}
                    onChange={e => setServico(s => ({ ...s, operador_name: e.target.value }))}
                    placeholder="Nome do operador"
                  />
                </Field>
                <Field label="Indicador">
                  <Input
                    className="h-12 text-base"
                    value={servico.indicador_name}
                    onChange={e => setServico(s => ({ ...s, indicador_name: e.target.value }))}
                    placeholder="Quem indicou?"
                  />
                </Field>
              </div>

              {/* Reagente + Starts */}
              <div className="grid grid-cols-2 gap-3">
                <Field label="Reagente Usado (L)" required>
                  <Input
                    type="number"
                    step="0.1"
                    min="0"
                    className="h-12 text-base"
                    value={servico.reagent_qty_used}
                    onChange={e => setServico(s => ({ ...s, reagent_qty_used: e.target.value }))}
                    inputMode="decimal"
                  />
                </Field>
                <Field label="Starts da Máquina" required>
                  <Input
                    type="number"
                    min="1"
                    className="h-12 text-base"
                    value={servico.machine_starts_used}
                    onChange={e => setServico(s => ({ ...s, machine_starts_used: e.target.value }))}
                    inputMode="numeric"
                  />
                </Field>
              </div>

              {/* Reinício toggle */}
              <div className="flex items-center justify-between rounded-xl border border-border px-4 py-3.5">
                <div>
                  <p className="text-sm font-medium">Houve reinício?</p>
                  <p className="text-xs text-muted-foreground">Processo foi interrompido e reiniciado</p>
                </div>
                <Switch
                  checked={servico.had_restart}
                  onCheckedChange={v => setServico(s => ({ ...s, had_restart: v, restart_reason: v ? s.restart_reason : "" }))}
                />
              </div>

              {servico.had_restart && (
                <Field label="Motivo do reinício">
                  <Textarea
                    className="text-base resize-none"
                    rows={2}
                    value={servico.restart_reason}
                    onChange={e => setServico(s => ({ ...s, restart_reason: e.target.value }))}
                    placeholder="Descreva o que aconteceu..."
                  />
                </Field>
              )}

              {/* Pré-atendimento toggle */}
              <div className="flex items-center justify-between rounded-xl border border-border px-4 py-3.5">
                <div>
                  <p className="text-sm font-medium">Pré-atendimento</p>
                  <p className="text-xs text-muted-foreground">Cliente pagou — serviço ainda não realizado</p>
                </div>
                <Switch
                  checked={servico.is_pre_sale}
                  onCheckedChange={v => setServico(s => ({ ...s, is_pre_sale: v }))}
                />
              </div>

              {servico.is_pre_sale ? (
                <Field label="Data preferencial">
                  <DatePickerInput
                    value={servico.preferred_date}
                    onChange={v => setServico(s => ({ ...s, preferred_date: v }))}
                    placeholder="Selecionar data preferencial"
                  />
                </Field>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Forma de Pagamento">
                    <Select
                      value={servico.payment_type}
                      onValueChange={v => setServico(s => ({ ...s, payment_type: v as PaymentType }))}
                    >
                      <SelectTrigger className="h-12 text-base">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(PAYMENT_LABELS).map(([k, l]) => (
                          <SelectItem key={k} value={k}>{l}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="Valor Total (R$)" required>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      className="h-12 text-base"
                      placeholder="0,00"
                      value={servico.total_value}
                      onChange={e => setServico(s => ({ ...s, total_value: e.target.value }))}
                      inputMode="decimal"
                    />
                  </Field>
                </div>
              )}

              {/* Observações */}
              <Field label="Observações">
                <Textarea
                  className="text-base resize-none"
                  value={servico.notes}
                  onChange={e => setServico(s => ({ ...s, notes: e.target.value }))}
                  placeholder="Obs. sobre o veículo, serviço ou cliente..."
                  rows={2}
                />
              </Field>

              {/* Resumo */}
              <div className="rounded-xl bg-muted/50 border border-border p-3.5 space-y-2 text-sm">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Resumo</p>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Cliente</span>
                  <span className="font-medium">{selectedCliente?.name || "—"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Veículo</span>
                  <span className="font-mono font-medium">{selectedVeiculo?.license_plate || "—"}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Modalidade</span>
                  <Badge
                    style={{ backgroundColor: MODALITY_INFO[servico.modality].color }}
                    className="text-white border-0 text-[10px]"
                  >
                    {servico.modality} — {MODALITY_INFO[servico.modality].label}
                  </Badge>
                </div>
                {!servico.is_pre_sale && (
                  <div className="flex justify-between border-t border-border pt-2">
                    <span className="text-muted-foreground">Valor</span>
                    <span className="font-semibold">
                      R$ {(parseFloat(servico.total_value) || 0).toFixed(2)}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* ── Sticky Navigation Footer ───────────────────────────── */}
        <div className="flex justify-between gap-3 px-5 py-4 border-t border-border bg-background">
          {step > 1 ? (
            <Button
              variant="outline"
              className="h-12 flex-1"
              onClick={() => setStep(s => (s - 1) as Step)}
              disabled={loading}
            >
              <ChevronLeft className="h-4 w-4 mr-1" /> Voltar
            </Button>
          ) : (
            <Button
              variant="ghost"
              className="h-12 flex-1"
              onClick={handleClose}
              disabled={loading}
            >
              Cancelar
            </Button>
          )}

          {step < 3 ? (
            <Button
              className="h-12 flex-1"
              onClick={handleNext}
              disabled={loading || (step === 1 && !selectedCliente && !novoCliente)}
            >
              {loading ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Aguarde...</>
              ) : (
                <>Próximo <ChevronRight className="h-4 w-4 ml-1" /></>
              )}
            </Button>
          ) : (
            <Button
              className="h-12 flex-1"
              onClick={handleSubmit}
              disabled={loading || (!servico.is_pre_sale && !servico.total_value) || !servico.operador_name.trim()}
            >
              {loading ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Registrando...</>
              ) : servico.is_pre_sale ? (
                "Agendar Atendimento"
              ) : (
                "Confirmar Atendimento"
              )}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

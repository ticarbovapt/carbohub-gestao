// Nova Descarbonização — B2C / B2B / Frota. Cria uma OS real (crm_os) com número próprio.
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

const onlyDigits = (s: string) => s.replace(/\D/g, "");
function fmtCnpj(v: string) {
  return onlyDigits(v).slice(0, 14)
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1/$2")
    .replace(/(\d{4})(\d)/, "$1-$2");
}
function fmtPhone(v: string) {
  const d = onlyDigits(v).slice(0, 11);
  if (d.length <= 10) return d.replace(/^(\d{2})(\d)/, "($1) $2").replace(/(\d{4})(\d)$/, "$1-$2");
  return d.replace(/^(\d{2})(\d)/, "($1) $2").replace(/(\d{5})(\d)/, "$1-$2");
}

export function NovaDescarbonizacaoDialog({ open, onOpenChange }: NovaDescarbonizacaoDialogProps) {
  const [step, setStep] = useState<"type" | "form">("type");
  const [selectedType, setSelectedType] = useState<OsTipo | null>(null);
  const [clienteNome, setClienteNome] = useState("");
  const [cnpj, setCnpj] = useState("");
  const [telefone, setTelefone] = useState("");
  const [responsavel, setResponsavel] = useState("");
  const [placa, setPlaca] = useState("");
  const [modelo, setModelo] = useState("");
  const [qtdVeiculos, setQtdVeiculos] = useState("");
  const [recorrencia, setRecorrencia] = useState("unica");
  const [scheduledAt, setScheduledAt] = useState("");
  const [prioridade, setPrioridade] = useState("3");
  const [observacoes, setObservacoes] = useState("");
  const [buscandoCnpj, setBuscandoCnpj] = useState(false);

  const createOS = useCreateOS();
  const isPJ = selectedType === "b2b" || selectedType === "frota";

  // Busca o CNPJ na BrasilAPI e auto-preenche a razão social (mesma fonte do Vender).
  async function handleBuscarCnpj() {
    const digits = onlyDigits(cnpj);
    if (digits.length !== 14) { toast.error("Digite um CNPJ com 14 dígitos."); return; }
    setBuscandoCnpj(true);
    try {
      const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${digits}`, { signal: AbortSignal.timeout(10000) });
      if (!res.ok) { toast.error("CNPJ não encontrado."); return; }
      const data = await res.json();
      const nome = data.nome_fantasia || data.razao_social || "";
      if (nome) { setClienteNome(nome); toast.success("Cliente preenchido pelo CNPJ."); }
      else toast.info("CNPJ encontrado, sem razão social.");
    } catch {
      toast.error("Falha ao consultar o CNPJ. Tente de novo.");
    } finally {
      setBuscandoCnpj(false);
    }
  }

  const reset = () => {
    setStep("type"); setSelectedType(null);
    setClienteNome(""); setCnpj(""); setTelefone(""); setResponsavel("");
    setPlaca(""); setModelo(""); setQtdVeiculos(""); setRecorrencia("unica");
    setScheduledAt(""); setPrioridade("3"); setObservacoes("");
  };

  const handleOpenChange = (isOpen: boolean) => {
    onOpenChange(isOpen);
    if (!isOpen) setTimeout(reset, 200);
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!selectedType) return;

    // Validação por tipo
    if (!clienteNome.trim()) {
      toast.error(selectedType === "frota" ? "Informe a empresa / frota." : "Informe o nome do cliente.");
      return;
    }
    if (selectedType === "b2c" && !telefone.trim()) {
      toast.error("Informe o telefone / WhatsApp do cliente.");
      return;
    }
    if (isPJ && onlyDigits(cnpj).length !== 14) {
      toast.error("Informe um CNPJ válido (14 dígitos).");
      return;
    }
    if (selectedType === "frota" && !scheduledAt) {
      toast.error("Selecione a data do agendamento.");
      return;
    }

    try {
      const { numero } = await createOS.mutateAsync({
        tipo: selectedType,
        cliente_nome: clienteNome.trim() || undefined,
        cnpj: isPJ ? cnpj.trim() || undefined : undefined,
        telefone: telefone.trim() || undefined,
        responsavel: isPJ ? responsavel.trim() || undefined : undefined,
        placa: selectedType !== "frota" ? placa.trim() || undefined : undefined,
        modelo: selectedType !== "frota" ? modelo.trim() || undefined : undefined,
        qtd_veiculos: selectedType === "frota" ? (qtdVeiculos ? Number(qtdVeiculos) : null) : undefined,
        recorrencia: selectedType === "frota" ? recorrencia : undefined,
        data_prevista: scheduledAt || null,
        prioridade: Number(prioridade),
        observacoes: observacoes.trim() || undefined,
      });
      toast.success(`OS ${numero ?? ""} criada com sucesso`);
      handleOpenChange(false);
    } catch (err) {
      toast.error("Erro ao criar OS", { description: (err as Error)?.message });
    }
  };

  const current = SERVICE_TYPES.find((t) => t.value === selectedType);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="w-[calc(100%-2rem)] sm:max-w-lg max-h-[90vh] overflow-y-auto">
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

        {/* ── Step 2: Formulário ── */}
        {step === "form" && selectedType && (
          <form onSubmit={handleSubmit}>
            <DialogHeader>
              <DialogTitle>{current?.label}</DialogTitle>
              <DialogDescription>Preencha as informações da Ordem de Serviço · o número é gerado automaticamente</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">

              {/* CNPJ (B2B e Frota) */}
              {isPJ && (
                <div className="space-y-1.5">
                  <Label>CNPJ <span className="text-destructive">*</span></Label>
                  <div className="flex gap-2">
                    <Input value={cnpj} onChange={(e) => setCnpj(fmtCnpj(e.target.value))}
                      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleBuscarCnpj(); } }}
                      placeholder="00.000.000/0000-00" className="font-mono" />
                    <Button type="button" variant="outline" size="sm" className="shrink-0 px-3" onClick={handleBuscarCnpj} disabled={buscandoCnpj}>
                      <Search className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}

              {/* Cliente / Empresa */}
              <div className="space-y-1.5">
                <Label htmlFor="customer_name">
                  {selectedType === "frota" ? "Empresa / Frota" : "Nome do Cliente"} <span className="text-destructive">*</span>
                </Label>
                <Input id="customer_name" value={clienteNome} onChange={(e) => setClienteNome(e.target.value)}
                  placeholder={selectedType === "frota" ? "Ex: Transportadora XYZ" : "Nome do cliente"} />
              </div>

              {/* Contato — B2C: telefone direto; PJ: responsável + telefone */}
              {selectedType === "b2c" ? (
                <div className="space-y-1.5">
                  <Label htmlFor="telefone">Telefone / WhatsApp <span className="text-destructive">*</span></Label>
                  <Input id="telefone" value={telefone} onChange={(e) => setTelefone(fmtPhone(e.target.value))} placeholder="(00) 00000-0000" />
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="responsavel">Responsável</Label>
                    <Input id="responsavel" value={responsavel} onChange={(e) => setResponsavel(e.target.value)} placeholder="Quem acompanha" />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="telefone">Telefone / WhatsApp</Label>
                    <Input id="telefone" value={telefone} onChange={(e) => setTelefone(fmtPhone(e.target.value))} placeholder="(00) 00000-0000" />
                  </div>
                </div>
              )}

              {/* Veículo — B2C/B2B: placa+modelo (1 veículo). Frota: qtd + recorrência */}
              {selectedType === "frota" ? (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="qtd">Qtd. de veículos</Label>
                    <Input id="qtd" type="number" min="1" value={qtdVeiculos} onChange={(e) => setQtdVeiculos(e.target.value)} placeholder="Ex: 12" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Recorrência</Label>
                    <Select value={recorrencia} onValueChange={setRecorrencia}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="unica">Única</SelectItem>
                        <SelectItem value="semanal">Semanal</SelectItem>
                        <SelectItem value="mensal">Mensal</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="vehicle_plate" className="flex items-center gap-1">
                      Placa <span className="text-[10px] text-muted-foreground font-normal">(opcional)</span>
                    </Label>
                    <Input id="vehicle_plate" value={placa} onChange={(e) => setPlaca(e.target.value.toUpperCase())} placeholder="ABC-1234" className="uppercase" />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="vehicle_model" className="flex items-center gap-1">
                      Modelo <span className="text-[10px] text-muted-foreground font-normal">(opcional)</span>
                    </Label>
                    <Input id="vehicle_model" value={modelo} onChange={(e) => setModelo(e.target.value)} placeholder="Ex: Caminhão, Fiat Uno" />
                  </div>
                </div>
              )}

              {/* Data — Frota obrigatória, demais opcional */}
              <div className="space-y-1.5">
                <Label>
                  {selectedType === "frota"
                    ? <>Data do Agendamento <span className="text-destructive">*</span></>
                    : "Data Prevista (opcional)"}
                </Label>
                <DateTimePicker value={scheduledAt} onChange={setScheduledAt}
                  placeholder={selectedType === "frota" ? "Selecione data e hora" : "Opcional — selecione se houver"} />
              </div>

              {/* Prioridade */}
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

              {/* Observações */}
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

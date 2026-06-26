import { useState } from "react";
import { CarboPageHeader } from "@/components/ui/carbo-page-header";
import { CarboCard, CarboCardContent, CarboCardHeader, CarboCardTitle } from "@/components/ui/carbo-card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CarboBadge } from "@/components/ui/carbo-badge";
import { Truck, Calculator, BarChart3, Plus, Loader2, Clock, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { ShipmentsKanban, LogisticsKpis, type Shipment } from "@/components/logistica/shipments";
import { ShipmentDetailsDialog } from "@/components/logistica/ShipmentDetailsDialog";
import { NovaRemessaDialog } from "@/components/logistica/NovaRemessaDialog";
import { useShipments } from "@/hooks/useShipments";
import { useCalculateFreight, localEstimate, FREIGHT_ORIGINS, type FreightCarrier, type FreightUnavailable } from "@/hooks/useFreightQuote";

const brlFrete = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v || 0);
const prazoFrete = (min: number | null, max: number | null) => {
  if (min == null && max == null) return "—";
  if (min != null && max != null && min !== max) return `${min}–${max} dias úteis`;
  return `${max ?? min} dia(s) úteis`;
};

export default function Logistica() {
  const { data: shipments = [], isLoading } = useShipments();
  const calc = useCalculateFreight();
  // Lembra a aba ativa entre recarregamentos (não volta sempre pra "Operacional").
  const [tab, setTab] = useState(() => localStorage.getItem("ops-logistica-tab") || "operacional");
  const changeTab = (v: string) => { setTab(v); localStorage.setItem("ops-logistica-tab", v); };
  const [originId, setOriginId] = useState(FREIGHT_ORIGINS[0].id); // Natal por padrão
  const [originCepCustom, setOriginCepCustom] = useState("");
  const [cep, setCep] = useState("");
  const [peso, setPeso] = useState("");
  const [altura, setAltura] = useState("");
  const [largura, setLargura] = useState("");
  const [comprimento, setComprimento] = useState("");
  const [valorMerc, setValorMerc] = useState("");
  const [freightResults, setFreightResults] = useState<FreightCarrier[] | null>(null);
  const [freightEstimated, setFreightEstimated] = useState(false);
  const [freightUnavailable, setFreightUnavailable] = useState<FreightUnavailable[]>([]);
  const [novaOpen, setNovaOpen] = useState(false);
  const [shipment, setShipment] = useState<Shipment | null>(null);

  const originCep = originId === "custom"
    ? originCepCustom
    : (FREIGHT_ORIGINS.find((o) => o.id === originId)?.cep ?? FREIGHT_ORIGINS[0].cep);

  const handleCalcularFrete = async () => {
    const pesoNum = Number(peso) || 0;
    if (pesoNum <= 0) { toast.error("Informe o peso (kg)."); return; }
    if (originCep.replace(/\D/g, "").length !== 8) { toast.error("Informe um CEP de origem válido (8 dígitos)."); return; }
    if (cep.replace(/\D/g, "").length !== 8) { toast.error("Informe um CEP de destino válido (8 dígitos)."); return; }
    const alt = Number(altura) || 1, larg = Number(largura) || 1, comp = Number(comprimento) || 1;
    try {
      const res = await calc.mutateAsync({
        to_cep: cep,
        from_cep: originCep,
        products: [{ id: "1", weight: pesoNum, height: alt, width: larg, length: comp, insurance_value: Number(valorMerc) || 0, quantity: 1 }],
      });
      if (res.env === "mock") {
        setFreightResults(localEstimate(pesoNum, alt, larg, comp, originCep, cep));
        setFreightEstimated(true);
        setFreightUnavailable([]);
      } else {
        setFreightResults(res.carriers);
        setFreightEstimated(false);
        setFreightUnavailable(res.unavailable ?? []);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao calcular frete.");
    }
  };
  const freightCheapest = freightResults?.length ? Math.min(...freightResults.map((r) => r.price)) : 0;

  return (
    <div className="p-4 md:p-6">
      <div className="space-y-6 max-w-[1500px] mx-auto">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <CarboPageHeader title="Controle Logístico" description="Rastreie separação, envio e entrega das remessas" icon={Truck} />
          <Button className="gap-2 shrink-0" onClick={() => setNovaOpen(true)}><Plus className="h-4 w-4" /> Nova Remessa</Button>
        </div>

        <Tabs value={tab} onValueChange={changeTab} className="w-full">
          <TabsList>
            <TabsTrigger value="operacional">Operacional</TabsTrigger>
            <TabsTrigger value="gestao">Gestão</TabsTrigger>
            <TabsTrigger value="frete" className="gap-1.5"><Truck className="h-3.5 w-3.5" /> Frete</TabsTrigger>
            <TabsTrigger value="estrategico">Estratégico</TabsTrigger>
          </TabsList>

          <TabsContent value="operacional" className="space-y-4 mt-4">
            {isLoading ? <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /> Carregando…</div> : <ShipmentsKanban shipments={shipments} onView={setShipment} />}
          </TabsContent>

          <TabsContent value="gestao" className="space-y-4 mt-4">
            <LogisticsKpis shipments={shipments} />
          </TabsContent>

          <TabsContent value="frete" className="space-y-6 mt-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <CarboCard>
                <CarboCardHeader><CarboCardTitle className="flex items-center gap-2"><Calculator className="h-4 w-4" /> Calculadora de Frete</CarboCardTitle></CarboCardHeader>
                <CarboCardContent className="space-y-3">
                  <div className="space-y-1.5">
                    <Label>Origem</Label>
                    <Select value={originId} onValueChange={setOriginId}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {FREIGHT_ORIGINS.map((o) => <SelectItem key={o.id} value={o.id}>{o.label}</SelectItem>)}
                        <SelectItem value="custom">Outro CEP…</SelectItem>
                      </SelectContent>
                    </Select>
                    {originId === "custom" && (
                      <Input className="mt-2" placeholder="CEP de origem" maxLength={9} value={originCepCustom} onChange={(e) => setOriginCepCustom(e.target.value)} />
                    )}
                  </div>
                  <div className="space-y-1.5"><Label>CEP de destino</Label><Input placeholder="00000-000" maxLength={9} value={cep} onChange={(e) => setCep(e.target.value)} /></div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5"><Label>Peso (kg)</Label><Input type="number" min={0.1} step={0.1} placeholder="ex: 12.5" value={peso} onChange={(e) => setPeso(e.target.value)} /></div>
                    <div className="space-y-1.5"><Label>Valor da mercadoria (R$)</Label><Input type="number" min={0} step={0.01} placeholder="seguro (opcional)" value={valorMerc} onChange={(e) => setValorMerc(e.target.value)} /></div>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Dimensões da caixa (cm)</Label>
                    <div className="grid grid-cols-3 gap-2">
                      <Input type="number" min={1} placeholder="Altura" value={altura} onChange={(e) => setAltura(e.target.value)} />
                      <Input type="number" min={1} placeholder="Largura" value={largura} onChange={(e) => setLargura(e.target.value)} />
                      <Input type="number" min={1} placeholder="Compr." value={comprimento} onChange={(e) => setComprimento(e.target.value)} />
                    </div>
                  </div>
                  <Button className="w-full gap-1.5" onClick={handleCalcularFrete} disabled={calc.isPending}>
                    {calc.isPending ? <><Loader2 className="h-4 w-4 animate-spin" /> Calculando…</> : <><Calculator className="h-4 w-4" /> Calcular Frete</>}
                  </Button>
                </CarboCardContent>
              </CarboCard>
              <CarboCard>
                <CarboCardHeader><CarboCardTitle>Resultado</CarboCardTitle></CarboCardHeader>
                <CarboCardContent className="space-y-2">
                  {!freightResults ? (
                    <div className="py-12 text-center text-muted-foreground">
                      <Truck className="h-10 w-10 mx-auto mb-2 opacity-30" />
                      <p className="text-sm">Informe CEP, peso e dimensões e calcule para ver as transportadoras e prazos.</p>
                    </div>
                  ) : (
                    <>
                      {freightEstimated && (
                        <div className="flex items-start gap-1.5 rounded-md bg-amber-500/10 border border-amber-500/20 px-3 py-2 text-[11px] text-amber-600 dark:text-amber-400">
                          <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                          <span><strong>Estimativa aproximada</strong> — cotação em tempo real indisponível no momento.</span>
                        </div>
                      )}
                      {freightResults.length === 0 && (
                        <p className="py-2 text-center text-sm text-muted-foreground">Nenhuma transportadora disponível para este pacote/destino.</p>
                      )}
                      {freightResults.map((r) => (
                        <div key={r.id} className="flex items-center justify-between rounded-lg border border-green-500/40 bg-green-500/[0.06] px-3 py-2.5">
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <Truck className="h-3.5 w-3.5 text-muted-foreground" />
                              <span className="text-sm font-medium">{r.company}</span>
                              <span className="text-xs text-muted-foreground">· {r.name}</span>
                              {r.price === freightCheapest && <CarboBadge variant="success" size="sm">Mais barato</CarboBadge>}
                            </div>
                            <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5"><Clock className="h-3 w-3" /> {prazoFrete(r.delivery_min, r.delivery_max)}</p>
                          </div>
                          <span className="text-sm font-semibold tabular-nums">{brlFrete(r.price)}</span>
                        </div>
                      ))}
                      {freightUnavailable.length > 0 && (
                        <div className="pt-2 mt-1 border-t border-border/50 space-y-1">
                          <p className="text-[11px] font-medium text-muted-foreground mb-1">Não atendem este pacote/destino:</p>
                          {freightUnavailable.map((u, i) => (
                            <div key={i} className="flex items-start gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/[0.06] px-3 py-2 text-[11px] text-amber-700 dark:text-amber-400">
                              <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                              <span><strong>{u.company}{u.name ? ` · ${u.name}` : ""}</strong> — {u.error}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </CarboCardContent>
              </CarboCard>
            </div>
          </TabsContent>

          <TabsContent value="estrategico" className="space-y-4 mt-4">
            <CarboCard><CarboCardContent className="py-12 text-center text-muted-foreground"><BarChart3 className="h-10 w-10 mx-auto mb-2 opacity-30" /><p>Visão estratégica de logística (custo por rota, performance de transportadoras) — em breve.</p></CarboCardContent></CarboCard>
          </TabsContent>
        </Tabs>
      </div>

      <NovaRemessaDialog open={novaOpen} onOpenChange={setNovaOpen} />
      <ShipmentDetailsDialog
        shipment={shipment}
        open={shipment !== null}
        onOpenChange={(o) => { if (!o) setShipment(null); }}
      />
    </div>
  );
}

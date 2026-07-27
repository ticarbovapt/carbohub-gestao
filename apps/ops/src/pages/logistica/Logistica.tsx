import { useState } from "react";
import { CarboPageHeader } from "@/components/ui/carbo-page-header";
import { CarboCard, CarboCardContent, CarboCardHeader, CarboCardTitle } from "@/components/ui/carbo-card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CarboBadge } from "@/components/ui/carbo-badge";
import { Truck, Calculator, BarChart3, Plus, Loader2, Clock, AlertCircle, MapPin, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { LogisticsKpis, ShipmentsKanban, type Shipment } from "@/components/logistica/shipments";
import { ShipmentDetailsDialog } from "@/components/logistica/ShipmentDetailsDialog";
import { NovaRemessaDialog } from "@/components/logistica/NovaRemessaDialog";
import { JamefQuoteCard } from "@/components/logistica/JamefQuoteCard";
import { useShipments } from "@/hooks/useShipments";
import { useCalculateFreight, localEstimate, FREIGHT_ORIGINS, type FreightCarrier, type FreightUnavailable } from "@/hooks/useFreightQuote";
import { useJamefQuote, type JamefQuote } from "@/hooks/useJamefQuote";
import { useCepLookup } from "@/hooks/useCepLookup";

const brlFrete = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v || 0);
const prazoFrete = (min: number | null, max: number | null) => {
  if (min == null && max == null) return "—";
  if (min != null && max != null && min !== max) return `${min}–${max} dias úteis`;
  return `${max ?? min} dia(s) úteis`;
};

export default function Logistica() {
  const { data: shipments = [], isLoading: shipmentsLoading } = useShipments();
  const [shipment, setShipment] = useState<Shipment | null>(null);
  const calc = useCalculateFreight();
  const jamef = useJamefQuote();
  // Lembra a aba ativa entre recarregamentos.
  const [tab, setTab] = useState(() => localStorage.getItem("ops-logistica-tab") || "gestao");
  const changeTab = (v: string) => { setTab(v); localStorage.setItem("ops-logistica-tab", v); };
  const [originId, setOriginId] = useState(FREIGHT_ORIGINS[0].id); // Natal por padrão
  const [originCepCustom, setOriginCepCustom] = useState("");
  const [cep, setCep] = useState("");
  const [peso, setPeso] = useState("");
  const [altura, setAltura] = useState("");
  const [largura, setLargura] = useState("");
  const [comprimento, setComprimento] = useState("");
  const [volumes, setVolumes] = useState("1");
  const [valorMerc, setValorMerc] = useState("");
  const [freightResults, setFreightResults] = useState<FreightCarrier[] | null>(null);
  const [freightEstimated, setFreightEstimated] = useState(false);
  const [freightUnavailable, setFreightUnavailable] = useState<FreightUnavailable[]>([]);
  const [jamefResult, setJamefResult] = useState<JamefQuote | null>(null);
  const [novaOpen, setNovaOpen] = useState(false);

  // Endereço do CEP digitado — conferência visual antes de cotar.
  const { endereco, buscando: buscandoCep, naoEncontrado: cepNaoEncontrado } = useCepLookup(cep);

  const originCep = originId === "custom"
    ? originCepCustom
    : (FREIGHT_ORIGINS.find((o) => o.id === originId)?.cep ?? FREIGHT_ORIGINS[0].cep);

  // A tabela da Jamef é de saída de Natal. Guardar a UF de origem é o que
  // permite a cotação RECUSAR outra origem em vez de dar um número errado.
  const originUf = originId === "rn" ? "RN"
    : originId === "sp" ? "SP"
    : null; // "Outro CEP…" — UF desconhecida, a Jamef recusa.

  const handleCalcularFrete = async () => {
    const pesoNum = Number(peso) || 0;
    if (pesoNum <= 0) { toast.error("Informe o peso (kg)."); return; }
    if (originCep.replace(/\D/g, "").length !== 8) { toast.error("Informe um CEP de origem válido (8 dígitos)."); return; }
    if (cep.replace(/\D/g, "").length !== 8) { toast.error("Informe um CEP de destino válido (8 dígitos)."); return; }
    const alt = Number(altura) || 1, larg = Number(largura) || 1, comp = Number(comprimento) || 1;
    const qtd = Math.max(Number(volumes) || 1, 1);
    const nf = Number(valorMerc) || 0;

    // As duas cotações são independentes: a Jamef vem da tabela de contrato, o
    // resto da API. Uma falhar não pode derrubar a outra.
    const [apiRes, jamefRes] = await Promise.allSettled([
      calc.mutateAsync({
        to_cep: cep,
        from_cep: originCep,
        products: [{ id: "1", weight: pesoNum, height: alt, width: larg, length: comp, insurance_value: nf, quantity: qtd }],
      }),
      jamef.mutateAsync({
        cep,
        peso_kg: pesoNum,
        altura_cm: alt, largura_cm: larg, comprimento_cm: comp,
        qtd_volumes: qtd,
        valor_nf: nf,
        origem_uf: originUf ?? "—",
      }),
    ]);

    if (apiRes.status === "fulfilled") {
      const res = apiRes.value;
      if (res.env === "mock") {
        setFreightResults(localEstimate(pesoNum, alt, larg, comp, originCep, cep));
        setFreightEstimated(true);
        setFreightUnavailable([]);
      } else {
        setFreightResults(res.carriers);
        setFreightEstimated(false);
        setFreightUnavailable(res.unavailable ?? []);
      }
    } else {
      setFreightResults([]);
      setFreightEstimated(false);
      setFreightUnavailable([]);
      toast.error("Cotação por API indisponível.");
    }

    setJamefResult(jamefRes.status === "fulfilled"
      ? jamefRes.value
      : { ok: false, motivo: "Não foi possível consultar a tabela de contrato." });
  };

  // As duas cotações são disparadas juntas — o botão só volta quando ambas
  // terminam, senão o resultado aparece pela metade.
  const calculando = calc.isPending || jamef.isPending;

  // Menor preço considerando API + Jamef juntas.
  const precos = [
    ...(freightResults ?? []).map((r) => r.price),
    ...(jamefResult?.ok ? [jamefResult.total] : []),
  ];
  const freightCheapest = precos.length ? Math.min(...precos) : 0;
  const jamefEhMaisBarato = !!jamefResult?.ok && jamefResult.total === freightCheapest;

  // Sugestão: o mais barato entre tudo que respondeu. Quando ele não tem prazo
  // (é o caso da Jamef — a tabela não traz), isso é dito, não escondido.
  const maisRapido = (freightResults ?? [])
    .filter((r) => r.delivery_max != null)
    .sort((a, b) => (a.delivery_max ?? 99) - (b.delivery_max ?? 99))[0];

  const sugestao = (() => {
    if (!freightResults && !jamefResult) return null;
    if (!precos.length) return null;
    if (jamefEhMaisBarato && jamefResult?.ok) {
      return {
        titulo: `Jamef — ${brlFrete(jamefResult.total)}`,
        motivo: "Menor preço entre as opções que responderam. A tabela de contrato não traz prazo: confirme a data com a transportadora antes de prometer entrega ao cliente.",
      };
    }
    const melhor = (freightResults ?? []).find((r) => r.price === freightCheapest);
    if (!melhor) return null;
    const economia = jamefResult?.ok ? jamefResult.total - melhor.price : 0;
    return {
      titulo: `${melhor.company} ${melhor.name} — ${brlFrete(melhor.price)}`,
      motivo: [
        `Menor preço${melhor.delivery_max != null ? `, ${prazoFrete(melhor.delivery_min, melhor.delivery_max)}` : ""}.`,
        economia > 0 ? `${brlFrete(economia)} mais barato que a Jamef.` : "",
        maisRapido && maisRapido.id !== melhor.id
          ? `Se o prazo apertar, ${maisRapido.company} ${maisRapido.name} entrega em ${prazoFrete(maisRapido.delivery_min, maisRapido.delivery_max)} por ${brlFrete(maisRapido.price)}.`
          : "",
      ].filter(Boolean).join(" "),
    };
  })();

  return (
    <div className="p-4 md:p-6">
      <div className="space-y-6 max-w-[1500px] mx-auto">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <CarboPageHeader title="Controle Logístico" description="Rastreie separação, envio e entrega das remessas" icon={Truck} />
          <Button className="gap-2 shrink-0" onClick={() => setNovaOpen(true)}><Plus className="h-4 w-4" /> Nova Remessa</Button>
        </div>

        <Tabs value={tab} onValueChange={changeTab} className="w-full">
          <TabsList>
            <TabsTrigger value="gestao">Gestão</TabsTrigger>
            <TabsTrigger value="frete" className="gap-1.5"><Truck className="h-3.5 w-3.5" /> Frete</TabsTrigger>
            <TabsTrigger value="estrategico">Estratégico</TabsTrigger>
          </TabsList>

          <TabsContent value="gestao" className="space-y-4 mt-4">
            <LogisticsKpis shipments={shipments} />
            {shipmentsLoading ? (
              <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /> Carregando remessas…</div>
            ) : (
              <ShipmentsKanban shipments={shipments} onView={setShipment} />
            )}
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
                  <div className="space-y-1.5">
                    <Label>CEP de destino</Label>
                    <Input placeholder="00000-000" maxLength={9} value={cep} onChange={(e) => setCep(e.target.value)} />
                    {/* Endereço do CEP — conferir aqui é barato; descobrir depois
                        que a carga saiu, não. */}
                    {buscandoCep && (
                      <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                        <Loader2 className="h-3 w-3 animate-spin" /> Buscando endereço…
                      </p>
                    )}
                    {endereco && (
                      <p className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
                        <MapPin className="h-3 w-3 shrink-0 mt-0.5 text-carbo-green" />
                        <span>
                          {[endereco.logradouro, endereco.bairro].filter(Boolean).join(", ")}
                          {(endereco.logradouro || endereco.bairro) && " — "}
                          <strong className="text-foreground">{endereco.cidade}/{endereco.uf}</strong>
                        </span>
                      </p>
                    )}
                    {cepNaoEncontrado && (
                      <p className="flex items-center gap-1.5 text-[11px] text-amber-600 dark:text-amber-400">
                        <AlertCircle className="h-3 w-3 shrink-0" /> CEP não encontrado — confira o número.
                      </p>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5"><Label>Peso (kg)</Label><Input type="number" min={0.1} step={0.1} placeholder="ex: 12.5" value={peso} onChange={(e) => setPeso(e.target.value)} /></div>
                    <div className="space-y-1.5"><Label>Valor da mercadoria (R$)</Label><Input type="number" min={0} step={0.01} placeholder="valor da NF" value={valorMerc} onChange={(e) => setValorMerc(e.target.value)} /></div>
                  </div>
                  <div className="grid grid-cols-[1fr_auto] gap-3 items-end">
                    <div className="space-y-1.5">
                      <Label>Dimensões da caixa (cm)</Label>
                      <div className="grid grid-cols-3 gap-2">
                        <Input type="number" min={1} placeholder="Altura" value={altura} onChange={(e) => setAltura(e.target.value)} />
                        <Input type="number" min={1} placeholder="Largura" value={largura} onChange={(e) => setLargura(e.target.value)} />
                        <Input type="number" min={1} placeholder="Compr." value={comprimento} onChange={(e) => setComprimento(e.target.value)} />
                      </div>
                    </div>
                    {/* Volumes entra na cubagem da Jamef (m³ × qtd × 300). Sem
                        ele, remessa com várias caixas sai barata demais. */}
                    <div className="space-y-1.5 w-20">
                      <Label>Volumes</Label>
                      <Input type="number" min={1} step={1} value={volumes} onChange={(e) => setVolumes(e.target.value)} />
                    </div>
                  </div>
                  <Button className="w-full gap-1.5" onClick={handleCalcularFrete} disabled={calculando}>
                    {calculando ? <><Loader2 className="h-4 w-4 animate-spin" /> Calculando…</> : <><Calculator className="h-4 w-4" /> Calcular Frete</>}
                  </Button>
                </CarboCardContent>
              </CarboCard>
              <CarboCard>
                <CarboCardHeader><CarboCardTitle>Resultado</CarboCardTitle></CarboCardHeader>
                <CarboCardContent className="space-y-2">
                  {!freightResults && !jamefResult ? (
                    <div className="py-12 text-center text-muted-foreground">
                      <Truck className="h-10 w-10 mx-auto mb-2 opacity-30" />
                      <p className="text-sm">Informe CEP, peso e dimensões e calcule para ver as transportadoras e prazos.</p>
                    </div>
                  ) : (
                    <>
                      {/* Sugestão primeiro: quem abre a tela quer a resposta,
                          não a lista para comparar sozinho. */}
                      {sugestao && (
                        <div className="rounded-lg border border-carbo-green/40 bg-carbo-green/[0.07] px-3 py-2.5 mb-1">
                          <div className="flex items-center gap-1.5">
                            <Sparkles className="h-3.5 w-3.5 text-carbo-green shrink-0" />
                            <span className="text-[11px] font-semibold uppercase tracking-wide text-carbo-green">Sugestão</span>
                          </div>
                          <p className="text-sm font-semibold mt-0.5">{sugestao.titulo}</p>
                          <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">{sugestao.motivo}</p>
                        </div>
                      )}

                      {/* Jamef — tabela de contrato, não API. */}
                      {jamefResult && (
                        <JamefQuoteCard quote={jamefResult} maisBarato={jamefEhMaisBarato} />
                      )}

                      {freightEstimated && (
                        <div className="flex items-start gap-1.5 rounded-md bg-amber-500/10 border border-amber-500/20 px-3 py-2 text-[11px] text-amber-600 dark:text-amber-400">
                          <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                          <span><strong>Estimativa aproximada</strong> — cotação em tempo real indisponível no momento.</span>
                        </div>
                      )}
                      {freightResults?.length === 0 && !jamefResult?.ok && (
                        <p className="py-2 text-center text-sm text-muted-foreground">Nenhuma transportadora disponível para este pacote/destino.</p>
                      )}
                      {(freightResults ?? []).map((r) => (
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

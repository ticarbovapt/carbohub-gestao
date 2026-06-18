import { useState } from "react";
import { CarboPageHeader } from "@/components/ui/carbo-page-header";
import { CarboCard, CarboCardContent, CarboCardHeader, CarboCardTitle } from "@/components/ui/carbo-card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Truck, Calculator, BarChart3, Plus, Loader2 } from "lucide-react";
import { ShipmentsKanban, LogisticsKpis, type Shipment } from "@/components/logistica/shipments";
import { FreightCalculatorDialog } from "@/components/logistica/FreightCalculatorDialog";
import { ShipmentDetailsDialog } from "@/components/logistica/ShipmentDetailsDialog";
import { NovaRemessaDialog } from "@/components/logistica/NovaRemessaDialog";
import { useShipments } from "@/hooks/useShipments";

export default function Logistica() {
  const { data: shipments = [], isLoading } = useShipments();
  const [cep, setCep] = useState("");
  const [freteOpen, setFreteOpen] = useState(false);
  const [novaOpen, setNovaOpen] = useState(false);
  const [shipment, setShipment] = useState<Shipment | null>(null);

  return (
    <div className="p-4 md:p-6">
      <div className="space-y-6 max-w-[1500px] mx-auto">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <CarboPageHeader title="Controle Logístico" description="Rastreie separação, envio e entrega das remessas" icon={Truck} />
          <Button className="gap-2 shrink-0" onClick={() => setNovaOpen(true)}><Plus className="h-4 w-4" /> Nova Remessa</Button>
        </div>

        <Tabs defaultValue="operacional" className="w-full">
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
                  <div className="space-y-1.5"><Label>CEP de destino</Label><Input placeholder="00000-000" value={cep} onChange={(e) => setCep(e.target.value)} /></div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5"><Label>Produto</Label><Input placeholder="CarboZé 100ml" /></div>
                    <div className="space-y-1.5"><Label>Quantidade</Label><Input type="number" placeholder="100" /></div>
                  </div>
                  <Button className="w-full gap-1.5" onClick={() => setFreteOpen(true)}><Calculator className="h-4 w-4" /> Calcular Frete</Button>
                </CarboCardContent>
              </CarboCard>
              <CarboCard>
                <CarboCardHeader><CarboCardTitle>Resultado</CarboCardTitle></CarboCardHeader>
                <CarboCardContent className="py-12 text-center text-muted-foreground">
                  <Truck className="h-10 w-10 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">Informe o CEP e calcule para ver as transportadoras e prazos.</p>
                </CarboCardContent>
              </CarboCard>
            </div>
            <CarboCard>
              <CarboCardHeader><CarboCardTitle>Relatórios de Frete</CarboCardTitle></CarboCardHeader>
              <CarboCardContent className="py-8 text-center text-muted-foreground"><BarChart3 className="h-8 w-8 mx-auto mb-2 opacity-30" /><p className="text-sm">Histórico de cotações e custos de frete — entra na fase de lógica.</p></CarboCardContent>
            </CarboCard>
          </TabsContent>

          <TabsContent value="estrategico" className="space-y-4 mt-4">
            <CarboCard><CarboCardContent className="py-12 text-center text-muted-foreground"><BarChart3 className="h-10 w-10 mx-auto mb-2 opacity-30" /><p>Visão estratégica de logística (custo por rota, performance de transportadoras) — entra na fase de lógica.</p></CarboCardContent></CarboCard>
          </TabsContent>
        </Tabs>
        <p className="text-xs text-muted-foreground text-center">Cotação de frete (transportadoras) e visão estratégica dependem de integração — entram numa fase futura.</p>
      </div>

      <NovaRemessaDialog open={novaOpen} onOpenChange={setNovaOpen} />
      <FreightCalculatorDialog open={freteOpen} onOpenChange={setFreteOpen} />
      <ShipmentDetailsDialog
        shipment={shipment}
        open={shipment !== null}
        onOpenChange={(o) => { if (!o) setShipment(null); }}
      />
    </div>
  );
}

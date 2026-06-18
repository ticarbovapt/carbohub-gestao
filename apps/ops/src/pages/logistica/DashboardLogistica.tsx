import { CarboPageHeader } from "@/components/ui/carbo-page-header";
import { CarboCard, CarboCardContent } from "@/components/ui/carbo-card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Truck, BarChart3, Loader2 } from "lucide-react";
import { useState } from "react";
import { ShipmentsKanban, LogisticsKpis, type Shipment } from "@/components/logistica/shipments";
import { ShipmentDetailsDialog } from "@/components/logistica/ShipmentDetailsDialog";
import { useShipments } from "@/hooks/useShipments";

export default function DashboardLogistica() {
  const { data: shipments = [], isLoading } = useShipments();
  const [shipment, setShipment] = useState<Shipment | null>(null);
  return (
    <div className="p-4 md:p-6">
      <div className="space-y-6 max-w-[1500px] mx-auto">
        <CarboPageHeader title="Dashboard — Logística" description="Rastreamento de remessas e KPIs de entrega" icon={Truck} />

        <Tabs defaultValue="kpis" className="w-full">
          <TabsList>
            <TabsTrigger value="kpis">KPIs</TabsTrigger>
            <TabsTrigger value="operacional">Operacional</TabsTrigger>
            <TabsTrigger value="estrategico">Estratégico</TabsTrigger>
          </TabsList>
          <TabsContent value="kpis" className="space-y-4 mt-4"><LogisticsKpis shipments={shipments} /></TabsContent>
          <TabsContent value="operacional" className="space-y-4 mt-4">
            {isLoading ? <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /> Carregando…</div> : <ShipmentsKanban shipments={shipments} onView={setShipment} />}
          </TabsContent>
          <TabsContent value="estrategico" className="space-y-4 mt-4">
            <CarboCard><CarboCardContent className="py-12 text-center text-muted-foreground"><BarChart3 className="h-10 w-10 mx-auto mb-2 opacity-30" /><p>Visão estratégica (custo por rota, performance de transportadoras) depende de integração de frete — fase futura.</p></CarboCardContent></CarboCard>
          </TabsContent>
        </Tabs>
      </div>

      <ShipmentDetailsDialog
        shipment={shipment}
        open={shipment !== null}
        onOpenChange={(o) => { if (!o) setShipment(null); }}
      />
    </div>
  );
}

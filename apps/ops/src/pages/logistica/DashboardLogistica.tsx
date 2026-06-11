import { CarboPageHeader } from "@/components/ui/carbo-page-header";
import { CarboCard, CarboCardContent } from "@/components/ui/carbo-card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Truck, CalendarRange, BarChart3 } from "lucide-react";
import { useState } from "react";
import { MOCK_SHIPMENTS, ShipmentsKanban, LogisticsKpis, type Shipment } from "@/components/logistica/shipments";
import { ShipmentDetailsDialog } from "@/components/logistica/ShipmentDetailsDialog";

// ⚠️ PORT VISUAL FIEL ao Controle (/dashboards/logistica → DashboardLogistica) — dados MOCK.

export default function DashboardLogistica() {
  const [shipment, setShipment] = useState<Shipment | null>(null);
  return (
    <div className="p-4 md:p-6">
      <div className="space-y-6 max-w-[1500px] mx-auto">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <CarboPageHeader title="Dashboard — Logística" description="Rastreamento de remessas, KPIs de entrega e visão estratégica" icon={Truck} />
          <div className="flex items-end gap-2 shrink-0">
            <div className="space-y-1">
              <Label className="text-[10px] text-muted-foreground flex items-center gap-1"><CalendarRange className="h-3 w-3" /> Período</Label>
              <div className="flex items-center gap-1"><Input type="date" className="h-8 w-[130px] text-xs" /><span className="text-xs text-muted-foreground">até</span><Input type="date" className="h-8 w-[130px] text-xs" /></div>
            </div>
          </div>
        </div>

        <Tabs defaultValue="kpis" className="w-full">
          <TabsList>
            <TabsTrigger value="kpis">KPIs</TabsTrigger>
            <TabsTrigger value="operacional">Operacional</TabsTrigger>
            <TabsTrigger value="estrategico">Estratégico</TabsTrigger>
          </TabsList>
          <TabsContent value="kpis" className="space-y-4 mt-4"><LogisticsKpis shipments={MOCK_SHIPMENTS} /></TabsContent>
          <TabsContent value="operacional" className="space-y-4 mt-4"><ShipmentsKanban shipments={MOCK_SHIPMENTS} onView={setShipment} /></TabsContent>
          <TabsContent value="estrategico" className="space-y-4 mt-4">
            <CarboCard><CarboCardContent className="py-12 text-center text-muted-foreground"><BarChart3 className="h-10 w-10 mx-auto mb-2 opacity-30" /><p>Visão estratégica de logística — entra na fase de lógica.</p></CarboCardContent></CarboCard>
          </TabsContent>
        </Tabs>
        <p className="text-xs text-muted-foreground text-center">Tela em port visual — dados de exemplo. Os dados reais entram na fase de lógica.</p>
      </div>

      <ShipmentDetailsDialog
        shipment={shipment}
        open={shipment !== null}
        onOpenChange={(o) => { if (!o) setShipment(null); }}
      />
    </div>
  );
}

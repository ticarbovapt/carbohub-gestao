import { useState } from "react";
import { BoardLayout } from "@/components/layouts/BoardLayout";
import { CarboPageHeader } from "@/components/ui/carbo-page-header";
import { Truck } from "lucide-react";
import { LogisticsKPIs } from "@/components/logistics/LogisticsKPIs";
import { LogisticsStrategic } from "@/components/logistics/LogisticsStrategic";
import { LogisticsKanban } from "@/components/logistics/LogisticsKanban";
import { ShipmentDetailsDialog } from "@/components/logistics/ShipmentDetailsDialog";
import { useShipments, useUpdateShipmentStatus } from "@/hooks/useShipments";
import { Shipment, ShipmentStatus } from "@/types/shipment";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

export default function DashboardLogistica() {
  const { isCeo, isAnyGestor } = useAuth();
  const { data: shipments = [], isLoading } = useShipments();
  const updateStatus = useUpdateShipmentStatus();
  const [selectedShipment, setSelectedShipment] = useState<Shipment | null>(null);

  const handleAdvance = (id: string, nextStatus: ShipmentStatus) => {
    updateStatus.mutate({ id, status: nextStatus });
  };

  return (
    <BoardLayout>
      <div className="space-y-6">
        <CarboPageHeader
          title="Dashboard — Logística"
          description="Rastreamento de remessas, KPIs de entrega e visão estratégica"
          icon={Truck}
        />

        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : (
          <Tabs defaultValue="kpis" className="w-full">
            <TabsList>
              <TabsTrigger value="kpis">KPIs</TabsTrigger>
              <TabsTrigger value="operacional">Operacional</TabsTrigger>
              {(isCeo || isAnyGestor) && (
                <TabsTrigger value="estrategico">Estratégico</TabsTrigger>
              )}
            </TabsList>

            <TabsContent value="kpis" className="space-y-4 mt-4">
              <LogisticsKPIs shipments={shipments} />
            </TabsContent>

            <TabsContent value="operacional" className="space-y-4 mt-4">
              <LogisticsKanban
                shipments={shipments}
                onAdvance={handleAdvance}
                onViewDetails={setSelectedShipment}
              />
            </TabsContent>

            {(isCeo || isAnyGestor) && (
              <TabsContent value="estrategico" className="space-y-4 mt-4">
                <LogisticsStrategic shipments={shipments} />
              </TabsContent>
            )}
          </Tabs>
        )}
      </div>

      <ShipmentDetailsDialog
        shipment={selectedShipment}
        open={!!selectedShipment}
        onOpenChange={(open) => !open && setSelectedShipment(null)}
      />
    </BoardLayout>
  );
}

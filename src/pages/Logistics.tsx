import { useState } from "react";
import { BoardLayout } from "@/components/layouts/BoardLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LogisticsKanban } from "@/components/logistics/LogisticsKanban";
import { LogisticsKPIs } from "@/components/logistics/LogisticsKPIs";
import { LogisticsStrategic } from "@/components/logistics/LogisticsStrategic";
import { ShipmentDetailsDialog } from "@/components/logistics/ShipmentDetailsDialog";
import { useShipments, useUpdateShipmentStatus } from "@/hooks/useShipments";
import { useAuth } from "@/contexts/AuthContext";
import { Shipment, ShipmentStatus } from "@/types/shipment";
import { Loader2, Truck } from "lucide-react";
import { CarboPageHeader } from "@/components/ui/carbo-page-header";

export default function Logistics() {
  const { isCeo, isAnyGestor } = useAuth();
  const { data: shipments = [], isLoading } = useShipments();
  const updateStatus = useUpdateShipmentStatus();
  const [selectedShipment, setSelectedShipment] = useState<Shipment | null>(null);

  const handleAdvance = (id: string, nextStatus: ShipmentStatus) => {
    updateStatus.mutate({ id, status: nextStatus });
  };

  if (isLoading) {
    return (
      <BoardLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </BoardLayout>
    );
  }

  return (
    <BoardLayout>
      <div className="space-y-6">
        <CarboPageHeader
          title="Controle Logístico"
          description="Rastreie separação, envio e entrega vinculados às Ordens de Produção"
          icon={Truck}
        />

        <Tabs defaultValue="operacional" className="w-full">
          <TabsList>
            <TabsTrigger value="operacional">Operacional</TabsTrigger>
            <TabsTrigger value="gestao">Gestão</TabsTrigger>
            {(isCeo || isAnyGestor) && (
              <TabsTrigger value="estrategico">Estratégico</TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="operacional" className="space-y-4">
            <LogisticsKanban
              shipments={shipments}
              onAdvance={handleAdvance}
              onViewDetails={setSelectedShipment}
            />
          </TabsContent>

          <TabsContent value="gestao" className="space-y-4">
            <LogisticsKPIs shipments={shipments} />
          </TabsContent>

          {(isCeo || isAnyGestor) && (
            <TabsContent value="estrategico" className="space-y-4">
              <LogisticsStrategic shipments={shipments} />
            </TabsContent>
          )}
        </Tabs>
      </div>

      <ShipmentDetailsDialog
        shipment={selectedShipment}
        open={!!selectedShipment}
        onOpenChange={(open) => !open && setSelectedShipment(null)}
      />
    </BoardLayout>
  );
}

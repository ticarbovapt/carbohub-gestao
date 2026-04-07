import { useState } from "react";
import { BoardLayout } from "@/components/layouts/BoardLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LogisticsKanban } from "@/components/logistics/LogisticsKanban";
import { LogisticsKPIs } from "@/components/logistics/LogisticsKPIs";
import { LogisticsStrategic } from "@/components/logistics/LogisticsStrategic";
import { ShipmentDetailsDialog } from "@/components/logistics/ShipmentDetailsDialog";
import { FreightCalculator } from "@/components/logistics/FreightCalculator";
import { FreightResults } from "@/components/logistics/FreightResults";
import { FreightReports } from "@/components/logistics/FreightReports";
import { useShipments, useUpdateShipmentStatus } from "@/hooks/useShipments";
import {
  useCalculateFreight,
  useSaveFreightQuote,
  type FreightQuoteResult,
  type FreightCarrier,
} from "@/hooks/useFreightQuote";
import { useAuth } from "@/contexts/AuthContext";
import { Shipment, ShipmentStatus } from "@/types/shipment";
import { Loader2, Truck } from "lucide-react";
import { CarboPageHeader } from "@/components/ui/carbo-page-header";
import { toast } from "sonner";

export default function Logistics() {
  const { isCeo, isAnyGestor } = useAuth();
  const { data: shipments = [], isLoading } = useShipments();
  const updateStatus  = useUpdateShipmentStatus();
  const [selectedShipment, setSelectedShipment] = useState<Shipment | null>(null);

  // ── Freight state ──────────────────────────────────────────────────────────
  const calculateFreight = useCalculateFreight();
  const saveFreightQuote = useSaveFreightQuote();

  const [freightResult, setFreightResult] = useState<FreightQuoteResult | null>(null);
  const [freightMeta, setFreightMeta] = useState<{
    to_cep:     string;
    to_city?:   string;
    to_state?:  string;
    productRef: string;
    quantity:   number;
  } | null>(null);

  const handleAdvance = (id: string, nextStatus: ShipmentStatus) => {
    updateStatus.mutate({ id, status: nextStatus });
  };

  const handleCalculate = async (payload: {
    to_cep:     string;
    products:   import("@/hooks/useFreightQuote").FreightProduct[];
    productRef: string;
    quantity:   number;
    to_city?:   string;
    to_state?:  string;
  }) => {
    setFreightResult(null);
    setFreightMeta({
      to_cep:     payload.to_cep,
      to_city:    payload.to_city,
      to_state:   payload.to_state,
      productRef: payload.productRef,
      quantity:   payload.quantity,
    });
    const result = await calculateFreight.mutateAsync({
      to_cep:   payload.to_cep,
      products: payload.products,
    });
    setFreightResult(result);
  };

  const handleSaveCarrier = (carrier: FreightCarrier) => {
    if (!freightMeta) return;
    saveFreightQuote.mutate({
      to_cep:           freightMeta.to_cep,
      to_city:          freightMeta.to_city,
      to_state:         freightMeta.to_state,
      product_ref:      freightMeta.productRef,
      quantity:         freightMeta.quantity,
      carriers:         freightResult?.carriers ?? [],
      selected_carrier: carrier.name,
      selected_price:   carrier.custom_price ?? carrier.price,
      selected_days:    carrier.delivery_max ?? carrier.delivery_min ?? undefined,
    });
    toast.success(`Cotação salva — ${carrier.name} (${carrier.company})`);
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
            <TabsTrigger value="frete" className="gap-1.5">
              <Truck className="h-3.5 w-3.5" />
              Frete
            </TabsTrigger>
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

          {/* ── Frete tab ─────────────────────────────────────────────────── */}
          <TabsContent value="frete" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <FreightCalculator
                onCalculate={handleCalculate}
                isLoading={calculateFreight.isPending}
              />
              <FreightResults
                result={freightResult}
                note={freightResult?.note}
                onSave={handleSaveCarrier}
                isSaving={saveFreightQuote.isPending}
              />
            </div>
            <FreightReports />
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

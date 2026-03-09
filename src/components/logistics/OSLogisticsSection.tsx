import { useShipmentsByOS } from "@/hooks/useShipments";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SHIPMENT_STATUS_CONFIG } from "@/types/shipment";
import { Truck, Package, MapPin } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

interface OSLogisticsSectionProps {
  serviceOrderId: string;
}

export function OSLogisticsSection({ serviceOrderId }: OSLogisticsSectionProps) {
  const { data: shipments = [], isLoading } = useShipmentsByOS(serviceOrderId);

  if (isLoading || shipments.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base lg:text-lg flex items-center gap-2">
          <Truck className="h-5 w-5" /> Logística
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {shipments.map((shipment) => {
          const config = SHIPMENT_STATUS_CONFIG[shipment.status];
          const totalItems = shipment.items.reduce(
            (s, i) => s + i.quantidade,
            0
          );

          return (
            <div
              key={shipment.id}
              className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 border-l-4"
              style={{ borderLeftColor: config.color }}
            >
              <div className="text-xl">{config.icon}</div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge
                    variant="outline"
                    className="text-xs"
                    style={{ borderColor: config.color, color: config.color }}
                  >
                    {config.label}
                  </Badge>
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <Package className="h-3 w-3" />
                    {totalItems} un.
                  </span>
                  {shipment.destination && (
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <MapPin className="h-3 w-3" />
                      {shipment.destination}
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Atualizado{" "}
                  {formatDistanceToNow(new Date(shipment.updated_at), {
                    locale: ptBR,
                    addSuffix: true,
                  })}
                </p>
              </div>
              {shipment.tracking_code && (
                <span className="text-xs font-mono text-muted-foreground">
                  {shipment.tracking_code}
                </span>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

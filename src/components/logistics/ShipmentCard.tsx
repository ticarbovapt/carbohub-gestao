import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowRight, MapPin, Package, Truck, ExternalLink } from "lucide-react";
import { Shipment, SHIPMENT_STATUS_CONFIG, ShipmentStatus } from "@/types/shipment";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

interface ShipmentCardProps {
  shipment: Shipment;
  onAdvance?: (id: string, nextStatus: ShipmentStatus) => void;
  onViewDetails?: (shipment: Shipment) => void;
}

const STATUS_FLOW: Record<ShipmentStatus, ShipmentStatus | null> = {
  separacao_pendente: "separando",
  separando: "separado",
  separado: "em_transporte",
  em_transporte: "entregue",
  entregue: null,
  cancelado: null,
};

export function ShipmentCard({ shipment, onAdvance, onViewDetails }: ShipmentCardProps) {
  const config = SHIPMENT_STATUS_CONFIG[shipment.status];
  const nextStatus = STATUS_FLOW[shipment.status];
  const nextConfig = nextStatus ? SHIPMENT_STATUS_CONFIG[nextStatus] : null;
  const totalItems = shipment.items.reduce((sum, i) => sum + i.quantidade, 0);

  return (
    <Card
      className="cursor-pointer hover:shadow-md transition-shadow border-l-4"
      style={{ borderLeftColor: config.color }}
      onClick={() => onViewDetails?.(shipment)}
    >
      <CardContent className="p-4 space-y-3">
        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground truncate">
              {shipment.service_order?.os_number || "OP"}
            </p>
            <p className="text-xs text-muted-foreground truncate">
              {shipment.service_order?.title}
            </p>
          </div>
          <Badge
            variant="outline"
            className="text-xs shrink-0"
            style={{ borderColor: config.color, color: config.color }}
          >
            {config.icon} {config.label}
          </Badge>
        </div>

        {/* Info */}
        <div className="space-y-1.5 text-xs text-muted-foreground">
          {shipment.destination && (
            <div className="flex items-center gap-1.5">
              <MapPin className="h-3 w-3 shrink-0" />
              <span className="truncate">{shipment.destination}</span>
            </div>
          )}
          <div className="flex items-center gap-1.5">
            <Package className="h-3 w-3 shrink-0" />
            <span>
              {shipment.items.length} item(ns) · {totalItems} un.
            </span>
          </div>
          {shipment.tracking_code && (
            <div className="flex items-center gap-1.5">
              <Truck className="h-3 w-3 shrink-0" />
              <span className="truncate">{shipment.tracking_code}</span>
              {shipment.tracking_url && (
                <a
                  href={shipment.tracking_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                >
                  <ExternalLink className="h-3 w-3 text-primary" />
                </a>
              )}
            </div>
          )}
          {shipment.service_order?.customer && (
            <p className="text-xs">
              Cliente: {shipment.service_order.customer.name}
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between pt-1">
          <span className="text-xs text-muted-foreground">
            {formatDistanceToNow(new Date(shipment.updated_at), {
              locale: ptBR,
              addSuffix: true,
            })}
          </span>
          {nextStatus && onAdvance && (
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs gap-1"
              onClick={(e) => {
                e.stopPropagation();
                onAdvance(shipment.id, nextStatus);
              }}
            >
              {nextConfig?.label}
              <ArrowRight className="h-3 w-3" />
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

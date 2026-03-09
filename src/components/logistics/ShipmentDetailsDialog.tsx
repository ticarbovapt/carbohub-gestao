import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  Shipment,
  ShipmentStatus,
  SHIPMENT_STATUS_CONFIG,
  TRANSPORT_MODES,
} from "@/types/shipment";
import { useUpdateShipmentStatus } from "@/hooks/useShipments";
import { Loader2, Package, MapPin, Truck, Calendar } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface ShipmentDetailsDialogProps {
  shipment: Shipment | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const NEXT_STATUS: Record<ShipmentStatus, ShipmentStatus | null> = {
  separacao_pendente: "separando",
  separando: "separado",
  separado: "em_transporte",
  em_transporte: "entregue",
  entregue: null,
  cancelado: null,
};

export function ShipmentDetailsDialog({
  shipment,
  open,
  onOpenChange,
}: ShipmentDetailsDialogProps) {
  const updateStatus = useUpdateShipmentStatus();
  const [transportMode, setTransportMode] = useState("");
  const [carrierName, setCarrierName] = useState("");
  const [trackingCode, setTrackingCode] = useState("");
  const [deliveryNotes, setDeliveryNotes] = useState("");

  if (!shipment) return null;

  const config = SHIPMENT_STATUS_CONFIG[shipment.status];
  const nextStatus = NEXT_STATUS[shipment.status];

  const handleAdvance = () => {
    if (!nextStatus) return;

    const extra: Record<string, any> = {};
    if (nextStatus === "em_transporte") {
      extra.transport_mode = transportMode || null;
      extra.carrier_name = carrierName || null;
      extra.tracking_code = trackingCode || null;
    }
    if (nextStatus === "entregue") {
      extra.delivery_notes = deliveryNotes || null;
    }

    updateStatus.mutate(
      { id: shipment.id, status: nextStatus, extra },
      { onSuccess: () => onOpenChange(false) }
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span>{config.icon}</span>
            Envio — {shipment.service_order?.os_number || "OP"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Status */}
          <div className="flex items-center gap-2">
            <Badge
              variant="outline"
              style={{ borderColor: config.color, color: config.color }}
            >
              {config.label}
            </Badge>
            {shipment.service_order?.customer && (
              <span className="text-sm text-muted-foreground">
                {shipment.service_order.customer.name}
              </span>
            )}
          </div>

          <Separator />

          {/* Items */}
          <div>
            <h4 className="text-sm font-medium flex items-center gap-1.5 mb-2">
              <Package className="h-4 w-4" /> Itens
            </h4>
            <div className="space-y-1">
              {shipment.items.map((item, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between text-sm bg-muted/50 rounded px-3 py-1.5"
                >
                  <span>{item.nome}</span>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span>{item.quantidade} un.</span>
                    {item.lote && <span>Lote: {item.lote}</span>}
                    {item.validade && <span>Val: {item.validade}</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Destination */}
          {shipment.destination && (
            <div className="flex items-center gap-1.5 text-sm">
              <MapPin className="h-4 w-4 text-muted-foreground" />
              {shipment.destination}
            </div>
          )}

          {/* Shipping info */}
          {shipment.shipped_at && (
            <div className="flex items-center gap-1.5 text-sm">
              <Truck className="h-4 w-4 text-muted-foreground" />
              {shipment.transport_mode &&
                TRANSPORT_MODES.find((m) => m.value === shipment.transport_mode)
                  ?.label}{" "}
              {shipment.carrier_name && `· ${shipment.carrier_name}`}
              {shipment.tracking_code && ` · ${shipment.tracking_code}`}
            </div>
          )}

          {/* Delivery info */}
          {shipment.delivered_at && (
            <div className="flex items-center gap-1.5 text-sm">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              Entregue em{" "}
              {format(new Date(shipment.delivered_at), "dd/MM/yyyy HH:mm", {
                locale: ptBR,
              })}
            </div>
          )}

          <Separator />

          {/* Advance form */}
          {nextStatus === "em_transporte" && (
            <div className="space-y-3">
              <h4 className="text-sm font-medium">Dados de Envio</h4>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Modal</Label>
                  <Select value={transportMode} onValueChange={setTransportMode}>
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                    <SelectContent>
                      {TRANSPORT_MODES.map((m) => (
                        <SelectItem key={m.value} value={m.value}>
                          {m.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Transportadora</Label>
                  <Input
                    className="h-9"
                    value={carrierName}
                    onChange={(e) => setCarrierName(e.target.value)}
                    placeholder="Nome"
                  />
                </div>
              </div>
              <div>
                <Label className="text-xs">Código de Rastreio</Label>
                <Input
                  className="h-9"
                  value={trackingCode}
                  onChange={(e) => setTrackingCode(e.target.value)}
                  placeholder="Opcional"
                />
              </div>
            </div>
          )}

          {nextStatus === "entregue" && (
            <div>
              <Label className="text-xs">Observações de Entrega</Label>
              <Textarea
                value={deliveryNotes}
                onChange={(e) => setDeliveryNotes(e.target.value)}
                placeholder="Observações finais..."
                rows={3}
              />
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
          {nextStatus && (
            <Button onClick={handleAdvance} disabled={updateStatus.isPending}>
              {updateStatus.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : null}
              Avançar para {SHIPMENT_STATUS_CONFIG[nextStatus].label}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

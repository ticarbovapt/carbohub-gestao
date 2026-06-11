// ⚠️ Form em port visual — campos MOCK; submit liga na fase de lógica.
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { CarboBadge } from "@/components/ui/carbo-badge";
import { Separator } from "@/components/ui/separator";
import { Package, MapPin, Truck, Hash } from "lucide-react";
import { type Shipment, SHIPMENT_STATUS_CONFIG } from "@/components/logistica/shipments";

interface ShipmentDetailsDialogProps {
  shipment: Shipment | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// Itens MOCK derivados do nº de itens do embarque
const MOCK_ITEMS = [
  { nome: "CarboZé 100ml", lote: "L-2406", validade: "06/2027" },
  { nome: "CarboZé 250ml", lote: "L-2405", validade: "05/2027" },
  { nome: "Aditivo Premium 500ml", lote: "L-2404", validade: "04/2027" },
  { nome: "Kit Aplicador", lote: "L-2403", validade: "—" },
];

export function ShipmentDetailsDialog({ shipment, open, onOpenChange }: ShipmentDetailsDialogProps) {
  if (!shipment) return null;

  const config = SHIPMENT_STATUS_CONFIG[shipment.status];
  const items = MOCK_ITEMS.slice(0, shipment.items);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span>{config.icon}</span> Embarque — {shipment.order_number}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <CarboBadge variant="outline" style={{ borderColor: config.color, color: config.color }}>
              {config.label}
            </CarboBadge>
            <span className="text-sm text-muted-foreground">{shipment.customer}</span>
          </div>

          <Separator />

          <div className="space-y-2 text-sm">
            <div className="flex items-center gap-2">
              <Hash className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">Pedido:</span>
              <span className="font-mono font-medium">{shipment.order_number}</span>
            </div>
            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">Destino:</span>
              <span className="font-medium">{shipment.destination}</span>
            </div>
            <div className="flex items-center gap-2">
              <Truck className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">Transportadora:</span>
              <span className="font-medium">{shipment.carrier_name || "Não definida"}</span>
            </div>
            <div className="flex items-center gap-2">
              <Package className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">Rastreio:</span>
              <span className="font-mono font-medium">{shipment.tracking_code || "—"}</span>
            </div>
          </div>

          <Separator />

          <div>
            <h4 className="text-sm font-medium flex items-center gap-1.5 mb-2">
              <Package className="h-4 w-4" /> Itens ({shipment.items})
            </h4>
            <div className="space-y-1">
              {items.map((item, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between text-sm bg-muted/50 rounded px-3 py-1.5"
                >
                  <span>{item.nome}</span>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span>Lote: {item.lote}</span>
                    <span>Val: {item.validade}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

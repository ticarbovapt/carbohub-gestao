import { useEffect, useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Package, MapPin, Hash, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { type Shipment, type ShipmentStatus, SHIPMENT_STATUS_CONFIG } from "@/components/logistica/shipments";
import { useShipmentMutations } from "@/hooks/useShipments";

const STATUS_OPTIONS: ShipmentStatus[] = ["separacao_pendente", "separando", "separado", "em_transporte", "entregue", "cancelado"];

export function ShipmentDetailsDialog({ shipment, open, onOpenChange }: { shipment: Shipment | null; open: boolean; onOpenChange: (open: boolean) => void }) {
  const { update } = useShipmentMutations();
  const [status, setStatus] = useState<ShipmentStatus>("separacao_pendente");
  const [carrier, setCarrier] = useState("");
  const [tracking, setTracking] = useState("");

  useEffect(() => {
    if (!shipment) return;
    setStatus(shipment.status);
    setCarrier(shipment.carrier_name ?? "");
    setTracking(shipment.tracking_code ?? "");
  }, [shipment?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!shipment) return null;
  const config = SHIPMENT_STATUS_CONFIG[shipment.status];

  const handleSave = async () => {
    try {
      await update.mutateAsync({ id: shipment.id, status, carrierName: carrier, trackingCode: tracking });
      toast.success("Remessa atualizada.");
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível atualizar a remessa.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span>{config.icon}</span> Embarque — {shipment.order_number}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2 text-sm">
            <div className="flex items-center gap-2">
              <Hash className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">Cliente:</span>
              <span className="font-medium">{shipment.customer}</span>
            </div>
            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">Destino:</span>
              <span className="font-medium">{shipment.destination}</span>
            </div>
            <div className="flex items-center gap-2">
              <Package className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">Itens:</span>
              <span className="font-medium">{shipment.items}</span>
            </div>
          </div>

          <Separator />

          <div className="space-y-1.5">
            <Label>Status</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as ShipmentStatus)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((s) => <SelectItem key={s} value={s}>{SHIPMENT_STATUS_CONFIG[s].icon} {SHIPMENT_STATUS_CONFIG[s].label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Transportadora</Label>
              <Input value={carrier} onChange={(e) => setCarrier(e.target.value)} placeholder="Não definida" />
            </div>
            <div className="space-y-1.5">
              <Label>Código de rastreio</Label>
              <Input value={tracking} onChange={(e) => setTracking(e.target.value)} placeholder="—" />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={update.isPending}>Cancelar</Button>
          <Button onClick={handleSave} disabled={update.isPending}>
            {update.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Salvando…</> : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

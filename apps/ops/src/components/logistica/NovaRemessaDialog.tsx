import { useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Truck, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useShipmentMutations } from "@/hooks/useShipments";

export function NovaRemessaDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { create } = useShipmentMutations();
  const [orderNumber, setOrderNumber] = useState("");
  const [customer, setCustomer] = useState("");
  const [destination, setDestination] = useState("");
  const [items, setItems] = useState("1");
  const [carrier, setCarrier] = useState("");
  const [tracking, setTracking] = useState("");

  const reset = () => { setOrderNumber(""); setCustomer(""); setDestination(""); setItems("1"); setCarrier(""); setTracking(""); };
  const close = (v: boolean) => { if (!v) reset(); onOpenChange(v); };

  const handleSubmit = async () => {
    try {
      await create.mutateAsync({ orderNumber, customer, destination, items: Number(items) || 0, carrierName: carrier, trackingCode: tracking });
      toast.success("Remessa criada.");
      reset();
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível criar a remessa.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Truck className="h-4 w-4" /> Nova Remessa</DialogTitle>
          <DialogDescription>Registre uma remessa para rastreio operacional.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>Nº do pedido *</Label><Input value={orderNumber} onChange={(e) => setOrderNumber(e.target.value)} placeholder="Ex.: PED-1023" /></div>
            <div className="space-y-1.5"><Label>Itens</Label><Input type="number" min={0} value={items} onChange={(e) => setItems(e.target.value)} /></div>
          </div>
          <div className="space-y-1.5"><Label>Cliente *</Label><Input value={customer} onChange={(e) => setCustomer(e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Destino</Label><Input value={destination} onChange={(e) => setDestination(e.target.value)} placeholder="Cidade/UF" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>Transportadora</Label><Input value={carrier} onChange={(e) => setCarrier(e.target.value)} placeholder="Opcional" /></div>
            <div className="space-y-1.5"><Label>Rastreio</Label><Input value={tracking} onChange={(e) => setTracking(e.target.value)} placeholder="Opcional" /></div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={create.isPending}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={create.isPending}>
            {create.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Criando…</> : "Criar Remessa"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

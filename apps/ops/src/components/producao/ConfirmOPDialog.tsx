// ⚠️ Form em port visual — campos MOCK; submit liga na fase de lógica.
import { useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ClipboardCheck, CheckCircle, XCircle, Package, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export interface ConfirmOPTarget {
  op_number: string;
  sku_code: string;
  sku_name: string;
  planned_quantity: number;
}

interface ConfirmOPDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  order: ConfirmOPTarget | null;
}

function YieldBadge({ pct }: { pct: number }) {
  const color = pct >= 90 ? "bg-green-500" : pct >= 75 ? "bg-yellow-500" : "bg-red-500";
  return <span className={cn("text-white border-0 text-sm px-3 py-1 rounded-md", color)}>{pct.toFixed(1)}%</span>;
}

export function ConfirmOPDialog({ open, onOpenChange, order }: ConfirmOPDialogProps) {
  const [goodQty, setGoodQty] = useState("");
  const [rejectedQty, setRejectedQty] = useState("0");
  const [rejectionReason, setRejectionReason] = useState("");
  const [deviationNotes, setDeviationNotes] = useState("");

  const handleOpenChange = (isOpen: boolean) => {
    if (isOpen && order) {
      setGoodQty(String(order.planned_quantity));
      setRejectedQty("0");
      setRejectionReason("");
      setDeviationNotes("");
    }
    onOpenChange(isOpen);
  };

  if (!order) return null;

  const planned = order.planned_quantity;
  const good = Number(goodQty) || 0;
  const rejected = Number(rejectedQty) || 0;
  const yieldPct = planned > 0 ? Math.min(100, Math.max(0, (good / planned) * 100)) : 0;

  const handleSubmit = () => {
    toast.info("Disponível na fase de lógica");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="w-[calc(100%-2rem)] sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ClipboardCheck className="h-5 w-5 text-purple-500" />
            Confirmar Produção
          </DialogTitle>
          <DialogDescription>
            {order.sku_code} — {order.sku_name} | Planejado: {order.planned_quantity} un
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* OP info */}
          <div className="rounded-lg bg-muted/50 border border-border px-4 py-3 space-y-1">
            <p className="font-mono text-[11px] text-muted-foreground tracking-wide">{order.op_number}</p>
            <p className="font-semibold text-sm flex items-center gap-1.5">
              <Package className="h-3.5 w-3.5 text-muted-foreground" /> {order.sku_name}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="goodQty" className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-green-500" /> Quantidade Aprovada
              </Label>
              <Input id="goodQty" type="number" min={0} value={goodQty}
                onChange={(e) => setGoodQty(e.target.value)} className="text-lg font-bold" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="rejectedQty" className="flex items-center gap-2">
                <XCircle className="h-4 w-4 text-red-500" /> Quantidade Rejeitada
              </Label>
              <Input id="rejectedQty" type="number" min={0} value={rejectedQty}
                onChange={(e) => setRejectedQty(e.target.value)} className="text-lg font-bold" />
            </div>
          </div>

          {/* Yield preview */}
          <div className="bg-muted/50 rounded-lg p-4 flex items-center justify-between">
            <span className="text-sm font-medium">Rendimento Estimado</span>
            <YieldBadge pct={yieldPct} />
          </div>

          {rejected > 0 && (
            <div className="space-y-2">
              <Label htmlFor="rejectionReason">Motivo da Rejeição</Label>
              <Textarea id="rejectionReason" value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                placeholder="Descreva o motivo das unidades rejeitadas..." rows={3} />
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="deviationNotes">Observações / Desvios (opcional)</Label>
            <Textarea id="deviationNotes" value={deviationNotes}
              onChange={(e) => setDeviationNotes(e.target.value)}
              placeholder="Notas sobre desvios no processo..." rows={2} />
          </div>

          <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-lg p-3 flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-red-500 mt-0.5 flex-shrink-0" />
            <p className="text-sm text-red-700 dark:text-red-400">
              Esta ação é <strong>irreversível</strong>. Ao confirmar, o estoque será ajustado e o status da OP mudará para "Confirmada".
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button type="button" onClick={handleSubmit} className="bg-purple-600 hover:bg-purple-700 text-white">
            <ClipboardCheck className="h-4 w-4 mr-2" /> Confirmar Produção
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

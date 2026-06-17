import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Shield, Save, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useSetStockMin } from "@/hooks/useStockMin";

interface MinStockDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  productId: string | null;
  productName: string;
  hubCode: string;
  hubLabel: string;
  currentMin: number;
}

export function MinStockDialog({ open, onOpenChange, productId, productName, hubCode, hubLabel, currentMin }: MinStockDialogProps) {
  const setMin = useSetStockMin();
  const [val, setVal] = useState(String(currentMin ?? 0));

  useEffect(() => { if (open) setVal(String(currentMin ?? 0)); }, [open, currentMin]);

  const submit = async () => {
    if (!productId) return;
    const v = Number(val);
    if (!Number.isFinite(v) || v < 0) { toast.error("Informe um valor válido."); return; }
    try {
      await setMin.mutateAsync({ productId, warehouseCode: hubCode, minQty: v });
      toast.success(`Estoque mínimo salvo em ${hubLabel}.`);
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível salvar o mínimo.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Shield className="h-4 w-4 text-carbo-green" /> Estoque Mínimo</DialogTitle>
          <DialogDescription>{productName} — {hubLabel}</DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label>Estoque mínimo de segurança (unidades)</Label>
          <Input type="number" min={0} value={val} onChange={(e) => setVal(e.target.value)} autoFocus />
          <p className="text-xs text-muted-foreground">Quando o estoque cair abaixo deste valor, o produto entra no alerta de reposição deste CD.</p>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={setMin.isPending}>Cancelar</Button>
          <Button onClick={submit} disabled={setMin.isPending} className="carbo-gradient text-white gap-1.5">
            {setMin.isPending ? <><Loader2 className="h-4 w-4 animate-spin" /> Salvando…</> : <><Save className="h-4 w-4" /> Salvar</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

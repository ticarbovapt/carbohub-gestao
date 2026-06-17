import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Pencil, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { type Hub } from "@/components/estoque/stockData";
import { useSetStockQty } from "@/hooks/useStockMutations";

export interface AjusteTarget { id: string; name: string; product_code: string; current: number; unit: string; }

export function AjustarEstoqueDialog({ target, hub, open, onOpenChange }: { target: AjusteTarget | null; hub: Hub; open: boolean; onOpenChange: (v: boolean) => void }) {
  const [novaQtd, setNovaQtd] = useState("");
  const [motivo, setMotivo] = useState("");
  const setStock = useSetStockQty();

  const reset = () => { setNovaQtd(""); setMotivo(""); };
  const close = (v: boolean) => { if (!v) reset(); onOpenChange(v); };

  const submit = async () => {
    if (!target) return;
    const parsed = Number(novaQtd);
    if (novaQtd.trim() === "" || !Number.isFinite(parsed) || parsed < 0) {
      toast.error("Informe uma quantidade válida.");
      return;
    }
    try {
      await setStock.mutateAsync({ productId: target.id, hubId: hub.id, newQty: parsed, currentQty: target.current, motivo: motivo.trim() || undefined });
      toast.success(`Estoque ajustado: ${target.name} em ${hub.label}.`);
      reset();
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível salvar o ajuste.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pencil className="h-4 w-4 text-carbo-blue" /> Ajustar Estoque — {target?.name ?? ""}
          </DialogTitle>
        </DialogHeader>

        {target && (
          <div className="space-y-4">
            <p className="text-xs text-muted-foreground font-mono">{target.product_code} · {hub.label}</p>

            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label>Quantidade atual</Label>
                <Input readOnly value={`${target.current.toLocaleString("pt-BR")} ${target.unit}`} className="bg-muted/40" />
              </div>
              <div className="grid gap-1.5">
                <Label>Nova quantidade</Label>
                <Input type="number" min={0} placeholder={String(target.current)} value={novaQtd} onChange={(e) => setNovaQtd(e.target.value)} autoFocus />
              </div>
            </div>

            <div className="grid gap-1.5">
              <Label>Motivo</Label>
              <Textarea placeholder="Motivo do ajuste (contagem, perda, correção...)" rows={3} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
            </div>
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={setStock.isPending}>Cancelar</Button>
          <Button onClick={submit} disabled={setStock.isPending} className="carbo-gradient text-white">
            {setStock.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Salvando…</> : "Salvar Ajuste"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

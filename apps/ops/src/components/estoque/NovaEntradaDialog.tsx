import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowDownToLine, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { type Hub } from "@/components/estoque/stockData";
import { useStock } from "@/hooks/useStock";
import { useSetStockQty } from "@/hooks/useStockMutations";

export function NovaEntradaDialog({ hub, open, onOpenChange }: { hub: Hub; open: boolean; onOpenChange: (v: boolean) => void }) {
  const { data: products = [] } = useStock();
  const setStock = useSetStockQty();

  const [productId, setProductId] = useState("");
  const [qtd, setQtd] = useState("");
  const [tipo, setTipo] = useState<"entrada" | "ajuste">("entrada");
  const [obs, setObs] = useState("");

  const reset = () => { setProductId(""); setQtd(""); setTipo("entrada"); setObs(""); };
  const close = (v: boolean) => { if (!v) reset(); onOpenChange(v); };

  const submit = async () => {
    const product = products.find((p) => p.id === productId);
    if (!product) { toast.error("Selecione um produto."); return; }
    const parsed = Number(qtd);
    if (qtd.trim() === "" || !Number.isFinite(parsed) || parsed < 0) {
      toast.error("Informe uma quantidade válida.");
      return;
    }
    const current = product.hubs[hub.id] ?? 0;
    // Entrada = soma ao saldo atual; Ajuste = define o saldo absoluto.
    const newQty = tipo === "entrada" ? current + parsed : parsed;
    try {
      await setStock.mutateAsync({ productId: product.id, hubId: hub.id, newQty, currentQty: current, motivo: obs.trim() || (tipo === "entrada" ? "Entrada de estoque" : "Ajuste de saldo") });
      toast.success(`${tipo === "entrada" ? "Entrada registrada" : "Saldo ajustado"}: ${product.name} em ${hub.label}.`);
      reset();
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível registrar a entrada.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowDownToLine className="h-4 w-4 text-carbo-green" /> Nova Entrada de Estoque
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-1.5">
            <Label>Produto</Label>
            <Select value={productId} onValueChange={setProductId}>
              <SelectTrigger><SelectValue placeholder="Selecione o produto" /></SelectTrigger>
              <SelectContent>
                {products.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name} <span className="text-muted-foreground text-xs">({p.product_code})</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label>Quantidade</Label>
              <Input type="number" min={0} placeholder="Ex: 500" value={qtd} onChange={(e) => setQtd(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label>Tipo</Label>
              <Select value={tipo} onValueChange={(v) => setTipo(v as "entrada" | "ajuste")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="entrada">Entrada (somar)</SelectItem>
                  <SelectItem value="ajuste">Ajuste (definir saldo)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label>Observações <span className="text-muted-foreground">(opcional)</span></Label>
            <Textarea placeholder="NF, lote, motivo..." rows={3} value={obs} onChange={(e) => setObs(e.target.value)} />
          </div>

          <p className="text-xs text-muted-foreground">Destino: <span className="font-medium text-foreground">{hub.label}</span></p>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={setStock.isPending}>Cancelar</Button>
          <Button onClick={submit} disabled={setStock.isPending} className="bg-carbo-green hover:bg-carbo-green/90 text-white">
            {setStock.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Registrando…</> : "Registrar Entrada"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

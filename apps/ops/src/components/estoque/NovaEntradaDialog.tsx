// ⚠️ Form em port visual — campos MOCK; submit liga na fase de lógica.
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowDownToLine } from "lucide-react";
import { toast } from "sonner";
import { MOCK_ESTOQUE, type Hub } from "@/components/estoque/stockData";

export function NovaEntradaDialog({ hub, open, onOpenChange }: { hub: Hub; open: boolean; onOpenChange: (v: boolean) => void }) {
  const submit = () => {
    toast.info("Disponível na fase de lógica");
    onOpenChange(false);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowDownToLine className="h-4 w-4 text-carbo-green" /> Nova Entrada de Estoque
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-1.5">
            <Label>Produto</Label>
            <Select defaultValue="">
              <SelectTrigger><SelectValue placeholder="Selecione o produto" /></SelectTrigger>
              <SelectContent>
                {MOCK_ESTOQUE.map((p) => (
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
              <Input type="number" min={1} placeholder="Ex: 500" />
            </div>
            <div className="grid gap-1.5">
              <Label>Tipo</Label>
              <Select defaultValue="entrada">
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="entrada">Entrada</SelectItem>
                  <SelectItem value="ajuste">Ajuste</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label>Observações <span className="text-muted-foreground">(opcional)</span></Label>
            <Textarea placeholder="NF, lote, motivo..." rows={3} />
          </div>

          <p className="text-xs text-muted-foreground">Destino: <span className="font-medium text-foreground">{hub.label}</span></p>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={submit} className="bg-carbo-green hover:bg-carbo-green/90 text-white">Registrar Entrada</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

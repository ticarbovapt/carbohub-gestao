// ⚠️ Form em port visual — campos MOCK; submit liga na fase de lógica.
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Pencil } from "lucide-react";
import { toast } from "sonner";
import { type Hub } from "@/components/estoque/stockData";

export interface AjusteTarget { name: string; product_code: string; current: number; unit: string; }

export function AjustarEstoqueDialog({ target, hub, open, onOpenChange }: { target: AjusteTarget | null; hub: Hub; open: boolean; onOpenChange: (v: boolean) => void }) {
  const submit = () => {
    toast.info("Disponível na fase de lógica");
    onOpenChange(false);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
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
                <Input type="number" min={0} placeholder={String(target.current)} />
              </div>
            </div>

            <div className="grid gap-1.5">
              <Label>Motivo</Label>
              <Textarea placeholder="Motivo do ajuste (contagem, perda, correção...)" rows={3} />
            </div>
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={submit} className="carbo-gradient text-white">Salvar Ajuste</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

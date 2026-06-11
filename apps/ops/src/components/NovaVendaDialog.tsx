// ⚠️ Form em port visual — campos MOCK; submit liga na fase de lógica.
import { useState } from "react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Plus, Trash2, ShoppingCart } from "lucide-react";
import { toast } from "sonner";

interface NovaVendaDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// Selects MOCK
const PRODUTOS = ["CarboZé 100ml", "CarboZé 1L", "CarboPRO", "KIT 5un CarboZé 100ml", "CarboVapt 70ml"];
const PAGAMENTOS = ["À vista", "30 dias", "28/56 dias", "30/60/90 dias", "Cartão"];
const FRETES = ["CIF — por conta do vendedor", "FOB — por conta do comprador"];

interface Item { id: number; produto: string; qtd: string; }

export function NovaVendaDialog({ open, onOpenChange }: NovaVendaDialogProps) {
  const [itens, setItens] = useState<Item[]>([{ id: 1, produto: "", qtd: "1" }]);

  const addItem = () => setItens((xs) => [...xs, { id: Date.now(), produto: "", qtd: "1" }]);
  const removeItem = (id: number) => setItens((xs) => (xs.length > 1 ? xs.filter((x) => x.id !== id) : xs));
  const setItem = (id: number, patch: Partial<Item>) =>
    setItens((xs) => xs.map((x) => (x.id === id ? { ...x, ...patch } : x)));

  const handleOpenChange = (isOpen: boolean) => {
    onOpenChange(isOpen);
    if (!isOpen) setTimeout(() => setItens([{ id: 1, produto: "", qtd: "1" }]), 200);
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    toast.info("Disponível na fase de lógica");
    handleOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="w-[calc(100%-2rem)] sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShoppingCart className="h-5 w-5 text-carbo-green" /> Nova Venda
            </DialogTitle>
            <DialogDescription>Registre um novo pedido de venda.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-1.5">
              <Label htmlFor="cliente">Cliente</Label>
              <Input id="cliente" placeholder="Nome do cliente ou razão social" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="cnpj">CNPJ / CPF</Label>
                <Input id="cnpj" placeholder="00.000.000/0001-00" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ie">Inscrição Estadual</Label>
                <Input id="ie" placeholder="ISENTO" />
              </div>
            </div>

            {/* Itens da venda */}
            <div className="space-y-2">
              <Label>Itens</Label>
              {itens.map((it) => (
                <div key={it.id} className="flex items-end gap-2">
                  <div className="flex-1 space-y-1">
                    <Select value={it.produto} onValueChange={(v) => setItem(it.id, { produto: v })}>
                      <SelectTrigger><SelectValue placeholder="Produto" /></SelectTrigger>
                      <SelectContent>
                        {PRODUTOS.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="w-20 space-y-1">
                    <Input type="number" min="1" value={it.qtd} onChange={(e) => setItem(it.id, { qtd: e.target.value })} placeholder="Qtd" />
                  </div>
                  <Button type="button" variant="ghost" size="icon" className="h-9 w-9 shrink-0 text-muted-foreground" onClick={() => removeItem(it.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={addItem}>
                <Plus className="h-4 w-4" /> Adicionar item
              </Button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Pagamento</Label>
                <Select>
                  <SelectTrigger><SelectValue placeholder="Forma de pagamento" /></SelectTrigger>
                  <SelectContent>
                    {PAGAMENTOS.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Frete</Label>
                <Select>
                  <SelectTrigger><SelectValue placeholder="Tipo de frete" /></SelectTrigger>
                  <SelectContent>
                    {FRETES.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="obs-venda">Observações</Label>
              <Textarea id="obs-venda" placeholder="Condições, prazo de entrega, etc." rows={2} />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>Cancelar</Button>
            <Button type="submit">Registrar Venda</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

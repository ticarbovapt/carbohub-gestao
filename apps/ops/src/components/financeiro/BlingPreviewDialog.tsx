// ⚠️ Form em port visual — campos MOCK; submit liga na fase de lógica.
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { CarboBadge } from "@/components/ui/carbo-badge";
import { Link2, FileText } from "lucide-react";
import { toast } from "sonner";

const brl = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

export interface BlingOrder {
  order_number: string; customer_name: string; cnpj: string; ie: string;
  payment_terms: string; freight_type: "CIF" | "FOB"; total: number;
}

// Itens mock — na lógica virão dos itens reais do pedido.
const MOCK_ITENS = [
  { produto: "CarboZé 100ml", qtd: 24, unitario: 0 },
  { produto: "CarboPRO", qtd: 6, unitario: 0 },
];

interface Props {
  order: BlingOrder | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function BlingPreviewDialog({ order, open, onOpenChange }: Props) {
  if (!order) return null;
  const itens = MOCK_ITENS.map((i) => ({ ...i, subtotal: order.total / MOCK_ITENS.length }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><FileText className="h-5 w-5 text-carbo-green" /> Pré-visualizar envio ao Bling</DialogTitle>
          <DialogDescription>Confira os dados que serão enviados via API ao Bling para emissão da NF-e.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          {/* Cabeçalho do pedido */}
          <div className="rounded-lg border bg-muted/20 p-3 space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="font-mono font-semibold text-carbo-green">{order.order_number}</span>
              <CarboBadge variant="info" size="sm">{order.freight_type}</CarboBadge>
            </div>
            <p className="font-medium">{order.customer_name}</p>
            <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs text-muted-foreground">
              <span>CNPJ: {order.cnpj}</span>
              <span>IE: {order.ie}</span>
              <span>Pagto: {order.payment_terms}</span>
              <span>Frete: {order.freight_type}</span>
            </div>
          </div>

          {/* Itens */}
          <div className="rounded-lg border overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-muted/40 text-muted-foreground">
                <tr><th className="text-left p-2 font-medium">Item</th><th className="text-right p-2 font-medium">Qtd</th><th className="text-right p-2 font-medium">Subtotal</th></tr>
              </thead>
              <tbody>
                {itens.map((i) => (
                  <tr key={i.produto} className="border-t">
                    <td className="p-2">{i.produto}</td>
                    <td className="p-2 text-right tabular-nums">{i.qtd}</td>
                    <td className="p-2 text-right tabular-nums">{brl(i.subtotal)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t bg-muted/20 font-semibold"><td className="p-2" colSpan={2}>Total</td><td className="p-2 text-right tabular-nums">{brl(order.total)}</td></tr>
              </tfoot>
            </table>
          </div>
          <p className="text-xs text-muted-foreground">Itens e valores unitários são exemplo — na fase de lógica virão do pedido real.</p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button className="gap-1.5" onClick={() => { toast.info("Disponível na fase de lógica"); onOpenChange(false); }}>
            <Link2 className="h-4 w-4" /> Criar no Bling
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

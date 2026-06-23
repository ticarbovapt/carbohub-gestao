import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DatePickerInput } from "@/components/ui/date-picker-input";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { usePurchaseOrders } from "@/hooks/usePurchaseOrders";
import { usePayableMutations } from "@/hooks/usePayables";

const MANUAL = "__manual__";

export function NovaContaPagarDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { data: orders = [] } = usePurchaseOrders();
  const { create } = usePayableMutations();
  const ocsFaturaveis = orders.filter((o) => o.status === "recebida" || o.status === "parcialmente_recebida");

  const [ocId, setOcId] = useState(MANUAL);
  const [supplier, setSupplier] = useState("");
  const [amount, setAmount] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [notes, setNotes] = useState("");

  const pickOc = (id: string) => {
    setOcId(id);
    const oc = orders.find((o) => o.id === id);
    if (oc) { setSupplier(oc.supplier_name); setAmount(String(oc.total_value || "")); }
  };

  const reset = () => { setOcId(MANUAL); setSupplier(""); setAmount(""); setDueDate(""); setNotes(""); };
  const close = (v: boolean) => { if (!v) reset(); onOpenChange(v); };

  const handleSubmit = async () => {
    try {
      await create.mutateAsync({
        supplierName: supplier,
        amount: Number(amount),
        dueDate,
        purchaseOrderId: ocId === MANUAL ? null : ocId,
        notes,
      });
      toast.success("Conta a pagar lançada.");
      reset();
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível lançar a conta.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Lançar Conta a Pagar</DialogTitle>
          <DialogDescription>A partir de uma OC recebida ou manual.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Ordem de Compra (opcional)</Label>
            <Select value={ocId} onValueChange={pickOc}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={MANUAL}>Conta manual (sem OC)</SelectItem>
                {ocsFaturaveis.map((o) => (
                  <SelectItem key={o.id} value={o.id}>{o.oc_number} — {o.supplier_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Fornecedor *</Label>
            <Input value={supplier} onChange={(e) => setSupplier(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Valor (R$) *</Label>
              <Input type="number" min={0} step={0.01} value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Vencimento *</Label>
              <DatePickerInput value={dueDate} onChange={setDueDate} placeholder="Selecionar" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Observações</Label>
            <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Documento, condição de pagamento..." />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={create.isPending}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={create.isPending}>
            {create.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Lançando…</> : "Lançar Conta"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

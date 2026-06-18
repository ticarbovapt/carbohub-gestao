import { useEffect, useState } from "react";
import { Loader2, AlertTriangle } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { usePurchaseOrders, type OcRow } from "@/hooks/usePurchaseOrders";
import { useRegisterReceiving, type ReceivingItem } from "@/hooks/usePurchaseReceivings";

const OPEN_STATUSES = ["gerada", "enviada_fornecedor", "parcialmente_recebida"];

export function RecebimentoDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { data: orders = [] } = usePurchaseOrders();
  const register = useRegisterReceiving();
  const openOrders = orders.filter((o) => OPEN_STATUSES.includes(o.status));

  const [ocId, setOcId] = useState("");
  const [items, setItems] = useState<ReceivingItem[]>([]);
  const [notes, setNotes] = useState("");

  const selected: OcRow | undefined = openOrders.find((o) => o.id === ocId);

  useEffect(() => {
    if (!selected) { setItems([]); return; }
    setItems(selected.items.map((i) => ({ descricao: i.descricao, qtd_pedida: Number(i.quantidade) || 0, qtd_recebida: Number(i.quantidade) || 0 })));
  }, [ocId]); // eslint-disable-line react-hooks/exhaustive-deps

  const hasDivergence = items.some((i) => i.qtd_recebida !== i.qtd_pedida);
  const setRecebida = (idx: number, v: number) =>
    setItems((arr) => arr.map((it, i) => (i === idx ? { ...it, qtd_recebida: v } : it)));

  const reset = () => { setOcId(""); setItems([]); setNotes(""); };
  const close = (v: boolean) => { if (!v) reset(); onOpenChange(v); };

  const submit = async () => {
    try {
      await register.mutateAsync({ purchaseOrderId: ocId, items, divergenceNotes: notes });
      toast.success("Recebimento registrado.");
      reset();
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível registrar o recebimento.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Conferir Recebimento</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 max-h-[65vh] overflow-y-auto pr-1">
          <div className="grid gap-1.5">
            <Label>Ordem de Compra *</Label>
            <Select value={ocId} onValueChange={setOcId}>
              <SelectTrigger><SelectValue placeholder="Selecione a OC a receber..." /></SelectTrigger>
              <SelectContent>
                {openOrders.length === 0 && <div className="px-2 py-1.5 text-sm text-muted-foreground">Nenhuma OC em aberto</div>}
                {openOrders.map((o) => <SelectItem key={o.id} value={o.id}>{o.oc_number} — {o.supplier_name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {selected && (
            <>
              <div>
                <Label className="text-xs">Itens — confira a quantidade recebida</Label>
                <div className="mt-2 space-y-2">
                  <div className="grid grid-cols-12 gap-2 text-xs text-muted-foreground px-1">
                    <span className="col-span-7">Descrição</span>
                    <span className="col-span-2 text-right">Pedido</span>
                    <span className="col-span-3 text-right">Recebido</span>
                  </div>
                  {items.map((it, idx) => {
                    const div = it.qtd_recebida !== it.qtd_pedida;
                    return (
                      <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                        <span className="col-span-7 text-sm">{it.descricao}</span>
                        <span className="col-span-2 text-right text-sm text-muted-foreground">{it.qtd_pedida}</span>
                        <div className="col-span-3">
                          <Input type="number" min={0} value={it.qtd_recebida} className={div ? "border-warning" : ""}
                            onChange={(e) => setRecebida(idx, Number(e.target.value))} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {hasDivergence && (
                <div className="flex items-center gap-2 rounded-md bg-warning/10 text-warning-foreground px-3 py-2 text-sm">
                  <AlertTriangle className="h-4 w-4 text-warning" /> Há divergência entre o pedido e o recebido.
                </div>
              )}

              <div className="grid gap-1.5">
                <Label>Observações {hasDivergence && "(explique a divergência)"}</Label>
                <Textarea placeholder="Observações do recebimento..." value={notes} onChange={(e) => setNotes(e.target.value)} />
              </div>
            </>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={register.isPending}>Cancelar</Button>
          <Button onClick={submit} disabled={!selected || register.isPending} className="carbo-gradient text-white">
            {register.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Salvando…</> : "Registrar Recebimento"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ⚠️ Form em port visual — campos MOCK; submit liga na fase de lógica.
import { useState } from "react";
import { Send, Plus, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

const DESTINOS = [
  { id: "sp", label: "CD SP LogHouse", desc: "E-commerce / estoque principal" },
  { id: "sp-vendas", label: "CD SP Vendas", desc: "Licenciados / lojas físicas" },
];
const PRODUTOS_MOCK = [
  { id: "1", name: "CarboZé 100ml", code: "ESTA-100ML" },
  { id: "2", name: "CarboZé 1L", code: "ESTA-1L" },
  { id: "5", name: "CarboPRO", code: "PRO-500" },
  { id: "6", name: "Rótulo CarboPRO", code: "ROT-PRO" },
];

interface EnvioRow { id: number; productId: string; destinoId: string; quantity: string; notes: string; }
let nextId = 1;
const newRow = (): EnvioRow => ({ id: nextId++, productId: "", destinoId: "sp", quantity: "", notes: "" });

export function CDSPRegistrarEnvioDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const [rows, setRows] = useState<EnvioRow[]>([newRow()]);

  const addRow = () => setRows((r) => [...r, newRow()]);
  const removeRow = (id: number) => setRows((r) => r.filter((x) => x.id !== id));
  const updateRow = (id: number, field: keyof EnvioRow, value: string) =>
    setRows((r) => r.map((x) => (x.id === id ? { ...x, [field]: value } : x)));

  const submit = () => {
    toast.info("Disponível na fase de lógica");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Send className="h-4 w-4 text-carbo-blue" />
            Registrar Envio para CD São Paulo
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
          {rows.map((row, idx) => (
            <div key={row.id} className="rounded-lg border border-border p-3 space-y-3 bg-muted/20">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">Envio {idx + 1}</span>
                {rows.length > 1 && (
                  <Button size="icon" variant="ghost" className="h-6 w-6 text-destructive" onClick={() => removeRow(row.id)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>

              <div>
                <Label className="text-xs">Destino</Label>
                <Select value={row.destinoId} onValueChange={(v) => updateRow(row.id, "destinoId", v)}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {DESTINOS.map((d) => (
                      <SelectItem key={d.id} value={d.id}>
                        <div>
                          <p className="font-medium">{d.label}</p>
                          <p className="text-[11px] text-muted-foreground">{d.desc}</p>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-xs">Produto</Label>
                <Select value={row.productId} onValueChange={(v) => updateRow(row.id, "productId", v)}>
                  <SelectTrigger className="h-9"><SelectValue placeholder="Selecione o produto" /></SelectTrigger>
                  <SelectContent>
                    {PRODUTOS_MOCK.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name} <span className="text-muted-foreground text-xs">({p.code})</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Quantidade</Label>
                  <Input type="number" min={1} className="h-9" placeholder="Ex: 500"
                    value={row.quantity} onChange={(e) => updateRow(row.id, "quantity", e.target.value)} />
                </div>
                <div>
                  <Label className="text-xs">Obs. <span className="text-muted-foreground">(opcional)</span></Label>
                  <Input className="h-9" placeholder="NF, remessa..."
                    value={row.notes} onChange={(e) => updateRow(row.id, "notes", e.target.value)} />
                </div>
              </div>
            </div>
          ))}

          <Button type="button" variant="outline" size="sm" className="w-full gap-1.5 border-dashed" onClick={addRow}>
            <Plus className="h-3.5 w-3.5" /> Adicionar outro envio
          </Button>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={submit} className="carbo-gradient text-white gap-1.5">
            <Send className="h-4 w-4" /> Registrar Envio
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

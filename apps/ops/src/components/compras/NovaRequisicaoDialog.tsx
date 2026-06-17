// TODO: ligar em <tabela de compras> (Supabase).
import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

const COST_CENTERS = [
  "Operações", "Manutenção", "Logística", "Administrativo", "Comercial", "TI",
  "Marketing", "Qualidade", "Financeiro", "RH", "Jurídico", "P&D", "Compras", "Produção",
];
const UNITS_OF_MEASURE = ["un", "kg", "g", "L", "mL", "m", "cm", "m²", "m³", "pç", "cx", "pct", "par", "h", "km"];
// TODO: ligar em <tabela de compras> (Supabase).
const FORNECEDORES: string[] = [];

interface ItemRow { id: number; descricao: string; quantidade: number; unidade: string; valor_unitario: number; }
let nextId = 1;
const newRow = (): ItemRow => ({ id: nextId++, descricao: "", quantidade: 1, unidade: "un", valor_unitario: 0 });
const brl = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

export function NovaRequisicaoDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const [items, setItems] = useState<ItemRow[]>([newRow()]);

  const estimated = items.reduce((s, i) => s + i.quantidade * i.valor_unitario, 0);
  const addItem = () => setItems((r) => [...r, newRow()]);
  const removeItem = (id: number) => setItems((r) => r.filter((x) => x.id !== id));
  const updateItem = (id: number, field: keyof ItemRow, value: string | number) =>
    setItems((r) => r.map((x) => (x.id === id ? { ...x, [field]: value } : x)));

  const submit = () => {
    toast.info("Disponível na fase de lógica");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Nova Requisição de Compra</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 max-h-[65vh] overflow-y-auto pr-1">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="grid gap-1.5">
              <Label>Centro de Custo *</Label>
              <Select defaultValue="">
                <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>
                  {COST_CENTERS.map((cc) => <SelectItem key={cc} value={cc}>{cc}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label>Tipo de Compra</Label>
              <Select defaultValue="uso_direto">
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="estoque">Estoque</SelectItem>
                  <SelectItem value="uso_direto">Uso Direto</SelectItem>
                  <SelectItem value="investimento">Investimento</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label>Fornecedor Sugerido</Label>
              <Select defaultValue="">
                <SelectTrigger><SelectValue placeholder="Selecione o fornecedor..." /></SelectTrigger>
                <SelectContent>
                  {FORNECEDORES.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label>Justificativa *</Label>
            <Textarea placeholder="Descreva a necessidade..." />
          </div>

          <div className="grid gap-1.5">
            <Label>Impacto Operacional</Label>
            <Textarea placeholder="Descreva o impacto se não aprovado..." />
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <Label>Itens da Requisição</Label>
              <Button variant="outline" size="sm" onClick={addItem} className="gap-1">
                <Plus className="h-3.5 w-3.5" /> Adicionar Item
              </Button>
            </div>
            <div className="space-y-2">
              {items.map((item, idx) => (
                <div key={item.id} className="grid grid-cols-12 gap-2 items-end">
                  <div className="col-span-5">
                    {idx === 0 && <Label className="text-xs">Descrição</Label>}
                    <Input value={item.descricao} placeholder="Descrição do item"
                      onChange={(e) => updateItem(item.id, "descricao", e.target.value)} />
                  </div>
                  <div className="col-span-2">
                    {idx === 0 && <Label className="text-xs">Qtd</Label>}
                    <Input type="number" min={1} value={item.quantidade}
                      onChange={(e) => updateItem(item.id, "quantidade", Number(e.target.value))} />
                  </div>
                  <div className="col-span-1">
                    {idx === 0 && <Label className="text-xs">Un.</Label>}
                    <Select value={item.unidade} onValueChange={(v) => updateItem(item.id, "unidade", v)}>
                      <SelectTrigger className="h-9 px-2 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {UNITS_OF_MEASURE.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-3">
                    {idx === 0 && <Label className="text-xs">Valor Unit.</Label>}
                    <Input type="number" min={0} step={0.01} value={item.valor_unitario}
                      onChange={(e) => updateItem(item.id, "valor_unitario", Number(e.target.value))} />
                  </div>
                  <div className="col-span-1 flex justify-center">
                    {items.length > 1 && (
                      <Button variant="ghost" size="icon" onClick={() => removeItem(item.id)} className="h-8 w-8 text-destructive">
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-3 text-right">
              <span className="text-sm text-muted-foreground">Valor Estimado: </span>
              <span className="text-lg font-bold">{brl(estimated)}</span>
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button variant="secondary" onClick={submit}>Salvar Rascunho</Button>
          <Button onClick={submit} className="carbo-gradient text-white">Enviar para Aprovação</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

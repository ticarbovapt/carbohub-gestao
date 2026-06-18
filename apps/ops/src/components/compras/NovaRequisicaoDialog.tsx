// TODO: ligar em <tabela de compras> (Supabase).
import { useState } from "react";
import { Plus, Trash2, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { useRcMutations, type PurchaseType } from "@/hooks/useRcRequests";
import { useSuppliers } from "@/hooks/useSuppliers";

const COST_CENTERS = [
  "Operações", "Manutenção", "Logística", "Administrativo", "Comercial", "TI",
  "Marketing", "Qualidade", "Financeiro", "RH", "Jurídico", "P&D", "Compras", "Produção",
];
const UNITS_OF_MEASURE = ["un", "kg", "g", "L", "mL", "m", "cm", "m²", "m³", "pç", "cx", "pct", "par", "h", "km"];

interface ItemRow { id: number; descricao: string; quantidade: number; unidade: string; valor_unitario: number; }
let nextId = 1;
const newRow = (): ItemRow => ({ id: nextId++, descricao: "", quantidade: 1, unidade: "un", valor_unitario: 0 });
const brl = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

export function NovaRequisicaoDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { create } = useRcMutations();
  const { data: suppliers = [] } = useSuppliers();
  const [items, setItems] = useState<ItemRow[]>([newRow()]);
  const [costCenter, setCostCenter] = useState("");
  const [purchaseType, setPurchaseType] = useState<PurchaseType>("uso_direto");
  const [suggestedSupplier, setSuggestedSupplier] = useState("");
  const [justificativa, setJustificativa] = useState("");
  const [operationalImpact, setOperationalImpact] = useState("");

  const estimated = items.reduce((s, i) => s + i.quantidade * i.valor_unitario, 0);
  const addItem = () => setItems((r) => [...r, newRow()]);
  const removeItem = (id: number) => setItems((r) => r.filter((x) => x.id !== id));
  const updateItem = (id: number, field: keyof ItemRow, value: string | number) =>
    setItems((r) => r.map((x) => (x.id === id ? { ...x, [field]: value } : x)));

  const reset = () => {
    setItems([newRow()]); setCostCenter(""); setPurchaseType("uso_direto");
    setSuggestedSupplier(""); setJustificativa(""); setOperationalImpact("");
  };
  const close = (v: boolean) => { if (!v) reset(); onOpenChange(v); };

  const submit = async (status: "rascunho" | "aguardando_aprovacao") => {
    try {
      await create.mutateAsync({ centroCusto: costCenter, purchaseType, suggestedSupplier, justificativa, operationalImpact, items, status });
      toast.success(status === "rascunho" ? "Rascunho salvo." : "Requisição enviada para aprovação.");
      reset();
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível salvar a requisição.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Nova Requisição de Compra</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 max-h-[65vh] overflow-y-auto pr-1">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="grid gap-1.5">
              <Label>Centro de Custo *</Label>
              <Select value={costCenter} onValueChange={setCostCenter}>
                <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>
                  {COST_CENTERS.map((cc) => <SelectItem key={cc} value={cc}>{cc}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label>Tipo de Compra</Label>
              <Select value={purchaseType} onValueChange={(v) => setPurchaseType(v as PurchaseType)}>
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
              <Select value={suggestedSupplier} onValueChange={setSuggestedSupplier}>
                <SelectTrigger><SelectValue placeholder="Selecione o fornecedor..." /></SelectTrigger>
                <SelectContent>
                  {suppliers.length === 0 && <div className="px-2 py-1.5 text-sm text-muted-foreground">Nenhum fornecedor cadastrado</div>}
                  {suppliers.map((f) => <SelectItem key={f.id} value={f.legal_name}>{f.legal_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label>Justificativa *</Label>
            <Textarea placeholder="Descreva a necessidade..." value={justificativa} onChange={(e) => setJustificativa(e.target.value)} />
          </div>

          <div className="grid gap-1.5">
            <Label>Impacto Operacional</Label>
            <Textarea placeholder="Descreva o impacto se não aprovado..." value={operationalImpact} onChange={(e) => setOperationalImpact(e.target.value)} />
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
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={create.isPending}>Cancelar</Button>
          <Button variant="secondary" onClick={() => submit("rascunho")} disabled={create.isPending}>Salvar Rascunho</Button>
          <Button onClick={() => submit("aguardando_aprovacao")} disabled={create.isPending} className="carbo-gradient text-white">
            {create.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Salvando…</> : "Enviar para Aprovação"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

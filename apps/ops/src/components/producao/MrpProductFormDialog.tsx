import { useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useMrpProductMutations } from "@/hooks/useMrpProductMutations";

const CATEGORIES = ["Produto Final", "Insumo", "Embalagem", "Carbonatação", "Outro"];
const UNITS = ["un", "L", "ml", "kg", "g", "cx"];

// Gera o código a partir do nome: maiúsculas, sem acento, cada palavra abreviada
// em até 3 caracteres, unidas por hífen. Ex.: "Reagente base" → "REA-BAS".
const toCode = (s: string) =>
  s.normalize("NFD").replace(/\p{M}/gu, "")
    .toUpperCase()
    .split(/[^A-Z0-9]+/)
    .filter(Boolean)
    .map((w) => w.slice(0, 3))
    .join("-");

export interface MrpProductFormInitial {
  name?: string;
  product_code?: string;
  category?: string;
  stock_unit?: string;
  safety_stock_qty?: number;
  lead_time_days?: number;
  notes?: string;
}

interface MrpProductFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "create" | "edit";
  id?: string;
  initial?: MrpProductFormInitial;
}

export function MrpProductFormDialog({ open, onOpenChange, mode, id, initial }: MrpProductFormDialogProps) {
  const { create, update } = useMrpProductMutations();
  const [name, setName] = useState(initial?.name ?? "");
  const [code, setCode] = useState(initial?.product_code ?? "");
  // No modo criar, o código segue o nome até o usuário editá-lo manualmente.
  const [codeTouched, setCodeTouched] = useState(mode === "edit");

  const onNameChange = (v: string) => {
    setName(v);
    if (!codeTouched) setCode(toCode(v));
  };
  const onCodeChange = (v: string) => {
    setCodeTouched(true);
    setCode(v);
  };
  const [category, setCategory] = useState(initial?.category ?? "Insumo");
  const [unit, setUnit] = useState(initial?.stock_unit ?? "un");
  const [safetyStock, setSafetyStock] = useState(String(initial?.safety_stock_qty ?? 0));
  const [leadTime, setLeadTime] = useState(String(initial?.lead_time_days ?? 7));
  const [notes, setNotes] = useState(initial?.notes ?? "");

  const pending = create.isPending || update.isPending;

  const handleSubmit = async () => {
    const payload = {
      name, product_code: code, category, stock_unit: unit,
      safety_stock_qty: Number(safetyStock) || 0, notes,
    };
    try {
      if (mode === "edit" && id) await update.mutateAsync({ id, ...payload });
      else await create.mutateAsync(payload);
      toast.success(mode === "create" ? "Produto criado." : "Produto atualizado.");
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível salvar o produto.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100%-2rem)] sm:max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{mode === "create" ? "Novo Produto" : "Editar Produto"}</DialogTitle>
          <DialogDescription>
            {mode === "create" ? "Cadastre um item no catálogo MRP (insumo, embalagem ou SKU)." : "Atualize os dados do item no catálogo MRP."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Nome *</Label>
              <Input placeholder="Reagente base" value={name} onChange={(e) => onNameChange(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Código *</Label>
              <Input placeholder="REA-BAS" value={code} onChange={(e) => onCodeChange(e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Categoria *</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Unidade</Label>
              <Select value={unit} onValueChange={setUnit}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {UNITS.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Estoque de Segurança</Label>
              <Input type="number" placeholder="0" value={safetyStock} onChange={(e) => setSafetyStock(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Lead Time (dias)</Label>
              <Input type="number" placeholder="7" value={leadTime} onChange={(e) => setLeadTime(e.target.value)} />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Observações</Label>
            <Textarea placeholder="Observações sobre o produto..." rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>Cancelar</Button>
          <Button type="button" onClick={handleSubmit} disabled={pending}>
            {pending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Salvando…</> : (mode === "create" ? "Criar Produto" : "Salvar")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

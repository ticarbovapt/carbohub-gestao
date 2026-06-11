// ⚠️ Form em port visual — campos MOCK; submit liga na fase de lógica.
import { useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

export interface SkuFormInitial {
  code?: string;
  name?: string;
  description?: string;
  category?: string;
  unit?: string;
  packaging_ml?: number | null;
  safety_stock_qty?: number;
  target_coverage_days?: number;
  is_active?: boolean;
}

interface SkuFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "create" | "edit";
  initial?: SkuFormInitial;
}

export function SkuFormDialog({ open, onOpenChange, mode, initial }: SkuFormDialogProps) {
  const [code, setCode] = useState(initial?.code ?? "");
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [category, setCategory] = useState(initial?.category ?? "produto_final");
  const [unit, setUnit] = useState(initial?.unit ?? "un");
  const [packagingMl, setPackagingMl] = useState(String(initial?.packaging_ml ?? 100));
  const [safetyStock, setSafetyStock] = useState(String(initial?.safety_stock_qty ?? 0));
  const [coverageDays, setCoverageDays] = useState(String(initial?.target_coverage_days ?? 30));
  const [isActive, setIsActive] = useState(initial?.is_active ?? true);

  const handleSubmit = () => {
    toast.info("Disponível na fase de lógica");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100%-2rem)] sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{mode === "create" ? "Novo SKU" : "Editar SKU"}</DialogTitle>
          <DialogDescription>
            {mode === "create" ? "Cadastre um novo produto acabado (SKU)" : "Atualize os dados do produto acabado (SKU)"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Identificação */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Identificação</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Código *</Label>
                <Input placeholder="SKU-CZ100" value={code} onChange={(e) => setCode(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Nome *</Label>
                <Input placeholder="CarboZé 100ml" value={name} onChange={(e) => setName(e.target.value)} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Descrição</Label>
              <Textarea placeholder="Descrição do produto..." rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Categoria *</Label>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="produto_final">Produto Final</SelectItem>
                    <SelectItem value="reagente">Reagente</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2 flex flex-col justify-end">
                <Label>Status</Label>
                <div className="flex items-center gap-2">
                  <Switch checked={isActive} onCheckedChange={setIsActive} />
                  <span className="text-sm">{isActive ? "Ativo" : "Inativo"}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Embalagem */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Embalagem</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Volume (ml) *</Label>
                <Input type="number" placeholder="100" value={packagingMl} onChange={(e) => setPackagingMl(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Unidade</Label>
                <Input placeholder="un" value={unit} onChange={(e) => setUnit(e.target.value)} />
              </div>
            </div>
          </div>

          {/* Parâmetros de Estoque */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Parâmetros de Estoque</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Estoque de Segurança</Label>
                <Input type="number" placeholder="0" value={safetyStock} onChange={(e) => setSafetyStock(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Cobertura Alvo (dias)</Label>
                <Input type="number" placeholder="30" value={coverageDays} onChange={(e) => setCoverageDays(e.target.value)} />
              </div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button type="button" onClick={handleSubmit}>{mode === "create" ? "Criar SKU" : "Salvar"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

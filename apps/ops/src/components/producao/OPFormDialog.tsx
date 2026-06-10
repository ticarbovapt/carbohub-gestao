// ⚠️ Form em port visual — campos MOCK; submit liga na fase de lógica.
import { useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DatePickerInput } from "@/components/ui/date-picker-input";
import { toast } from "sonner";

const PRIORITY_LABELS: Record<string, string> = { "1": "Urgente", "2": "Alta", "3": "Normal", "4": "Baixa", "5": "Planejado" };
const DEMAND_SOURCE_LABELS: Record<string, string> = { venda: "Venda", recorrencia: "Recorrência", safety_stock: "Safety Stock", pcp_manual: "PCP Manual" };

// SKUs mock para o select de produto
const MOCK_SKUS = [
  { id: "1", code: "SKU-ZE-100", name: "CarboZé 100ml" },
  { id: "2", code: "SKU-ZE-1L", name: "CarboZé 1L" },
  { id: "3", code: "SKU-PRO", name: "CarboPRO" },
  { id: "4", code: "SKU-VAPT", name: "CarboVapt" },
];

function currentPeriod(): string {
  const now = new Date();
  return `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export interface OPFormInitial {
  sku_id?: string;
  planned_quantity?: number;
  priority?: string;
  demand_source?: string;
  need_date?: string;
  deviation_notes?: string;
}

interface OPFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "create" | "edit";
  initial?: OPFormInitial;
}

export function OPFormDialog({ open, onOpenChange, mode, initial }: OPFormDialogProps) {
  const [skuId, setSkuId] = useState(initial?.sku_id ?? "");
  const [plannedQty, setPlannedQty] = useState(String(initial?.planned_quantity ?? 100));
  const [priority, setPriority] = useState(initial?.priority ?? "3");
  const [demandSource, setDemandSource] = useState(initial?.demand_source ?? "");
  const [needDate, setNeedDate] = useState(initial?.need_date ?? "");
  const [notes, setNotes] = useState(initial?.deviation_notes ?? "");

  const selectedSku = MOCK_SKUS.find((s) => s.id === skuId);
  const opPreview = selectedSku
    ? `OP-${selectedSku.code.replace(/^SKU-/i, "")}-${currentPeriod()}-XXXX`
    : null;

  const handleSubmit = () => {
    toast.info("Disponível na fase de lógica");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{mode === "create" ? "Nova Ordem de Produção" : "Editar Ordem de Produção"}</DialogTitle>
          <DialogDescription>
            {mode === "create" ? "Crie uma nova OP a partir de um produto." : "Atualize os dados da ordem de produção."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {/* Produto */}
          <div className="space-y-2">
            <Label>Produto *</Label>
            <Select value={skuId} onValueChange={setSkuId}>
              <SelectTrigger><SelectValue placeholder="Selecione o produto" /></SelectTrigger>
              <SelectContent>
                {MOCK_SKUS.map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.code} — {s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Preview do número de OP */}
          {opPreview && (
            <div className="space-y-1">
              <Label className="text-muted-foreground text-xs uppercase tracking-wide">Número da OP (gerado)</Label>
              <div className="rounded-md border border-border bg-muted/50 px-3 py-2 text-sm font-mono text-muted-foreground">
                {opPreview}
              </div>
            </div>
          )}

          {/* Quantidade Planejada */}
          <div className="space-y-2">
            <Label>Quantidade Planejada *</Label>
            <Input type="number" value={plannedQty} onChange={(e) => setPlannedQty(e.target.value)} />
          </div>

          {/* Prioridade + Fonte de Demanda */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Prioridade</Label>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {Object.entries(PRIORITY_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Fonte de Demanda</Label>
              <Select value={demandSource} onValueChange={setDemandSource}>
                <SelectTrigger><SelectValue placeholder="Selecione (opcional)" /></SelectTrigger>
                <SelectContent>
                  {Object.entries(DEMAND_SOURCE_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Data de Necessidade */}
          <div className="space-y-2">
            <Label>Data de Necessidade</Label>
            <DatePickerInput value={needDate} onChange={setNeedDate} placeholder="Selecionar data" />
          </div>

          {/* Observações */}
          <div className="space-y-2">
            <Label>Observações</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Observações sobre a OP..." />
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button type="button" onClick={handleSubmit}>{mode === "create" ? "Criar OP" : "Salvar"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

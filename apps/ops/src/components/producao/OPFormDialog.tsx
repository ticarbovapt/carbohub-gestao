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
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useSkus } from "@/hooks/useSkus";
import { useProductionOrderMutations } from "@/hooks/useProductionOrders";

const PRIORITY_LABELS: Record<string, string> = { "1": "Urgente", "2": "Alta", "3": "Normal", "4": "Baixa", "5": "Planejado" };
const DEMAND_SOURCE_LABELS: Record<string, string> = { venda: "Venda", recorrencia: "Recorrência", safety_stock: "Safety Stock", pcp_manual: "PCP Manual" };

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
  id?: string;
  initial?: OPFormInitial;
}

export function OPFormDialog({ open, onOpenChange, mode, id, initial }: OPFormDialogProps) {
  const { data: skus = [] } = useSkus();
  const { create, update } = useProductionOrderMutations();
  const [skuId, setSkuId] = useState(initial?.sku_id ?? "");
  const [plannedQty, setPlannedQty] = useState(initial?.planned_quantity != null ? String(initial.planned_quantity) : "");
  const [priority, setPriority] = useState(initial?.priority ?? "3");
  const [demandSource, setDemandSource] = useState(initial?.demand_source ?? "");
  const [needDate, setNeedDate] = useState(initial?.need_date ?? "");
  const [notes, setNotes] = useState(initial?.deviation_notes ?? "");

  const activeSkus = skus.filter((s) => s.is_active);
  const selectedSku = skus.find((s) => s.id === skuId);
  const pending = create.isPending || update.isPending;

  const handleSubmit = async () => {
    try {
      if (mode === "create") {
        if (!selectedSku) throw new Error("Selecione o produto.");
        await create.mutateAsync({
          skuId, skuCode: selectedSku.code, plannedQuantity: Number(plannedQty),
          priority: Number(priority), demandSource, needDate, notes,
        });
        toast.success("Ordem de Produção criada.");
      } else {
        if (!id) throw new Error("OP inválida.");
        await update.mutateAsync({
          id, plannedQuantity: plannedQty ? Number(plannedQty) : undefined,
          priority: Number(priority), demandSource, needDate: needDate || null, notes,
        });
        toast.success("Ordem de Produção atualizada.");
      }
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível salvar a OP.");
    }
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
            <Select value={skuId} onValueChange={setSkuId} disabled={mode === "edit"}>
              <SelectTrigger><SelectValue placeholder="Selecione o produto" /></SelectTrigger>
              <SelectContent>
                {activeSkus.length === 0 && <div className="px-2 py-1.5 text-sm text-muted-foreground">Nenhum SKU ativo</div>}
                {activeSkus.map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.code} — {s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Quantidade Planejada */}
          <div className="space-y-2">
            <Label>Quantidade Planejada *</Label>
            <Input type="number" min={1} value={plannedQty} onChange={(e) => setPlannedQty(e.target.value)} />
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
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>Cancelar</Button>
          <Button type="button" onClick={handleSubmit} disabled={pending}>
            {pending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Salvando…</> : (mode === "create" ? "Criar OP" : "Salvar")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

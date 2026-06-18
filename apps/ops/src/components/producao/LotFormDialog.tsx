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
import { useMrpProducts } from "@/hooks/useMrpProducts";
import { useLotMutations, useLotSuppliers } from "@/hooks/useLots";

export interface LotFormInitial {
  product_id?: string;
  initial_volume_ml?: number;
  expected_samples?: number;
  supplier_id?: string;
  received_at?: string;
  expired_at?: string;
  notes?: string;
}

interface LotFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "create" | "edit";
  id?: string;
  initial?: LotFormInitial;
}

export function LotFormDialog({ open, onOpenChange, mode, id, initial }: LotFormDialogProps) {
  const { data: products = [] } = useMrpProducts();
  const { data: suppliers = [] } = useLotSuppliers();
  const { create, update } = useLotMutations();
  const isEdit = mode === "edit";

  const [productId, setProductId] = useState(initial?.product_id ?? "");
  const [volume, setVolume] = useState(initial?.initial_volume_ml != null ? String(initial.initial_volume_ml) : "");
  const [expectedSamples, setExpectedSamples] = useState(initial?.expected_samples != null ? String(initial.expected_samples) : "3");
  const [supplierId, setSupplierId] = useState(initial?.supplier_id ?? "");
  const [receivedAt, setReceivedAt] = useState(initial?.received_at ?? "");
  const [expiredAt, setExpiredAt] = useState(initial?.expired_at ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");

  const pending = create.isPending || update.isPending;

  const handleSubmit = async () => {
    try {
      if (isEdit) {
        if (!id) throw new Error("Lote inválido.");
        await update.mutateAsync({
          id, expectedSamples: expectedSamples ? Number(expectedSamples) : undefined,
          receivedAt: receivedAt || null, expiredAt: expiredAt || null, notes,
        });
        toast.success("Lote atualizado.");
      } else {
        await create.mutateAsync({
          productId, initialVolumeMl: Number(volume), supplierId,
          receivedAt, expiredAt, expectedSamples: Number(expectedSamples) || 3, notes,
        });
        toast.success("Lote criado.");
      }
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível salvar o lote.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Editar Lote" : "Novo Lote de Reagente"}</DialogTitle>
          <DialogDescription>
            {isEdit ? "Atualize os dados do lote (produto e volume inicial são fixos)." : "Registre um novo lote de reagente recebido."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Produto */}
          <div className="space-y-2">
            <Label>Produto *</Label>
            <Select value={productId} onValueChange={setProductId} disabled={isEdit}>
              <SelectTrigger><SelectValue placeholder="Selecione o produto" /></SelectTrigger>
              <SelectContent>
                {products.length === 0 && <div className="px-2 py-1.5 text-sm text-muted-foreground">Nenhum produto</div>}
                {products.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {/* Volume e Amostras */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Volume Inicial (ml) *</Label>
              <Input type="number" min={1} value={volume} onChange={(e) => setVolume(e.target.value)} disabled={isEdit} />
            </div>
            <div className="space-y-2">
              <Label>Amostras Esperadas</Label>
              <Input type="number" min={0} value={expectedSamples} onChange={(e) => setExpectedSamples(e.target.value)} />
            </div>
          </div>

          {/* Fornecedor */}
          <div className="space-y-2">
            <Label>Fornecedor</Label>
            <Select value={supplierId} onValueChange={setSupplierId} disabled={isEdit}>
              <SelectTrigger><SelectValue placeholder="Selecione (opcional)" /></SelectTrigger>
              <SelectContent>
                {suppliers.length === 0 && <div className="px-2 py-1.5 text-sm text-muted-foreground">Nenhum fornecedor</div>}
                {suppliers.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {/* Datas */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Data de Recebimento</Label>
              <DatePickerInput value={receivedAt} onChange={setReceivedAt} placeholder="Selecionar data" />
            </div>
            <div className="space-y-2">
              <Label>Data de Validade</Label>
              <DatePickerInput value={expiredAt} onChange={setExpiredAt} placeholder="Selecionar data" />
            </div>
          </div>

          {/* Observações */}
          <div className="space-y-2">
            <Label>Observações</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Observações sobre o lote..." />
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>Cancelar</Button>
          <Button type="button" onClick={handleSubmit} disabled={pending}>
            {pending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Salvando…</> : (isEdit ? "Salvar" : "Criar Lote")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

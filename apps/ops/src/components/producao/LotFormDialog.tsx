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

const MOCK_PRODUCTS = [
  { id: "p1", name: "Reagente CarboZé" },
  { id: "p2", name: "Reagente CarboPRO" },
  { id: "p3", name: "Aditivo X" },
  { id: "p4", name: "Base concentrada" },
];
const MOCK_SUPPLIERS = [
  { id: "s1", name: "QuímicaSul" },
  { id: "s2", name: "BioReagentes" },
  { id: "s3", name: "InsumosBR" },
];

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
  initial?: LotFormInitial;
}

export function LotFormDialog({ open, onOpenChange, mode, initial }: LotFormDialogProps) {
  const [productId, setProductId] = useState(initial?.product_id ?? "");
  const [volume, setVolume] = useState(String(initial?.initial_volume_ml ?? 200000));
  const [expectedSamples, setExpectedSamples] = useState(String(initial?.expected_samples ?? 3));
  const [supplierId, setSupplierId] = useState(initial?.supplier_id ?? "");
  const [receivedAt, setReceivedAt] = useState(initial?.received_at ?? "");
  const [expiredAt, setExpiredAt] = useState(initial?.expired_at ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");

  const handleSubmit = () => {
    toast.info("Disponível na fase de lógica");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{mode === "create" ? "Novo Lote de Reagente" : "Editar Lote"}</DialogTitle>
          <DialogDescription>
            {mode === "create" ? "Registre um novo lote de reagente recebido." : "Atualize os dados do lote."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Produto */}
          <div className="space-y-2">
            <Label>Produto *</Label>
            <Select value={productId} onValueChange={setProductId}>
              <SelectTrigger><SelectValue placeholder="Selecione o produto" /></SelectTrigger>
              <SelectContent>
                {MOCK_PRODUCTS.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {/* Volume e Amostras */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Volume Inicial (ml) *</Label>
              <Input type="number" value={volume} onChange={(e) => setVolume(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Amostras Esperadas</Label>
              <Input type="number" value={expectedSamples} onChange={(e) => setExpectedSamples(e.target.value)} />
            </div>
          </div>

          {/* Fornecedor */}
          <div className="space-y-2">
            <Label>Fornecedor</Label>
            <Select value={supplierId} onValueChange={setSupplierId}>
              <SelectTrigger><SelectValue placeholder="Selecione (opcional)" /></SelectTrigger>
              <SelectContent>
                {MOCK_SUPPLIERS.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
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
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button type="button" onClick={handleSubmit}>{mode === "create" ? "Criar Lote" : "Salvar"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

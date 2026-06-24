import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CarboCard, CarboCardContent, CarboCardHeader, CarboCardTitle } from "@/components/ui/carbo-card";
import { useCreatePurchaseRequest } from "@/hooks/usePurchasing";
import { useSuppliers } from "@/hooks/useSuppliers";
import type { PurchaseRequestItem } from "@/types/purchasing";

const UNITS_OF_MEASURE = ["un", "kg", "g", "L", "mL", "m", "cm", "m²", "m³", "pç", "cx", "pct", "par", "h", "km"];

interface PurchaseRequestFormProps {
  serviceOrderId?: string;
  onClose: () => void;
}

const COST_CENTERS = [
  "Operações",
  "Manutenção",
  "Logística",
  "Administrativo",
  "Comercial",
  "TI",
  "Marketing",
  "Qualidade",
  "Financeiro",
  "RH",
  "Jurídico",
  "P&D",
  "Compras",
  "Produção",
];

export function PurchaseRequestForm({ serviceOrderId, onClose }: PurchaseRequestFormProps) {
  const createRC = useCreatePurchaseRequest();
  const { data: suppliers } = useSuppliers();
  const [costCenter, setCostCenter] = useState("");
  const [purchaseType, setPurchaseType] = useState("uso_direto");
  const [supplier, setSupplier] = useState("");
  const [justification, setJustification] = useState("");
  const [impact, setImpact] = useState("");
  const [items, setItems] = useState<PurchaseRequestItem[]>([
    { descricao: "", quantidade: 1, unidade: "un", valor_unitario: 0 },
  ]);

  const estimatedValue = items.reduce((sum, i) => sum + i.quantidade * i.valor_unitario, 0);

  const addItem = () => setItems([...items, { descricao: "", quantidade: 1, unidade: "un", valor_unitario: 0 }]);
  const removeItem = (idx: number) => setItems(items.filter((_, i) => i !== idx));
  const updateItem = (idx: number, field: keyof PurchaseRequestItem, value: any) => {
    const updated = [...items];
    (updated[idx] as any)[field] = value;
    setItems(updated);
  };

  const handleSubmit = async (asDraft: boolean) => {
    if (!costCenter || !justification || items.some((i) => !i.descricao)) return;

    await createRC.mutateAsync({
      cost_center: costCenter,
      purchase_type: purchaseType,
      suggested_supplier: supplier,
      estimated_value: estimatedValue,
      justification,
      operational_impact: impact,
      items,
      service_order_id: serviceOrderId,
      status: asDraft ? "rascunho" : "aguardando_aprovacao",
    });
    onClose();
  };

  const formatCurrency = (val: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(val);

  return (
    <CarboCard variant="elevated" padding="default">
      <CarboCardHeader>
        <CarboCardTitle>Nova Requisição de Compra</CarboCardTitle>
      </CarboCardHeader>
      <CarboCardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <Label>Centro de Custo *</Label>
            <Select value={costCenter} onValueChange={setCostCenter}>
              <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
              <SelectContent>
                {COST_CENTERS.map((cc) => (
                  <SelectItem key={cc} value={cc}>{cc}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Tipo de Compra</Label>
            <Select value={purchaseType} onValueChange={setPurchaseType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="estoque">Estoque</SelectItem>
                <SelectItem value="uso_direto">Uso Direto</SelectItem>
                <SelectItem value="investimento">Investimento</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Fornecedor Sugerido</Label>
            <Select value={supplier} onValueChange={setSupplier}>
              <SelectTrigger><SelectValue placeholder="Selecione o fornecedor..." /></SelectTrigger>
              <SelectContent>
                {(suppliers || []).filter(s => s.is_active).map((s) => (
                  <SelectItem key={s.id} value={s.name}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div>
          <Label>Justificativa *</Label>
          <Textarea value={justification} onChange={(e) => setJustification(e.target.value)} placeholder="Descreva a necessidade..." />
        </div>

        <div>
          <Label>Impacto Operacional</Label>
          <Textarea value={impact} onChange={(e) => setImpact(e.target.value)} placeholder="Descreva o impacto se não aprovado..." />
        </div>

        {/* Items */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <Label>Itens da Requisição</Label>
            <Button variant="outline" size="sm" onClick={addItem} className="gap-1">
              <Plus className="h-3.5 w-3.5" /> Adicionar Item
            </Button>
          </div>
          <div className="space-y-2">
            {items.map((item, idx) => (
              <div key={idx} className="grid grid-cols-12 gap-2 items-end">
                <div className="col-span-5">
                  {idx === 0 && <Label className="text-xs">Descrição</Label>}
                  <Input
                    value={item.descricao}
                    onChange={(e) => updateItem(idx, "descricao", e.target.value)}
                    placeholder="Descrição do item"
                  />
                </div>
                <div className="col-span-2">
                  {idx === 0 && <Label className="text-xs">Qtd</Label>}
                  <Input
                    type="number"
                    min={1}
                    value={item.quantidade}
                    onChange={(e) => updateItem(idx, "quantidade", Number(e.target.value))}
                  />
                </div>
                <div className="col-span-1">
                  {idx === 0 && <Label className="text-xs">Un.</Label>}
                  <Select value={item.unidade} onValueChange={(v) => updateItem(idx, "unidade", v)}>
                    <SelectTrigger className="h-9 px-2 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {UNITS_OF_MEASURE.map((u) => (
                        <SelectItem key={u} value={u}>{u}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="col-span-3">
                  {idx === 0 && <Label className="text-xs">Valor Unit.</Label>}
                  <Input
                    type="number"
                    min={0}
                    step={0.01}
                    value={item.valor_unitario}
                    onChange={(e) => updateItem(idx, "valor_unitario", Number(e.target.value))}
                  />
                </div>
                <div className="col-span-1 flex justify-center">
                  {items.length > 1 && (
                    <Button variant="ghost" size="icon" onClick={() => removeItem(idx)} className="h-8 w-8 text-destructive">
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
          <div className="mt-3 text-right">
            <span className="text-sm text-muted-foreground">Valor Estimado: </span>
            <span className="text-lg font-bold kpi-number">{formatCurrency(estimatedValue)}</span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3 pt-4 border-t border-border">
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button variant="secondary" onClick={() => handleSubmit(true)} disabled={createRC.isPending}>
            Salvar Rascunho
          </Button>
          <Button onClick={() => handleSubmit(false)} disabled={createRC.isPending} className="carbo-gradient text-white">
            Enviar para Aprovação
          </Button>
        </div>
      </CarboCardContent>
    </CarboCard>
  );
}

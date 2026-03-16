import { useState, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  ClipboardCheck,
  ArrowRight,
  ArrowLeft,
  Loader2,
  CheckCircle,
  AlertTriangle,
  XCircle,
  Package,
  Beaker,
} from "lucide-react";
import {
  type ProductionOrder,
  useProductionOrderMaterials,
  type ProductionOrderMaterial,
} from "@/hooks/useProductionOrders";
import {
  useSubmitConfirmation,
  type ConfirmationItem,
} from "@/hooks/useProductionConfirmation";
import { useLots } from "@/hooks/useLots";
import { cn } from "@/lib/utils";

interface ConfirmOPDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  order: ProductionOrder | null;
}

type Step = "production" | "materials" | "summary";

function YieldBadge({ pct }: { pct: number }) {
  const color = pct >= 90 ? "bg-green-500" : pct >= 75 ? "bg-yellow-500" : "bg-red-500";
  return (
    <Badge className={cn("text-white border-0 text-sm px-3 py-1", color)}>
      {pct.toFixed(1)}%
    </Badge>
  );
}

export function ConfirmOPDialog({ open, onOpenChange, order }: ConfirmOPDialogProps) {
  const [step, setStep] = useState<Step>("production");
  const [goodQty, setGoodQty] = useState(0);
  const [rejectedQty, setRejectedQty] = useState(0);
  const [rejectionReason, setRejectionReason] = useState("");
  const [deviationNotes, setDeviationNotes] = useState("");
  const [items, setItems] = useState<ConfirmationItem[]>([]);

  const { data: materials = [] } = useProductionOrderMaterials(order?.id);
  const { data: allLots = [] } = useLots();
  const submitConfirmation = useSubmitConfirmation();

  // Reset on open
  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) {
      setStep("production");
      setGoodQty(0);
      setRejectedQty(0);
      setRejectionReason("");
      setDeviationNotes("");
      setItems([]);
    } else if (order) {
      setGoodQty(order.planned_quantity);
      setRejectedQty(0);
    }
    onOpenChange(isOpen);
  };

  // Initialize items from materials
  const initializeItems = () => {
    const initialized: ConfirmationItem[] = materials.map((m: ProductionOrderMaterial) => ({
      product_id: m.product_id,
      product_name: m.product_name || "—",
      theoretical_quantity: m.theoretical_quantity,
      actual_quantity: m.is_separated ? m.separated_quantity : m.theoretical_quantity,
      loss_quantity: 0,
      loss_reason: "",
      lot_id: null,
      unit: "un",
    }));
    setItems(initialized);
  };

  // Filter lots for a given product (only approved)
  const getLotsForProduct = (productId: string) =>
    allLots.filter((l) => l.product_id === productId && l.status === "aprovado");

  // Calculate KPIs
  const yieldPct = useMemo(() => {
    if (!order || order.planned_quantity <= 0) return 0;
    return Math.min(100, Math.max(0, (goodQty / order.planned_quantity) * 100));
  }, [goodQty, order]);

  const bomAdherencePct = useMemo(() => {
    const validItems = items.filter((i) => i.theoretical_quantity > 0);
    if (validItems.length === 0) return 100;
    const adherences = validItems.map((i) => (i.actual_quantity / i.theoretical_quantity) * 100);
    return adherences.reduce((a, b) => a + b, 0) / adherences.length;
  }, [items]);

  // Update an item
  const updateItem = (index: number, field: keyof ConfirmationItem, value: any) => {
    setItems((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      // Auto-calculate loss
      if (field === "actual_quantity") {
        const actual = Number(value) || 0;
        const theoretical = next[index].theoretical_quantity;
        next[index].loss_quantity = Math.max(0, actual - theoretical);
      }
      return next;
    });
  };

  // Submit
  const handleSubmit = async () => {
    if (!order) return;

    await submitConfirmation.mutateAsync({
      production_order_id: order.id,
      sku_id: order.sku_id,
      planned_quantity: order.planned_quantity,
      good_quantity: goodQty,
      rejected_quantity: rejectedQty,
      rejection_reason: rejectedQty > 0 ? rejectionReason : undefined,
      deviation_notes: deviationNotes || undefined,
      destination_warehouse_id: order.destination_warehouse_id,
      items,
    });

    handleOpenChange(false);
  };

  if (!order) return null;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ClipboardCheck className="h-5 w-5 text-purple-500" />
            Confirmar Produção
          </DialogTitle>
          <DialogDescription>
            {order.sku_code} — {order.sku_name} | Planejado: {order.planned_quantity} un
          </DialogDescription>
        </DialogHeader>

        {/* Step indicators */}
        <div className="flex items-center gap-2 px-2 py-3">
          {(["production", "materials", "summary"] as Step[]).map((s, i) => {
            const labels = ["Resultado", "Materiais", "Resumo"];
            const isActive = s === step;
            const isPast = (step === "materials" && i === 0) || (step === "summary" && i < 2);
            return (
              <div key={s} className="flex items-center gap-2 flex-1">
                <div
                  className={cn(
                    "h-7 w-7 rounded-full flex items-center justify-center text-xs font-bold",
                    isActive
                      ? "bg-purple-500 text-white"
                      : isPast
                        ? "bg-green-500 text-white"
                        : "bg-muted text-muted-foreground"
                  )}
                >
                  {isPast ? "✓" : i + 1}
                </div>
                <span className={cn("text-sm", isActive ? "font-medium" : "text-muted-foreground")}>
                  {labels[i]}
                </span>
                {i < 2 && <ArrowRight className="h-4 w-4 text-muted-foreground ml-auto" />}
              </div>
            );
          })}
        </div>

        {/* Step 1: Production Result */}
        {step === "production" && (
          <div className="space-y-5 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="goodQty" className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-green-500" />
                  Quantidade Aprovada
                </Label>
                <Input
                  id="goodQty"
                  type="number"
                  min={0}
                  value={goodQty}
                  onChange={(e) => setGoodQty(Number(e.target.value) || 0)}
                  className="text-lg font-bold"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="rejectedQty" className="flex items-center gap-2">
                  <XCircle className="h-4 w-4 text-red-500" />
                  Quantidade Rejeitada
                </Label>
                <Input
                  id="rejectedQty"
                  type="number"
                  min={0}
                  value={rejectedQty}
                  onChange={(e) => setRejectedQty(Number(e.target.value) || 0)}
                  className="text-lg font-bold"
                />
              </div>
            </div>

            {/* Yield preview */}
            <div className="bg-muted/50 rounded-lg p-4 flex items-center justify-between">
              <span className="text-sm font-medium">Rendimento Estimado</span>
              <YieldBadge pct={yieldPct} />
            </div>

            {rejectedQty > 0 && (
              <div className="space-y-2">
                <Label htmlFor="rejectionReason">Motivo da Rejeição</Label>
                <Textarea
                  id="rejectionReason"
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  placeholder="Descreva o motivo das unidades rejeitadas..."
                  rows={3}
                />
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="deviationNotes">Observações / Desvios (opcional)</Label>
              <Textarea
                id="deviationNotes"
                value={deviationNotes}
                onChange={(e) => setDeviationNotes(e.target.value)}
                placeholder="Notas sobre desvios no processo..."
                rows={2}
              />
            </div>

            <div className="flex justify-end">
              <Button
                onClick={() => {
                  initializeItems();
                  setStep("materials");
                }}
                disabled={goodQty <= 0 && rejectedQty <= 0}
              >
                Próximo: Materiais
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </div>
          </div>
        )}

        {/* Step 2: Material Consumption */}
        {step === "materials" && (
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              Informe o consumo real de cada material. O valor teórico é baseado na BOM.
            </p>

            <div className="space-y-3 max-h-[400px] overflow-y-auto">
              {items.map((item, index) => {
                const lots = getLotsForProduct(item.product_id);
                const overConsumed = item.actual_quantity > item.theoretical_quantity;
                return (
                  <div
                    key={item.product_id}
                    className={cn(
                      "rounded-lg border p-4 space-y-3",
                      overConsumed ? "border-amber-300 bg-amber-50/50 dark:bg-amber-950/10" : ""
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Package className="h-4 w-4 text-blue-500" />
                        <span className="font-medium text-sm">{item.product_name}</span>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        Teórico: <strong>{item.theoretical_quantity}</strong>
                      </span>
                    </div>

                    <div className="grid grid-cols-3 gap-3">
                      <div className="space-y-1">
                        <Label className="text-xs">Consumo Real</Label>
                        <Input
                          type="number"
                          min={0}
                          step={0.01}
                          value={item.actual_quantity}
                          onChange={(e) =>
                            updateItem(index, "actual_quantity", Number(e.target.value) || 0)
                          }
                          className={cn("h-9", overConsumed && "border-amber-500")}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Perda</Label>
                        <Input
                          type="number"
                          value={item.loss_quantity}
                          readOnly
                          className="h-9 bg-muted"
                        />
                      </div>
                      {lots.length > 0 && (
                        <div className="space-y-1">
                          <Label className="text-xs flex items-center gap-1">
                            <Beaker className="h-3 w-3" /> Lote
                          </Label>
                          <Select
                            value={item.lot_id || "none"}
                            onValueChange={(v) => updateItem(index, "lot_id", v === "none" ? null : v)}
                          >
                            <SelectTrigger className="h-9 text-xs">
                              <SelectValue placeholder="Selecionar" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">Nenhum</SelectItem>
                              {lots.map((lot) => (
                                <SelectItem key={lot.id} value={lot.id}>
                                  {lot.lot_code} ({lot.available_volume_ml}ml)
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                    </div>

                    {overConsumed && (
                      <div className="space-y-1">
                        <Label className="text-xs text-amber-600">Motivo do Excesso</Label>
                        <Input
                          value={item.loss_reason}
                          onChange={(e) => updateItem(index, "loss_reason", e.target.value)}
                          placeholder="Ex: reprocessamento, derramamento..."
                          className="h-9 text-sm"
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="flex justify-between pt-2">
              <Button variant="outline" onClick={() => setStep("production")}>
                <ArrowLeft className="h-4 w-4 mr-2" />
                Voltar
              </Button>
              <Button onClick={() => setStep("summary")}>
                Próximo: Resumo
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </div>
          </div>
        )}

        {/* Step 3: Summary & Confirm */}
        {step === "summary" && (
          <div className="space-y-5 py-2">
            {/* Production result */}
            <div className="rounded-lg border p-4 space-y-3">
              <h4 className="font-semibold text-sm">Resultado da Produção</h4>
              <div className="grid grid-cols-3 gap-4 text-center">
                <div>
                  <p className="text-xs text-muted-foreground">Planejado</p>
                  <p className="text-xl font-bold">{order.planned_quantity}</p>
                </div>
                <div>
                  <p className="text-xs text-green-500">Aprovado</p>
                  <p className="text-xl font-bold text-green-600">{goodQty}</p>
                </div>
                <div>
                  <p className="text-xs text-red-500">Rejeitado</p>
                  <p className="text-xl font-bold text-red-600">{rejectedQty}</p>
                </div>
              </div>
            </div>

            {/* KPIs */}
            <div className="grid grid-cols-2 gap-4">
              <div className="rounded-lg border p-4 text-center">
                <p className="text-xs text-muted-foreground mb-1">Rendimento</p>
                <YieldBadge pct={yieldPct} />
              </div>
              <div className="rounded-lg border p-4 text-center">
                <p className="text-xs text-muted-foreground mb-1">Aderência BOM</p>
                <YieldBadge pct={bomAdherencePct} />
              </div>
            </div>

            {/* Materials summary */}
            <div className="rounded-lg border p-4 space-y-2">
              <h4 className="font-semibold text-sm">Consumo de Materiais</h4>
              <div className="space-y-1.5">
                {items.map((item) => {
                  const adherence = item.theoretical_quantity > 0
                    ? (item.actual_quantity / item.theoretical_quantity) * 100
                    : 100;
                  const isOver = adherence > 105;
                  const isUnder = adherence < 95;
                  return (
                    <div key={item.product_id} className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground truncate max-w-[200px]">
                        {item.product_name}
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs">
                          {item.actual_quantity} / {item.theoretical_quantity}
                        </span>
                        {isOver && <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />}
                        {isUnder && <AlertTriangle className="h-3.5 w-3.5 text-blue-500" />}
                        {!isOver && !isUnder && <CheckCircle className="h-3.5 w-3.5 text-green-500" />}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {deviationNotes && (
              <div className="rounded-lg border border-amber-200 bg-amber-50/50 dark:bg-amber-950/10 p-3">
                <p className="text-xs font-medium text-amber-700 mb-1">Observações</p>
                <p className="text-sm text-amber-600">{deviationNotes}</p>
              </div>
            )}

            {/* Warning */}
            <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-lg p-3 flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-red-500 mt-0.5 flex-shrink-0" />
              <p className="text-sm text-red-700 dark:text-red-400">
                Esta ação é <strong>irreversível</strong>. Ao confirmar, o estoque será ajustado e o
                status da OP mudará para "Confirmada".
              </p>
            </div>

            <div className="flex justify-between pt-2">
              <Button variant="outline" onClick={() => setStep("materials")}>
                <ArrowLeft className="h-4 w-4 mr-2" />
                Voltar
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={submitConfirmation.isPending}
                className="bg-purple-600 hover:bg-purple-700 text-white"
              >
                {submitConfirmation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Confirmando...
                  </>
                ) : (
                  <>
                    <ClipboardCheck className="h-4 w-4 mr-2" />
                    Confirmar Produção
                  </>
                )}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

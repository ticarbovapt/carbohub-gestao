import React, { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, ShieldCheck, AlertTriangle, Package, MapPin, CheckCircle2, XCircle, ShieldAlert } from "lucide-react";
import { useSubmitConfirmation } from "@/hooks/useProductionConfirmation";
import { useUpdateProductionOrderOP } from "@/hooks/useProductionOrders";
import type { ProductionOrder, QualityResult } from "@/hooks/useProductionOrders";

const DEVIATION_REASONS = [
  { value: "produzido_a_mais",   label: "Produzido a mais" },
  { value: "falta_de_insumo",    label: "Falta de insumo" },
  { value: "quebra_de_producao", label: "Quebra / perda de produção" },
  { value: "erro_de_medicao",    label: "Erro de medição" },
  { value: "ajuste_de_formula",  label: "Ajuste de fórmula" },
  { value: "outro",              label: "Outro" },
];

const QUALITY_OPTIONS: { value: QualityResult; label: string; icon: React.ReactNode; color: string }[] = [
  { value: "aprovada",  label: "Aprovado",  icon: <CheckCircle2 className="h-4 w-4" />, color: "border-green-500 bg-green-500/10 text-green-700 dark:text-green-400" },
  { value: "reprovada", label: "Reprovado", icon: <XCircle className="h-4 w-4" />,      color: "border-red-500 bg-red-500/10 text-red-700 dark:text-red-400" },
  { value: "bloqueada", label: "Bloqueado", icon: <ShieldAlert className="h-4 w-4" />,  color: "border-amber-500 bg-amber-500/10 text-amber-700 dark:text-amber-400" },
];

interface QuickConfirmOPDialogProps {
  open: boolean;
  order: ProductionOrder | null;
  onOpenChange: (open: boolean) => void;
}

export function QuickConfirmOPDialog({ open, order, onOpenChange }: QuickConfirmOPDialogProps) {
  const [goodQty,       setGoodQty]       = useState("");
  const [reason,        setReason]        = useState("");
  const [notes,         setNotes]         = useState("");
  const [qualityResult, setQualityResult] = useState<QualityResult | "">("");

  const submitConfirmation = useSubmitConfirmation();
  const updateOP           = useUpdateProductionOrderOP();

  useEffect(() => {
    if (open && order) {
      setGoodQty(String(order.planned_quantity));
      setReason("");
      setNotes("");
      setQualityResult("");
    }
  }, [open, order?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const { data: materials = [] } = useQuery({
    queryKey: ["op_materials_quick", order?.id],
    enabled: !!order?.id && open,
    queryFn: async () => {
      const { data: mats, error } = await (supabase as any)
        .from("production_order_material")
        .select("product_id, theoretical_quantity")
        .eq("production_order_id", order!.id);
      if (error) throw error;

      const ids = (mats || []).map((m: any) => m.product_id as string);
      if (ids.length === 0) return [];

      const [prodsRes, lotsRes] = await Promise.all([
        supabase.from("mrp_products").select("id, name, stock_unit").in("id", ids),
        (supabase as any).from("inventory_lot")
          .select("id, product_id, available_volume_ml")
          .in("product_id", ids)
          .eq("status", "aprovado")
          .gt("available_volume_ml", 0)
          .order("created_at", { ascending: false }),
      ]);

      const prodMap = new Map((prodsRes.data || []).map((p: any) => [p.id, p]));
      // Pick the lot with most volume available per product
      const lotMap = new Map<string, string>();
      for (const lot of (lotsRes.data || [])) {
        if (!lotMap.has(lot.product_id)) lotMap.set(lot.product_id, lot.id);
      }

      return (mats || []).map((m: any) => ({
        product_id:           m.product_id as string,
        theoretical_quantity: m.theoretical_quantity as number,
        product_name: (prodMap.get(m.product_id) as any)?.name      || "—",
        unit:         (prodMap.get(m.product_id) as any)?.stock_unit || "un",
        lot_id:       lotMap.get(m.product_id) || null,
      }));
    },
  });

  const { data: natalWarehouse } = useQuery({
    queryKey: ["warehouse_natal"],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("warehouses")
        .select("id, name")
        .ilike("name", "%natal%")
        .eq("is_active", true)
        .maybeSingle();
      return data as { id: string; name: string } | null;
    },
  });

  if (!order) return null;

  const plannedQty = order.planned_quantity;
  const actualQty  = Number(goodQty);
  const diff       = actualQty - plannedQty;
  const qtyChanged = goodQty !== "" && actualQty !== plannedQty;
  const isPending  = submitConfirmation.isPending || updateOP.isPending;
  const canConfirm = !!qualityResult && !isPending && !(qtyChanged && !reason);

  const handleConfirm = async () => {
    const actual = Number(goodQty);
    if (isNaN(actual) || actual <= 0) {
      toast.error("Quantidade deve ser maior que zero");
      return;
    }
    if (qtyChanged && !reason) {
      toast.error("Selecione o motivo da alteração na quantidade");
      return;
    }
    if (!qualityResult) {
      toast.error("Selecione o resultado da inspeção de qualidade");
      return;
    }

    const ratio       = plannedQty > 0 ? actual / plannedQty : 1;
    const warehouseId = order.destination_warehouse_id || natalWarehouse?.id || null;

    const items = materials.map(m => {
      const scaled = Math.max(0, Math.round(m.theoretical_quantity * ratio * 100) / 100);
      return {
        product_id:           m.product_id,
        product_name:         m.product_name,
        theoretical_quantity: m.theoretical_quantity,
        actual_quantity:      scaled,
        loss_quantity:        Math.max(0, m.theoretical_quantity - scaled),
        loss_reason:          qtyChanged ? reason : "",
        lot_id:               m.lot_id || null,
        unit:                 m.unit,
      };
    });

    try {
      await submitConfirmation.mutateAsync({
        production_order_id:      order.id,
        sku_id:                   order.sku_id,
        planned_quantity:         plannedQty,
        good_quantity:            actual,
        rejected_quantity:        Math.max(0, plannedQty - actual),
        rejection_reason:         qtyChanged ? reason : undefined,
        deviation_notes:          notes || undefined,
        destination_warehouse_id: warehouseId,
        items,
      });

      // Próximo status baseado no resultado da qualidade
      const nextStatus = qualityResult === "aprovada" ? "qualidade_aprovada" : "bloqueada";
      await updateOP.mutateAsync({
        id: order.id,
        op_status:      nextStatus,
        quality_result: qualityResult,
      });

      onOpenChange(false);
    } catch {
      // errors handled by hooks (toast shown in onError)
    }
  };

  return (
    <Dialog open={open} onOpenChange={v => { if (!isPending) onOpenChange(v); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-orange-500" />
            Inspeção de Qualidade
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* OP info */}
          <div className="rounded-lg bg-muted/50 border border-border px-4 py-3 space-y-1">
            <p className="font-mono text-[11px] text-muted-foreground tracking-wide">
              {order.op_number || order.id.slice(0, 8).toUpperCase()}
            </p>
            <p className="font-semibold text-sm flex items-center gap-1.5">
              <Package className="h-3.5 w-3.5 text-muted-foreground" />
              {order.sku_name || "Produto"}
            </p>
            <p className="text-xs text-muted-foreground">
              Planejado: <strong className="text-foreground">{plannedQty} un</strong>
            </p>
          </div>

          {/* Quality result — REQUIRED */}
          <div className="space-y-2">
            <Label>Resultado da Inspeção *</Label>
            <div className="grid grid-cols-3 gap-2">
              {QUALITY_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setQualityResult(opt.value)}
                  className={`flex flex-col items-center gap-1.5 rounded-lg border-2 px-3 py-3 text-xs font-semibold transition-all
                    ${qualityResult === opt.value
                      ? opt.color + " border-current"
                      : "border-border text-muted-foreground hover:border-muted-foreground/50"
                    }`}
                >
                  {opt.icon}
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Quantity */}
          <div className="space-y-2">
            <Label htmlFor="good-qty">Quantidade Produzida *</Label>
            <Input
              id="good-qty"
              type="number"
              min={0}
              value={goodQty}
              onChange={e => setGoodQty(e.target.value)}
              placeholder={String(plannedQty)}
            />
            {qtyChanged && (
              <p className={`text-xs flex items-center gap-1 font-medium ${diff < 0 ? "text-destructive" : "text-green-600"}`}>
                <AlertTriangle className="h-3 w-3" />
                {diff > 0 ? "+" : ""}{diff} unidades em relação ao planejado
              </p>
            )}
          </div>

          {qtyChanged && (
            <div className="space-y-2">
              <Label>Motivo da alteração *</Label>
              <Select value={reason} onValueChange={setReason}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o motivo" />
                </SelectTrigger>
                <SelectContent>
                  {DEVIATION_REASONS.map(r => (
                    <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Destination hub */}
          <div className="flex items-center gap-1.5 text-sm text-muted-foreground rounded-md bg-muted/30 px-3 py-2">
            <MapPin className="h-3.5 w-3.5 shrink-0" />
            <span>Estoque creditado em:</span>
            <strong className="text-foreground ml-1">{natalWarehouse?.name ?? "Hub Natal"}</strong>
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label htmlFor="notes">Observações (opcional)</Label>
            <Textarea
              id="notes"
              placeholder="Detalhes da inspeção..."
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={2}
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            Cancelar
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={!canConfirm}
            className={qualityResult === "aprovada"
              ? "bg-green-600 hover:bg-green-700 text-white"
              : qualityResult === "reprovada"
                ? "bg-red-600 hover:bg-red-700 text-white"
                : qualityResult === "bloqueada"
                  ? "bg-amber-600 hover:bg-amber-700 text-white"
                  : ""}
          >
            {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {qualityResult === "aprovada" ? "Aprovar" : qualityResult === "reprovada" ? "Reprovar" : qualityResult === "bloqueada" ? "Bloquear" : "Selecione o resultado"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

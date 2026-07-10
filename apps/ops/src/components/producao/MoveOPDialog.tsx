import { useMemo } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { CarboBadge } from "@/components/ui/carbo-badge";
import { CheckCircle2, AlertTriangle, PackageX, ArrowRight, Loader2 } from "lucide-react";
import { useMrpProducts } from "@/hooks/useMrpProducts";
import { useBom } from "@/hooks/useBom";
import { convertUnit, unitLabel } from "@/lib/units";
import type { OpRow, OpStatus } from "@/hooks/useProductionOrders";

const HUB_RN = "HUB-RN";
const fmt = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 3 });

interface MoveOPDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  op: OpRow | null;
  fromLabel: string;
  toLabel: string;
  toStatus: OpStatus;
  pending: boolean;
  onConfirm: () => void;
}

interface Line {
  id: string; name: string; needed: number; unit: string; available: number; incompatible: boolean; critical: boolean;
}

export function MoveOPDialog({ open, onOpenChange, op, fromLabel, toLabel, toStatus, pending, onConfirm }: MoveOPDialogProps) {
  const isSeparacao = toStatus === "separada";
  const isConclusao = toStatus === "concluida";

  const { data: products = [] } = useMrpProducts();
  const { data: bom = [], isLoading: bomLoading } = useBom(open && isSeparacao && op?.product_id ? op.product_id : null);
  const qty = op?.planned_quantity ?? 0;
  const productById = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);

  const lines = useMemo<Line[]>(() => {
    if (!isSeparacao || !op?.product_id || qty <= 0) return [];
    return bom.map((b) => {
      const insumo = productById.get(b.insumo_id);
      const stockUnit = insumo?.stock_unit || b.unit || "un";
      const raw = b.qty * qty;
      const converted = convertUnit(raw, b.unit || stockUnit, stockUnit);
      const available = insumo?.hubs.find((h) => h.warehouse_name === HUB_RN)?.quantity ?? 0;
      return {
        id: b.insumo_id, name: insumo?.name || b.insumo || "—",
        needed: converted ?? raw, unit: stockUnit, available,
        incompatible: converted === null, critical: b.is_critical,
      };
    });
  }, [bom, productById, isSeparacao, op?.product_id, qty]);

  const missing = lines.filter((l) => l.incompatible || l.available < l.needed);
  const canSeparate = lines.length > 0 && missing.length === 0;

  if (!op) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isSeparacao ? "Separar materiais?" : isConclusao ? "Concluir produção?" : "Mover ordem de produção?"}
          </DialogTitle>
          <DialogDescription className="flex items-center gap-2 pt-1">
            <span className="font-mono text-xs text-blue-500">{op.op_number}</span>
            <span className="text-foreground font-medium">{op.sku_name}</span>
            <span className="text-muted-foreground">· {fmt(qty)} un</span>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {/* De → Para */}
          <div className="flex items-center justify-center gap-3 text-sm">
            <CarboBadge variant="secondary">{fromLabel}</CarboBadge>
            <ArrowRight className="h-4 w-4 text-muted-foreground" />
            <CarboBadge variant="default">{toLabel}</CarboBadge>
          </div>

          {/* Baixa de insumos (Separação) */}
          {isSeparacao && (
            <div className="rounded-lg border border-border overflow-hidden">
              <div className={`flex items-center gap-2 px-3 py-2 text-sm font-medium ${
                bomLoading ? "bg-muted/40 text-muted-foreground"
                : lines.length === 0 ? "bg-amber-500/10 text-amber-700 dark:text-amber-400"
                : canSeparate ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                : "bg-destructive/10 text-destructive"
              }`}>
                {bomLoading ? <Loader2 className="h-4 w-4 animate-spin" />
                  : lines.length === 0 ? <PackageX className="h-4 w-4" />
                  : canSeparate ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
                {bomLoading ? "Conferindo insumos…"
                  : lines.length === 0 ? "Produto sem ficha (BOM) — nada será deduzido."
                  : canSeparate ? "Vai deduzir estes insumos do HUB Natal:"
                  : `Faltam ${missing.length} ${missing.length === 1 ? "insumo" : "insumos"} — a baixa deixará o estoque negativo.`}
              </div>
              {lines.length > 0 && (
                <div className="divide-y divide-border">
                  {lines.map((l) => {
                    const ok = !l.incompatible && l.available >= l.needed;
                    return (
                      <div key={l.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 font-medium truncate">
                            {l.name}{l.critical && <AlertTriangle className="h-3 w-3 text-destructive shrink-0" />}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            Deduz <strong>{fmt(l.needed)} {unitLabel(l.unit)}</strong> · Estoque <strong>{fmt(l.available)} {unitLabel(l.unit)}</strong>
                          </div>
                        </div>
                        {l.incompatible ? <CarboBadge variant="destructive" className="shrink-0">unidade incompatível</CarboBadge>
                          : ok ? <CarboBadge variant="success" className="shrink-0 gap-1"><CheckCircle2 className="h-3 w-3" /> ok</CarboBadge>
                          : <CarboBadge variant="destructive" className="shrink-0">falta {fmt(l.needed - l.available)} {unitLabel(l.unit)}</CarboBadge>}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Crédito do produto (Conclusão) */}
          {isConclusao && (
            <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-2.5 text-sm text-emerald-700 dark:text-emerald-400 flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              <span>Vai creditar <strong>{fmt(qty)} un de {op.sku_name}</strong> no estoque do HUB Natal.</span>
            </div>
          )}

          {/* Aviso geral */}
          {!isSeparacao && !isConclusao && (
            <p className="text-sm text-muted-foreground text-center">Confirmar a mudança de etapa desta OP?</p>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>Cancelar</Button>
          <Button
            type="button"
            variant={isSeparacao && !canSeparate && lines.length > 0 ? "destructive" : "default"}
            onClick={onConfirm}
            disabled={pending}
          >
            {pending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Movendo…</>
              : isSeparacao ? (canSeparate || lines.length === 0 ? "Separar" : "Separar mesmo assim")
              : isConclusao ? "Concluir" : "Mover"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Package, ChevronLeft, ArrowUpCircle, ArrowDownCircle, RefreshCw, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { CarboSkeleton } from "@/components/ui/CarboSkeleton";
import { usePDVStatus } from "@/hooks/usePDV";
import {
  usePDVProductStock,
  usePDVStockMovements,
  useAdjustPDVStock,
  MOVEMENT_LABELS,
  type PDVStockMovement,
} from "@/hooks/usePDVProducts";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

const MOVEMENT_COLORS: Record<PDVStockMovement["tipo"], string> = {
  venda:     "text-destructive",
  reposicao: "text-green-500",
  ajuste:    "text-blue-500",
  perda:     "text-orange-500",
  entrada:   "text-green-500",
};

const MOVEMENT_SIGN: Record<PDVStockMovement["tipo"], string> = {
  venda:     "−",
  reposicao: "+",
  ajuste:    "±",
  perda:     "−",
  entrada:   "+",
};

export default function PDVEstoque() {
  const navigate = useNavigate();
  const { data: pdvStatus } = usePDVStatus();
  const pdvId = pdvStatus?.pdv?.id;
  const { data: productStock = [], isLoading: stockLoading } = usePDVProductStock(pdvId);
  const { data: movements = [], isLoading: movLoading } = usePDVStockMovements(pdvId, 50);
  const adjustStock = useAdjustPDVStock();

  const [adjustOpen, setAdjustOpen] = useState(false);
  const [adjustForm, setAdjustForm] = useState({
    productId: "",
    tipo: "ajuste" as PDVStockMovement["tipo"],
    qty: "1",
    notes: "",
  });

  async function handleAdjust() {
    if (!pdvId || !adjustForm.productId) return;
    await adjustStock.mutateAsync({
      pdvId,
      productId: adjustForm.productId,
      tipo: adjustForm.tipo,
      qty: Math.abs(parseFloat(adjustForm.qty)) || 0,
      notes: adjustForm.notes || undefined,
    });
    setAdjustOpen(false);
    setAdjustForm({ productId: "", tipo: "ajuste", qty: "1", notes: "" });
  }

  if (stockLoading) {
    return (
      <div className="p-4 space-y-3">
        <CarboSkeleton className="h-10 w-48" />
        {[1, 2, 3].map(i => <CarboSkeleton key={i} className="h-24" />)}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Top bar */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border sticky top-0 bg-background z-10">
        <Button variant="ghost" size="icon" onClick={() => navigate("/pdv/dashboard")}>
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <div className="flex items-center gap-2">
          <Package className="h-5 w-5 text-primary" />
          <h1 className="font-bold text-lg">Estoque</h1>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="ml-auto gap-1.5"
          onClick={() => {
            setAdjustForm({ productId: "", tipo: "ajuste", qty: "1", notes: "" });
            setAdjustOpen(true);
          }}
        >
          <SlidersHorizontal className="h-4 w-4" /> Ajustar Estoque
        </Button>
      </div>

      <div className="p-4 space-y-6">
        {/* Stock per product */}
        <section className="space-y-3">
          <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Estoque por Produto</p>
          {productStock.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground">
              <Package className="h-8 w-8 mx-auto mb-2 opacity-40" />
              <p className="text-sm">Nenhum estoque inicializado.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {productStock.map(s => {
                const pct = s.qty_max_capacity > 0
                  ? Math.min((s.qty_current / s.qty_max_capacity) * 100, 100)
                  : 0;
                const alert = s.qty_current <= s.qty_min_threshold;
                const critical = s.qty_current === 0;
                return (
                  <div
                    key={s.id}
                    className={cn(
                      "rounded-xl border p-4 space-y-3",
                      critical ? "border-destructive/40 bg-destructive/5"
                        : alert ? "border-amber-500/40 bg-amber-500/5"
                        : "border-border bg-card"
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-semibold text-sm">{s.product?.name ?? "Produto"}</p>
                        <p className="text-xs text-muted-foreground">{s.product?.sku_code ?? ""}</p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className={cn("text-2xl font-bold", critical ? "text-destructive" : alert ? "text-amber-500" : "text-foreground")}>
                          {s.qty_current.toFixed(0)}
                        </p>
                        <p className="text-xs text-muted-foreground">unidades</p>
                      </div>
                    </div>
                    <Progress
                      value={pct}
                      className={cn("h-2", critical ? "[&>div]:bg-destructive" : alert ? "[&>div]:bg-amber-500" : "[&>div]:bg-green-500")}
                    />
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>Mín: {s.qty_min_threshold} un</span>
                      <div className="flex items-center gap-1.5">
                        {critical && <Badge variant="destructive" className="text-[10px] h-4 px-1.5">CRÍTICO</Badge>}
                        {alert && !critical && <Badge className="text-[10px] h-4 px-1.5 bg-amber-500/10 text-amber-600 border-0">ALERTA</Badge>}
                      </div>
                      <span>Máx: {s.qty_max_capacity} un</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <Separator />

        {/* Movement history */}
        <section className="space-y-3">
          <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Histórico de Movimentações</p>
          {movLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map(i => <CarboSkeleton key={i} className="h-14" />)}
            </div>
          ) : movements.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">
              Nenhuma movimentação registrada.
            </div>
          ) : (
            <div className="space-y-2">
              {movements.map(m => (
                <div
                  key={m.id}
                  className="flex items-center gap-3 rounded-lg border border-border px-3 py-2.5"
                >
                  <div className={cn("flex-shrink-0", MOVEMENT_COLORS[m.tipo])}>
                    {m.qty > 0
                      ? <ArrowUpCircle className="h-4 w-4" />
                      : <ArrowDownCircle className="h-4 w-4" />
                    }
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">
                      {MOVEMENT_LABELS[m.tipo]} — {m.product?.name ?? m.product_id.slice(0, 8)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {m.qty_before ?? "?"} → {m.qty_after ?? "?"} un
                      {m.notes ? ` · ${m.notes}` : ""}
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className={cn("text-sm font-bold", MOVEMENT_COLORS[m.tipo])}>
                      {MOVEMENT_SIGN[m.tipo]}{Math.abs(m.qty).toFixed(0)}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      {format(new Date(m.created_at), "dd/MM HH:mm", { locale: ptBR })}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* Adjust dialog */}
      <Dialog open={adjustOpen} onOpenChange={setAdjustOpen}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Ajuste de Estoque</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-sm">Produto *</Label>
              <Select
                value={adjustForm.productId}
                onValueChange={v => setAdjustForm(f => ({ ...f, productId: v }))}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Selecionar produto..." />
                </SelectTrigger>
                <SelectContent>
                  {productStock.map(s => (
                    <SelectItem key={s.product_id} value={s.product_id}>
                      {s.product?.name ?? s.product_id} — {s.qty_current.toFixed(0)} un
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-sm">Tipo de movimentação *</Label>
              <Select
                value={adjustForm.tipo}
                onValueChange={v => setAdjustForm(f => ({ ...f, tipo: v as PDVStockMovement["tipo"] }))}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(MOVEMENT_LABELS) as Array<PDVStockMovement["tipo"]>).map(t => (
                    <SelectItem key={t} value={t}>{MOVEMENT_LABELS[t]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-sm">Quantidade *</Label>
              <Input
                type="number"
                min={0}
                step={1}
                className="mt-1"
                value={adjustForm.qty}
                onChange={e => setAdjustForm(f => ({ ...f, qty: e.target.value }))}
              />
            </div>
            <div>
              <Label className="text-sm">Motivo / Observação</Label>
              <Textarea
                className="mt-1 resize-none text-sm"
                rows={2}
                placeholder="Opcional..."
                value={adjustForm.notes}
                onChange={e => setAdjustForm(f => ({ ...f, notes: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAdjustOpen(false)}>Cancelar</Button>
            <Button
              className="carbo-gradient"
              disabled={adjustStock.isPending || !adjustForm.productId}
              onClick={handleAdjust}
            >
              {adjustStock.isPending ? "Salvando..." : "Registrar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

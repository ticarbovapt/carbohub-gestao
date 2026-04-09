import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Package,
  AlertTriangle,
  ArrowUpCircle,
  ArrowDownCircle,
  SlidersHorizontal,
  Layers,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { LicenseeLayout } from "@/components/layouts/LicenseeLayout";
import { useAuth } from "@/contexts/AuthContext";
import { useLicenseeStatus } from "@/hooks/useLicenseePortal";
import {
  useLicenseeProductStock,
  useLicenseeStockMovements,
  useAdjustLicenseeStock,
  useInitLicenseeProductStock,
  useCreateProductionOrder,
  useAdminLicenseeAllStock,
  LICENSEE_MOVEMENT_LABELS,
  type LicenseeStockMovement,
} from "@/hooks/useLicenseeProducts";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

const MOVEMENT_COLORS: Record<LicenseeStockMovement["tipo"], string> = {
  venda:     "text-destructive",
  reposicao: "text-green-500",
  ajuste:    "text-blue-500",
  perda:     "text-orange-500",
  entrada:   "text-green-500",
};
const MOVEMENT_SIGN: Record<LicenseeStockMovement["tipo"], string> = {
  venda: "−", reposicao: "+", ajuste: "±", perda: "−", entrada: "+",
};

// ── MANAGER VIEW ─────────────────────────────────────────────────────────────
function LicenseeProductsManager({ licenseeId }: { licenseeId: string }) {
  const { data: productStock = [], isLoading: stockLoading } = useLicenseeProductStock(licenseeId);
  const { data: movements = [], isLoading: movLoading } = useLicenseeStockMovements(licenseeId, 30);
  const adjustStock = useAdjustLicenseeStock();
  const initStock = useInitLicenseeProductStock();
  const createOrder = useCreateProductionOrder();

  const [adjustOpen, setAdjustOpen] = useState(false);
  const [orderOpen, setOrderOpen] = useState(false);
  const [orderForm, setOrderForm] = useState({ productId: "", qty: "10", notes: "" });
  const [adjustForm, setAdjustForm] = useState({
    productId: "",
    tipo: "ajuste" as LicenseeStockMovement["tipo"],
    qty: "1",
    notes: "",
  });

  const hasAlerts = productStock.some(s => s.has_alert);

  async function handleAdjust() {
    if (!adjustForm.productId) return;
    await adjustStock.mutateAsync({
      licenseeId,
      productId: adjustForm.productId,
      tipo: adjustForm.tipo,
      qty: Math.abs(parseFloat(adjustForm.qty)) || 0,
      notes: adjustForm.notes || undefined,
    });
    setAdjustOpen(false);
    setAdjustForm({ productId: "", tipo: "ajuste", qty: "1", notes: "" });
  }

  async function handleOrder() {
    if (!orderForm.productId) return;
    await createOrder.mutateAsync({
      licenseeId,
      productId: orderForm.productId,
      qtyRequested: Math.abs(parseFloat(orderForm.qty)) || 10,
      notes: orderForm.notes || undefined,
    });
    setOrderOpen(false);
    setOrderForm({ productId: "", qty: "10", notes: "" });
  }

  if (stockLoading) {
    return (
      <LicenseeLayout>
        <div className="p-4 space-y-3">
          <Skeleton className="h-10 w-48" />
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-28" />)}
        </div>
      </LicenseeLayout>
    );
  }

  return (
    <LicenseeLayout>
      <div className="flex flex-col min-h-full">
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border sticky top-0 bg-background z-10">
          <div className="flex items-center gap-2">
            <Package className="h-5 w-5 text-primary" />
            <h1 className="font-bold text-lg">Estoque de Produtos</h1>
          </div>
          <div className="ml-auto flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => { setOrderForm({ productId: "", qty: "10", notes: "" }); setOrderOpen(true); }}
            >
              Solicitar Reposição
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5"
              onClick={() => { setAdjustForm({ productId: "", tipo: "ajuste", qty: "1", notes: "" }); setAdjustOpen(true); }}
            >
              <SlidersHorizontal className="h-4 w-4" /> Ajustar
            </Button>
          </div>
        </div>

        <div className="p-4 space-y-6">
          {/* Alert banner */}
          {hasAlerts && (
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3 flex items-center gap-3">
              <AlertTriangle className="h-5 w-5 text-amber-500 flex-shrink-0" />
              <p className="text-sm font-semibold text-amber-600">
                {productStock.filter(s => s.has_alert).length} produto(s) abaixo do estoque mínimo
              </p>
            </div>
          )}

          {/* Product stock cards */}
          <section className="space-y-3">
            <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Estoque por Produto</p>
            {productStock.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Package className="h-10 w-10 mx-auto mb-3 opacity-40" />
                <p className="text-sm mb-3">Estoque não inicializado.</p>
                <Button
                  size="sm"
                  onClick={() => initStock.mutate(licenseeId)}
                  disabled={initStock.isPending}
                >
                  {initStock.isPending ? "Inicializando..." : "Inicializar Estoque"}
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                {productStock.map(s => {
                  const pct = s.qty_max_capacity > 0
                    ? Math.min((s.qty_current / s.qty_max_capacity) * 100, 100)
                    : 0;
                  const critical = s.qty_current === 0;
                  const alert = s.has_alert;
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
              <div className="space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-14" />)}</div>
            ) : movements.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-sm">Nenhuma movimentação registrada.</div>
            ) : (
              <div className="space-y-2">
                {movements.map(m => (
                  <div key={m.id} className="flex items-center gap-3 rounded-lg border border-border px-3 py-2.5">
                    <div className={cn("flex-shrink-0", MOVEMENT_COLORS[m.tipo])}>
                      {m.qty > 0 ? <ArrowUpCircle className="h-4 w-4" /> : <ArrowDownCircle className="h-4 w-4" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">
                        {LICENSEE_MOVEMENT_LABELS[m.tipo]} — {m.product?.name ?? m.product_id.slice(0, 8)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {m.qty_before ?? "?"} → {m.qty_after ?? "?"} un{m.notes ? ` · ${m.notes}` : ""}
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
            <DialogHeader><DialogTitle>Ajuste de Estoque</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div>
                <Label className="text-sm">Produto *</Label>
                <Select value={adjustForm.productId} onValueChange={v => setAdjustForm(f => ({ ...f, productId: v }))}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Selecionar produto..." /></SelectTrigger>
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
                <Label className="text-sm">Tipo *</Label>
                <Select value={adjustForm.tipo} onValueChange={v => setAdjustForm(f => ({ ...f, tipo: v as LicenseeStockMovement["tipo"] }))}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.keys(LICENSEE_MOVEMENT_LABELS) as Array<LicenseeStockMovement["tipo"]>).map(t => (
                      <SelectItem key={t} value={t}>{LICENSEE_MOVEMENT_LABELS[t]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-sm">Quantidade *</Label>
                <Input type="number" min={0} step={1} className="mt-1" value={adjustForm.qty}
                  onChange={e => setAdjustForm(f => ({ ...f, qty: e.target.value }))} />
              </div>
              <div>
                <Label className="text-sm">Motivo / Observação</Label>
                <Textarea className="mt-1 resize-none text-sm" rows={2} placeholder="Opcional..."
                  value={adjustForm.notes} onChange={e => setAdjustForm(f => ({ ...f, notes: e.target.value }))} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setAdjustOpen(false)}>Cancelar</Button>
              <Button className="carbo-gradient" disabled={adjustStock.isPending || !adjustForm.productId} onClick={handleAdjust}>
                {adjustStock.isPending ? "Salvando..." : "Registrar"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Production order dialog */}
        <Dialog open={orderOpen} onOpenChange={setOrderOpen}>
          <DialogContent className="sm:max-w-[400px]">
            <DialogHeader><DialogTitle>Solicitar Reposição</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div>
                <Label className="text-sm">Produto *</Label>
                <Select value={orderForm.productId} onValueChange={v => setOrderForm(f => ({ ...f, productId: v }))}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Selecionar produto..." /></SelectTrigger>
                  <SelectContent>
                    {productStock.map(s => (
                      <SelectItem key={s.product_id} value={s.product_id}>
                        {s.product?.name ?? s.product_id}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-sm">Quantidade solicitada *</Label>
                <Input type="number" min={1} step={1} className="mt-1" value={orderForm.qty}
                  onChange={e => setOrderForm(f => ({ ...f, qty: e.target.value }))} />
              </div>
              <div>
                <Label className="text-sm">Observações</Label>
                <Textarea className="mt-1 resize-none text-sm" rows={2} placeholder="Urgência, prazo, etc..."
                  value={orderForm.notes} onChange={e => setOrderForm(f => ({ ...f, notes: e.target.value }))} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOrderOpen(false)}>Cancelar</Button>
              <Button className="carbo-gradient" disabled={createOrder.isPending || !orderForm.productId} onClick={handleOrder}>
                {createOrder.isPending ? "Enviando..." : "Solicitar"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </LicenseeLayout>
  );
}

// ── ADMIN VIEW ────────────────────────────────────────────────────────────────
function LicenseeProductsAdmin() {
  const { data: allStock = [], isLoading } = useAdminLicenseeAllStock();
  const [filterProduct, setFilterProduct] = useState<string>("all");

  const products = Array.from(
    new Map(allStock.map(r => [r.product_id, { id: r.product_id, name: r.product_name, sort_order: r.sort_order }])).values()
  ).sort((a, b) => a.sort_order - b.sort_order);

  const licensees = Array.from(
    new Map(allStock.map(r => [r.licensee_id, { id: r.licensee_id, name: r.licensee_name, city: r.licensee_city, state: r.licensee_state }])).values()
  ).sort((a, b) => a.name.localeCompare(b.name));

  const alerts = allStock.filter(r => r.has_alert);

  if (isLoading) {
    return (
      <LicenseeLayout>
        <div className="p-4 space-y-3">
          <Skeleton className="h-10 w-48" />
          {[1,2,3].map(i => <Skeleton key={i} className="h-20" />)}
        </div>
      </LicenseeLayout>
    );
  }

  return (
    <LicenseeLayout>
      <div className="flex flex-col min-h-full">
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border sticky top-0 bg-background z-10">
          <div className="flex items-center gap-2">
            <Layers className="h-5 w-5 text-primary" />
            <h1 className="font-bold text-lg">Produtos — Todos os Licenciados</h1>
          </div>
          <div className="ml-auto w-48">
            <Select value={filterProduct} onValueChange={setFilterProduct}>
              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Filtrar produto..." /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os produtos</SelectItem>
                {products.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="p-4 space-y-6">
          {/* Alert banner */}
          {alerts.length > 0 && (
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3 flex items-center gap-3">
              <AlertTriangle className="h-5 w-5 text-amber-500 flex-shrink-0" />
              <p className="text-sm font-semibold text-amber-600">
                {alerts.length} {alerts.length === 1 ? "item abaixo" : "itens abaixo"} do mínimo em {new Set(alerts.map(a => a.licensee_id)).size} licenciado(s)
              </p>
            </div>
          )}

          {/* Matrix: Licensee × Products */}
          {licensees.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <Package className="h-10 w-10 mx-auto mb-3 opacity-40" />
              <p>Nenhum licenciado com estoque inicializado.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {licensees.map(lic => {
                const licRows = allStock.filter(r =>
                  r.licensee_id === lic.id &&
                  (filterProduct === "all" || r.product_id === filterProduct)
                );
                const licAlert = licRows.some(r => r.has_alert);
                return (
                  <Card key={lic.id} className={cn(licAlert && "border-amber-500/30")}>
                    <CardHeader className="pb-2 pt-3 px-4">
                      <CardTitle className="text-sm flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span>{lic.name}</span>
                          {lic.city && (
                            <span className="text-xs font-normal text-muted-foreground">{lic.city}, {lic.state}</span>
                          )}
                        </div>
                        {licAlert && (
                          <Badge className="text-[10px] h-4 px-1.5 bg-amber-500/10 text-amber-600 border-0">ALERTA</Badge>
                        )}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="px-4 pb-3">
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        {licRows.map(row => {
                          const pct = row.qty_max_capacity > 0
                            ? Math.min((row.qty_current / row.qty_max_capacity) * 100, 100)
                            : 0;
                          const critical = row.qty_current === 0;
                          return (
                            <div key={row.product_id} className="space-y-1">
                              <div className="flex justify-between text-xs">
                                <span className="font-medium truncate">{row.product_name}</span>
                                <span className={cn("font-mono font-semibold",
                                  critical ? "text-destructive" : row.has_alert ? "text-amber-500" : "text-foreground"
                                )}>
                                  {row.qty_current.toFixed(0)} un
                                </span>
                              </div>
                              <Progress
                                value={pct}
                                className={cn("h-1.5",
                                  critical ? "[&>div]:bg-destructive" : row.has_alert ? "[&>div]:bg-amber-500" : "[&>div]:bg-green-500"
                                )}
                              />
                              <p className="text-[10px] text-muted-foreground">Mín: {row.qty_min_threshold} un</p>
                            </div>
                          );
                        })}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </LicenseeLayout>
  );
}

// ── ROOT EXPORT ───────────────────────────────────────────────────────────────
export default function LicenseeProducts() {
  const { isAdmin, isCeo } = useAuth();
  const { data: licenseeStatus, isLoading } = useLicenseeStatus();

  if (isAdmin || isCeo) return <LicenseeProductsAdmin />;

  if (isLoading) {
    return (
      <LicenseeLayout>
        <div className="p-4 space-y-3">
          <Skeleton className="h-10 w-48" />
          {[1,2,3].map(i => <Skeleton key={i} className="h-28" />)}
        </div>
      </LicenseeLayout>
    );
  }

  // Mood2 licensees don't have product stock — redirect via UI message
  if (!licenseeStatus?.licensee_id) {
    return (
      <LicenseeLayout>
        <div className="p-8 text-center text-muted-foreground">
          <Package className="h-12 w-12 mx-auto mb-4 opacity-40" />
          <p className="font-semibold">Acesso não disponível</p>
          <p className="text-sm mt-1">Esta área é exclusiva para licenciados com produtos cadastrados.</p>
        </div>
      </LicenseeLayout>
    );
  }

  return <LicenseeProductsManager licenseeId={licenseeStatus.licensee_id} />;
}

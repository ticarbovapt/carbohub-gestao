import { useEffect, useMemo, useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CheckCircle2, AlertTriangle, PackageX, ArrowRight, Loader2, Tag, Factory, Beaker } from "lucide-react";
import { cn } from "@/lib/utils";
import { useMrpProducts } from "@/hooks/useMrpProducts";
import { useBom } from "@/hooks/useBom";
import { convertUnit, unitLabel } from "@/lib/units";
import type { OpRow, OpStatus, ProductionRoute } from "@/hooks/useProductionOrders";

const HUB_RN = "HUB-RN";
const fmt = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 3 });

interface MoveOPDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  op: OpRow | null;
  fromLabel: string;
  toLabel: string;
  toStatus: OpStatus;
  skipWarning?: boolean;
  pending: boolean;
  onConfirm: (result: { route: ProductionRoute; good?: number; rejected?: number }) => void;
}

interface Line { id: string; name: string; needed: number; unit: string; available: number; incompatible: boolean; critical: boolean; }

export function MoveOPDialog({ open, onOpenChange, op, fromLabel, toLabel, toStatus, skipWarning, pending, onConfirm }: MoveOPDialogProps) {
  const isSeparacao = toStatus === "separada";
  const isConclusao = toStatus === "concluida";

  const { data: products = [] } = useMrpProducts();
  const productById = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const qty = op?.planned_quantity ?? 0;

  const { data: finalBom = [], isLoading: bomLoading } = useBom(open && isSeparacao && op?.product_id ? op.product_id : null);

  // Componente semi-acabado na ficha (ex.: Envasado) → habilita a escolha de rota.
  const semiLine = useMemo(
    () => finalBom.find((b) => productById.get(b.insumo_id)?.category === "Semi-acabado") ?? null,
    [finalBom, productById],
  );
  const semiProduct = semiLine ? productById.get(semiLine.insumo_id) : null;
  const hasChoice = !!semiLine;

  const { data: semiBom = [] } = useBom(open && hasChoice ? semiLine!.insumo_id : null);

  // Rota escolhida: para produtos com semi-acabado é obrigatória; senão é direta.
  const [route, setRoute] = useState<ProductionRoute>(null);
  useEffect(() => { setRoute((op?.production_route as ProductionRoute) ?? null); }, [op?.id, op?.production_route]);

  // Conclusão: boas + refugo (o crédito usa as boas).
  const [good, setGood] = useState<string>("");
  const [rejected, setRejected] = useState<string>("");
  useEffect(() => {
    setGood(op?.good_quantity != null ? String(op.good_quantity) : String(op?.planned_quantity ?? ""));
    setRejected(op?.rejected_quantity != null ? String(op.rejected_quantity) : "0");
  }, [op?.id, op?.good_quantity, op?.rejected_quantity, op?.planned_quantity]);
  const goodNum = Math.max(0, Number(good) || 0);
  const rejectedNum = Math.max(0, Number(rejected) || 0);

  const lineFrom = (insumoId: string, qtyInBomUnit: number, bomUnit: string, critical: boolean): Line => {
    const insumo = productById.get(insumoId);
    const stockUnit = insumo?.stock_unit || bomUnit || "un";
    const converted = convertUnit(qtyInBomUnit, bomUnit || stockUnit, stockUnit);
    const available = insumo?.hubs.find((h) => h.warehouse_name === HUB_RN)?.quantity ?? 0;
    return { id: insumoId, name: insumo?.name || "—", needed: converted ?? qtyInBomUnit, unit: stockUnit, available, incompatible: converted === null, critical };
  };

  // Consumo por rota. "rotular"/direto = ficha do produto. "zero" = explode o semi.
  const buildLines = (r: ProductionRoute): Line[] => {
    if (!op?.product_id || qty <= 0) return [];
    if (r === "zero" && semiLine) {
      const others = finalBom.filter((b) => b.insumo_id !== semiLine.insumo_id).map((b) => lineFrom(b.insumo_id, b.qty * qty, b.unit, b.is_critical));
      const semiQty = semiLine.qty * qty; // nº de envasados
      const exploded = semiBom.map((s) => lineFrom(s.insumo_id, s.qty * semiQty, s.unit, s.is_critical));
      return [...others, ...exploded];
    }
    return finalBom.map((b) => lineFrom(b.insumo_id, b.qty * qty, b.unit, b.is_critical));
  };

  const effectiveRoute: ProductionRoute = hasChoice ? route : "rotular";
  const lines = useMemo(() => buildLines(effectiveRoute), [finalBom, semiBom, semiLine, effectiveRoute, productById, qty]); // eslint-disable-line react-hooks/exhaustive-deps
  const missing = lines.filter((l) => l.incompatible || l.available < l.needed);
  const canSeparate = lines.length > 0 && missing.length === 0;

  // Disponibilidade do envasado p/ a rota "só rotular".
  const semiAvail = semiProduct?.hubs.find((h) => h.warehouse_name === HUB_RN)?.quantity ?? 0;
  const semiNeed = semiLine ? semiLine.qty * qty : 0;
  const rotularOk = semiAvail >= semiNeed;

  const routeChosen = !hasChoice || route === "rotular" || route === "zero";

  if (!op) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isSeparacao ? "Separar materiais" : isConclusao ? "Concluir produção" : "Mover ordem de produção"}
          </DialogTitle>
          <DialogDescription className="flex flex-wrap items-center gap-x-2 gap-y-1 pt-0.5">
            <span className="font-mono text-xs text-blue-500">{op.op_number}</span>
            <span className="text-foreground font-medium">{op.sku_name}</span>
            <span className="text-muted-foreground">· {fmt(qty)} un</span>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* De → Para */}
          <div className="flex items-center gap-2 text-xs">
            <span className="rounded-md bg-muted px-2 py-1 font-medium text-muted-foreground">{fromLabel}</span>
            <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="rounded-md bg-primary/10 px-2 py-1 font-semibold text-primary">{toLabel}</span>
          </div>

          {skipWarning && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2.5 text-sm text-amber-700 dark:text-amber-400">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>Esta OP normalmente <strong>não passa por {toLabel}</strong> (pela rota escolhida). Mover mesmo assim?</span>
            </div>
          )}

          {isSeparacao && bomLoading && (
            <div className="flex items-center gap-2 py-6 justify-center text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Conferindo a ficha…
            </div>
          )}

          {/* Escolha de rota (produto com semi-acabado na ficha) */}
          {isSeparacao && !bomLoading && hasChoice && (
            <div className="space-y-2">
              <p className="text-sm font-medium">Como esta produção vai ser feita?</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <RouteCard
                  icon={Tag}
                  title="Só rotular"
                  subtitle={`Usa ${semiProduct?.name ?? "envasado"} já pronto do estoque`}
                  hint={rotularOk ? `${fmt(semiAvail)} em estoque` : `Só ${fmt(semiAvail)} em estoque (precisa ${fmt(semiNeed)})`}
                  hintTone={rotularOk ? "ok" : "warn"}
                  selected={route === "rotular"}
                  onClick={() => setRoute("rotular")}
                />
                <RouteCard
                  icon={Factory}
                  title="Produzir do zero"
                  subtitle="Fabrica o envasado agora (garrafa, líquido, tampa) e rotula"
                  hint="Não usa envasado pronto"
                  hintTone="muted"
                  selected={route === "zero"}
                  onClick={() => setRoute("zero")}
                />
              </div>
            </div>
          )}

          {/* Lista de consumo */}
          {isSeparacao && !bomLoading && (
            <div>
              {lines.length === 0 && !hasChoice && (
                <div className="flex items-center gap-2 rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2.5 text-sm text-amber-700 dark:text-amber-400">
                  <PackageX className="h-4 w-4 shrink-0" /> Produto sem ficha (BOM) — nada será deduzido.
                </div>
              )}
              {hasChoice && !routeChosen && (
                <p className="text-sm text-muted-foreground text-center py-2">Escolha a rota acima para ver o que será separado.</p>
              )}
              {lines.length > 0 && routeChosen && (
                <div className="rounded-lg border border-border overflow-hidden">
                  <div className={cn(
                    "flex items-center gap-2 px-3 py-2 text-sm font-medium",
                    canSeparate ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" : "bg-destructive/10 text-destructive",
                  )}>
                    {canSeparate ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
                    {canSeparate ? "Baixa no HUB Natal ao separar:" : `Faltam ${missing.length} ${missing.length === 1 ? "item" : "itens"} no HUB Natal`}
                  </div>
                  <div className="divide-y divide-border">
                    {lines.map((l) => {
                      const ok = !l.incompatible && l.available >= l.needed;
                      return (
                        <div key={l.id} className="flex items-center gap-3 px-3 py-2.5">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5 text-sm font-medium truncate">
                              {l.name}{l.critical && <AlertTriangle className="h-3 w-3 text-amber-500 shrink-0" />}
                            </div>
                            <div className="text-xs text-muted-foreground tabular-nums">
                              Precisa {fmt(l.needed)} {unitLabel(l.unit)} · em estoque {fmt(l.available)} {unitLabel(l.unit)}
                            </div>
                          </div>
                          <span className={cn(
                            "shrink-0 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
                            l.incompatible ? "bg-destructive/10 text-destructive"
                              : ok ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                              : "bg-destructive/10 text-destructive",
                          )}>
                            {l.incompatible ? "unidade incompatível"
                              : ok ? <><CheckCircle2 className="h-3 w-3" /> ok</>
                              : `falta ${fmt(l.needed - l.available)} ${unitLabel(l.unit)}`}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Conclusão → registra boas/refugo e credita as BOAS no estoque */}
          {isConclusao && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Boas (aprovadas)</Label>
                  <Input type="number" min={0} value={good} onChange={(e) => setGood(e.target.value)} className="h-9" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Refugo (perdas)</Label>
                  <Input type="number" min={0} value={rejected} onChange={(e) => setRejected(e.target.value)} className="h-9" />
                </div>
              </div>
              <div className="flex items-center gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-2.5 text-sm text-emerald-700 dark:text-emerald-400">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                <span>Credita <strong>{fmt(goodNum)} un de {op.sku_name}</strong> no HUB Natal.{rejectedNum > 0 && <> Refugo de {fmt(rejectedNum)} un registrado.</>}</span>
              </div>
              {goodNum + rejectedNum !== qty && (
                <p className="text-xs text-amber-600 dark:text-amber-400">Boas + refugo ({fmt(goodNum + rejectedNum)}) diferente do planejado ({fmt(qty)} un).</p>
              )}
            </div>
          )}

          {!isSeparacao && !isConclusao && (
            <p className="text-sm text-muted-foreground">Confirmar a mudança de etapa desta OP?</p>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>Cancelar</Button>
          <Button
            type="button"
            variant={isSeparacao && routeChosen && !canSeparate && lines.length > 0 ? "destructive" : "default"}
            onClick={() => onConfirm(
              isConclusao
                ? { route: op.production_route ?? null, good: goodNum, rejected: rejectedNum }
                : { route: hasChoice ? route : null },
            )}
            disabled={pending || (isSeparacao && hasChoice && !routeChosen)}
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

function RouteCard({ icon: Icon, title, subtitle, hint, hintTone, selected, onClick }: {
  icon: typeof Tag; title: string; subtitle: string; hint: string; hintTone: "ok" | "warn" | "muted"; selected: boolean; onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "text-left rounded-lg border p-3 transition-colors",
        selected ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-border hover:border-primary/50 hover:bg-muted/40",
      )}
    >
      <div className="flex items-center gap-2">
        <Icon className={cn("h-4 w-4", selected ? "text-primary" : "text-muted-foreground")} />
        <span className="text-sm font-semibold">{title}</span>
        {selected && <CheckCircle2 className="h-4 w-4 text-primary ml-auto" />}
      </div>
      <p className="text-xs text-muted-foreground mt-1 leading-snug">{subtitle}</p>
      <p className={cn(
        "text-xs mt-1.5 font-medium inline-flex items-center gap-1",
        hintTone === "ok" ? "text-emerald-600 dark:text-emerald-400" : hintTone === "warn" ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground",
      )}>
        {hintTone === "warn" && <AlertTriangle className="h-3 w-3" />}
        {hintTone === "ok" && <Beaker className="h-3 w-3" />}
        {hint}
      </p>
    </button>
  );
}

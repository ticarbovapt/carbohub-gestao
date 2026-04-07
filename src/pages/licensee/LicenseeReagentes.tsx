import { useState } from "react";
import { LicenseeLayout } from "@/components/layouts/LicenseeLayout";
import { useLicenseeStatus } from "@/hooks/useLicenseePortal";
import {
  useLicenseeReagentStock,
  useReagentMovements,
  useUpsertReagentStock,
  useAddReagentMovement,
} from "@/hooks/useLicenseeReagentStock";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { CarboCard } from "@/components/ui/carbo-card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { FlaskConical, Plus, TrendingDown, TrendingUp, Settings2, AlertTriangle } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";

const REAGENT_LABELS: Record<string, { label: string; color: string }> = {
  flex:   { label: "Flex",   color: "#22c55e" },
  diesel: { label: "Diesel", color: "#f59e0b" },
  normal: { label: "Normal", color: "#3b82f6" },
};

function StockGauge({ label, qty, minAlert, color }: { label: string; qty: number; minAlert: number; color: string }) {
  const pct = minAlert > 0 ? Math.min(100, (qty / (minAlert * 4)) * 100) : 100;
  const isLow = qty <= minAlert;
  const isCritical = qty <= minAlert * 0.5;

  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FlaskConical className="h-4 w-4" style={{ color }} />
          <span className="font-semibold text-sm">{label}</span>
        </div>
        {isCritical ? (
          <Badge variant="destructive" className="text-[10px]">Crítico</Badge>
        ) : isLow ? (
          <Badge className="text-[10px] bg-amber-500 text-white border-0">Estoque Baixo</Badge>
        ) : (
          <Badge variant="outline" className="text-[10px] text-green-600 border-green-500">OK</Badge>
        )}
      </div>

      <div className="space-y-1.5">
        <div className="flex justify-between text-sm">
          <span className="font-bold text-2xl" style={{ color }}>{qty.toFixed(1)} L</span>
          <span className="text-xs text-muted-foreground self-end">Alerta: {minAlert}L</span>
        </div>
        <div className="h-2 rounded-full bg-muted overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{
              width: `${pct}%`,
              backgroundColor: isCritical ? "#ef4444" : isLow ? "#f59e0b" : color,
            }}
          />
        </div>
      </div>

      {isLow && (
        <div className="flex items-center gap-1.5 text-xs text-amber-600">
          <AlertTriangle className="h-3.5 w-3.5" />
          <span>Abaixo do nível mínimo — solicite reposição</span>
        </div>
      )}
    </div>
  );
}

function AjusteModal({
  open,
  onClose,
  licenseeId,
}: {
  open: boolean;
  onClose: () => void;
  licenseeId: string;
}) {
  const addMov = useAddReagentMovement();
  const [form, setForm] = useState({
    tipo: "reposicao" as "reposicao" | "ajuste",
    reagent_type: "flex" as "flex" | "diesel" | "normal",
    quantidade: "",
    motivo: "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const qty = parseFloat(form.quantidade);
    if (!qty || qty === 0) return;
    await addMov.mutateAsync({
      licensee_id: licenseeId,
      descarb_sale_id: null,
      tipo: form.tipo,
      reagent_type: form.reagent_type,
      quantidade: form.tipo === "ajuste" ? qty : Math.abs(qty),
      motivo: form.motivo || null,
      created_by: null,
    });
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={o => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Movimentação de Reagente</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label>Tipo</Label>
            <Select value={form.tipo} onValueChange={v => setForm(f => ({ ...f, tipo: v as any }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="reposicao">Reposição (entrada)</SelectItem>
                <SelectItem value="ajuste">Ajuste manual</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Reagente</Label>
            <Select value={form.reagent_type} onValueChange={v => setForm(f => ({ ...f, reagent_type: v as any }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="flex">Flex</SelectItem>
                <SelectItem value="diesel">Diesel</SelectItem>
                <SelectItem value="normal">Normal</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Quantidade (L) {form.tipo === "ajuste" ? "— use negativo para deduzir" : ""}</Label>
            <Input
              type="number"
              step="0.1"
              value={form.quantidade}
              onChange={e => setForm(f => ({ ...f, quantidade: e.target.value }))}
              required
            />
          </div>
          <div>
            <Label>Motivo / Observação</Label>
            <Textarea value={form.motivo} onChange={e => setForm(f => ({ ...f, motivo: e.target.value }))} rows={2} />
          </div>
          <div className="flex justify-end gap-2 pt-1 border-t border-border">
            <Button variant="outline" type="button" onClick={onClose}>Cancelar</Button>
            <Button type="submit" disabled={addMov.isPending}>
              {addMov.isPending ? "Salvando..." : "Confirmar"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function LicenseeReagentes() {
  const { data: status } = useLicenseeStatus();
  const licenseeId = status?.licensee_id;

  const { data: stock, isLoading: stockLoading } = useLicenseeReagentStock(licenseeId);
  const { data: movements = [], isLoading: movLoading } = useReagentMovements(licenseeId);
  const [ajusteOpen, setAjusteOpen] = useState(false);

  const TIPOS_LABEL: Record<string, string> = {
    consumo:   "Consumo",
    reposicao: "Reposição",
    ajuste:    "Ajuste",
  };

  return (
    <LicenseeLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Reagentes</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Estoque e movimentações de reagentes</p>
          </div>
          <Button
            onClick={() => setAjusteOpen(true)}
            className="gap-2 bg-area-licensee hover:bg-area-licensee/90"
            disabled={!licenseeId}
          >
            <Plus className="h-4 w-4" /> Registrar Reposição
          </Button>
        </div>

        {/* Stock gauges */}
        {stockLoading ? (
          <div className="grid sm:grid-cols-3 gap-4">
            {[1,2,3].map(i => <Skeleton key={i} className="h-36 rounded-xl" />)}
          </div>
        ) : (
          <div className="grid sm:grid-cols-3 gap-4">
            <StockGauge label="Flex"   qty={stock?.qty_flex   ?? 0} minAlert={stock?.min_qty_alert ?? 5} color={REAGENT_LABELS.flex.color}   />
            <StockGauge label="Diesel" qty={stock?.qty_diesel ?? 0} minAlert={stock?.min_qty_alert ?? 5} color={REAGENT_LABELS.diesel.color} />
            <StockGauge label="Normal" qty={stock?.qty_normal ?? 0} minAlert={stock?.min_qty_alert ?? 5} color={REAGENT_LABELS.normal.color} />
          </div>
        )}

        {/* Movements */}
        <div className="space-y-3">
          <h2 className="text-base font-semibold text-foreground">Histórico de Movimentações</h2>

          {movLoading ? (
            <div className="space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-14 rounded-lg" />)}</div>
          ) : movements.length === 0 ? (
            <CarboCard className="flex flex-col items-center justify-center py-10 gap-2">
              <FlaskConical className="h-8 w-8 text-muted-foreground/30" />
              <p className="text-muted-foreground text-sm">Nenhuma movimentação registrada</p>
            </CarboCard>
          ) : (
            <div className="space-y-1.5">
              {movements.map(m => {
                const rColor = REAGENT_LABELS[m.reagent_type]?.color ?? "#64748b";
                const isPositive = m.quantidade > 0;
                return (
                  <div key={m.id} className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3">
                    <div className={cn("flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full",
                      isPositive ? "bg-green-100" : "bg-red-100"
                    )}>
                      {isPositive
                        ? <TrendingUp className="h-4 w-4 text-green-600" />
                        : <TrendingDown className="h-4 w-4 text-red-500" />
                      }
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">
                        {TIPOS_LABEL[m.tipo] ?? m.tipo}
                        {" — "}
                        <span style={{ color: rColor }}>{REAGENT_LABELS[m.reagent_type]?.label ?? m.reagent_type}</span>
                      </p>
                      <p className="text-xs text-muted-foreground">{m.motivo || format(new Date(m.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className={cn("font-bold text-sm", isPositive ? "text-green-600" : "text-red-500")}>
                        {isPositive ? "+" : ""}{m.quantidade.toFixed(1)} L
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        {format(new Date(m.created_at), "dd/MM HH:mm", { locale: ptBR })}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {licenseeId && (
        <AjusteModal open={ajusteOpen} onClose={() => setAjusteOpen(false)} licenseeId={licenseeId} />
      )}
    </LicenseeLayout>
  );
}

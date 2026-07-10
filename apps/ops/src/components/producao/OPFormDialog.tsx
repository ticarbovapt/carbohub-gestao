import { useMemo, useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DatePickerInput } from "@/components/ui/date-picker-input";
import { CarboBadge } from "@/components/ui/carbo-badge";
import { Loader2, CheckCircle2, AlertTriangle, PackageX } from "lucide-react";
import { toast } from "sonner";
import { useMrpProducts } from "@/hooks/useMrpProducts";
import { useBom } from "@/hooks/useBom";
import { useProductionOrderMutations } from "@/hooks/useProductionOrders";
import { convertUnit, unitLabel } from "@/lib/units";

const PRIORITY_LABELS: Record<string, string> = { "1": "Urgente", "2": "Alta", "3": "Normal", "4": "Baixa", "5": "Planejado" };
const DEMAND_SOURCE_LABELS: Record<string, string> = { venda: "Venda", recorrencia: "Recorrência", safety_stock: "Safety Stock", pcp_manual: "PCP Manual" };

const HUB_RN = "HUB-RN";
const fmt = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 3 });

export interface OPFormInitial {
  product_id?: string;
  product_label?: string;
  planned_quantity?: number;
  priority?: string;
  demand_source?: string;
  need_date?: string;
  deviation_notes?: string;
  customer_name?: string;
}

interface OPFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "create" | "edit";
  id?: string;
  initial?: OPFormInitial;
  lockQuantity?: boolean; // OP vinda de venda → quantidade segue o pedido (não edita)
}

interface MaterialLine {
  insumoId: string;
  name: string;
  code: string;
  needed: number;        // na unidade de estoque do insumo
  unit: string;          // unidade de estoque do insumo
  available: number;     // estoque HUB-RN
  incompatible: boolean; // BOM em unidade de outra dimensão que o estoque
  critical: boolean;
}

export function OPFormDialog({ open, onOpenChange, mode, id, initial, lockQuantity }: OPFormDialogProps) {
  const { data: products = [] } = useMrpProducts();
  const { create, update } = useProductionOrderMutations();
  const [productId, setProductId] = useState(initial?.product_id ?? "");
  const [plannedQty, setPlannedQty] = useState(initial?.planned_quantity != null ? String(initial.planned_quantity) : "");
  const [priority, setPriority] = useState(initial?.priority ?? "3");
  const [demandSource, setDemandSource] = useState(initial?.demand_source ?? "");
  const [needDate, setNeedDate] = useState(initial?.need_date ?? "");
  const [notes, setNotes] = useState(initial?.deviation_notes ?? "");
  const [customerName, setCustomerName] = useState(initial?.customer_name ?? "");
  // Cliente é obrigatório quando a OP é de venda/recorrência (identifica o card).
  const needsCustomer = demandSource === "venda" || demandSource === "recorrencia";

  // Produzíveis: Produto Final e Semi-acabado (ex.: OP de envasar sem rótulo p/ estoque).
  const finalProducts = products.filter((p) => p.category === "Produto Final" || p.category === "Semi-acabado");
  const selectedProduct = products.find((p) => p.id === productId);
  const pending = create.isPending || update.isPending;

  // Ficha técnica do produto escolhido → checagem de materiais (create e edit).
  const { data: bom = [], isLoading: bomLoading } = useBom(productId || null);
  const qtyNum = Number(plannedQty) || 0;
  const productById = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);

  const materials = useMemo<MaterialLine[]>(() => {
    if (!productId || qtyNum <= 0) return [];
    return bom.map((b) => {
      const insumo = productById.get(b.insumo_id);
      const stockUnit = insumo?.stock_unit || b.unit || "un";
      const rawNeeded = b.qty * qtyNum; // na unidade da BOM
      const converted = convertUnit(rawNeeded, b.unit || stockUnit, stockUnit);
      const incompatible = converted === null;
      const needed = converted ?? rawNeeded;
      const available = insumo?.hubs.find((h) => h.warehouse_name === HUB_RN)?.quantity ?? 0;
      return {
        insumoId: b.insumo_id,
        name: insumo?.name || b.insumo || "—",
        code: insumo?.product_code || b.code || "",
        needed,
        unit: stockUnit,
        available,
        incompatible,
        critical: b.is_critical,
      };
    });
  }, [bom, productById, productId, qtyNum]);

  const missing = materials.filter((m) => m.incompatible || m.available < m.needed);
  const canProduce = materials.length > 0 && missing.length === 0;
  const showCheck = !!productId && qtyNum > 0;

  const handleSubmit = async () => {
    try {
      // Cliente obrigatório p/ venda/recorrência — vale em CREATE e EDIT.
      if (needsCustomer && !customerName.trim()) throw new Error("Informe o cliente/empresa da venda.");
      if (mode === "create") {
        if (!selectedProduct) throw new Error("Selecione o produto.");
        await create.mutateAsync({
          productId, productName: selectedProduct.name, plannedQuantity: qtyNum,
          priority: Number(priority), demandSource, needDate, notes, customerName,
        });
        toast.success("Ordem de Produção criada.");
      } else {
        if (!id) throw new Error("OP inválida.");
        await update.mutateAsync({
          id,
          productId: productId || undefined,
          productName: selectedProduct?.name,
          // Não envia quantidade quando travada (OP de pedido de venda).
          plannedQuantity: !lockQuantity && plannedQty ? Number(plannedQty) : undefined,
          priority: Number(priority), demandSource, needDate: needDate || null, notes,
          customerName,
        });
        toast.success("Ordem de Produção atualizada.");
      }
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível salvar a OP.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{mode === "create" ? "Nova Ordem de Produção" : "Editar Ordem de Produção"}</DialogTitle>
          <DialogDescription>
            {mode === "create" ? "Crie uma OP a partir de um Produto Final — checamos os insumos no HUB Natal." : "Atualize os dados da ordem de produção."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {/* Produto Final — editável também no modo edição, p/ vincular OPs que
              nasceram sem produto (ex.: venda em texto livre do pós-venda). */}
          <div className="space-y-2">
            <Label>Produto Final *</Label>
            <Select value={productId} onValueChange={setProductId}>
              <SelectTrigger><SelectValue placeholder="Selecione o produto final" /></SelectTrigger>
              <SelectContent>
                {finalProducts.length === 0 && <div className="px-2 py-1.5 text-sm text-muted-foreground">Nenhum Produto Final ativo</div>}
                {finalProducts.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.product_code} — {p.name}{!p.has_bom && <span className="text-amber-600"> (sem ficha)</span>}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {mode === "edit" && !productId && initial?.product_label && (
              <p className="text-[11px] text-amber-600">Esta OP veio como “{initial.product_label}” (texto livre). Escolha o Produto Final para habilitar a checagem de estoque.</p>
            )}
          </div>

          {/* Quantidade Planejada */}
          <div className="space-y-2">
            <Label>Quantidade Planejada *</Label>
            <Input type="number" min={1} value={plannedQty} onChange={(e) => setPlannedQty(e.target.value)} disabled={lockQuantity} className={lockQuantity ? "opacity-70 cursor-not-allowed" : undefined} />
            {lockQuantity && <p className="text-[11px] text-muted-foreground">A quantidade vem do pedido de venda e não pode ser alterada aqui.</p>}
          </div>

          {/* Checagem de materiais (HUB-RN) */}
          {showCheck && (
            <div className="rounded-lg border border-border overflow-hidden">
              <div className={`flex items-center gap-2 px-3 py-2 text-sm font-medium ${
                bomLoading ? "bg-muted/40 text-muted-foreground"
                : materials.length === 0 ? "bg-amber-500/10 text-amber-700 dark:text-amber-400"
                : canProduce ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                : "bg-destructive/10 text-destructive"
              }`}>
                {bomLoading ? <Loader2 className="h-4 w-4 animate-spin" />
                  : materials.length === 0 ? <PackageX className="h-4 w-4" />
                  : canProduce ? <CheckCircle2 className="h-4 w-4" />
                  : <AlertTriangle className="h-4 w-4" />}
                {bomLoading ? "Verificando insumos…"
                  : materials.length === 0 ? "Produto sem ficha técnica (BOM) — cadastre os insumos para checar o estoque."
                  : canProduce ? `Dá pra produzir ${fmt(qtyNum)} un — todos os insumos disponíveis no HUB Natal.`
                  : `Faltam ${missing.length} ${missing.length === 1 ? "insumo" : "insumos"} no HUB Natal para produzir ${fmt(qtyNum)} un.`}
              </div>
              {materials.length > 0 && (
                <div className="divide-y divide-border">
                  {materials.map((m) => {
                    const ok = !m.incompatible && m.available >= m.needed;
                    const short = m.needed - m.available;
                    return (
                      <div key={m.insumoId} className="flex items-center gap-3 px-3 py-2 text-sm">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 font-medium truncate">
                            {m.name}
                            {m.critical && <AlertTriangle className="h-3 w-3 text-destructive shrink-0" />}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            Precisa <strong>{fmt(m.needed)} {unitLabel(m.unit)}</strong> · Estoque <strong>{fmt(m.available)} {unitLabel(m.unit)}</strong>
                          </div>
                        </div>
                        {m.incompatible ? (
                          <CarboBadge variant="destructive" className="shrink-0">unidade incompatível</CarboBadge>
                        ) : ok ? (
                          <CarboBadge variant="success" className="shrink-0 gap-1"><CheckCircle2 className="h-3 w-3" /> ok</CarboBadge>
                        ) : (
                          <CarboBadge variant="destructive" className="shrink-0">falta {fmt(short)} {unitLabel(m.unit)}</CarboBadge>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Prioridade + Fonte de Demanda */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Prioridade</Label>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {Object.entries(PRIORITY_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Fonte de Demanda</Label>
              <Select value={demandSource} onValueChange={setDemandSource}>
                <SelectTrigger><SelectValue placeholder="Selecione (opcional)" /></SelectTrigger>
                <SelectContent>
                  {Object.entries(DEMAND_SOURCE_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Cliente / Empresa — obrigatório em venda/recorrência (identifica o card) */}
          <div className="space-y-2">
            <Label>Cliente / Empresa {needsCustomer && <span className="text-destructive">*</span>}</Label>
            <Input
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder={needsCustomer ? "Ex.: Lucas teste / Nome da empresa" : "Opcional (interno mostra a fonte + data)"}
              disabled={lockQuantity}
              className={needsCustomer && !customerName.trim() ? "border-destructive focus-visible:ring-destructive" : undefined}
            />
            {needsCustomer && !customerName.trim() ? (
              <p className="text-[11px] text-destructive">Obrigatório para venda/recorrência — informe o cliente/empresa.</p>
            ) : !needsCustomer ? (
              <p className="text-[11px] text-muted-foreground">Para Safety Stock / PCP Manual, o card mostra a fonte e a data de criação.</p>
            ) : null}
          </div>

          {/* Data de Necessidade */}
          <div className="space-y-2">
            <Label>Data de Necessidade</Label>
            <DatePickerInput value={needDate} onChange={setNeedDate} placeholder="Selecionar data" />
          </div>

          {/* Observações */}
          <div className="space-y-2">
            <Label>Observações</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Observações sobre a OP..." />
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>Cancelar</Button>
          <Button type="button" onClick={handleSubmit} disabled={pending || (needsCustomer && !customerName.trim())}>
            {pending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Salvando…</> : (mode === "create" ? "Criar OP" : "Salvar")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

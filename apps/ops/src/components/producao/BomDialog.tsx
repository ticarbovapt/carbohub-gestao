import { useMemo, useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CarboBadge } from "@/components/ui/carbo-badge";
import {
  CarboTable, CarboTableHeader, CarboTableBody, CarboTableRow, CarboTableHead, CarboTableCell,
} from "@/components/ui/carbo-table";
import { ClipboardList, Plus, Pencil, Trash2, Loader2, AlertTriangle, Settings2, Tag } from "lucide-react";
import { toast } from "sonner";
import { useBom, useBomMutations, useAllBom } from "@/hooks/useBom";
import { useMrpProducts } from "@/hooks/useMrpProducts";
import { ALL_UNITS, unitLabel, convertUnit, isCountUnit } from "@/lib/units";

const fmtBRL = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

interface BomDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  productId: string | null;
  productName: string;
}

export function BomDialog({ open, onOpenChange, productId, productName }: BomDialogProps) {
  const { data: items = [], isLoading } = useBom(open ? productId : null);
  const { data: products = [] } = useMrpProducts();
  const { add, update, remove } = useBomMutations();

  const [editingId, setEditingId] = useState<string | null>(null); // null = adicionando
  const [insumoId, setInsumoId] = useState("");
  const [qty, setQty] = useState("");
  const [unit, setUnit] = useState("un");
  const [critical, setCritical] = useState(false);

  const usedIds = new Set(items.map((i) => i.insumo_id));
  const options = products.filter((p) => p.id !== productId && !usedIds.has(p.id));

  // ── Custo por rota (Rotular × Do zero) ──────────────────────────────────────
  // A rota "Do zero" NÃO é cadastrada aqui: ela é montada automaticamente
  // explodindo cada linha Semi-acabado na própria ficha dela (garrafa+líquido+
  // tampa em vez do semi-acabado pronto). Isto é SÓ leitura/custo — a produção
  // (op_deduct_materials) continua lendo o mrp_bom direto, sem alteração.
  const { data: allBom = [] } = useAllBom(open);
  const productsById = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const bomByProduct = useMemo(() => {
    const m = new Map<string, typeof allBom>();
    for (const r of allBom) { const a = m.get(r.product_id) ?? []; a.push(r); m.set(r.product_id, a); }
    return m;
  }, [allBom]);

  // Custo de 1 linha: converte a qtd da ficha p/ a unidade de estoque do insumo
  // e multiplica pelo custo unitário cadastrado. missing = insumo sem custo.
  const lineCost = (insumoId: string, qty: number, unit: string): { cost: number; missing: boolean } => {
    const p = productsById.get(insumoId);
    if (!p) return { cost: 0, missing: true };
    const stockUnit = p.stock_unit || unit || "un";
    const need = convertUnit(qty, unit || stockUnit, stockUnit) ?? qty;
    return { cost: (p.unit_cost || 0) * need, missing: !(p.unit_cost > 0) };
  };

  const temSemi = items.some((it) => productsById.get(it.insumo_id)?.category === "Semi-acabado");

  // Receita "Do zero": explode as linhas Semi-acabado; mantém as demais (ex.: rótulo).
  const zeroRecipe = useMemo(() => {
    const out: { insumo_id: string; name: string; code: string; qty: number; unit: string }[] = [];
    for (const it of items) {
      const p = productsById.get(it.insumo_id);
      if (p?.category === "Semi-acabado") {
        for (const s of bomByProduct.get(it.insumo_id) ?? []) {
          const sp = productsById.get(s.insumo_id);
          out.push({ insumo_id: s.insumo_id, name: sp?.name ?? "—", code: sp?.product_code ?? "", qty: s.qpu * it.qty, unit: s.unit });
        }
      } else {
        out.push({ insumo_id: it.insumo_id, name: it.insumo, code: it.code, qty: it.qty, unit: it.unit });
      }
    }
    return out;
  }, [items, bomByProduct, productsById]);

  const rotularTotal = items.reduce((acc, it) => {
    const c = lineCost(it.insumo_id, it.qty, it.unit);
    return { cost: acc.cost + c.cost, missing: acc.missing + (c.missing ? 1 : 0) };
  }, { cost: 0, missing: 0 });
  const zeroTotal = zeroRecipe.reduce((acc, it) => {
    const c = lineCost(it.insumo_id, it.qty, it.unit);
    return { cost: acc.cost + c.cost, missing: acc.missing + (c.missing ? 1 : 0) };
  }, { cost: 0, missing: 0 });

  // Unidade do insumo no estoque → oferece o dropdown completo.
  const selectedInsumo = products.find((p) => p.id === insumoId);
  const stockUnit = selectedInsumo?.stock_unit || "un";
  const unitOptions = [...new Set([...ALL_UNITS, unit].filter(Boolean))];

  const resetForm = () => { setEditingId(null); setInsumoId(""); setQty(""); setUnit("un"); setCritical(false); };

  const startEdit = (item: { id: string; insumo_id: string; qty: number; unit: string; is_critical: boolean }) => {
    setEditingId(item.id);
    setInsumoId(item.insumo_id);
    setQty(String(item.qty));
    setUnit(item.unit || "un");
    setCritical(item.is_critical);
  };

  const handleSave = async () => {
    if (!productId) return;
    // A unidade da BOM tem que ser conversível para a unidade de estoque do insumo
    // (ex.: ml↔L). Bloqueia dimensão incompatível (ml num insumo contado em un).
    if (convertUnit(1, unit, stockUnit) === null) {
      toast.error(`Unidade incompatível: o insumo é estocado em ${unitLabel(stockUnit)}. Use uma unidade da mesma grandeza.`);
      return;
    }
    // Unidade contável (un) não aceita fração — não existe "meia garrafa" na ficha.
    if (isCountUnit(unit) && !Number.isInteger(Number(qty))) {
      toast.error(`${unitLabel(unit)} é contável: use um número inteiro (sem casas decimais).`);
      return;
    }
    try {
      if (editingId) {
        await update.mutateAsync({ id: editingId, productId, quantity: Number(qty), unit, isCritical: critical });
        toast.success("Linha da ficha atualizada.");
      } else {
        await add.mutateAsync({ productId, insumoId, quantity: Number(qty), unit, isCritical: critical });
        toast.success("Insumo adicionado à ficha.");
      }
      resetForm();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível salvar.");
    }
  };

  const handleRemove = async (id: string) => {
    if (!productId) return;
    if (editingId === id) resetForm();
    try {
      await remove.mutateAsync({ id, productId });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível remover.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100%-2rem)] sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ClipboardList className="h-5 w-5 text-primary" />
            BOM — {productName}
          </DialogTitle>
          <DialogDescription>Lista de insumos consumidos por unidade produzida.</DialogDescription>
          {temSemi && (
            <p className="text-xs text-muted-foreground pt-1">
              Este produto tem um <strong>semi-acabado</strong> na ficha, então pode ser fabricado de 2 formas
              (mesma lógica de rota das Ordens de Produção): <Tag className="inline h-3 w-3 -mt-0.5" /> <strong>Rotular</strong> (usa
              o semi-acabado pronto — a ficha editável abaixo) e <Settings2 className="inline h-3 w-3 -mt-0.5" /> <strong>Do zero</strong> (monta
              a partir dos insumos crus). A rota “Do zero” é <strong>calculada automaticamente</strong> a partir da ficha do
              semi-acabado — só leitura, não altera a produção.
            </p>
          )}
        </DialogHeader>

        <div className="space-y-4">
          {/* Form de adicionar insumo */}
          <div className="grid grid-cols-1 sm:grid-cols-[1fr,auto,auto,auto] gap-2 items-end rounded-lg border border-dashed border-border p-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Insumo {editingId && <span className="text-muted-foreground">(editando)</span>}</Label>
              {editingId ? (
                <div className="h-9 flex items-center px-3 rounded-md border border-input bg-muted/40 text-sm truncate">
                  {selectedInsumo?.name ?? "—"}
                </div>
              ) : (
                <Select value={insumoId} onValueChange={(v) => { setInsumoId(v); const p = products.find((x) => x.id === v); if (p?.stock_unit) setUnit(p.stock_unit); }}>
                  <SelectTrigger className="h-9"><SelectValue placeholder="Selecione o insumo" /></SelectTrigger>
                  <SelectContent>
                    {options.map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.name} <span className="text-muted-foreground text-xs">({p.product_code})</span></SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {selectedInsumo && (
                <p className="text-[11px] text-muted-foreground">Estoque em <strong>{unitLabel(stockUnit)}</strong> — pode cadastrar em outra unidade (converte na produção).</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Qtd / un</Label>
              <Input type="number" min={0} step="0.0001" placeholder="1" value={qty} onChange={(e) => setQty(e.target.value)} className="h-9 w-24" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Unidade</Label>
              <Select value={unit} onValueChange={setUnit}>
                <SelectTrigger className="h-9 w-20"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {unitOptions.map((u) => <SelectItem key={u} value={u}>{unitLabel(u)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col items-center gap-1">
              <Label className="text-xs">Crítico</Label>
              <Switch checked={critical} onCheckedChange={setCritical} />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            {editingId && (
              <Button size="sm" variant="outline" onClick={resetForm} disabled={update.isPending}>Cancelar</Button>
            )}
            <Button size="sm" className="gap-1.5" onClick={handleSave} disabled={add.isPending || update.isPending || !insumoId || !qty}>
              {(add.isPending || update.isPending) ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
              {editingId ? "Salvar alteração" : "Adicionar insumo"}
            </Button>
          </div>

          {temSemi && (
            <div className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
              <Tag className="h-4 w-4 text-primary" /> Rotular <span className="text-xs font-normal text-muted-foreground">(usa o semi-acabado pronto — ficha editável)</span>
            </div>
          )}
          <div className="overflow-x-auto rounded-lg border border-border">
            <CarboTable>
              <CarboTableHeader>
                <CarboTableRow>
                  <CarboTableHead>Insumo</CarboTableHead>
                  <CarboTableHead className="text-right">Qtd por unidade</CarboTableHead>
                  <CarboTableHead>Unidade</CarboTableHead>
                  <CarboTableHead className="text-right">Custo</CarboTableHead>
                  <CarboTableHead>Crítico</CarboTableHead>
                  <CarboTableHead className="w-10" />
                </CarboTableRow>
              </CarboTableHeader>
              <CarboTableBody>
                {isLoading && (
                  <CarboTableRow><CarboTableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin inline mr-2" /> Carregando…</CarboTableCell></CarboTableRow>
                )}
                {!isLoading && items.length === 0 && (
                  <CarboTableRow><CarboTableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">Nenhum insumo na ficha</CarboTableCell></CarboTableRow>
                )}
                {items.map((item) => {
                  const c = lineCost(item.insumo_id, item.qty, item.unit);
                  return (
                  <CarboTableRow key={item.id} className={editingId === item.id ? "bg-primary/5" : undefined}>
                    <CarboTableCell className="font-medium">{item.insumo}<span className="ml-2 text-xs text-muted-foreground font-mono">{item.code}</span></CarboTableCell>
                    <CarboTableCell className="text-right tabular-nums">{item.qty.toLocaleString("pt-BR")}</CarboTableCell>
                    <CarboTableCell className="text-muted-foreground">{unitLabel(item.unit)}</CarboTableCell>
                    <CarboTableCell className="text-right tabular-nums">{c.missing ? <span className="text-xs text-amber-500" title="Insumo sem custo cadastrado">sem custo</span> : fmtBRL(c.cost)}</CarboTableCell>
                    <CarboTableCell>{item.is_critical ? <CarboBadge variant="destructive" className="gap-1"><AlertTriangle className="h-3 w-3" /> Crítico</CarboBadge> : <span className="text-xs text-muted-foreground">—</span>}</CarboTableCell>
                    <CarboTableCell>
                      <div className="flex items-center gap-0.5">
                        <button onClick={() => startEdit(item)} className="p-1.5 hover:bg-muted rounded-md" title="Editar linha"><Pencil className="h-3.5 w-3.5 text-muted-foreground" /></button>
                        <button onClick={() => handleRemove(item.id)} className="p-1.5 hover:bg-muted rounded-md text-destructive disabled:opacity-50" disabled={remove.isPending} title="Remover"><Trash2 className="h-3.5 w-3.5" /></button>
                      </div>
                    </CarboTableCell>
                  </CarboTableRow>
                  );
                })}
                {!isLoading && items.length > 0 && (
                  <CarboTableRow className="bg-muted/30">
                    <CarboTableCell className="font-semibold" colSpan={3}>Custo total {temSemi && "(Rotular)"}</CarboTableCell>
                    <CarboTableCell className="text-right font-semibold tabular-nums">{fmtBRL(rotularTotal.cost)}</CarboTableCell>
                    <CarboTableCell colSpan={2}>{rotularTotal.missing > 0 && <span className="text-xs text-amber-500 whitespace-nowrap">falta custo de {rotularTotal.missing} insumo(s)</span>}</CarboTableCell>
                  </CarboTableRow>
                )}
              </CarboTableBody>
            </CarboTable>
          </div>

          {/* ── Rota "Do zero" — SÓ LEITURA, montada explodindo o semi-acabado ─── */}
          {temSemi && (
            <div className="space-y-2">
              <div className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                <Settings2 className="h-4 w-4 text-primary" /> Do zero
                <span className="text-xs font-normal text-muted-foreground">(monta a partir dos insumos crus — calculado da ficha do semi-acabado)</span>
              </div>
              <div className="overflow-x-auto rounded-lg border border-dashed border-border bg-muted/10">
                <CarboTable>
                  <CarboTableHeader>
                    <CarboTableRow>
                      <CarboTableHead>Insumo</CarboTableHead>
                      <CarboTableHead className="text-right">Qtd por unidade</CarboTableHead>
                      <CarboTableHead>Unidade</CarboTableHead>
                      <CarboTableHead className="text-right">Custo</CarboTableHead>
                    </CarboTableRow>
                  </CarboTableHeader>
                  <CarboTableBody>
                    {zeroRecipe.map((it, i) => {
                      const c = lineCost(it.insumo_id, it.qty, it.unit);
                      return (
                        <CarboTableRow key={`${it.insumo_id}-${i}`}>
                          <CarboTableCell className="font-medium">{it.name}<span className="ml-2 text-xs text-muted-foreground font-mono">{it.code}</span></CarboTableCell>
                          <CarboTableCell className="text-right tabular-nums">{it.qty.toLocaleString("pt-BR")}</CarboTableCell>
                          <CarboTableCell className="text-muted-foreground">{unitLabel(it.unit)}</CarboTableCell>
                          <CarboTableCell className="text-right tabular-nums">{c.missing ? <span className="text-xs text-amber-500" title="Insumo sem custo cadastrado">sem custo</span> : fmtBRL(c.cost)}</CarboTableCell>
                        </CarboTableRow>
                      );
                    })}
                    <CarboTableRow className="bg-muted/30">
                      <CarboTableCell className="font-semibold" colSpan={3}>Custo total (Do zero)</CarboTableCell>
                      <CarboTableCell className="text-right font-semibold tabular-nums">{fmtBRL(zeroTotal.cost)}</CarboTableCell>
                    </CarboTableRow>
                  </CarboTableBody>
                </CarboTable>
              </div>
              {zeroTotal.missing > 0 && (
                <p className="text-xs text-amber-500">⚙️ Do zero: falta custo de {zeroTotal.missing} insumo(s) — o valor acima é parcial (só o que tem custo cadastrado).</p>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

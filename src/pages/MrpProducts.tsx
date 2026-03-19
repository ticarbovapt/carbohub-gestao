import { useState } from "react";
import { BoardLayout } from "@/components/layouts/BoardLayout";
import { CarboPageHeader } from "@/components/ui/carbo-page-header";
import { CarboButton } from "@/components/ui/carbo-button";
import { CarboSearchInput } from "@/components/ui/carbo-input";
import { CarboTable, CarboTableHeader, CarboTableBody, CarboTableRow, CarboTableHead, CarboTableCell } from "@/components/ui/carbo-table";
import { CarboCard } from "@/components/ui/carbo-card";
import { CarboEmptyState } from "@/components/ui/carbo-empty-state";
import { CarboSkeleton } from "@/components/ui/CarboSkeleton";
import { CarboBadge } from "@/components/ui/carbo-badge";
import { Package, Plus, Pencil, Warehouse, AlertTriangle, CheckCircle, AlertCircle } from "lucide-react";
import { useMrpProducts, useCreateMrpProduct, useUpdateMrpProduct, useWarehouseStockByProduct, MrpProduct } from "@/hooks/useMrpProducts";
import { useAuth } from "@/contexts/AuthContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

const CATEGORIES = ["Carbonatação", "Embalagem", "Insumo", "Produto Final", "Outro"];

function ProductForm({ product, onClose }: { product?: MrpProduct; onClose: () => void }) {
  const createMut = useCreateMrpProduct();
  const updateMut = useUpdateMrpProduct();
  const [form, setForm] = useState({
    product_code: product?.product_code || "",
    name: product?.name || "",
    category: product?.category || "",
    packaging_size_ml: product?.packaging_size_ml?.toString() || "",
    packaging_size_g: product?.packaging_size_g?.toString() || "",
    package_qty: product?.package_qty?.toString() || "",
    min_order_qty: product?.min_order_qty?.toString() || "",
    weight_kg: product?.weight_kg?.toString() || "",
    notes: product?.notes || "",
    is_active: product?.is_active ?? true,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      product_code: form.product_code,
      name: form.name,
      category: form.category || null,
      packaging_size_ml: form.packaging_size_ml ? Number(form.packaging_size_ml) : null,
      packaging_size_g: form.packaging_size_g ? Number(form.packaging_size_g) : null,
      package_qty: form.package_qty ? Number(form.package_qty) : null,
      min_order_qty: form.min_order_qty ? Number(form.min_order_qty) : null,
      safety_stock_qty: product?.safety_stock_qty ?? 0,
      weight_kg: form.weight_kg ? Number(form.weight_kg) : null,
      dimensions_cm: null,
      notes: form.notes || null,
      is_active: form.is_active,
      current_stock_qty: product?.current_stock_qty ?? 0,
      stock_updated_at: product?.stock_updated_at ?? null,
      stock_unit: product?.stock_unit ?? 'un',
    };
    if (product) {
      await updateMut.mutateAsync({ id: product.id, ...payload });
    } else {
      await createMut.mutateAsync(payload);
    }
    onClose();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>Código do Produto *</Label>
          <Input value={form.product_code} onChange={e => setForm(f => ({ ...f, product_code: e.target.value.toUpperCase() }))} required disabled={!!product} placeholder="CARBOZE_10ML" />
        </div>
        <div>
          <Label>Nome *</Label>
          <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required placeholder="CarboZé 10ml" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>Categoria</Label>
          <Select value={form.category} onValueChange={v => setForm(f => ({ ...f, category: v }))}>
            <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
            <SelectContent>
              {CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Qtd por embalagem</Label>
          <Input type="number" value={form.package_qty} onChange={e => setForm(f => ({ ...f, package_qty: e.target.value }))} />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-4">
        <div>
          <Label>Volume (ml)</Label>
          <Input type="number" step="0.01" value={form.packaging_size_ml} onChange={e => setForm(f => ({ ...f, packaging_size_ml: e.target.value }))} />
        </div>
        <div>
          <Label>Peso emb. (g)</Label>
          <Input type="number" step="0.01" value={form.packaging_size_g} onChange={e => setForm(f => ({ ...f, packaging_size_g: e.target.value }))} />
        </div>
        <div>
          <Label>Peso (kg)</Label>
          <Input type="number" step="0.01" value={form.weight_kg} onChange={e => setForm(f => ({ ...f, weight_kg: e.target.value }))} />
        </div>
      </div>
      <div>
          <Label>Qtd mínima de pedido</Label>
          <Input type="number" value={form.min_order_qty} onChange={e => setForm(f => ({ ...f, min_order_qty: e.target.value }))} />
        </div>
      <div>
        <Label>Observações</Label>
        <Textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <CarboButton variant="outline" type="button" onClick={onClose}>Cancelar</CarboButton>
        <CarboButton type="submit" loading={createMut.isPending || updateMut.isPending}>
          {product ? "Salvar" : "Criar Produto"}
        </CarboButton>
      </div>
    </form>
  );
}

function StockRiskBadge({ product, hubStocks }: { product: MrpProduct; hubStocks?: { warehouse_name: string; quantity: number }[] }) {
  const totalConsolidated = hubStocks && hubStocks.length > 0
    ? hubStocks.reduce((sum, h) => sum + h.quantity, 0)
    : product.current_stock_qty;

  const hasHubWithZero = hubStocks?.some(h => h.quantity === 0);

  if (product.safety_stock_qty > 0 && totalConsolidated < product.safety_stock_qty) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger>
            <CarboBadge variant="destructive" className="flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" /> Baixo
            </CarboBadge>
          </TooltipTrigger>
          <TooltipContent>
            Estoque ({totalConsolidated}) abaixo do nível de segurança ({product.safety_stock_qty})
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  if (hasHubWithZero) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger>
            <CarboBadge variant="warning" className="flex items-center gap-1">
              <AlertCircle className="h-3 w-3" /> Risco em HUB
            </CarboBadge>
          </TooltipTrigger>
          <TooltipContent>
            {hubStocks?.filter(h => h.quantity === 0).map(h => h.warehouse_name).join(", ")} com estoque zerado
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <CarboBadge variant="success" className="flex items-center gap-1">
      <CheckCircle className="h-3 w-3" /> OK
    </CarboBadge>
  );
}

export default function MrpProducts() {
  const { isAdmin, isCeo } = useAuth();
  const { data: products = [], isLoading } = useMrpProducts();
  const { data: warehouseStockMap = {} } = useWarehouseStockByProduct();
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editProduct, setEditProduct] = useState<MrpProduct | undefined>();

  const canEdit = isAdmin || isCeo;

  const filtered = products.filter(p => {
    if (!search) return true;
    const s = search.toLowerCase();
    return p.product_code.toLowerCase().includes(s) || p.name.toLowerCase().includes(s);
  });

  return (
    <BoardLayout>
      <div className="space-y-6">
        <CarboPageHeader
          title="Insumos (MRP)"
          description="Cadastro mestre de insumos do ecossistema"
          icon={Package}
          actions={canEdit ? (
            <CarboButton onClick={() => { setEditProduct(undefined); setDialogOpen(true); }}>
              <Plus className="h-4 w-4 mr-1" /> Novo Produto
            </CarboButton>
          ) : undefined}
        />

        <div className="max-w-md">
          <CarboSearchInput placeholder="Buscar por código ou nome..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>

        {isLoading ? (
          <CarboCard padding="none"><div className="p-6 space-y-4">{[1,2,3].map(i => <CarboSkeleton key={i} className="h-14 w-full" />)}</div></CarboCard>
        ) : filtered.length === 0 ? (
          <CarboCard>
            <CarboEmptyState icon={Package} title="Nenhum produto encontrado" description="Cadastre o primeiro produto do MRP" action={canEdit ? { label: "Novo Produto", onClick: () => { setEditProduct(undefined); setDialogOpen(true); } } : undefined} />
          </CarboCard>
        ) : (
          <CarboCard padding="none">
            <CarboTable>
              <CarboTableHeader>
                <CarboTableRow>
                  <CarboTableHead>Produto</CarboTableHead>
                  <CarboTableHead>Código</CarboTableHead>
                  <CarboTableHead>Categoria</CarboTableHead>
                  <CarboTableHead className="text-right">Estoque Total</CarboTableHead>
                  <CarboTableHead className="text-right">Segurança</CarboTableHead>
                  <CarboTableHead>Status</CarboTableHead>
                  <CarboTableHead>Hubs</CarboTableHead>
                  {canEdit && <CarboTableHead className="w-10" />}
                </CarboTableRow>
              </CarboTableHeader>
              <CarboTableBody>
                {filtered.map(p => {
                  const hubStocks = warehouseStockMap[p.id] || [];
                  const totalConsolidated = hubStocks.length > 0
                    ? hubStocks.reduce((sum, h) => sum + h.quantity, 0)
                    : p.current_stock_qty;

                  return (
                    <CarboTableRow key={p.id}>
                      <CarboTableCell className="font-medium text-foreground">{p.name}</CarboTableCell>
                      <CarboTableCell className="font-mono text-xs text-muted-foreground">{p.product_code}</CarboTableCell>
                      <CarboTableCell className="text-sm text-muted-foreground">{p.category || "—"}</CarboTableCell>
                      <CarboTableCell className="text-right font-semibold tabular-nums">{totalConsolidated.toLocaleString("pt-BR")} {p.stock_unit}</CarboTableCell>
                      <CarboTableCell className="text-right tabular-nums text-muted-foreground">{p.safety_stock_qty.toLocaleString("pt-BR")} {p.stock_unit}</CarboTableCell>
                      <CarboTableCell>
                        <StockRiskBadge product={p} hubStocks={hubStocks} />
                      </CarboTableCell>
                      <CarboTableCell>
                        {hubStocks.length > 0 ? (
                          <div className="space-y-0.5 text-xs text-muted-foreground">
                            {hubStocks.map(h => (
                              <div key={h.warehouse_id} className="flex items-center gap-2">
                                <span className="min-w-[52px]">{h.warehouse_name}</span>
                                <span className={`font-medium tabular-nums ${h.quantity === 0 ? "text-destructive" : "text-foreground"}`}>
                                  {h.quantity.toLocaleString("pt-BR")} {p.stock_unit}
                                </span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </CarboTableCell>
                      {canEdit && (
                        <CarboTableCell>
                          <button
                            onClick={() => { setEditProduct(p); setDialogOpen(true); }}
                            className="p-1.5 hover:bg-muted rounded-md"
                          >
                            <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                          </button>
                        </CarboTableCell>
                      )}
                    </CarboTableRow>
                  );
                })}
              </CarboTableBody>
            </CarboTable>
          </CarboCard>
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editProduct ? "Editar Produto" : "Novo Produto"}</DialogTitle></DialogHeader>
          <ProductForm product={editProduct} onClose={() => setDialogOpen(false)} />
        </DialogContent>
      </Dialog>
    </BoardLayout>
  );
}

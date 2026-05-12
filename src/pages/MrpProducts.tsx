import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { BoardLayout } from "@/components/layouts/BoardLayout";
import { CarboPageHeader } from "@/components/ui/carbo-page-header";
import { CarboButton } from "@/components/ui/carbo-button";
import { CarboSearchInput } from "@/components/ui/carbo-input";
import { CarboTable, CarboTableHeader, CarboTableBody, CarboTableRow, CarboTableHead, CarboTableCell } from "@/components/ui/carbo-table";
import { CarboCard } from "@/components/ui/carbo-card";
import { CarboEmptyState } from "@/components/ui/carbo-empty-state";
import { CarboSkeleton } from "@/components/ui/CarboSkeleton";
import { CarboBadge } from "@/components/ui/carbo-badge";
import { Package, Plus, Pencil, Warehouse, AlertTriangle, CheckCircle, AlertCircle, ClipboardList, Trash2 } from "lucide-react";
import { useMrpProducts, useCreateMrpProduct, useUpdateMrpProduct, useDeleteMrpProduct, useWarehouseStockByProduct, MrpProduct } from "@/hooks/useMrpProducts";
import { useAuth } from "@/contexts/AuthContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ProductBomModal } from "@/components/mrp/ProductBomModal";
import { cn } from "@/lib/utils";

const CATEGORIES = ["Carbonatação", "Embalagem", "Insumo", "Produto Final", "Outro"];

const CATEGORY_FILTER_TABS = [
  { key: "all",           label: "Todos" },
  { key: "Produto Final", label: "Produto Final" },
  { key: "Insumo",        label: "Insumos" },
  { key: "Embalagem",     label: "Embalagem" },
  { key: "Carbonatação",  label: "Carbonatação" },
];

function CategoryBadge({ category }: { category: string | null }) {
  if (!category) return <span className="text-muted-foreground text-sm">—</span>;
  const cls: Record<string, string> = {
    "Produto Final": "bg-emerald-700 text-white border-0",
    "Insumo":        "bg-blue-600 text-white border-0",
    "Embalagem":     "bg-amber-500 text-white border-0",
    "Carbonatação":  "bg-purple-600 text-white border-0",
    "Outro":         "bg-gray-500 text-white border-0",
  };
  return (
    <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium", cls[category] ?? "bg-gray-500 text-white border-0")}>
      {category}
    </span>
  );
}

/**
 * Gera código de produto normalizado a partir do nome.
 * Abrevia cada palavra a 4 chars, mantém tamanhos (100ML, 1L, 500G) intactos.
 * Ex: "Estabilizado 100ml" → "ESTA-100ML"  |  "Garrafa PET" → "GARR-PET"
 */
function generateSkuFromName(name: string): string {
  const clean = name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")   // remove acentos
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, " ")      // special chars → espaço
    .trim();

  const parts = clean.split(/\s+/).filter(Boolean).map(token => {
    // Mantém tokens de tamanho/volume (100ML, 1L, 500G, 70ML, etc.) intactos
    if (/^\d+(ML|L|G|KG|UN|MG)$/.test(token)) return token;
    // Abrevia palavras a 4 chars
    return token.substring(0, 4);
  });

  return parts.join("-").replace(/-{2,}/g, "-").substring(0, 20);
}

function ProductForm({ product, onClose }: { product?: MrpProduct; onClose: () => void }) {
  const createMut = useCreateMrpProduct();
  const updateMut = useUpdateMrpProduct();
  const deleteMut = useDeleteMrpProduct();
  // Flag para saber se o usuário já editou o código manualmente
  const [codeManuallyEdited, setCodeManuallyEdited] = useState(false);
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
    current_stock_qty: product?.current_stock_qty?.toString() || "0",
    safety_stock_qty: product?.safety_stock_qty?.toString() || "0",
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
      safety_stock_qty: form.safety_stock_qty ? Number(form.safety_stock_qty) : 0,
      weight_kg: form.weight_kg ? Number(form.weight_kg) : null,
      dimensions_cm: null,
      notes: form.notes || null,
      is_active: form.is_active,
      current_stock_qty: form.current_stock_qty ? Number(form.current_stock_qty) : 0,
      stock_updated_at: (
        form.current_stock_qty !== product?.current_stock_qty?.toString() ||
        form.safety_stock_qty !== product?.safety_stock_qty?.toString()
      ) ? new Date().toISOString() : (product?.stock_updated_at ?? null),
      stock_unit: product?.stock_unit ?? 'un',
    };
    if (product) {
      const { product_code, ...updatePayload } = payload;
      await updateMut.mutateAsync({ id: product.id, ...updatePayload });
    } else {
      await createMut.mutateAsync(payload);
    }
    onClose();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>Nome *</Label>
          <Input
            value={form.name}
            onChange={e => {
              const newName = e.target.value;
              setForm(f => ({
                ...f,
                name: newName,
                // Atualiza o código automaticamente enquanto não foi editado manualmente
                ...(!product && !codeManuallyEdited
                  ? { product_code: generateSkuFromName(newName) }
                  : {}),
              }));
            }}
            required
            placeholder="CarboZé 10ml"
          />
        </div>
        <div>
          <Label className="flex items-center gap-1.5">
            Código do Produto *
            {!product && !codeManuallyEdited && (
              <span className="text-[10px] text-muted-foreground font-normal">(auto)</span>
            )}
          </Label>
          <Input
            value={form.product_code}
            onChange={e => {
              setCodeManuallyEdited(true);
              setForm(f => ({ ...f, product_code: e.target.value.toUpperCase() }));
            }}
            required
            disabled={!!product}
            placeholder="CARBOZE_10ML"
            className={!product && !codeManuallyEdited && form.product_code ? "text-muted-foreground" : ""}
          />
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
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>Qtd mínima de pedido</Label>
          <Input type="number" value={form.min_order_qty} onChange={e => setForm(f => ({ ...f, min_order_qty: e.target.value }))} />
        </div>
      </div>
      {product && (
        <div className="grid grid-cols-2 gap-4 p-3 bg-muted/50 rounded-lg border border-border">
          <div>
            <Label className="text-xs font-semibold uppercase text-carbo-green">Estoque Atual</Label>
            <Input type="number" value={form.current_stock_qty} onChange={e => setForm(f => ({ ...f, current_stock_qty: e.target.value }))} />
          </div>
          <div>
            <Label className="text-xs font-semibold uppercase text-carbo-green">Estoque Segurança</Label>
            <Input type="number" value={form.safety_stock_qty} onChange={e => setForm(f => ({ ...f, safety_stock_qty: e.target.value }))} />
          </div>
        </div>
      )}
      <div>
        <Label>Observações</Label>
        <Textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
      </div>
      <div className="flex items-center justify-between pt-2">
        {product ? (
          <CarboButton
            variant="outline"
            type="button"
            loading={deleteMut.isPending}
            onClick={async () => {
              if (!window.confirm(`Excluir "${product.name}" permanentemente? Esta ação não pode ser desfeita.`)) return;
              await deleteMut.mutateAsync(product.id);
              onClose();
            }}
            className="text-destructive border-destructive/40 hover:bg-destructive/10 hover:border-destructive gap-1.5"
          >
            <Trash2 className="h-3.5 w-3.5" /> Excluir
          </CarboButton>
        ) : <span />}
        <div className="flex gap-2">
          <CarboButton variant="outline" type="button" onClick={onClose}>Cancelar</CarboButton>
          <CarboButton type="submit" loading={createMut.isPending || updateMut.isPending}>
            {product ? "Salvar" : "Criar Produto"}
          </CarboButton>
        </div>
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
  const { isAdmin, isCeo, isAnyGestor } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const { data: products = [], isLoading } = useMrpProducts();
  const { data: warehouseStockMap = {} } = useWarehouseStockByProduct();
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editProduct, setEditProduct] = useState<MrpProduct | undefined>();
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [bomProduct, setBomProduct] = useState<MrpProduct | null>(null);
  const [bomOpen, setBomOpen] = useState(false);

  // Detecta ?bom=1 vindo do sidebar
  const bomView = searchParams.get("bom") === "1";

  const canEdit = true;

  const filtered = products.filter(p => {
    if (categoryFilter !== "all" && p.category !== categoryFilter) return false;
    if (!search) return true;
    const s = search.toLowerCase();
    return p.product_code.toLowerCase().includes(s) || p.name.toLowerCase().includes(s);
  });

  return (
    <BoardLayout>
      <div className="space-y-6">
        <CarboPageHeader
          title="Catálogo MRP"
          description="Insumos, SKUs, BOM Lists e controle de qualidade"
          icon={Package}
          actions={canEdit ? (
            <CarboButton onClick={() => { setEditProduct(undefined); setDialogOpen(true); }}>
              <Plus className="h-4 w-4 mr-1" /> Novo Produto
            </CarboButton>
          ) : undefined}
        />

        {/* ── View tabs: Produtos | BOM Lists ── */}
        <div className="flex items-center gap-1 border-b border-border pb-2">
          <button
            onClick={() => setSearchParams({})}
            className={cn(
              "flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-t-lg transition-colors -mb-[9px] border-b-2",
              !bomView
                ? "border-primary text-primary bg-primary/5"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            <Package className="h-4 w-4" /> Insumos / SKUs
          </button>
          <button
            onClick={() => setSearchParams({ bom: "1" })}
            className={cn(
              "flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-t-lg transition-colors -mb-[9px] border-b-2",
              bomView
                ? "border-primary text-primary bg-primary/5"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            <ClipboardList className="h-4 w-4" /> BOM Lists
          </button>
        </div>

        {/* ── BOM view ───────────────────────────────────────────────── */}
        {bomView && (
          <CarboCard>
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Selecione um <strong>Produto Final</strong> para visualizar ou editar sua lista de insumos (BOM).
              </p>
              {isLoading ? (
                <div className="space-y-2">{[1,2,3].map(i => <CarboSkeleton key={i} className="h-12 w-full" />)}</div>
              ) : (
                <div className="divide-y divide-border">
                  {products.filter(p => p.category === "Produto Final").map(p => (
                    <div key={p.id} className="flex items-center justify-between py-3 px-1">
                      <div className="flex items-center gap-3 min-w-0">
                        <Package className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">{p.name}</p>
                          <p className="text-xs text-muted-foreground">{p.product_code}</p>
                        </div>
                      </div>
                      <CarboButton variant="outline" onClick={() => { setBomProduct(p); setBomOpen(true); }} className="flex-shrink-0 gap-1.5">
                        <ClipboardList className="h-3.5 w-3.5" /> Ver / Editar BOM
                      </CarboButton>
                    </div>
                  ))}
                  {products.filter(p => p.category === "Produto Final").length === 0 && (
                    <p className="text-center text-muted-foreground text-sm py-8">Nenhum Produto Final cadastrado ainda.</p>
                  )}
                </div>
              )}
            </div>
          </CarboCard>
        )}

        {/* ── Produtos view ───────────────────────────────────────────── */}
        {!bomView && <div className="flex flex-wrap items-center gap-3">
          <div className="max-w-md flex-1 min-w-[200px]">
            <CarboSearchInput placeholder="Buscar por código ou nome..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <div className="flex items-center gap-1 flex-wrap">
            {CATEGORY_FILTER_TABS.map(tab => (
              <button
                key={tab.key}
                onClick={() => setCategoryFilter(tab.key)}
                className={cn(
                  "px-3 py-1.5 rounded-full text-xs font-medium transition-colors",
                  categoryFilter === tab.key
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>}

        {!bomView && isLoading ? (
          <CarboCard padding="none"><div className="p-6 space-y-4">{[1,2,3].map(i => <CarboSkeleton key={i} className="h-14 w-full" />)}</div></CarboCard>
        ) : !bomView && filtered.length === 0 ? (
          <CarboCard>
            <CarboEmptyState icon={Package} title="Nenhum produto encontrado" description="Cadastre o primeiro produto do MRP" action={canEdit ? { label: "Novo Produto", onClick: () => { setEditProduct(undefined); setDialogOpen(true); } } : undefined} />
          </CarboCard>
        ) : !bomView ? (
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
                      <CarboTableCell className="font-medium text-foreground">
                        {p.category === "Produto Final" ? (
                          <button
                            className="flex items-center gap-1.5 text-left hover:underline text-primary font-semibold"
                            onClick={() => { setBomProduct(p); setBomOpen(true); }}
                          >
                            {p.name}
                            <ClipboardList className="h-3.5 w-3.5 shrink-0 opacity-60" />
                          </button>
                        ) : (
                          p.name
                        )}
                      </CarboTableCell>
                      <CarboTableCell className="font-mono text-xs text-muted-foreground">{p.product_code}</CarboTableCell>
                      <CarboTableCell><CategoryBadge category={p.category} /></CarboTableCell>
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
        ) : null}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editProduct ? "Editar Produto" : "Novo Produto"}</DialogTitle></DialogHeader>
          <ProductForm product={editProduct} onClose={() => setDialogOpen(false)} />
        </DialogContent>
      </Dialog>

      <ProductBomModal
        product={bomProduct}
        open={bomOpen}
        onOpenChange={(o) => { setBomOpen(o); if (!o) setBomProduct(null); }}
      />
    </BoardLayout>
  );
}

import { useState } from "react";
import { CarboPageHeader } from "@/components/ui/carbo-page-header";
import { CarboButton } from "@/components/ui/carbo-button";
import { CarboCard } from "@/components/ui/carbo-card";
import { CarboEmptyState } from "@/components/ui/carbo-empty-state";
import { CarboBadge } from "@/components/ui/carbo-badge";
import { CarboSearchInput } from "@/components/ui/carbo-input";
import {
  CarboTable, CarboTableHeader, CarboTableBody, CarboTableRow, CarboTableHead, CarboTableCell,
} from "@/components/ui/carbo-table";
import { Package, Plus, ClipboardList, Pencil, Trash2, AlertTriangle, AlertCircle, CheckCircle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { MrpProductFormDialog } from "@/components/producao/MrpProductFormDialog";
import { BomDialog } from "@/components/producao/BomDialog";
import { DeleteConfirmDialog } from "@/components/producao/DeleteConfirmDialog";
import { useMrpProducts, type MrpProduct } from "@/hooks/useMrpProducts";
import { useMrpProductMutations } from "@/hooks/useMrpProductMutations";
import { toast } from "sonner";

const CATEGORY_FILTER_TABS = [
  { key: "all", label: "Todos" },
  { key: "Produto Final", label: "Produto Final" },
  { key: "Insumo", label: "Insumos" },
  { key: "Embalagem", label: "Embalagem" },
  { key: "Carbonatação", label: "Carbonatação" },
];
const CATEGORY_CLS: Record<string, string> = {
  "Produto Final": "bg-emerald-700 text-white border-0",
  "Insumo": "bg-blue-600 text-white border-0",
  "Embalagem": "bg-amber-500 text-white border-0",
  "Carbonatação": "bg-purple-600 text-white border-0",
  "Outro": "bg-gray-500 text-white border-0",
};
function CategoryBadge({ category }: { category: string | null }) {
  if (!category) return <span className="text-muted-foreground text-sm">—</span>;
  return <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium", CATEGORY_CLS[category] ?? CATEGORY_CLS["Outro"])}>{category}</span>;
}

function StockRiskBadge({ p }: { p: MrpProduct }) {
  const total = p.hubs.length ? p.hubs.reduce((s, h) => s + h.quantity, 0) : p.current_stock_qty;
  const hasZero = p.hubs.some((h) => h.quantity === 0);
  if (p.safety_stock_qty > 0 && total < p.safety_stock_qty) return <CarboBadge variant="destructive" className="flex items-center gap-1"><AlertTriangle className="h-3 w-3" /> Baixo</CarboBadge>;
  if (hasZero) return <CarboBadge variant="warning" className="flex items-center gap-1"><AlertCircle className="h-3 w-3" /> Risco em HUB</CarboBadge>;
  return <CarboBadge variant="success" className="flex items-center gap-1"><CheckCircle className="h-3 w-3" /> OK</CarboBadge>;
}

export default function ProdutosMrp() {
  const canEdit = true;
  const [view, setView] = useState<"produtos" | "bom">("produtos");
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [editProduct, setEditProduct] = useState<MrpProduct | null>(null);
  const [bomProduct, setBomProduct] = useState<MrpProduct | null>(null);
  const [deleteProduct, setDeleteProduct] = useState<MrpProduct | null>(null);

  const { data: products = [], isLoading, error } = useMrpProducts();
  const { remove, deactivate } = useMrpProductMutations();

  const filtered = products.filter((p) => {
    if (categoryFilter !== "all" && p.category !== categoryFilter) return false;
    if (!search) return true;
    const s = search.toLowerCase();
    return p.product_code.toLowerCase().includes(s) || p.name.toLowerCase().includes(s);
  });
  const produtosFinais = products.filter((p) => p.category === "Produto Final");

  return (
    <div className="p-4 md:p-6">
      <div className="space-y-6 max-w-[1500px] mx-auto">
        <CarboPageHeader
          title="Catálogo MRP"
          description="Insumos, SKUs, BOM Lists e controle de qualidade"
          icon={Package}
          actions={canEdit ? <CarboButton onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4 mr-1" /> Novo Produto</CarboButton> : undefined}
        />

        {/* Tabs */}
        <div className="flex items-center gap-1 border-b border-border pb-2">
          <button onClick={() => setView("produtos")} className={cn("flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-t-lg transition-colors -mb-[9px] border-b-2", view === "produtos" ? "border-primary text-primary bg-primary/5" : "border-transparent text-muted-foreground hover:text-foreground")}>
            <Package className="h-4 w-4" /> Insumos / SKUs
          </button>
          <button onClick={() => setView("bom")} className={cn("flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-t-lg transition-colors -mb-[9px] border-b-2", view === "bom" ? "border-primary text-primary bg-primary/5" : "border-transparent text-muted-foreground hover:text-foreground")}>
            <ClipboardList className="h-4 w-4" /> BOM Lists
          </button>
        </div>

        {view === "bom" ? (
          <CarboCard>
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">Selecione um <strong>Produto Final</strong> para visualizar ou editar sua lista de insumos (BOM).</p>
              <div className="divide-y divide-border">
                {produtosFinais.length === 0 && (
                  <p className="py-8 text-center text-sm text-muted-foreground">Nenhum produto final</p>
                )}
                {produtosFinais.map((p) => (
                  <div key={p.id} className="flex items-center justify-between py-3 px-1">
                    <div className="flex items-center gap-3 min-w-0">
                      <Package className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                      <div className="min-w-0"><p className="text-sm font-medium text-foreground truncate">{p.name}</p><p className="text-xs text-muted-foreground">{p.product_code}</p></div>
                    </div>
                    <CarboButton variant="outline" onClick={() => setBomProduct(p)} className="flex-shrink-0 gap-1.5"><ClipboardList className="h-3.5 w-3.5" /> Ver / Editar BOM</CarboButton>
                  </div>
                ))}
              </div>
            </div>
          </CarboCard>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-3">
              <div className="max-w-md flex-1 min-w-[200px]"><CarboSearchInput placeholder="Buscar por código ou nome..." value={search} onChange={(e) => setSearch(e.target.value)} /></div>
              <div className="flex items-center gap-1 flex-wrap">
                {CATEGORY_FILTER_TABS.map((tab) => (
                  <button key={tab.key} onClick={() => setCategoryFilter(tab.key)} className={cn("px-3 py-1.5 rounded-full text-xs font-medium transition-colors", categoryFilter === tab.key ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80")}>{tab.label}</button>
                ))}
              </div>
            </div>

            {isLoading ? (
              <CarboCard><div className="flex items-center justify-center gap-2 py-16 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /> Carregando catálogo…</div></CarboCard>
            ) : error ? (
              <CarboCard><CarboEmptyState icon={AlertTriangle} title="Erro ao carregar" description="Não foi possível buscar os produtos. Tente novamente." /></CarboCard>
            ) : filtered.length === 0 ? (
              <CarboCard><CarboEmptyState icon={Package} title="Nenhum produto encontrado" description={products.length === 0 ? "Nenhum produto ativo no catálogo MRP." : "Ajuste os filtros de busca."} /></CarboCard>
            ) : (
              <CarboCard padding="none">
                <div className="overflow-x-auto">
                  <CarboTable>
                    <CarboTableHeader>
                      <CarboTableRow>
                        <CarboTableHead>Produto</CarboTableHead><CarboTableHead>Código</CarboTableHead><CarboTableHead>Categoria</CarboTableHead>
                        <CarboTableHead className="text-right">Estoque Total</CarboTableHead><CarboTableHead className="text-right">Segurança</CarboTableHead>
                        <CarboTableHead>Status</CarboTableHead><CarboTableHead>Hubs</CarboTableHead>{canEdit && <CarboTableHead className="w-10" />}
                      </CarboTableRow>
                    </CarboTableHeader>
                    <CarboTableBody>
                      {filtered.map((p) => {
                        const total = p.hubs.length ? p.hubs.reduce((s, h) => s + h.quantity, 0) : p.current_stock_qty;
                        return (
                          <CarboTableRow key={p.id}>
                            <CarboTableCell className="font-medium text-foreground">
                              {p.category === "Produto Final" ? (
                                <button className="flex items-center gap-1.5 text-left hover:underline text-primary font-semibold" onClick={() => setBomProduct(p)}>{p.name}<ClipboardList className="h-3.5 w-3.5 shrink-0 opacity-60" /></button>
                              ) : p.name}
                            </CarboTableCell>
                            <CarboTableCell className="font-mono text-xs text-muted-foreground">{p.product_code}</CarboTableCell>
                            <CarboTableCell><CategoryBadge category={p.category} /></CarboTableCell>
                            <CarboTableCell className="text-right font-semibold tabular-nums">{total.toLocaleString("pt-BR")} {p.stock_unit}</CarboTableCell>
                            <CarboTableCell className="text-right tabular-nums text-muted-foreground">{p.safety_stock_qty.toLocaleString("pt-BR")} {p.stock_unit}</CarboTableCell>
                            <CarboTableCell><StockRiskBadge p={p} /></CarboTableCell>
                            <CarboTableCell>
                              <div className="space-y-0.5 text-xs text-muted-foreground">
                                {p.hubs.map((h) => (
                                  <div key={h.warehouse_name} className="flex items-center gap-2">
                                    <span className="min-w-[52px]">{h.warehouse_name}</span>
                                    <span className={cn("font-medium tabular-nums", h.quantity === 0 ? "text-destructive" : "text-foreground")}>{h.quantity.toLocaleString("pt-BR")} {p.stock_unit}</span>
                                  </div>
                                ))}
                              </div>
                            </CarboTableCell>
                            {canEdit && (
                              <CarboTableCell>
                                <div className="flex items-center gap-0.5">
                                  <button onClick={() => setEditProduct(p)} className="p-1.5 hover:bg-muted rounded-md" title="Editar"><Pencil className="h-3.5 w-3.5 text-muted-foreground" /></button>
                                  <button onClick={() => setDeleteProduct(p)} className="p-1.5 hover:bg-destructive/10 rounded-md" title="Excluir"><Trash2 className="h-3.5 w-3.5 text-destructive" /></button>
                                </div>
                              </CarboTableCell>
                            )}
                          </CarboTableRow>
                        );
                      })}
                    </CarboTableBody>
                  </CarboTable>
                </div>
              </CarboCard>
            )}
          </>
        )}
      </div>

      {/* Dialogs */}
      <MrpProductFormDialog open={createOpen} onOpenChange={setCreateOpen} mode="create" />
      {editProduct && (
        <MrpProductFormDialog
          key={editProduct.id}
          open={!!editProduct}
          onOpenChange={(v) => { if (!v) setEditProduct(null); }}
          mode="edit"
          id={editProduct.id}
          initial={{
            name: editProduct.name,
            product_code: editProduct.product_code,
            category: editProduct.category,
            stock_unit: editProduct.stock_unit,
            safety_stock_qty: editProduct.safety_stock_qty,
          }}
        />
      )}
      <BomDialog
        open={!!bomProduct}
        onOpenChange={(v) => { if (!v) setBomProduct(null); }}
        productId={bomProduct?.id ?? null}
        productName={bomProduct?.name ?? ""}
      />
      <DeleteConfirmDialog
        open={!!deleteProduct}
        onOpenChange={(v) => { if (!v) setDeleteProduct(null); }}
        title="Excluir produto?"
        description={`"${deleteProduct?.name ?? ""}" será removido do catálogo. Só é possível excluir produtos sem estoque, sem BOM que os use como insumo e sem OP. Se tiver vínculo, desative em vez de excluir.`}
        onConfirm={deleteProduct ? async () => {
          try {
            await remove.mutateAsync({ id: deleteProduct.id, name: deleteProduct.name });
            toast.success("Produto excluído.");
            setDeleteProduct(null);
          } catch (e) {
            const msg = e instanceof Error ? e.message : "Não foi possível excluir.";
            // Se travou por vínculo, oferece desativar.
            toast.error(msg, {
              duration: 10000,
              action: {
                label: "Desativar",
                onClick: async () => {
                  try { await deactivate.mutateAsync(deleteProduct.id); toast.success("Produto desativado."); setDeleteProduct(null); }
                  catch (er) { toast.error(er instanceof Error ? er.message : "Falha ao desativar."); }
                },
              },
            });
            setDeleteProduct(null);
          }
        } : undefined}
      />
    </div>
  );
}

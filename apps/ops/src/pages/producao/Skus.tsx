import { useMemo, useState } from "react";
import { CarboPageHeader } from "@/components/ui/carbo-page-header";
import { CarboButton } from "@/components/ui/carbo-button";
import { CarboKPI } from "@/components/ui/carbo-kpi";
import { CarboEmptyState } from "@/components/ui/carbo-empty-state";
import { CarboBadge } from "@/components/ui/carbo-badge";
import { CarboSearchInput } from "@/components/ui/carbo-input";
import {
  CarboTable, CarboTableHeader, CarboTableBody, CarboTableRow, CarboTableHead, CarboTableCell,
} from "@/components/ui/carbo-table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Package, Plus, RefreshCw, PackageCheck, PackageX, Pencil, Trash2, Loader2 } from "lucide-react";
import { SkuFormDialog } from "@/components/producao/SkuFormDialog";
import { DeleteConfirmDialog } from "@/components/producao/DeleteConfirmDialog";
import { useSkus, type Sku } from "@/hooks/useSkus";
import { useSkuMutations } from "@/hooks/useSkuMutations";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export default function Skus() {
  const canManage = true;
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [editSku, setEditSku] = useState<Sku | null>(null);
  const [deleteSku, setDeleteSku] = useState<Sku | null>(null);

  const { data: skus = [], isLoading, isFetching, error, refetch } = useSkus();
  const { remove } = useSkuMutations();

  const stats = useMemo(() => ({ total: skus.length, active: skus.filter((s) => s.is_active).length, inactive: skus.filter((s) => !s.is_active).length }), [skus]);
  const filtered = useMemo(() => skus.filter((sku) => {
    if (categoryFilter !== "all" && sku.category !== categoryFilter) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      if (!sku.name.toLowerCase().includes(q) && !sku.code.toLowerCase().includes(q)) return false;
    }
    return true;
  }), [skus, searchQuery, categoryFilter]);

  return (
    <div className="p-4 md:p-6">
      <div className="space-y-6 max-w-[1500px] mx-auto">
        <CarboPageHeader
          title="Gestão de SKUs"
          description="Produtos acabados e fichas técnicas (BOM)"
          icon={Package}
          actions={
            <div className="flex items-center gap-3">
              <CarboButton variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}><RefreshCw className={cn("h-4 w-4 mr-2", isFetching && "animate-spin")} /> Atualizar</CarboButton>
              {canManage && <CarboButton size="sm" onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4 mr-2" /> Novo SKU</CarboButton>}
            </div>
          }
        />

        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <CarboKPI title="Total SKUs" value={stats.total} icon={Package} iconColor="blue" />
          <CarboKPI title="Ativos" value={stats.active} icon={PackageCheck} iconColor="green" />
          <CarboKPI title="Inativos" value={stats.inactive} icon={PackageX} iconColor="muted" />
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1 max-w-sm"><CarboSearchInput placeholder="Buscar por código ou nome..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} /></div>
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-[200px]"><SelectValue placeholder="Todas categorias" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas categorias</SelectItem>
              <SelectItem value="produto_final">Produto Final</SelectItem>
              <SelectItem value="reagente">Reagente</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /> Carregando SKUs…</div>
        ) : error ? (
          <CarboEmptyState title="Erro ao carregar" description="Não foi possível buscar os SKUs. Tente novamente." icon={Package} />
        ) : filtered.length === 0 ? (
          <CarboEmptyState title="Nenhum SKU encontrado" description={skus.length === 0 ? "Nenhum SKU cadastrado." : "Tente ajustar os filtros de busca."} icon={Package} />
        ) : (
          <div className="overflow-x-auto">
            <CarboTable>
              <CarboTableHeader>
                <CarboTableRow>
                  <CarboTableHead>Código</CarboTableHead><CarboTableHead>Nome</CarboTableHead><CarboTableHead>Categoria</CarboTableHead>
                  <CarboTableHead>Embalagem</CarboTableHead><CarboTableHead>Estoque Seg.</CarboTableHead><CarboTableHead>Status</CarboTableHead>
                  <CarboTableHead>BOM</CarboTableHead>{canManage && <CarboTableHead className="w-20">Ações</CarboTableHead>}
                </CarboTableRow>
              </CarboTableHeader>
              <CarboTableBody>
                {filtered.map((sku) => (
                  <CarboTableRow key={sku.id} interactive onClick={() => setEditSku(sku)}>
                    <CarboTableCell><span className="font-mono text-sm font-medium text-carbo-green">{sku.code}</span></CarboTableCell>
                    <CarboTableCell>
                      <p className="font-medium">{sku.name}</p>
                      {sku.description && <p className="text-xs text-muted-foreground truncate max-w-48">{sku.description}</p>}
                    </CarboTableCell>
                    <CarboTableCell><span className="text-sm capitalize">{sku.category?.replace("_", " ") || "---"}</span></CarboTableCell>
                    <CarboTableCell>{sku.packaging_ml ? `${sku.packaging_ml} ml` : "---"}</CarboTableCell>
                    <CarboTableCell><span className="font-medium">{sku.safety_stock_qty}</span></CarboTableCell>
                    <CarboTableCell><CarboBadge variant={sku.is_active ? "success" : "secondary"} dot>{sku.is_active ? "Ativo" : "Inativo"}</CarboBadge></CarboTableCell>
                    <CarboTableCell>{sku.bom_version ? <CarboBadge variant="outline">v{sku.bom_version}</CarboBadge> : <span className="text-sm text-muted-foreground">---</span>}</CarboTableCell>
                    {canManage && (
                      <CarboTableCell>
                        <div className="flex items-center gap-1">
                          <CarboButton variant="ghost" size="icon" className="h-8 w-8" onClick={(e) => { e.stopPropagation(); setEditSku(sku); }}><Pencil className="h-4 w-4" /></CarboButton>
                          <CarboButton variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={(e) => { e.stopPropagation(); setDeleteSku(sku); }}><Trash2 className="h-4 w-4" /></CarboButton>
                        </div>
                      </CarboTableCell>
                    )}
                  </CarboTableRow>
                ))}
              </CarboTableBody>
            </CarboTable>
          </div>
        )}
      </div>

      {/* Dialogs */}
      <SkuFormDialog open={createOpen} onOpenChange={setCreateOpen} mode="create" />
      {editSku && (
        <SkuFormDialog
          key={editSku.id}
          open={!!editSku}
          onOpenChange={(v) => { if (!v) setEditSku(null); }}
          mode="edit"
          id={editSku.id}
          initial={{
            code: editSku.code,
            name: editSku.name,
            description: editSku.description ?? "",
            category: editSku.category,
            packaging_ml: editSku.packaging_ml,
            safety_stock_qty: editSku.safety_stock_qty,
            is_active: editSku.is_active,
          }}
        />
      )}
      <DeleteConfirmDialog
        open={!!deleteSku}
        onOpenChange={(v) => { if (!v) setDeleteSku(null); }}
        title="Excluir SKU?"
        description={`Esta ação não pode ser desfeita. O SKU ${deleteSku?.code ?? ""} será excluído permanentemente.`}
        onConfirm={deleteSku ? async () => {
          await remove.mutateAsync(deleteSku.id);
          toast.success(`SKU ${deleteSku.code} excluído.`);
          setDeleteSku(null);
        } : undefined}
      />
    </div>
  );
}

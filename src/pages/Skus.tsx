import { useState, useMemo } from "react";
import { BoardLayout } from "@/components/layouts/BoardLayout";
import { CarboPageHeader } from "@/components/ui/carbo-page-header";
import { CarboButton } from "@/components/ui/carbo-button";
import { CarboKPI } from "@/components/ui/carbo-kpi";
import { CarboEmptyState } from "@/components/ui/carbo-empty-state";
import { CarboSkeleton } from "@/components/ui/CarboSkeleton";
import { Package, Plus, RefreshCw, PackageCheck, PackageX } from "lucide-react";
import { useSkus, useActiveSkuBoms, Sku } from "@/hooks/useSkus";
import { useAuth } from "@/contexts/AuthContext";
import { SkusFilters } from "@/components/skus/SkusFilters";
import { SkusTable } from "@/components/skus/SkusTable";
import { CreateSkuDialog } from "@/components/skus/CreateSkuDialog";
import { EditSkuDialog } from "@/components/skus/EditSkuDialog";
import { DeleteSkuDialog } from "@/components/skus/DeleteSkuDialog";

export default function Skus() {
  const { isManager, isAdmin } = useAuth();
  const canManage = isManager || isAdmin;

  const { data: skus = [], isLoading, refetch } = useSkus();
  const { data: activeBomVersions = {} } = useActiveSkuBoms();

  // Dialog state
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [selectedSku, setSelectedSku] = useState<Sku | null>(null);

  // Filter state
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");

  // Stats
  const stats = useMemo(() => {
    const total = skus.length;
    const active = skus.filter((s) => s.is_active).length;
    const inactive = total - active;
    return { total, active, inactive };
  }, [skus]);

  // Filtering
  const filteredSkus = useMemo(() => {
    return skus.filter((sku) => {
      if (categoryFilter !== "all" && sku.category !== categoryFilter) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        if (
          !sku.name.toLowerCase().includes(q) &&
          !sku.code.toLowerCase().includes(q)
        )
          return false;
      }
      return true;
    });
  }, [skus, categoryFilter, searchQuery]);

  const activeFilterCount =
    (searchQuery !== "" ? 1 : 0) + (categoryFilter !== "all" ? 1 : 0);

  const handleEdit = (sku: Sku) => {
    setSelectedSku(sku);
    setIsEditOpen(true);
  };

  const handleDelete = (sku: Sku) => {
    setSelectedSku(sku);
    setIsDeleteOpen(true);
  };

  return (
    <BoardLayout>
      <div className="space-y-6">
        {/* Header */}
        <CarboPageHeader
          title="Gestão de SKUs"
          description="Produtos acabados e fichas técnicas (BOM)"
          icon={Package}
          actions={
            <div className="flex items-center gap-3">
              <CarboButton variant="outline" size="sm" onClick={() => refetch()}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Atualizar
              </CarboButton>
              {canManage && (
                <CarboButton size="sm" onClick={() => setIsCreateOpen(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Novo SKU
                </CarboButton>
              )}
            </div>
          }
        />

        {/* KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <CarboKPI
            title="Total SKUs"
            value={stats.total}
            icon={Package}
            iconColor="blue"
            loading={isLoading}
          />
          <CarboKPI
            title="Ativos"
            value={stats.active}
            icon={PackageCheck}
            iconColor="green"
            loading={isLoading}
          />
          <CarboKPI
            title="Inativos"
            value={stats.inactive}
            icon={PackageX}
            iconColor="muted"
            loading={isLoading}
          />
        </div>

        {/* Filters */}
        <SkusFilters
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          categoryFilter={categoryFilter}
          onCategoryChange={setCategoryFilter}
          activeCount={activeFilterCount}
        />

        {/* Table */}
        {isLoading ? (
          <div className="space-y-3">
            <CarboSkeleton className="h-12 w-full" />
            <CarboSkeleton className="h-12 w-full" />
            <CarboSkeleton className="h-12 w-full" />
          </div>
        ) : filteredSkus.length === 0 ? (
          <CarboEmptyState
            title="Nenhum SKU encontrado"
            description={
              searchQuery || categoryFilter !== "all"
                ? "Tente ajustar os filtros de busca."
                : "Comece cadastrando o primeiro SKU."
            }
            icon={Package}
            action={
              canManage && !searchQuery && categoryFilter === "all"
                ? { label: "Novo SKU", onClick: () => setIsCreateOpen(true) }
                : undefined
            }
          />
        ) : (
          <SkusTable
            skus={filteredSkus}
            activeBomVersions={activeBomVersions}
            onEdit={handleEdit}
            onDelete={handleDelete}
            canManage={canManage}
          />
        )}

        {/* Dialogs */}
        <CreateSkuDialog open={isCreateOpen} onOpenChange={setIsCreateOpen} />
        <EditSkuDialog open={isEditOpen} onOpenChange={setIsEditOpen} sku={selectedSku} />
        <DeleteSkuDialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen} sku={selectedSku} />
      </div>
    </BoardLayout>
  );
}

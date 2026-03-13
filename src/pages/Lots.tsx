import { useState, useMemo } from "react";
import { BoardLayout } from "@/components/layouts/BoardLayout";
import { CarboPageHeader } from "@/components/ui/carbo-page-header";
import { CarboButton } from "@/components/ui/carbo-button";
import { CarboKPI } from "@/components/ui/carbo-kpi";
import { CarboEmptyState } from "@/components/ui/carbo-empty-state";
import { CarboSkeleton } from "@/components/ui/CarboSkeleton";
import { FlaskConical, Plus, RefreshCw, ShieldCheck, ShieldAlert, ShieldX } from "lucide-react";
import { useLots, InventoryLot } from "@/hooks/useLots";
import { useAuth } from "@/contexts/AuthContext";
import { LotsFilters } from "@/components/lots/LotsFilters";
import { LotsTable } from "@/components/lots/LotsTable";
import { CreateLotDialog } from "@/components/lots/CreateLotDialog";
import { EditLotDialog } from "@/components/lots/EditLotDialog";
import { DeleteLotDialog } from "@/components/lots/DeleteLotDialog";

export default function Lots() {
  const { isManager, isAdmin } = useAuth();
  const canManage = isManager || isAdmin;

  const { data: lots = [], isLoading, refetch } = useLots();

  // Dialog state
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [selectedLot, setSelectedLot] = useState<InventoryLot | null>(null);

  // Filter state
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  // Stats
  const stats = useMemo(() => {
    const total = lots.length;
    const quarentena = lots.filter((l) => l.status === "em_quarentena").length;
    const aprovados = lots.filter((l) => l.status === "aprovado").length;
    const bloqueados = lots.filter((l) => l.status === "bloqueado" || l.status === "reprovado").length;
    return { total, quarentena, aprovados, bloqueados };
  }, [lots]);

  // Filtering
  const filteredLots = useMemo(() => {
    return lots.filter((lot) => {
      if (statusFilter !== "all" && lot.status !== statusFilter) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        if (
          !lot.lot_code.toLowerCase().includes(q) &&
          !(lot.product_name || "").toLowerCase().includes(q)
        )
          return false;
      }
      return true;
    });
  }, [lots, statusFilter, searchQuery]);

  const activeFilterCount =
    (searchQuery !== "" ? 1 : 0) + (statusFilter !== "all" ? 1 : 0);

  const handleEdit = (lot: InventoryLot) => {
    setSelectedLot(lot);
    setIsEditOpen(true);
  };

  const handleDelete = (lot: InventoryLot) => {
    setSelectedLot(lot);
    setIsDeleteOpen(true);
  };

  return (
    <BoardLayout>
      <div className="space-y-6">
        {/* Header */}
        <CarboPageHeader
          title="Gestão de Lotes"
          description="Controle de lotes de reagentes e qualidade"
          icon={FlaskConical}
          actions={
            <div className="flex items-center gap-3">
              <CarboButton variant="outline" size="sm" onClick={() => refetch()}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Atualizar
              </CarboButton>
              {canManage && (
                <CarboButton size="sm" onClick={() => setIsCreateOpen(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Novo Lote
                </CarboButton>
              )}
            </div>
          }
        />

        {/* KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <CarboKPI
            title="Total Lotes"
            value={stats.total}
            icon={FlaskConical}
            iconColor="blue"
            loading={isLoading}
          />
          <CarboKPI
            title="Em Quarentena"
            value={stats.quarentena}
            icon={ShieldAlert}
            iconColor="yellow"
            loading={isLoading}
          />
          <CarboKPI
            title="Aprovados"
            value={stats.aprovados}
            icon={ShieldCheck}
            iconColor="green"
            loading={isLoading}
          />
          <CarboKPI
            title="Bloqueados"
            value={stats.bloqueados}
            icon={ShieldX}
            iconColor="red"
            loading={isLoading}
          />
        </div>

        {/* Filters */}
        <LotsFilters
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          statusFilter={statusFilter}
          onStatusChange={setStatusFilter}
          activeCount={activeFilterCount}
        />

        {/* Table */}
        {isLoading ? (
          <div className="space-y-3">
            <CarboSkeleton className="h-12 w-full" />
            <CarboSkeleton className="h-12 w-full" />
            <CarboSkeleton className="h-12 w-full" />
          </div>
        ) : filteredLots.length === 0 ? (
          <CarboEmptyState
            title="Nenhum lote encontrado"
            description={
              searchQuery || statusFilter !== "all"
                ? "Tente ajustar os filtros de busca."
                : "Comece cadastrando o primeiro lote."
            }
            icon={FlaskConical}
            action={
              canManage && !searchQuery && statusFilter === "all"
                ? { label: "Novo Lote", onClick: () => setIsCreateOpen(true) }
                : undefined
            }
          />
        ) : (
          <LotsTable
            lots={filteredLots}
            onEdit={handleEdit}
            onDelete={handleDelete}
            canManage={canManage}
          />
        )}

        {/* Dialogs */}
        <CreateLotDialog open={isCreateOpen} onOpenChange={setIsCreateOpen} />
        <EditLotDialog open={isEditOpen} onOpenChange={setIsEditOpen} lot={selectedLot} />
        <DeleteLotDialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen} lot={selectedLot} />
      </div>
    </BoardLayout>
  );
}

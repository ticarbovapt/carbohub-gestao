import { useState, useMemo } from "react";
import { BoardLayout } from "@/components/layouts/BoardLayout";
import { Button } from "@/components/ui/button";
import { Loader2, Factory, Plus } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import {
  useProductionOrdersOP,
  type ProductionOrder,
} from "@/hooks/useProductionOrders";
import { OPFilters } from "@/components/production-orders/OPFilters";
import { OPTable } from "@/components/production-orders/OPTable";
import { CreateOPDialog } from "@/components/production-orders/CreateOPDialog";
import { EditOPDialog } from "@/components/production-orders/EditOPDialog";
import { DeleteOPDialog } from "@/components/production-orders/DeleteOPDialog";
import { ConfirmOPDialog } from "@/components/production-orders/ConfirmOPDialog";
import { OPKpiCards } from "@/components/production-orders/OPKpiCards";

export default function ProductionOrdersOP() {
  const { isManager, isAdmin } = useAuth();
  const canManage = isManager || isAdmin;

  const { data: orders = [], isLoading } = useProductionOrdersOP();

  // Dialog state
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<ProductionOrder | null>(null);

  // Filter state
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");

  // Filtering
  const filteredOrders = useMemo(() => {
    return orders.filter((order) => {
      if (statusFilter !== "all" && order.op_status !== statusFilter) return false;
      if (priorityFilter !== "all" && String(order.priority) !== priorityFilter) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const matchesTitle = (order.title || "").toLowerCase().includes(q);
        const matchesSku =
          (order.sku_code || "").toLowerCase().includes(q) ||
          (order.sku_name || "").toLowerCase().includes(q);
        if (!matchesTitle && !matchesSku) return false;
      }
      return true;
    });
  }, [orders, statusFilter, priorityFilter, searchQuery]);

  const handleEdit = (order: ProductionOrder) => {
    setSelectedOrder(order);
    setIsEditOpen(true);
  };

  const handleDelete = (order: ProductionOrder) => {
    setSelectedOrder(order);
    setIsDeleteOpen(true);
  };

  const handleConfirm = (order: ProductionOrder) => {
    setSelectedOrder(order);
    setIsConfirmOpen(true);
  };

  if (isLoading) {
    return (
      <BoardLayout>
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </BoardLayout>
    );
  }

  return (
    <BoardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-3">
              <Factory className="h-6 w-6 text-orange-500" />
              Ordens de Produção
            </h1>
            <p className="text-muted-foreground mt-1">
              Gestão e acompanhamento de OPs
            </p>
          </div>
          {canManage && (
            <Button onClick={() => setIsCreateOpen(true)} className="gap-2">
              <Plus className="h-4 w-4" />
              Nova OP
            </Button>
          )}
        </div>

        {/* KPIs — Confirmation metrics (last 30 days) */}
        <OPKpiCards />

        {/* Filters */}
        <OPFilters
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          statusFilter={statusFilter}
          onStatusChange={setStatusFilter}
          priorityFilter={priorityFilter}
          onPriorityChange={setPriorityFilter}
        />

        {/* Table */}
        {filteredOrders.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <Factory className="h-12 w-12 mx-auto mb-4 opacity-30" />
            <p className="text-lg font-medium">Nenhuma OP encontrada</p>
            <p className="text-sm">
              {searchQuery || statusFilter !== "all" || priorityFilter !== "all"
                ? "Tente ajustar os filtros de busca."
                : "Comece criando a primeira Ordem de Produção."}
            </p>
            {canManage && !searchQuery && statusFilter === "all" && priorityFilter === "all" && (
              <Button className="mt-4 gap-2" onClick={() => setIsCreateOpen(true)}>
                <Plus className="h-4 w-4" />
                Nova OP
              </Button>
            )}
          </div>
        ) : (
          <OPTable
            orders={filteredOrders}
            onEdit={handleEdit}
            onDelete={handleDelete}
            onConfirm={handleConfirm}
            canManage={canManage}
          />
        )}

        {/* Dialogs */}
        <CreateOPDialog open={isCreateOpen} onOpenChange={setIsCreateOpen} />
        <EditOPDialog open={isEditOpen} onOpenChange={setIsEditOpen} order={selectedOrder} />
        <DeleteOPDialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen} order={selectedOrder} />
        <ConfirmOPDialog open={isConfirmOpen} onOpenChange={setIsConfirmOpen} order={selectedOrder} />
      </div>
    </BoardLayout>
  );
}

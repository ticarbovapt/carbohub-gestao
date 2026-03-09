import React, { useState, useEffect } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { BoardLayout } from "@/components/layouts/BoardLayout";
import { OSKanbanBoard } from "@/components/os/OSKanbanBoard";
import { CreateOSDialog } from "@/components/os/CreateOSDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Filter, Plus, RefreshCw, ArrowLeft, Home } from "lucide-react";
import { ServiceOrder, OsStatus, DEPARTMENT_INFO } from "@/types/os";

export default function OSBoard() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user, isManager } = useAuth();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<OsStatus | "all">("all");
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);

  // Check for action=new in URL
  useEffect(() => {
    if (searchParams.get("action") === "new") {
      setIsCreateDialogOpen(true);
      // Remove the action param after opening
      searchParams.delete("action");
      setSearchParams(searchParams, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  // Fetch service orders
  const { data: orders = [], isLoading, refetch } = useQuery({
    queryKey: ["service-orders", statusFilter],
    queryFn: async () => {
      let query = supabase
        .from("service_orders")
        .select(`
          *,
          customer:customers(*)
        `)
        .order("created_at", { ascending: false });

      if (statusFilter !== "all") {
        query = query.eq("status", statusFilter);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as ServiceOrder[];
    },
  });

  // Filter orders by search query
  const filteredOrders = orders.filter((order) => {
    if (!searchQuery) return true;
    const search = searchQuery.toLowerCase();
    return (
      order.os_number.toLowerCase().includes(search) ||
      order.title.toLowerCase().includes(search) ||
      order.customer?.name?.toLowerCase().includes(search)
    );
  });

  const handleOrderClick = (order: ServiceOrder) => {
    navigate(`/os/${order.id}`);
  };

  return (
    <BoardLayout>
      <div className="space-y-6">
        {/* Back to home */}
        <Link
          to="/dashboard"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors group"
        >
          <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-1" />
          <Home className="h-4 w-4" />
          <span>Início OPS</span>
        </Link>

        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Ordens de Produção</h1>
            <p className="text-muted-foreground">
              Gerencie o fluxo de OP entre departamentos
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              <RefreshCw className="h-4 w-4 mr-1" />
              Atualizar
            </Button>
            {isManager && (
              <CreateOSDialog 
                defaultOpen={isCreateDialogOpen}
                onOpenChange={setIsCreateDialogOpen}
                onSuccess={() => refetch()}
                trigger={
                  <Button className="carbo-gradient text-white">
                    <Plus className="h-4 w-4 mr-1" />
                    Nova OP
                  </Button>
                }
              />
            )}
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-col md:flex-row gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por número, título ou cliente..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>

          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as OsStatus | "all")}>
            <SelectTrigger className="w-40">
              <Filter className="h-4 w-4 mr-2" />
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="draft">Rascunho</SelectItem>
              <SelectItem value="active">Ativa</SelectItem>
              <SelectItem value="paused">Pausada</SelectItem>
              <SelectItem value="completed">Concluída</SelectItem>
              <SelectItem value="cancelled">Cancelada</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {Object.entries(DEPARTMENT_INFO).map(([dept, info]) => {
            const count = filteredOrders.filter((o) => o.current_department === dept).length;
            return (
              <div
                key={dept}
                className="bg-card rounded-xl border p-4 flex items-center gap-3"
              >
                <span className="text-2xl">{info.icon}</span>
                <div>
                  <p className="text-2xl font-bold text-foreground">{count}</p>
                  <p className="text-xs text-muted-foreground">{info.name}</p>
                </div>
              </div>
            );
          })}
        </div>

        {/* Kanban Board */}
        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <RefreshCw className="h-8 w-8 animate-spin text-carbo-green" />
          </div>
        ) : (
          <OSKanbanBoard
            orders={filteredOrders}
            onOrderClick={handleOrderClick}
            onAddOrder={() => setIsCreateDialogOpen(true)}
            canAddOrder={isManager}
          />
        )}
      </div>

      {/* Create OS Dialog - Standalone for URL trigger */}
      {!isManager && isCreateDialogOpen && (
        <CreateOSDialog 
          defaultOpen={true}
          onOpenChange={setIsCreateDialogOpen}
          onSuccess={() => refetch()}
        />
      )}
    </BoardLayout>
  );
}

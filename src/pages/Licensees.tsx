import React, { useState, useMemo, useEffect } from "react";
import { BoardLayout } from "@/components/layouts/BoardLayout";
import { CarboPageHeader } from "@/components/ui/carbo-page-header";
import { CarboButton } from "@/components/ui/carbo-button";
import { CarboCard, CarboCardContent, CarboCardHeader, CarboCardTitle } from "@/components/ui/carbo-card";
import { CarboKPI } from "@/components/ui/carbo-kpi";
import { CarboBadge } from "@/components/ui/carbo-badge";
import { CarboTable, CarboTableHeader, CarboTableBody, CarboTableRow, CarboTableHead, CarboTableCell } from "@/components/ui/carbo-table";
import { CarboEmptyState } from "@/components/ui/carbo-empty-state";
import { CarboSkeleton } from "@/components/ui/CarboSkeleton";
import { PaginationControls } from "@/components/ui/pagination-controls";
import { 
  Building2, 
  Plus, 
  RefreshCw, 
  MapPin, 
  Phone, 
  Mail,
  ChevronRight,
  Users,
  Cog,
  TrendingUp,
  Download,
  FileSpreadsheet,
} from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useLicensees, useLicenseeStats, LicenseeStatus, Licensee } from "@/hooks/useLicensees";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate, useSearchParams } from "react-router-dom";
import { CreateLicenseeDialog } from "@/components/licensees/CreateLicenseeDialog";
import { EditLicenseeDialog } from "@/components/licensees/EditLicenseeDialog";
import { LicenseesFilters } from "@/components/licensees/LicenseesFilters";
import { LicenseesTable } from "@/components/licensees/LicenseesTable";
import { exportToExcel, exportToCSV, LICENSEE_EXPORT_COLUMNS } from "@/lib/exportUtils";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";

const STATUS_LABELS: Record<LicenseeStatus, string> = {
  active: "Ativo",
  inactive: "Inativo",
  pending: "Pendente",
  suspended: "Suspenso",
};

const STATUS_VARIANTS: Record<LicenseeStatus, "success" | "secondary" | "warning" | "destructive"> = {
  active: "success",
  inactive: "secondary",
  pending: "warning",
  suspended: "destructive",
};

export default function Licensees() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const { isManager, isAdmin } = useAuth();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<LicenseeStatus | "all">("all");
  const [stateFilter, setStateFilter] = useState<string>(searchParams.get("state") || "all");
  const [cityFilter, setCityFilter] = useState<string>("all");
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [selectedLicensee, setSelectedLicensee] = useState<Licensee | null>(null);

  const { data: licensees = [], isLoading, refetch } = useLicensees("all");
  const { data: stats, isLoading: statsLoading } = useLicenseeStats();

  // Read state filter from URL on mount
  useEffect(() => {
    const stateFromUrl = searchParams.get("state");
    if (stateFromUrl) {
      setStateFilter(stateFromUrl);
      // Clear the URL param after applying
      setSearchParams({});
    }
  }, [searchParams, setSearchParams]);

  // Realtime subscription for licensees
  React.useEffect(() => {
    const channel = supabase
      .channel('licensees-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'licensees' },
        () => {
          queryClient.invalidateQueries({ queryKey: ["licensees"] });
          queryClient.invalidateQueries({ queryKey: ["licensee-stats"] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  // Get unique states and cities from data
  const availableStates = useMemo(() => {
    const states = new Set<string>();
    licensees.forEach((l) => {
      if (l.address_state) states.add(l.address_state);
    });
    return Array.from(states);
  }, [licensees]);

  const availableCities = useMemo(() => {
    const cities = new Set<string>();
    licensees.forEach((l) => {
      if (l.address_city) {
        // If a state filter is applied, only show cities in that state
        if (stateFilter === "all" || l.address_state === stateFilter) {
          cities.add(l.address_city);
        }
      }
    });
    return Array.from(cities);
  }, [licensees, stateFilter]);

  // Filter licensees
  const filteredLicensees = useMemo(() => {
    return licensees.filter((licensee) => {
      // Status filter
      if (statusFilter !== "all" && licensee.status !== statusFilter) return false;
      
      // State filter
      if (stateFilter !== "all" && licensee.address_state !== stateFilter) return false;
      
      // City filter
      if (cityFilter !== "all" && licensee.address_city !== cityFilter) return false;
      
      // Search filter
      if (searchQuery) {
        const search = searchQuery.toLowerCase();
        return (
          licensee.name.toLowerCase().includes(search) ||
          licensee.code.toLowerCase().includes(search) ||
          licensee.email?.toLowerCase().includes(search) ||
          licensee.address_city?.toLowerCase().includes(search)
        );
      }
      
      return true;
    });
  }, [licensees, statusFilter, stateFilter, cityFilter, searchQuery]);

  // Count active filters
  const activeFiltersCount = [
    statusFilter !== "all",
    stateFilter !== "all",
    cityFilter !== "all",
  ].filter(Boolean).length;

  const clearFilters = () => {
    setStatusFilter("all");
    setStateFilter("all");
    setCityFilter("all");
    setSearchQuery("");
  };

  // Reset city filter when state changes
  const handleStateChange = (value: string) => {
    setStateFilter(value);
    setCityFilter("all");
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  };

  return (
    <BoardLayout>
      <div className="space-y-6">
        <CarboPageHeader
          title="Gestão de Licenciados"
          description="Cadastro, abrangência, horários e performance"
          icon={Building2}
          actions={
            <>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <CarboButton variant="outline" size="sm" disabled={filteredLicensees.length === 0}>
                    <Download className="h-4 w-4 mr-1" />
                    Exportar
                  </CarboButton>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    onClick={() => {
                      exportToExcel(filteredLicensees as unknown as Record<string, unknown>[], LICENSEE_EXPORT_COLUMNS, `licenciados-${new Date().toISOString().slice(0, 10)}`);
                      toast.success("Arquivo Excel exportado!");
                    }}
                  >
                    <FileSpreadsheet className="h-4 w-4 mr-2" />
                    Exportar Excel (.xlsx)
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => {
                      exportToCSV(filteredLicensees as unknown as Record<string, unknown>[], LICENSEE_EXPORT_COLUMNS, `licenciados-${new Date().toISOString().slice(0, 10)}`);
                      toast.success("Arquivo CSV exportado!");
                    }}
                  >
                    <Download className="h-4 w-4 mr-2" />
                    Exportar CSV
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <CarboButton variant="outline" size="sm" onClick={() => refetch()}>
                <RefreshCw className="h-4 w-4 mr-1" />
                Atualizar
              </CarboButton>
              {isManager && (
                <CarboButton onClick={() => setIsCreateDialogOpen(true)}>
                  <Plus className="h-4 w-4 mr-1" />
                  Novo Licenciado
                </CarboButton>
              )}
            </>
          }
        />

        {/* KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <CarboKPI
            title="Total"
            value={stats?.total || 0}
            icon={Building2}
            iconColor="blue"
            loading={statsLoading}
            delay={50}
          />
          <CarboKPI
            title="Ativos"
            value={stats?.active || 0}
            icon={TrendingUp}
            iconColor="success"
            loading={statsLoading}
            delay={100}
          />
          <CarboKPI
            title="Pendentes"
            value={stats?.pending || 0}
            icon={Users}
            iconColor="warning"
            loading={statsLoading}
            delay={150}
          />
          <CarboKPI
            title="Máquinas"
            value={stats?.totalMachines || 0}
            icon={Cog}
            iconColor="green"
            loading={statsLoading}
            delay={200}
          />
          <CarboKPI
            title="Receita Total"
            value={formatCurrency(stats?.totalRevenue || 0)}
            icon={TrendingUp}
            iconColor="green"
            loading={statsLoading}
            delay={250}
          />
        </div>

        {/* Filters */}
        <LicenseesFilters
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          statusFilter={statusFilter}
          onStatusChange={setStatusFilter}
          stateFilter={stateFilter}
          onStateChange={handleStateChange}
          cityFilter={cityFilter}
          onCityChange={setCityFilter}
          availableStates={availableStates}
          availableCities={availableCities}
          activeFiltersCount={activeFiltersCount}
          onClearFilters={clearFilters}
        />

        {/* Table */}
        {isLoading ? (
          <CarboCard padding="none">
            <div className="p-6 space-y-4">
              {[1, 2, 3, 4, 5].map((i) => (
                <CarboSkeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          </CarboCard>
        ) : filteredLicensees.length === 0 ? (
          <CarboCard>
            <CarboEmptyState
              icon={Building2}
              title="Nenhum licenciado encontrado"
              description={searchQuery ? "Tente ajustar os filtros de busca" : "Comece cadastrando seu primeiro licenciado"}
              action={
                isManager
                  ? {
                      label: "Novo Licenciado",
                      onClick: () => setIsCreateDialogOpen(true),
                    }
                  : undefined
              }
            />
          </CarboCard>
        ) : (
          <LicenseesTable 
            licensees={filteredLicensees} 
            navigate={navigate}
            onEdit={isAdmin ? (licensee: Licensee) => {
              setSelectedLicensee(licensee);
              setIsEditDialogOpen(true);
            } : undefined}
          />
        )}
      </div>

      <CreateLicenseeDialog
        open={isCreateDialogOpen}
        onOpenChange={setIsCreateDialogOpen}
      />

      <EditLicenseeDialog
        open={isEditDialogOpen}
        onOpenChange={setIsEditDialogOpen}
        licensee={selectedLicensee}
      />
    </BoardLayout>
  );
}

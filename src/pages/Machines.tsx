import React, { useState } from "react";
import { BoardLayout } from "@/components/layouts/BoardLayout";
import { LicenseeSubNav } from "@/components/licensees/LicenseeSubNav";
import { CarboPageHeader } from "@/components/ui/carbo-page-header";
import { CarboButton } from "@/components/ui/carbo-button";
import { CarboCard, CarboCardContent, CarboCardHeader, CarboCardTitle } from "@/components/ui/carbo-card";
import { CarboKPI } from "@/components/ui/carbo-kpi";
import { CarboBadge } from "@/components/ui/carbo-badge";
import { CarboSearchInput } from "@/components/ui/carbo-input";
import { CarboTable, CarboTableHeader, CarboTableBody, CarboTableRow, CarboTableHead, CarboTableCell } from "@/components/ui/carbo-table";
import { CarboEmptyState } from "@/components/ui/carbo-empty-state";
import { CarboSkeleton } from "@/components/ui/CarboSkeleton";
import {
  Cog,
  Plus,
  RefreshCw,
  Filter,
  MapPin,
  AlertTriangle,
  ChevronRight,
  Wrench,
  Zap,
  Package,
  Download,
  FileSpreadsheet,
  Upload,
} from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useMachines, useMachineStats, useMachineAlerts, MachineStatus, Machine } from "@/hooks/useMachines";
import { useLicensees } from "@/hooks/useLicensees";
import { useAuth } from "@/contexts/AuthContext";
// navigate removed — no machine detail page
import { CreateMachineDialog } from "@/components/machines/CreateMachineDialog";
import { EditMachineDialog } from "@/components/machines/EditMachineDialog";
import { ImportMachinesDialog } from "@/components/machines/ImportMachinesDialog";
import { MachinesTable } from "@/components/machines/MachinesTable";
import { exportToExcel, exportToCSV, MACHINE_EXPORT_COLUMNS } from "@/lib/exportUtils";
import { toast } from "sonner";

const STATUS_LABELS: Record<MachineStatus, string> = {
  operational: "Operacional",
  maintenance: "Manutenção",
  offline: "Offline",
  retired: "Aposentada",
};

const STATUS_VARIANTS: Record<MachineStatus, "success" | "warning" | "destructive" | "secondary"> = {
  operational: "success",
  maintenance: "warning",
  offline: "destructive",
  retired: "secondary",
};

export default function Machines() {
  const { isManager, isAdmin } = useAuth();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<MachineStatus | "all">("all");
  const [licenseeFilter, setLicenseeFilter] = useState<string>("all");
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);
  const [selectedMachine, setSelectedMachine] = useState<Machine | null>(null);

  const { data: machines = [], isLoading, refetch } = useMachines(statusFilter, licenseeFilter === "all" ? undefined : licenseeFilter);
  const { data: stats, isLoading: statsLoading } = useMachineStats();
  const { data: alerts } = useMachineAlerts();
  const { data: licensees = [] } = useLicensees("all");

  // Filter by search
  const filteredMachines = machines.filter((machine) => {
    if (!searchQuery) return true;
    const search = searchQuery.toLowerCase();
    return (
      machine.machine_id.toLowerCase().includes(search) ||
      machine.model.toLowerCase().includes(search) ||
      machine.licensee?.name?.toLowerCase().includes(search) ||
      machine.location_city?.toLowerCase().includes(search)
    );
  });

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
          title="Gestão de Máquinas"
          description="Equipamentos, consumo, alertas e manutenção"
          icon={Cog}
          actions={
            <>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <CarboButton variant="outline" size="sm" disabled={filteredMachines.length === 0}>
                    <Download className="h-4 w-4 mr-1" />
                    Exportar
                  </CarboButton>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    onClick={() => {
                      exportToExcel(filteredMachines as unknown as Record<string, unknown>[], MACHINE_EXPORT_COLUMNS, `maquinas-${new Date().toISOString().slice(0, 10)}`);
                      toast.success("Arquivo Excel exportado!");
                    }}
                  >
                    <FileSpreadsheet className="h-4 w-4 mr-2" />
                    Exportar Excel (.xlsx)
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => {
                      exportToCSV(filteredMachines as unknown as Record<string, unknown>[], MACHINE_EXPORT_COLUMNS, `maquinas-${new Date().toISOString().slice(0, 10)}`);
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
                <>
                  <CarboButton
                    variant="outline"
                    onClick={() => setIsImportDialogOpen(true)}
                    aria-label="Importar máquinas via CSV"
                  >
                    <Upload className="h-4 w-4 mr-1" />
                    Importar CSV
                  </CarboButton>
                  <CarboButton onClick={() => setIsCreateDialogOpen(true)}>
                    <Plus className="h-4 w-4 mr-1" />
                    Nova Máquina
                  </CarboButton>
                </>
              )}
            </>
          }
        />

        <LicenseeSubNav />

        {/* Alerts Banner */}
        {alerts && (alerts.alerts.length > 0 || alerts.lowStock.length > 0) && (
          <CarboCard variant="highlight" className="border-l-warning">
            <CarboCardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <AlertTriangle className="h-5 w-5 text-warning" />
                  <div>
                    <p className="font-medium">Atenção Necessária</p>
                    <p className="text-sm text-muted-foreground">
                      {alerts.alerts.length} máquina(s) com alertas, {alerts.lowStock.length} com estoque baixo
                    </p>
                  </div>
                </div>
                <CarboButton variant="outline" size="sm">
                  Ver Detalhes
                </CarboButton>
              </div>
            </CarboCardContent>
          </CarboCard>
        )}

        {/* KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <CarboKPI
            title="Total"
            value={stats?.total || 0}
            icon={Cog}
            iconColor="blue"
            loading={statsLoading}
            delay={50}
          />
          <CarboKPI
            title="Operacionais"
            value={stats?.operational || 0}
            icon={Zap}
            iconColor="success"
            loading={statsLoading}
            delay={100}
          />
          <CarboKPI
            title="Manutenção"
            value={stats?.maintenance || 0}
            icon={Wrench}
            iconColor="warning"
            loading={statsLoading}
            delay={150}
          />
          <CarboKPI
            title="Estoque Baixo"
            value={stats?.lowStock || 0}
            icon={Package}
            iconColor="destructive"
            loading={statsLoading}
            delay={200}
          />
          <CarboKPI
            title="Créditos Total"
            value={formatCurrency(stats?.totalCredits || 0)}
            icon={Zap}
            iconColor="green"
            loading={statsLoading}
            delay={250}
          />
        </div>

        {/* Filters */}
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1 max-w-md">
            <CarboSearchInput
              placeholder="Buscar por ID, modelo, licenciado ou cidade..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as MachineStatus | "all")}>
            <SelectTrigger className="w-40 h-11 rounded-xl">
              <Filter className="h-4 w-4 mr-2" />
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              {Object.entries(STATUS_LABELS).map(([key, label]) => (
                <SelectItem key={key} value={key}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={licenseeFilter} onValueChange={setLicenseeFilter}>
            <SelectTrigger className="w-48 h-11 rounded-xl">
              <SelectValue placeholder="Licenciado" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos Licenciados</SelectItem>
              {licensees.map((lic) => (
                <SelectItem key={lic.id} value={lic.id}>
                  {lic.code} - {lic.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Table */}
        {isLoading ? (
          <CarboCard padding="none">
            <div className="p-6 space-y-4">
              {[1, 2, 3, 4, 5].map((i) => (
                <CarboSkeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          </CarboCard>
        ) : filteredMachines.length === 0 ? (
          <CarboCard>
            <CarboEmptyState
              icon={Cog}
              title="Nenhuma máquina encontrada"
              description={searchQuery ? "Tente ajustar os filtros de busca" : "Comece cadastrando sua primeira máquina"}
              action={
                isManager
                  ? {
                      label: "Nova Máquina",
                      onClick: () => setIsCreateDialogOpen(true),
                    }
                  : undefined
              }
            >
              {isManager && !searchQuery && (
                <CarboButton
                  variant="outline"
                  size="sm"
                  onClick={() => setIsImportDialogOpen(true)}
                  aria-label="Importar máquinas em massa via CSV"
                >
                  <Upload className="h-4 w-4 mr-1" />
                  Importar CSV
                </CarboButton>
              )}
            </CarboEmptyState>
          </CarboCard>
        ) : (
          <MachinesTable
            machines={filteredMachines}
            onEdit={(isAdmin || isManager) ? (machine: Machine) => {
              setSelectedMachine(machine);
              setIsEditDialogOpen(true);
            } : undefined}
          />
        )}
      </div>

      <CreateMachineDialog
        open={isCreateDialogOpen}
        onOpenChange={setIsCreateDialogOpen}
        licensees={licensees}
      />

      <EditMachineDialog
        open={isEditDialogOpen}
        onOpenChange={setIsEditDialogOpen}
        machine={selectedMachine}
      />

      <ImportMachinesDialog
        open={isImportDialogOpen}
        onOpenChange={setIsImportDialogOpen}
      />
    </BoardLayout>
  );
}

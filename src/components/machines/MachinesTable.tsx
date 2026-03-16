import React from "react";
import { CarboTable, CarboTableHeader, CarboTableBody, CarboTableRow, CarboTableHead, CarboTableCell } from "@/components/ui/carbo-table";
import { CarboBadge } from "@/components/ui/carbo-badge";
import { CarboButton } from "@/components/ui/carbo-button";
import { PaginationControls } from "@/components/ui/pagination-controls";
import { usePagination } from "@/hooks/usePagination";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MapPin, AlertTriangle, Pencil } from "lucide-react";
import { useUpdateMachine, type Machine, type MachineStatus } from "@/hooks/useMachines";
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

const STATUS_COLORS: Record<MachineStatus, string> = {
  operational: "text-green-500 border-green-500/30 bg-green-500/10",
  maintenance: "text-yellow-500 border-yellow-500/30 bg-yellow-500/10",
  offline: "text-red-500 border-red-500/30 bg-red-500/10",
  retired: "text-gray-400 border-gray-400/30 bg-gray-400/10",
};

interface MachinesTableProps {
  machines: Machine[];
  onEdit?: (machine: Machine) => void;
}

export function MachinesTable({ machines, onEdit }: MachinesTableProps) {
  const pagination = usePagination(machines, { initialPageSize: 10 });
  const updateMachine = useUpdateMachine();

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  };

  const handleStatusChange = async (machine: Machine, newStatus: MachineStatus) => {
    if (newStatus === machine.status) return;
    try {
      await updateMachine.mutateAsync({
        id: machine.id,
        status: newStatus,
      });
      toast.success(`Status de ${machine.machine_id} alterado para ${STATUS_LABELS[newStatus]}`);
    } catch {
      toast.error("Erro ao alterar status");
    }
  };

  return (
    <div className="space-y-4">
      <CarboTable>
        <CarboTableHeader>
          <CarboTableRow>
            <CarboTableHead>ID</CarboTableHead>
            <CarboTableHead>Modelo</CarboTableHead>
            <CarboTableHead>Licenciado</CarboTableHead>
            <CarboTableHead>Localização</CarboTableHead>
            <CarboTableHead>Estoque</CarboTableHead>
            <CarboTableHead>Créditos</CarboTableHead>
            <CarboTableHead>Status</CarboTableHead>
            {onEdit && <CarboTableHead className="w-24 text-center">Ações</CarboTableHead>}
          </CarboTableRow>
        </CarboTableHeader>
        <CarboTableBody>
          {pagination.paginatedData.map((machine) => {
            const stockPercentage = Math.round(
              ((machine.capacity - machine.units_since_last_refill) / machine.capacity) * 100
            );
            const isLowStock = machine.units_since_last_refill <= machine.low_stock_threshold;

            return (
              <CarboTableRow key={machine.id}>
                <CarboTableCell>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-medium text-carbo-green">
                      {machine.machine_id}
                    </span>
                    {machine.has_active_alert && (
                      <AlertTriangle className="h-4 w-4 text-warning" />
                    )}
                  </div>
                </CarboTableCell>
                <CarboTableCell>
                  <p className="font-medium">{machine.model}</p>
                  {machine.serial_number && (
                    <p className="text-xs text-muted-foreground font-mono">
                      S/N: {machine.serial_number}
                    </p>
                  )}
                </CarboTableCell>
                <CarboTableCell>
                  {machine.licensee ? (
                    <div>
                      <p className="text-sm">{machine.licensee.name}</p>
                      <p className="text-xs text-muted-foreground">{machine.licensee.code}</p>
                    </div>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </CarboTableCell>
                <CarboTableCell>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <MapPin className="h-4 w-4" />
                    {machine.location_city && machine.location_state
                      ? `${machine.location_city}, ${machine.location_state}`
                      : "Não informado"}
                  </div>
                </CarboTableCell>
                <CarboTableCell>
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className={isLowStock ? "text-destructive font-medium" : ""}>
                        {stockPercentage}%
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full bg-muted overflow-hidden w-16">
                      <div
                        className={`h-full transition-all ${
                          isLowStock ? "bg-destructive" : "progress-gradient"
                        }`}
                        style={{ width: `${stockPercentage}%` }}
                      />
                    </div>
                  </div>
                </CarboTableCell>
                <CarboTableCell>
                  <span className="font-medium kpi-number">
                    {formatCurrency(Number(machine.total_credits_generated))}
                  </span>
                </CarboTableCell>
                <CarboTableCell>
                  {onEdit ? (
                    <Select
                      value={machine.status}
                      onValueChange={(v) => handleStatusChange(machine, v as MachineStatus)}
                    >
                      <SelectTrigger
                        className={`h-8 w-[140px] text-xs font-medium rounded-full border ${STATUS_COLORS[machine.status]}`}
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(STATUS_LABELS).map(([key, label]) => (
                          <SelectItem key={key} value={key}>
                            <div className="flex items-center gap-2">
                              <div className={`h-2 w-2 rounded-full ${
                                key === "operational" ? "bg-green-500" :
                                key === "maintenance" ? "bg-yellow-500" :
                                key === "offline" ? "bg-red-500" : "bg-gray-400"
                              }`} />
                              {label}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <CarboBadge variant={STATUS_VARIANTS[machine.status]} dot>
                      {STATUS_LABELS[machine.status]}
                    </CarboBadge>
                  )}
                </CarboTableCell>
                {onEdit && (
                  <CarboTableCell className="text-center">
                    <CarboButton
                      variant="outline"
                      size="sm"
                      onClick={() => onEdit(machine)}
                      className="h-8 gap-1.5 text-xs"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      Editar
                    </CarboButton>
                  </CarboTableCell>
                )}
              </CarboTableRow>
            );
          })}
        </CarboTableBody>
      </CarboTable>

      <PaginationControls
        currentPage={pagination.currentPage}
        totalPages={pagination.totalPages}
        totalItems={pagination.totalItems}
        startIndex={pagination.startIndex}
        endIndex={pagination.endIndex}
        pageSize={pagination.pageSize}
        pageSizeOptions={pagination.pageSizeOptions}
        hasNextPage={pagination.hasNextPage}
        hasPrevPage={pagination.hasPrevPage}
        onPageChange={pagination.goToPage}
        onPageSizeChange={pagination.setPageSize}
      />
    </div>
  );
}

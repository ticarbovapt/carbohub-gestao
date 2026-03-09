import React from "react";
import { CarboTable, CarboTableHeader, CarboTableBody, CarboTableRow, CarboTableHead, CarboTableCell } from "@/components/ui/carbo-table";
import { CarboBadge } from "@/components/ui/carbo-badge";
import { CarboButton } from "@/components/ui/carbo-button";
import { PaginationControls } from "@/components/ui/pagination-controls";
import { usePagination } from "@/hooks/usePagination";
import { MapPin, ChevronRight, AlertTriangle, Pencil } from "lucide-react";
import type { Machine, MachineStatus } from "@/hooks/useMachines";
import type { NavigateFunction } from "react-router-dom";

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

interface MachinesTableProps {
  machines: Machine[];
  navigate: NavigateFunction;
  onEdit?: (machine: Machine) => void;
}

export function MachinesTable({ machines, navigate, onEdit }: MachinesTableProps) {
  const pagination = usePagination(machines, { initialPageSize: 10 });

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
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
            {onEdit && <CarboTableHead className="w-10">Editar</CarboTableHead>}
            <CarboTableHead className="w-10"></CarboTableHead>
          </CarboTableRow>
        </CarboTableHeader>
        <CarboTableBody>
          {pagination.paginatedData.map((machine) => {
            const stockPercentage = Math.round(
              ((machine.capacity - machine.units_since_last_refill) / machine.capacity) * 100
            );
            const isLowStock = machine.units_since_last_refill <= machine.low_stock_threshold;

            return (
              <CarboTableRow
                key={machine.id}
                interactive
                onClick={() => navigate(`/machines/${machine.id}`)}
              >
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
                  <CarboBadge variant={STATUS_VARIANTS[machine.status]} dot>
                    {STATUS_LABELS[machine.status]}
                  </CarboBadge>
                </CarboTableCell>
                {onEdit && (
                  <CarboTableCell>
                    <CarboButton
                      variant="ghost"
                      size="icon"
                      onClick={(e) => {
                        e.stopPropagation();
                        onEdit(machine);
                      }}
                      className="h-8 w-8"
                    >
                      <Pencil className="h-4 w-4" />
                    </CarboButton>
                  </CarboTableCell>
                )}
                <CarboTableCell>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </CarboTableCell>
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

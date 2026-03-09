import React from "react";
import { CarboTable, CarboTableHeader, CarboTableBody, CarboTableRow, CarboTableHead, CarboTableCell } from "@/components/ui/carbo-table";
import { CarboBadge } from "@/components/ui/carbo-badge";
import { PaginationControls } from "@/components/ui/pagination-controls";
import { usePagination } from "@/hooks/usePagination";
import { MapPin, Phone, Mail, ChevronRight, Pencil } from "lucide-react";
import { CarboButton } from "@/components/ui/carbo-button";
import type { Licensee, LicenseeStatus } from "@/hooks/useLicensees";
import type { NavigateFunction } from "react-router-dom";

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

interface LicenseesTableProps {
  licensees: Licensee[];
  navigate: NavigateFunction;
  onEdit?: (licensee: Licensee) => void;
}

export function LicenseesTable({ licensees, navigate, onEdit }: LicenseesTableProps) {
  const pagination = usePagination(licensees, { initialPageSize: 10 });

  return (
    <div className="space-y-4">
      <CarboTable>
        <CarboTableHeader>
          <CarboTableRow>
            <CarboTableHead>Código</CarboTableHead>
            <CarboTableHead>Licenciado</CarboTableHead>
            <CarboTableHead>Localização</CarboTableHead>
            <CarboTableHead>Contato</CarboTableHead>
            <CarboTableHead>Máquinas</CarboTableHead>
            <CarboTableHead>Status</CarboTableHead>
            {onEdit && <CarboTableHead className="w-10">Editar</CarboTableHead>}
            <CarboTableHead className="w-10"></CarboTableHead>
          </CarboTableRow>
        </CarboTableHeader>
        <CarboTableBody>
          {pagination.paginatedData.map((licensee) => (
            <CarboTableRow
              key={licensee.id}
              interactive
              onClick={() => navigate(`/licensees/${licensee.id}`)}
            >
              <CarboTableCell>
                <span className="font-mono text-sm font-medium text-carbo-green">
                  {licensee.code}
                </span>
              </CarboTableCell>
              <CarboTableCell>
                <div>
                  <p className="font-medium">{licensee.name}</p>
                  {licensee.legal_name && (
                    <p className="text-xs text-muted-foreground truncate max-w-48">
                      {licensee.legal_name}
                    </p>
                  )}
                </div>
              </CarboTableCell>
              <CarboTableCell>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <MapPin className="h-4 w-4" />
                  {licensee.address_city && licensee.address_state
                    ? `${licensee.address_city}, ${licensee.address_state}`
                    : "Não informado"}
                </div>
              </CarboTableCell>
              <CarboTableCell>
                <div className="space-y-1">
                  {licensee.email && (
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Mail className="h-3 w-3" />
                      {licensee.email}
                    </div>
                  )}
                  {licensee.phone && (
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Phone className="h-3 w-3" />
                      {licensee.phone}
                    </div>
                  )}
                </div>
              </CarboTableCell>
              <CarboTableCell>
                <span className="font-medium kpi-number">{licensee.total_machines}</span>
              </CarboTableCell>
              <CarboTableCell>
                <CarboBadge variant={STATUS_VARIANTS[licensee.status]} dot>
                  {STATUS_LABELS[licensee.status]}
                </CarboBadge>
              </CarboTableCell>
              {onEdit && (
                <CarboTableCell>
                  <CarboButton
                    variant="ghost"
                    size="icon"
                    onClick={(e) => {
                      e.stopPropagation();
                      onEdit(licensee);
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
          ))}
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

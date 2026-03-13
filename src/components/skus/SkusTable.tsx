import {
  CarboTable,
  CarboTableHeader,
  CarboTableBody,
  CarboTableRow,
  CarboTableHead,
  CarboTableCell,
} from "@/components/ui/carbo-table";
import { CarboBadge } from "@/components/ui/carbo-badge";
import { PaginationControls } from "@/components/ui/pagination-controls";
import { usePagination } from "@/hooks/usePagination";
import { CarboButton } from "@/components/ui/carbo-button";
import { Pencil, Trash2 } from "lucide-react";
import type { Sku } from "@/hooks/useSkus";

interface SkusTableProps {
  skus: Sku[];
  activeBomVersions: Record<string, number>;
  onEdit: (sku: Sku) => void;
  onDelete: (sku: Sku) => void;
  canManage: boolean;
}

export function SkusTable({ skus, activeBomVersions, onEdit, onDelete, canManage }: SkusTableProps) {
  const pagination = usePagination(skus, { initialPageSize: 10 });

  return (
    <div className="space-y-4">
      <CarboTable>
        <CarboTableHeader>
          <CarboTableRow>
            <CarboTableHead>Código</CarboTableHead>
            <CarboTableHead>Nome</CarboTableHead>
            <CarboTableHead>Categoria</CarboTableHead>
            <CarboTableHead>Embalagem</CarboTableHead>
            <CarboTableHead>Estoque Seg.</CarboTableHead>
            <CarboTableHead>Status</CarboTableHead>
            <CarboTableHead>BOM</CarboTableHead>
            {canManage && <CarboTableHead className="w-20">Ações</CarboTableHead>}
          </CarboTableRow>
        </CarboTableHeader>
        <CarboTableBody>
          {pagination.paginatedData.map((sku) => (
            <CarboTableRow
              key={sku.id}
              interactive
              onClick={() => onEdit(sku)}
            >
              <CarboTableCell>
                <span className="font-mono text-sm font-medium text-carbo-green">
                  {sku.code}
                </span>
              </CarboTableCell>
              <CarboTableCell>
                <p className="font-medium">{sku.name}</p>
                {sku.description && (
                  <p className="text-xs text-muted-foreground truncate max-w-48">
                    {sku.description}
                  </p>
                )}
              </CarboTableCell>
              <CarboTableCell>
                <span className="text-sm capitalize">
                  {sku.category?.replace("_", " ") || "---"}
                </span>
              </CarboTableCell>
              <CarboTableCell>
                {sku.packaging_ml ? `${sku.packaging_ml} ml` : "---"}
              </CarboTableCell>
              <CarboTableCell>
                <span className="font-medium kpi-number">{sku.safety_stock_qty}</span>
              </CarboTableCell>
              <CarboTableCell>
                <CarboBadge variant={sku.is_active ? "success" : "secondary"} dot>
                  {sku.is_active ? "Ativo" : "Inativo"}
                </CarboBadge>
              </CarboTableCell>
              <CarboTableCell>
                {activeBomVersions[sku.id] ? (
                  <CarboBadge variant="outline">v{activeBomVersions[sku.id]}</CarboBadge>
                ) : (
                  <span className="text-sm text-muted-foreground">---</span>
                )}
              </CarboTableCell>
              {canManage && (
                <CarboTableCell>
                  <div className="flex items-center gap-1">
                    <CarboButton
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={(e) => {
                        e.stopPropagation();
                        onEdit(sku);
                      }}
                    >
                      <Pencil className="h-4 w-4" />
                    </CarboButton>
                    <CarboButton
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDelete(sku);
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </CarboButton>
                  </div>
                </CarboTableCell>
              )}
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

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Pencil, Trash2 } from "lucide-react";
import { InventoryLot, LOT_STATUS_LABELS, LOT_STATUS_COLORS } from "@/hooks/useLots";
import { usePagination } from "@/hooks/usePagination";
import { PaginationControls } from "@/components/ui/pagination-controls";
import { cn } from "@/lib/utils";

interface LotsTableProps {
  lots: InventoryLot[];
  onEdit: (lot: InventoryLot) => void;
  onDelete: (lot: InventoryLot) => void;
  canManage: boolean;
}

export function LotsTable({ lots, onEdit, onDelete, canManage }: LotsTableProps) {
  const pagination = usePagination(lots, { initialPageSize: 10 });

  const formatVolume = (ml: number) => {
    if (ml >= 1000) return `${(ml / 1000).toFixed(1)}L`;
    return `${ml}ml`;
  };

  const volumePercent = (available: number, initial: number) => {
    if (initial === 0) return 0;
    return Math.round((available / initial) * 100);
  };

  return (
    <div className="space-y-4">
      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Código</TableHead>
              <TableHead>Produto</TableHead>
              <TableHead>Volume</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Amostras</TableHead>
              <TableHead>Fornecedor</TableHead>
              <TableHead>Recebido</TableHead>
              {canManage && <TableHead className="text-right">Ações</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {pagination.paginatedData.map((lot) => {
              const pct = volumePercent(lot.available_volume_ml, lot.initial_volume_ml);
              return (
                <TableRow key={lot.id}>
                  <TableCell>
                    <span className="font-mono text-sm text-green-500 font-medium">
                      {lot.lot_code}
                    </span>
                  </TableCell>
                  <TableCell className="font-medium">
                    {lot.product_name || "—"}
                  </TableCell>
                  <TableCell>
                    <div className="space-y-1">
                      <span className="text-sm">
                        {formatVolume(lot.available_volume_ml)} / {formatVolume(lot.initial_volume_ml)}
                      </span>
                      <div className="w-20 h-1.5 bg-muted rounded-full overflow-hidden">
                        <div
                          className={cn(
                            "h-full rounded-full transition-all",
                            pct > 50 ? "bg-green-500" : pct > 20 ? "bg-yellow-500" : "bg-red-500"
                          )}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={cn(
                        "text-white border-0 text-xs",
                        LOT_STATUS_COLORS[lot.status]
                      )}
                    >
                      {LOT_STATUS_LABELS[lot.status]}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm">
                      {lot.collected_samples}/{lot.expected_samples}
                    </span>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {lot.supplier_name || "—"}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {lot.received_at
                      ? new Date(lot.received_at).toLocaleDateString("pt-BR")
                      : "—"}
                  </TableCell>
                  {canManage && (
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => onEdit(lot)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:text-destructive"
                          onClick={() => onDelete(lot)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
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

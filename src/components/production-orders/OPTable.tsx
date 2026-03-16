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
import { Pencil, Trash2, ClipboardCheck } from "lucide-react";
import {
  ProductionOrder,
  OP_STATUS_LABELS,
  OP_STATUS_COLORS,
  DEMAND_SOURCE_LABELS,
  PRIORITY_LABELS,
} from "@/hooks/useProductionOrders";
import { usePagination } from "@/hooks/usePagination";
import { PaginationControls } from "@/components/ui/pagination-controls";
import { cn } from "@/lib/utils";

interface OPTableProps {
  orders: ProductionOrder[];
  onEdit: (order: ProductionOrder) => void;
  onDelete: (order: ProductionOrder) => void;
  onConfirm?: (order: ProductionOrder) => void;
  canManage: boolean;
}

const PRIORITY_BADGE_COLORS: Record<number, string> = {
  1: "bg-red-500",
  2: "bg-orange-500",
  3: "bg-blue-500",
  4: "bg-gray-400",
  5: "bg-gray-300",
};

export function OPTable({ orders, onEdit, onDelete, onConfirm, canManage }: OPTableProps) {
  const pagination = usePagination(orders, { initialPageSize: 10 });

  return (
    <div className="space-y-4">
      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>OP</TableHead>
              <TableHead>SKU</TableHead>
              <TableHead>Qtd</TableHead>
              <TableHead>Prioridade</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Demanda</TableHead>
              <TableHead>Necessidade</TableHead>
              {canManage && <TableHead className="text-right">Ações</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {pagination.paginatedData.map((order) => (
              <TableRow key={order.id}>
                <TableCell>
                  <span className="font-mono text-sm text-blue-500 font-medium">
                    {order.title || order.id.slice(0, 8)}
                  </span>
                </TableCell>
                <TableCell>
                  <div className="space-y-0.5">
                    <span className="font-mono text-sm text-green-500 font-medium">
                      {order.sku_code}
                    </span>
                    <p className="text-xs text-muted-foreground">
                      {order.sku_name}
                    </p>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="space-y-0.5">
                    <span className="font-bold text-sm">
                      {order.planned_quantity}
                    </span>
                    {(order.good_quantity != null || order.rejected_quantity != null) && (
                      <p className="text-xs text-muted-foreground">
                        {order.good_quantity ?? 0} ok / {order.rejected_quantity ?? 0} rej
                      </p>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <Badge
                    variant="outline"
                    className={cn(
                      "text-white border-0 text-xs",
                      PRIORITY_BADGE_COLORS[order.priority] || "bg-gray-400"
                    )}
                  >
                    {PRIORITY_LABELS[order.priority] || `P${order.priority}`}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Badge
                    variant="outline"
                    className={cn(
                      "text-white border-0 text-xs",
                      OP_STATUS_COLORS[order.op_status]
                    )}
                  >
                    {OP_STATUS_LABELS[order.op_status]}
                  </Badge>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {DEMAND_SOURCE_LABELS[order.demand_source] || "—"}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {order.need_date
                    ? new Date(order.need_date).toLocaleDateString("pt-BR")
                    : "—"}
                </TableCell>
                {canManage && (
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      {order.op_status === "aguardando_confirmacao" && onConfirm && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-purple-500 hover:text-purple-600"
                          onClick={() => onConfirm(order)}
                          title="Confirmar Produção"
                        >
                          <ClipboardCheck className="h-4 w-4" />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => onEdit(order)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        onClick={() => onDelete(order)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                )}
              </TableRow>
            ))}
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

import React from "react";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ServiceOrder, DepartmentType, DEPARTMENT_INFO, DEPARTMENT_ORDER } from "@/types/os";
import { OSCard } from "./OSCard";

interface OSKanbanBoardProps {
  orders: ServiceOrder[];
  onOrderClick: (order: ServiceOrder) => void;
  onAddOrder?: (department: DepartmentType) => void;
  canAddOrder?: boolean;
  className?: string;
}

export function OSKanbanBoard({
  orders,
  onOrderClick,
  onAddOrder,
  canAddOrder = false,
  className,
}: OSKanbanBoardProps) {
  // Group orders by current department
  const ordersByDepartment = DEPARTMENT_ORDER.reduce((acc, dept) => {
    acc[dept] = orders.filter((o) => o.current_department === dept);
    return acc;
  }, {} as Record<DepartmentType, ServiceOrder[]>);

  return (
    <div className={cn("flex gap-4 overflow-x-auto pb-4", className)}>
      {DEPARTMENT_ORDER.map((dept) => {
        const info = DEPARTMENT_INFO[dept];
        const deptOrders = ordersByDepartment[dept];
        const activeCount = deptOrders.filter((o) => o.status === "active").length;

        return (
          <div
            key={dept}
            className="flex-shrink-0 w-80 bg-muted/30 rounded-xl border border-border"
          >
            {/* Column header */}
            <div
              className="sticky top-0 p-4 border-b border-border bg-background/80 backdrop-blur-sm rounded-t-xl"
              style={{ borderTopColor: info.color, borderTopWidth: 3 }}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xl">{info.icon}</span>
                  <h3 className="font-semibold text-board-text">{info.name}</h3>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="text-xs">
                    {deptOrders.length}
                  </Badge>
                  {activeCount > 0 && (
                    <Badge className="text-xs bg-success">
                      {activeCount} ativas
                    </Badge>
                  )}
                </div>
              </div>

              {/* Add button for managers */}
              {canAddOrder && dept === "venda" && (
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full mt-3"
                  onClick={() => onAddOrder?.(dept)}
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Nova OP
                </Button>
              )}
            </div>

            {/* Cards container */}
            <ScrollArea className="h-[calc(100vh-280px)]">
              <div className="p-3 space-y-3">
                {deptOrders.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground text-sm">
                    Nenhuma OP nesta etapa
                  </div>
                ) : (
                  deptOrders.map((order) => (
                    <OSCard
                      key={order.id}
                      order={order}
                      onClick={() => onOrderClick(order)}
                    />
                  ))
                )}
              </div>
            </ScrollArea>
          </div>
        );
      })}
    </div>
  );
}

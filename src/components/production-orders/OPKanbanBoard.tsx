import { useState } from "react";
import { DndContext, DragEndEvent, DragStartEvent, MouseSensor, TouchSensor, useSensor, useSensors } from "@dnd-kit/core";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { OPKanbanCard } from "./OPKanbanCard";
import type { ProductionOrder, OpStatus } from "@/hooks/useProductionOrders";
import { useUpdateProductionOrderOP } from "@/hooks/useProductionOrders";
import { DraggableCard, DroppableColumn, KanbanDragOverlay } from "@/components/kanban/KanbanDnd";

// ──────────────────────────────────────────────────────────────
// Stage grouping: map each op_status to a Kanban column
// ──────────────────────────────────────────────────────────────

interface OPKanbanColumn {
  id: string;
  label: string;
  emoji: string;
  color: string;
  statuses: OpStatus[];
}

export const OP_KANBAN_COLUMNS: OPKanbanColumn[] = [
  { id: "backlog",     label: "Backlog",      emoji: "📋", color: "#64748b", statuses: ["rascunho"] },
  { id: "planejada",   label: "Planejada",    emoji: "📅", color: "#3b82f6", statuses: ["planejada"] },
  { id: "materiais",   label: "Materiais",    emoji: "🔧", color: "#f59e0b", statuses: ["aguardando_separacao", "separada"] },
  { id: "liberada",    label: "Liberada",     emoji: "✅", color: "#6366f1", statuses: ["aguardando_liberacao", "liberada_producao"] },
  { id: "em_producao", label: "Em Produção",  emoji: "⚙️", color: "#8b5cf6", statuses: ["em_producao"] },
  { id: "qualidade",   label: "Qualidade",    emoji: "🔍", color: "#f97316", statuses: ["aguardando_confirmacao", "confirmada", "aguardando_qualidade"] },
  { id: "concluida",   label: "Concluída",    emoji: "📦", color: "#22c55e", statuses: ["liberada", "concluida"] },
  { id: "bloqueada",   label: "Bloqueada",    emoji: "🚫", color: "#ef4444", statuses: ["bloqueada", "cancelada"] },
];

// ──────────────────────────────────────────────────────────────

interface OPKanbanBoardProps {
  orders: ProductionOrder[];
  onAdvance?: (order: ProductionOrder) => void;
  onCardClick?: (order: ProductionOrder) => void;
}

export function OPKanbanBoard({ orders, onAdvance, onCardClick }: OPKanbanBoardProps) {
  const updateOP = useUpdateProductionOrderOP();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [optimisticMoves, setOptimisticMoves] = useState<Record<string, string>>({});

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } })
  );

  const ordersByColumn = OP_KANBAN_COLUMNS.reduce((acc, col) => {
    acc[col.id] = orders.filter((o) => {
      const pendingColId = optimisticMoves[o.id];
      return pendingColId ? pendingColId === col.id : col.statuses.includes(o.op_status);
    });
    return acc;
  }, {} as Record<string, ProductionOrder[]>);

  const activeOrder = activeId ? orders.find((o) => o.id === activeId) : null;

  function handleDragStart(event: DragStartEvent) {
    setActiveId(event.active.id as string);
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveId(null);
    if (!over) return;
    const order = active.data.current?.entity as ProductionOrder;
    const targetCol = OP_KANBAN_COLUMNS.find((c) => c.id === over.id);
    if (!order || !targetCol) return;
    const targetStatus = targetCol.statuses[0];
    const currentCol = OP_KANBAN_COLUMNS.find((c) => c.statuses.includes(order.op_status));
    if (currentCol?.id === targetCol.id) return;
    setOptimisticMoves((prev) => ({ ...prev, [order.id]: targetCol.id }));
    updateOP.mutate({ id: order.id, op_status: targetStatus }, {
      onSettled: () => setOptimisticMoves((prev) => { const n = { ...prev }; delete n[order.id]; return n; }),
    });
  }

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActiveId(null)}
    >
      <div className="flex gap-3 overflow-x-auto pb-4 min-h-[500px]">
        {OP_KANBAN_COLUMNS.map((col) => (
          <OPColumn
            key={col.id}
            column={col}
            orders={ordersByColumn[col.id] ?? []}
            onAdvance={onAdvance}
            onCardClick={onCardClick}
          />
        ))}
      </div>

      <KanbanDragOverlay>
        {activeOrder ? (
          <OPKanbanCard order={activeOrder} />
        ) : null}
      </KanbanDragOverlay>
    </DndContext>
  );
}

function OPColumn({
  column,
  orders,
  onAdvance,
  onCardClick,
}: {
  column: OPKanbanColumn;
  orders: ProductionOrder[];
  onAdvance?: (order: ProductionOrder) => void;
  onCardClick?: (order: ProductionOrder) => void;
}) {
  return (
    <div className="flex-shrink-0 w-64 bg-muted/30 rounded-xl border border-border">
      {/* Column header */}
      <div
        className="sticky top-0 p-3 border-b border-border bg-background/80 backdrop-blur-sm rounded-t-xl"
        style={{ borderTopColor: column.color, borderTopWidth: 3 }}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-base">{column.emoji}</span>
            <h3 className="font-semibold text-sm">{column.label}</h3>
          </div>
          <Badge variant="secondary" className="text-xs">
            {orders.length}
          </Badge>
        </div>
      </div>

      {/* Cards */}
      <ScrollArea className="h-[calc(100vh-320px)]">
        <DroppableColumn id={column.id}>
          <div className="p-2 space-y-2">
            {orders.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-8 italic">
                Nenhuma OP aqui
              </p>
            ) : (
              orders.map((order) => (
                <DraggableCard
                  key={order.id}
                  id={order.id}
                  data={{ entity: order }}
                >
                  <OPKanbanCard
                    order={order}
                    onAdvance={
                      column.id !== "concluida" && column.id !== "bloqueada"
                        ? onAdvance
                        : undefined
                    }
                    onClick={onCardClick}
                  />
                </DraggableCard>
              ))
            )}
          </div>
        </DroppableColumn>
      </ScrollArea>
    </div>
  );
}

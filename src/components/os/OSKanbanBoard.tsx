import { useState } from "react";
import { DndContext, DragEndEvent, DragStartEvent, MouseSensor, TouchSensor, useSensor, useSensors } from "@dnd-kit/core";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { OSCard } from "./OSCard";
import type { ServiceOrderCarboVAPT, OsStageConfig } from "@/types/os";
import { OS_KANBAN_STAGES } from "@/types/os";
import type { OsStage } from "@/types/os";
import { useSetOSStage } from "@/hooks/useServiceOrders";
import { DraggableCard, DroppableColumn, KanbanDragOverlay } from "@/components/kanban/KanbanDnd";

interface OSKanbanBoardProps {
  orders: ServiceOrderCarboVAPT[];
  onAdvance?: (order: ServiceOrderCarboVAPT) => void;
  onCancel?: (order: ServiceOrderCarboVAPT) => void;
  onCardClick?: (order: ServiceOrderCarboVAPT) => void;
}

export function OSKanbanBoard({
  orders,
  onAdvance,
  onCancel,
  onCardClick,
}: OSKanbanBoardProps) {
  const setOSStage = useSetOSStage();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [optimisticMoves, setOptimisticMoves] = useState<Record<string, OsStage>>({});

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } })
  );

  const ordersByStage = OS_KANBAN_STAGES.reduce((acc, stage) => {
    acc[stage.id] = orders.filter((o) => {
      const pendingStage = optimisticMoves[o.id];
      return pendingStage ? pendingStage === stage.id : o.os_stage === stage.id;
    });
    return acc;
  }, {} as Record<string, ServiceOrderCarboVAPT[]>);

  const activeOrder = activeId ? orders.find((o) => o.id === activeId) : null;

  function handleDragStart(event: DragStartEvent) {
    setActiveId(event.active.id as string);
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveId(null);
    if (!over) return;
    const order = active.data.current?.entity as ServiceOrderCarboVAPT;
    const toStage = over.id as OsStage;
    if (!order || order.os_stage === toStage) return;
    setOptimisticMoves((prev) => ({ ...prev, [order.id]: toStage }));
    setOSStage.mutate({ id: order.id, stage: toStage }, {
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
        {OS_KANBAN_STAGES.map((stage) => (
          <OSKanbanColumn
            key={stage.id}
            stage={stage}
            orders={ordersByStage[stage.id] ?? []}
            onAdvance={onAdvance}
            onCancel={onCancel}
            onCardClick={onCardClick}
          />
        ))}
      </div>

      <KanbanDragOverlay>
        {activeOrder ? (
          <OSCard order={activeOrder} />
        ) : null}
      </KanbanDragOverlay>
    </DndContext>
  );
}

function OSKanbanColumn({
  stage,
  orders,
  onAdvance,
  onCancel,
  onCardClick,
}: {
  stage: OsStageConfig;
  orders: ServiceOrderCarboVAPT[];
  onAdvance?: (order: ServiceOrderCarboVAPT) => void;
  onCancel?: (order: ServiceOrderCarboVAPT) => void;
  onCardClick?: (order: ServiceOrderCarboVAPT) => void;
}) {
  return (
    <div className="flex-shrink-0 w-72 bg-muted/30 rounded-xl border border-border">
      {/* Column header */}
      <div
        className="sticky top-0 p-3 border-b border-border bg-background/80 backdrop-blur-sm rounded-t-xl"
        style={{ borderTopColor: stage.color, borderTopWidth: 3 }}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-base">{stage.emoji}</span>
            <h3 className="font-semibold text-sm">{stage.label}</h3>
          </div>
          <Badge variant="secondary" className="text-xs">
            {orders.length}
          </Badge>
        </div>
      </div>

      {/* Cards */}
      <ScrollArea className="h-[calc(100vh-320px)]">
        <DroppableColumn id={stage.id}>
          <div className="p-2 space-y-2">
            {orders.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-8 italic">
                Nenhuma OS nesta etapa
              </p>
            ) : (
              orders.map((order) => (
                <DraggableCard
                  key={order.id}
                  id={order.id}
                  data={{ entity: order }}
                >
                  <OSCard
                    order={order}
                    onAdvance={onAdvance}
                    onCancel={onCancel}
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

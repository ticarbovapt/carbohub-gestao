import { useState, useEffect } from "react";
import { DndContext, DragEndEvent, DragStartEvent, MouseSensor, TouchSensor, useSensor, useSensors } from "@dnd-kit/core";
import { Shipment, ShipmentStatus, SHIPMENT_STATUS_CONFIG } from "@/types/shipment";
import { ShipmentCard } from "./ShipmentCard";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { DraggableCard, DroppableColumn, KanbanDragOverlay } from "@/components/kanban/KanbanDnd";

const KANBAN_COLUMNS: ShipmentStatus[] = [
  "separacao_pendente",
  "separando",
  "separado",
  "em_transporte",
  "entregue",
];

interface LogisticsKanbanProps {
  shipments: Shipment[];
  onAdvance: (id: string, nextStatus: ShipmentStatus) => void;
  onViewDetails: (shipment: Shipment) => void;
  onDragMove?: (id: string, toStatus: ShipmentStatus) => void;
}

export function LogisticsKanban({
  shipments,
  onAdvance,
  onViewDetails,
  onDragMove,
}: LogisticsKanbanProps) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [optimisticMoves, setOptimisticMoves] = useState<Record<string, ShipmentStatus>>({});

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } })
  );

  // Clear optimistic state only when server data confirms the move
  useEffect(() => {
    if (Object.keys(optimisticMoves).length === 0) return;
    setOptimisticMoves((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const [id, status] of Object.entries(prev)) {
        const s = shipments.find((sh) => sh.id === id);
        if (s && s.status === status) { delete next[id]; changed = true; }
      }
      return changed ? next : prev;
    });
  }, [shipments]); // eslint-disable-line react-hooks/exhaustive-deps

  const activeShipment = activeId ? shipments.find((s) => s.id === activeId) : null;

  function handleDragStart(event: DragStartEvent) {
    setActiveId(event.active.id as string);
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveId(null);
    if (!over) return;
    const shipment = active.data.current?.entity as Shipment;
    const toStatus = over.id as ShipmentStatus;
    if (!shipment || shipment.status === toStatus) return;
    setOptimisticMoves((prev) => ({ ...prev, [shipment.id]: toStatus }));
    onDragMove?.(shipment.id, toStatus);
  }

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActiveId(null)}
    >
      <ScrollArea className="w-full">
        <div className="flex gap-4 pb-4 min-w-[900px]">
          {KANBAN_COLUMNS.map((status) => {
            const config = SHIPMENT_STATUS_CONFIG[status];
            const items = shipments.filter((s) => (optimisticMoves[s.id] ?? s.status) === status);

            return (
              <div
                key={status}
                className="flex-1 min-w-[220px] bg-muted/40 rounded-xl p-3 space-y-3"
              >
                {/* Column header */}
                <div className="flex items-center gap-2 px-1">
                  <span className="text-base">{config.icon}</span>
                  <h3 className="text-sm font-semibold text-foreground">
                    {config.label}
                  </h3>
                  <span className="ml-auto text-xs font-medium bg-muted rounded-full px-2 py-0.5 text-muted-foreground">
                    {items.length}
                  </span>
                </div>

                {/* Cards */}
                <DroppableColumn id={status}>
                  <div className="space-y-2 p-1">
                    {items.length === 0 ? (
                      <p className="text-xs text-muted-foreground text-center py-6">
                        Nenhum envio
                      </p>
                    ) : (
                      items.map((shipment) => (
                        <DraggableCard
                          key={shipment.id}
                          id={shipment.id}
                          data={{ entity: shipment }}
                        >
                          <ShipmentCard
                            shipment={shipment}
                            onAdvance={onAdvance}
                            onViewDetails={onViewDetails}
                          />
                        </DraggableCard>
                      ))
                    )}
                  </div>
                </DroppableColumn>
              </div>
            );
          })}
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>

      <KanbanDragOverlay>
        {activeShipment ? (
          <ShipmentCard
            shipment={activeShipment}
            onAdvance={() => {}}
            onViewDetails={() => {}}
          />
        ) : null}
      </KanbanDragOverlay>
    </DndContext>
  );
}

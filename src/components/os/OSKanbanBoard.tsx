import React from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { OSCard } from "./OSCard";
import type { ServiceOrderCarboVAPT, OsStageConfig } from "@/types/os";
import { OS_KANBAN_STAGES } from "@/types/os";

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
  // Group orders by os_stage
  const ordersByStage = OS_KANBAN_STAGES.reduce((acc, stage) => {
    acc[stage.id] = orders.filter((o) => o.os_stage === stage.id);
    return acc;
  }, {} as Record<string, ServiceOrderCarboVAPT[]>);

  return (
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
        <div className="p-2 space-y-2">
          {orders.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-8 italic">
              Nenhuma OS nesta etapa
            </p>
          ) : (
            orders.map((order) => (
              <OSCard
                key={order.id}
                order={order}
                onAdvance={onAdvance}
                onCancel={onCancel}
                onClick={onCardClick}
              />
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

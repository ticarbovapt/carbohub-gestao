import { useState } from "react";
import { DndContext, DragEndEvent, DragStartEvent, MouseSensor, TouchSensor, useSensor, useSensors } from "@dnd-kit/core";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { CRMLeadCard } from "./CRMLeadCard";
import type { CRMLead, FunnelType, StageConfig } from "@/types/crm";
import { getStagesForFunnel } from "@/types/crm";
import { DraggableCard, DroppableColumn, KanbanDragOverlay } from "@/components/kanban/KanbanDnd";

interface CRMKanbanBoardProps {
  leads: CRMLead[];
  funnelType: FunnelType;
  onAdvance?: (lead: CRMLead) => void;
  onMarkLost?: (lead: CRMLead) => void;
  onLeadClick?: (lead: CRMLead) => void;
  onDragMove?: (lead: CRMLead, toStage: string) => void;
}

export function CRMKanbanBoard({ leads, funnelType, onAdvance, onMarkLost, onLeadClick, onDragMove }: CRMKanbanBoardProps) {
  const stages = getStagesForFunnel(funnelType);
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } })
  );

  const leadsByStage = stages.reduce((acc, stage) => {
    acc[stage.id] = leads.filter((l) => l.stage === stage.id);
    return acc;
  }, {} as Record<string, CRMLead[]>);

  const activeLead = activeId ? leads.find((l) => l.id === activeId) : null;

  function handleDragStart(event: DragStartEvent) {
    setActiveId(event.active.id as string);
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveId(null);
    if (!over) return;
    const lead = active.data.current?.entity as CRMLead;
    const toStage = over.id as string;
    if (!lead || lead.stage === toStage) return;
    onDragMove?.(lead, toStage);
  }

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActiveId(null)}
    >
      <div className="flex gap-3 overflow-x-auto pb-4">
        {stages.map((stage) => {
          const stageLeads = leadsByStage[stage.id] || [];

          return (
            <KanbanColumn
              key={stage.id}
              stage={stage}
              leads={stageLeads}
              funnelType={funnelType}
              onAdvance={onAdvance}
              onMarkLost={onMarkLost}
              onLeadClick={onLeadClick}
            />
          );
        })}
      </div>

      <KanbanDragOverlay>
        {activeLead ? (
          <CRMLeadCard
            lead={activeLead}
            funnelType={funnelType}
          />
        ) : null}
      </KanbanDragOverlay>
    </DndContext>
  );
}

function KanbanColumn({
  stage,
  leads,
  funnelType,
  onAdvance,
  onMarkLost,
  onLeadClick,
}: {
  stage: StageConfig;
  leads: CRMLead[];
  funnelType: FunnelType;
  onAdvance?: (lead: CRMLead) => void;
  onMarkLost?: (lead: CRMLead) => void;
  onLeadClick?: (lead: CRMLead) => void;
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
            <span className="text-lg">{stage.icon}</span>
            <h3 className="font-semibold text-sm">{stage.label}</h3>
          </div>
          <Badge variant="secondary" className="text-xs">
            {leads.length}
          </Badge>
        </div>
      </div>

      {/* Cards */}
      <ScrollArea className="h-[calc(100vh-320px)]">
        <DroppableColumn id={stage.id}>
          <div className="p-2 space-y-2">
            {leads.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-8">Nenhum lead</p>
            ) : (
              leads.map((lead) => (
                <DraggableCard
                  key={lead.id}
                  id={lead.id}
                  data={{ entity: lead }}
                >
                  <CRMLeadCard
                    lead={lead}
                    funnelType={funnelType}
                    onAdvance={onAdvance}
                    onMarkLost={onMarkLost}
                    onClick={onLeadClick}
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

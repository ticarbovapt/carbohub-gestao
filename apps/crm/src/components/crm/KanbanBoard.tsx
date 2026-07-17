import { useState, useEffect } from "react";
import { DndContext, DragEndEvent, DragStartEvent, MouseSensor, TouchSensor, useSensor, useSensors } from "@dnd-kit/core";
import { Badge } from "@/components/ui/badge";
import { Plus } from "lucide-react";
import { LeadCard, type LeadOwner } from "./LeadCard";
import type { CRMLead, FunnelType, StageConfig } from "@/types/crm";
import { getStagesForFunnel } from "@/types/crm";
import { DraggableCard, DroppableColumn, KanbanDragOverlay } from "@/components/kanban/KanbanDnd";

interface KanbanBoardProps {
  leads: CRMLead[];
  funnelType: FunnelType;
  onAdvance?: (lead: CRMLead) => void;
  onMarkLost?: (lead: CRMLead) => void;
  onLeadClick?: (lead: CRMLead) => void;
  onDragMove?: (lead: CRMLead, toStage: string) => void;
  onAddLead?: (stageId: string) => void;
  ownersById?: Record<string, LeadOwner>;
}

const leadOwnerId = (l: CRMLead) => ((l as { assigned_to?: string | null; created_by?: string | null }).assigned_to
  ?? (l as { created_by?: string | null }).created_by ?? "");

export function KanbanBoard({ leads, funnelType, onAdvance, onMarkLost, onLeadClick, onDragMove, onAddLead, ownersById }: KanbanBoardProps) {
  const stages = getStagesForFunnel(funnelType);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [optimisticMoves, setOptimisticMoves] = useState<Record<string, string>>({});

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } })
  );

  const leadsByStage = stages.reduce((acc, stage) => {
    acc[stage.id] = leads.filter((l) => {
      const pending = optimisticMoves[l.id];
      return pending ? pending === stage.id : l.stage === stage.id;
    });
    return acc;
  }, {} as Record<string, CRMLead[]>);

  useEffect(() => {
    if (Object.keys(optimisticMoves).length === 0) return;
    setOptimisticMoves((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const [id, stage] of Object.entries(prev)) {
        const lead = leads.find((l) => l.id === id);
        if (lead && lead.stage === stage) { delete next[id]; changed = true; }
      }
      return changed ? next : prev;
    });
  }, [leads]); // eslint-disable-line react-hooks/exhaustive-deps

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
    setOptimisticMoves((prev) => ({ ...prev, [lead.id]: toStage }));
    onDragMove?.(lead, toStage);
  }

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActiveId(null)}
      autoScroll={{ threshold: { x: 0.2, y: 0.2 }, acceleration: 18 }}
    >
      <div className="flex gap-3 overflow-x-auto pb-4">
        {stages.map((stage) => (
          <KanbanColumn
            key={stage.id}
            stage={stage}
            leads={leadsByStage[stage.id] || []}
            funnelType={funnelType}
            onAdvance={onAdvance}
            onMarkLost={onMarkLost}
            onLeadClick={onLeadClick}
            onAddLead={onAddLead}
            ownersById={ownersById}
          />
        ))}
      </div>

      <KanbanDragOverlay>
        {activeLead ? (
          <LeadCard lead={activeLead} funnelType={funnelType} />
        ) : null}
      </KanbanDragOverlay>
    </DndContext>
  );
}

function KanbanColumn({
  stage, leads, funnelType, onAdvance, onMarkLost, onLeadClick, onAddLead, ownersById,
}: {
  stage: StageConfig;
  leads: CRMLead[];
  funnelType: FunnelType;
  onAdvance?: (lead: CRMLead) => void;
  onMarkLost?: (lead: CRMLead) => void;
  onLeadClick?: (lead: CRMLead) => void;
  onAddLead?: (stageId: string) => void;
  ownersById?: Record<string, LeadOwner>;
}) {
  const totalValor = leads.reduce((s, l) => s + (Number(l.estimated_revenue) || 0), 0);
  const fmtK = (v: number) => v >= 1000 ? `R$ ${(v / 1000).toFixed(v % 1000 === 0 ? 0 : 1)}k` : `R$ ${v}`;
  return (
    <div className="flex-shrink-0 w-72 bg-muted/30 rounded-xl border border-border flex flex-col h-[calc(100vh-260px)]">
      {/* Column header */}
      <div
        className="sticky top-0 p-3 border-b border-border bg-background/80 backdrop-blur-sm rounded-t-xl"
        style={{ borderTopColor: stage.color, borderTopWidth: 3 }}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-base">{stage.icon}</span>
            <h3 className="font-semibold text-sm">{stage.label}</h3>
          </div>
          <div className="flex items-center gap-1">
            <Badge variant="secondary" className="text-xs">{leads.length}</Badge>
            {onAddLead && (
              <button onClick={() => onAddLead(stage.id)} className="h-6 w-6 inline-flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors" title="Adicionar lead aqui">
                <Plus className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
        <p className="text-[11px] text-muted-foreground mt-1 tabular-nums min-h-[14px]">
          {totalValor > 0 ? `${fmtK(totalValor)} em pipeline` : " "}
        </p>
      </div>

      {/* Cards */}
      <div className="flex-1 overflow-y-auto">
        <DroppableColumn id={stage.id}>
          <div className="p-2 space-y-2">
            {leads.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-8">Nenhum lead</p>
            ) : (
              leads.map((lead) => (
                <DraggableCard key={lead.id} id={lead.id} data={{ entity: lead }}>
                  <LeadCard
                    lead={lead}
                    funnelType={funnelType}
                    owner={ownersById?.[leadOwnerId(lead)]}
                    onAdvance={onAdvance}
                    onMarkLost={onMarkLost}
                    onClick={onLeadClick}
                  />
                </DraggableCard>
              ))
            )}
          </div>
        </DroppableColumn>
      </div>
    </div>
  );
}

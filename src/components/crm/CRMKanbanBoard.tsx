import React from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { CRMLeadCard } from "./CRMLeadCard";
import type { CRMLead, FunnelType, StageConfig } from "@/types/crm";
import { getStagesForFunnel } from "@/types/crm";

interface CRMKanbanBoardProps {
  leads: CRMLead[];
  funnelType: FunnelType;
  onAdvance?: (lead: CRMLead) => void;
  onMarkLost?: (lead: CRMLead) => void;
  onLeadClick?: (lead: CRMLead) => void;
}

export function CRMKanbanBoard({ leads, funnelType, onAdvance, onMarkLost, onLeadClick }: CRMKanbanBoardProps) {
  const stages = getStagesForFunnel(funnelType);

  // Group leads by stage
  const leadsByStage = stages.reduce((acc, stage) => {
    acc[stage.id] = leads.filter((l) => l.stage === stage.id);
    return acc;
  }, {} as Record<string, CRMLead[]>);

  return (
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
        <div className="p-2 space-y-2">
          {leads.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-8">Nenhum lead</p>
          ) : (
            leads.map((lead) => (
              <CRMLeadCard
                key={lead.id}
                lead={lead}
                funnelType={funnelType}
                onAdvance={onAdvance}
                onMarkLost={onMarkLost}
                onClick={onLeadClick}
              />
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

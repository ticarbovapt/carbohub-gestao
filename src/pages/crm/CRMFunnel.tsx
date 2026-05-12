import React, { useState } from "react";
import { useParams } from "react-router-dom";
import { BoardLayout } from "@/components/layouts/BoardLayout";
import { CarboPageHeader } from "@/components/ui/carbo-page-header";
import { CarboKPI } from "@/components/ui/carbo-kpi";
import { CarboButton } from "@/components/ui/carbo-button";
import { CarboCard, CarboCardContent } from "@/components/ui/carbo-card";
import { CarboSearchInput } from "@/components/ui/carbo-input";
import { CarboSkeleton } from "@/components/ui/CarboSkeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Users, TrendingUp, AlertTriangle, Flame, LayoutGrid, List } from "lucide-react";
import { useCRMLeads, useCRMStats, useAdvanceLeadStage, useMarkLeadLost } from "@/hooks/useCRMLeads";
import { CRMKanbanBoard } from "@/components/crm/CRMKanbanBoard";
import { CRMLeadForm } from "@/components/crm/CRMLeadForm";
import { CRMLeadDrawer } from "@/components/crm/CRMLeadDrawer";
import { FUNNEL_CONFIG, getStagesForFunnel, getNextStage, LOSS_REASONS } from "@/types/crm";
import type { FunnelType, CRMLead } from "@/types/crm";
import { Button } from "@/components/ui/button";

export default function CRMFunnel() {
  const { funnelType } = useParams<{ funnelType: string }>();
  const ft = (funnelType || "f4") as FunnelType;
  const config = FUNNEL_CONFIG[ft];

  const [searchQuery, setSearchQuery] = useState("");
  const [stageFilter, setStageFilter] = useState("all");
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [lostDialogLead, setLostDialogLead] = useState<CRMLead | null>(null);
  const [drawerLead, setDrawerLead] = useState<CRMLead | null>(null);
  const [viewMode, setViewMode] = useState<"kanban" | "list">("kanban");

  const { data: leads = [], isLoading } = useCRMLeads(ft);
  const { data: stats } = useCRMStats(ft);
  const advanceLead = useAdvanceLeadStage();
  const markLost = useMarkLeadLost();
  const stages = getStagesForFunnel(ft);

  // Filter leads
  const filteredLeads = leads.filter((lead) => {
    if (stageFilter !== "all" && lead.stage !== stageFilter) return false;
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      (lead.contact_name || "").toLowerCase().includes(q) ||
      (lead.legal_name || "").toLowerCase().includes(q) ||
      (lead.trade_name || "").toLowerCase().includes(q) ||
      (lead.city || "").toLowerCase().includes(q) ||
      (lead.cnpj || "").includes(q)
    );
  });

  const handleAdvance = (lead: CRMLead) => {
    const next = getNextStage(ft, lead.stage);
    if (next) {
      advanceLead.mutate({ id: lead.id, newStage: next, funnelType: ft });
    }
  };

  const handleDragMove = (lead: CRMLead, toStage: string) => {
    advanceLead.mutate({ id: lead.id, newStage: toStage, funnelType: ft, currentStage: lead.stage });
  };

  const handleMarkLost = (lead: CRMLead) => {
    setLostDialogLead(lead);
  };

  const confirmLost = (reason: string) => {
    if (lostDialogLead) {
      markLost.mutate({ id: lostDialogLead.id, reason, funnelType: ft });
      setLostDialogLead(null);
    }
  };

  if (!config) {
    return (
      <BoardLayout>
        <div className="p-8 text-center text-muted-foreground">Funil não encontrado</div>
      </BoardLayout>
    );
  }

  return (
    <BoardLayout>
      <div className="space-y-4">
        <CarboPageHeader
          title={config.name}
          description={config.description}
          icon={Users}
          actions={
            <CarboButton onClick={() => setIsFormOpen(true)}>
              <Plus className="h-4 w-4 mr-1" />
              Novo Lead
            </CarboButton>
          }
        />

        {/* KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <CarboKPI title="Total Leads" value={stats?.total || 0} icon={Users} iconColor="blue" loading={!stats} />
          <CarboKPI title="Quentes" value={stats?.hot || 0} icon={Flame} iconColor="warning" loading={!stats} />
          <CarboKPI title="Sem Atividade >3d" value={stats?.stale || 0} icon={AlertTriangle} iconColor="warning" loading={!stats} />
          <CarboKPI title="Pipeline (R$)" value={new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(stats?.totalRevenue || 0)} icon={TrendingUp} iconColor="green" loading={!stats} />
          <CarboKPI title="Média Tentativas" value={stats?.avgAttempts || 0} icon={Users} iconColor="blue" loading={!stats} />
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex-1 max-w-sm">
            <CarboSearchInput
              placeholder="Buscar por nome, CNPJ, cidade..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <Select value={stageFilter} onValueChange={setStageFilter}>
            <SelectTrigger className="w-44 h-9 text-xs">
              <SelectValue placeholder="Estágio" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos Estágios</SelectItem>
              {stages.map((s) => (
                <SelectItem key={s.id} value={s.id}>{s.icon} {s.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex gap-1 border rounded-lg p-0.5">
            <Button variant={viewMode === "kanban" ? "default" : "ghost"} size="sm" className="h-7" onClick={() => setViewMode("kanban")}>
              <LayoutGrid className="h-3 w-3" />
            </Button>
            <Button variant={viewMode === "list" ? "default" : "ghost"} size="sm" className="h-7" onClick={() => setViewMode("list")}>
              <List className="h-3 w-3" />
            </Button>
          </div>
          <span className="ml-auto text-xs text-muted-foreground">
            {filteredLeads.length} leads
          </span>
        </div>

        {/* Content */}
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (<CarboSkeleton key={i} className="h-20 w-full" />))}
          </div>
        ) : viewMode === "kanban" ? (
          <CRMKanbanBoard
            leads={filteredLeads}
            funnelType={ft}
            onAdvance={handleAdvance}
            onMarkLost={handleMarkLost}
            onLeadClick={(lead) => setDrawerLead(lead)}
            onDragMove={handleDragMove}
          />
        ) : (
          <CarboCard>
            <CarboCardContent className="p-0">
              <div className="divide-y">
                {filteredLeads.map((lead) => (
                  <div key={lead.id} className="flex items-center justify-between p-3 hover:bg-muted/50">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{lead.trade_name || lead.legal_name || lead.contact_name}</p>
                      <p className="text-xs text-muted-foreground">{lead.city} · {lead.contact_phone}</p>
                    </div>
                    <div className="flex items-center gap-2 cursor-pointer" onClick={() => setDrawerLead(lead)}>
                      <span className="text-xs px-2 py-0.5 rounded-full" style={{ backgroundColor: stages.find((s) => s.id === lead.stage)?.color + "20", color: stages.find((s) => s.id === lead.stage)?.color }}>
                        {stages.find((s) => s.id === lead.stage)?.label}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </CarboCardContent>
          </CarboCard>
        )}
      </div>

      {/* New Lead Form */}
      <CRMLeadForm funnelType={ft} open={isFormOpen} onOpenChange={setIsFormOpen} />

      {/* Lead Detail Drawer */}
      <CRMLeadDrawer
        lead={drawerLead}
        funnelType={ft}
        open={!!drawerLead}
        onOpenChange={(open) => { if (!open) setDrawerLead(null); }}
      />
    </BoardLayout>
  );
}

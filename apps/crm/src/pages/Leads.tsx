import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Boxes, Plus, LogOut, Filter, ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { KanbanBoard } from "@/components/crm/KanbanBoard";
import { LeadForm } from "@/components/crm/LeadForm";
import { LeadDrawer } from "@/components/crm/LeadDrawer";
import { useAuth } from "@/contexts/AuthContext";
import { useCRMLeads, useAdvanceLeadStage } from "@/hooks/useCRMLeads";
import { can } from "@/lib/access";
import type { CRMLead, FunnelType } from "@/types/crm";
import { FUNNEL_CONFIG, getNextStage } from "@/types/crm";

const FUNNELS: FunnelType[] = ["f1", "f2", "f3", "f4", "f5", "f6", "f7", "f8", "f9"];

export default function Leads() {
  const { level, isGestor, signOut } = useAuth();
  const navigate = useNavigate();

  const [funnel, setFunnel] = useState<FunnelType>("f1");
  const [showForm, setShowForm] = useState(false);
  const [selectedLead, setSelectedLead] = useState<CRMLead | null>(null);

  const { data: leads = [], isLoading } = useCRMLeads(funnel);
  const advance = useAdvanceLeadStage();

  function handleAdvance(lead: CRMLead) {
    const next = getNextStage(funnel, lead.stage);
    if (!next) return;
    advance.mutate({ id: lead.id, newStage: next, funnelType: funnel, currentStage: lead.stage });
  }

  const funnelCfg = FUNNEL_CONFIG[funnel];
  const canFilter = can(level, "filtrar_por_vendedor");

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      {/* Header */}
      <header className="border-b flex-shrink-0">
        <div className="px-4 h-14 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Boxes className="h-5 w-5 text-carbo-green" />
            <span className="font-bold">Carbo CRM</span>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" onClick={() => navigate("/")}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            {canFilter && (
              <Button variant="ghost" size="sm">
                <Filter className="h-4 w-4 mr-1" /> Filtrar
              </Button>
            )}
            <Button size="sm" onClick={() => setShowForm(true)}>
              <Plus className="h-4 w-4 mr-1" /> Novo lead
            </Button>
            <Button variant="ghost" size="sm" onClick={signOut}>
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      {/* Funnel tabs */}
      <div className="border-b flex-shrink-0 bg-muted/30">
        <div className="flex overflow-x-auto px-4 gap-1 py-1.5 scrollbar-hide">
          {FUNNELS.map((f) => {
            const cfg = FUNNEL_CONFIG[f];
            const active = f === funnel;
            return (
              <button
                key={f}
                onClick={() => setFunnel(f)}
                className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  active
                    ? "bg-background border shadow-sm text-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-background/60"
                }`}
              >
                <span>{cfg.icon}</span>
                <span>{cfg.shortName}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Funnel info */}
      <div className="px-4 pt-3 pb-2 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-semibold text-sm">{funnelCfg.name}</h1>
            <p className="text-xs text-muted-foreground">
              {funnelCfg.description}
              {isGestor
                ? ` · ${leads.length} leads (visão global)`
                : ` · ${leads.length} leads (seus)`}
            </p>
          </div>
        </div>
      </div>

      {/* Kanban */}
      <main className="flex-1 overflow-hidden px-4 pb-4">
        {isLoading ? (
          <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">
            Carregando leads…
          </div>
        ) : (
          <KanbanBoard
            leads={leads}
            funnelType={funnel}
            onAdvance={handleAdvance}
            onMarkLost={(lead) => setSelectedLead(lead)}
            onLeadClick={(lead) => setSelectedLead(lead)}
            onDragMove={(lead, toStage) =>
              advance.mutate({ id: lead.id, newStage: toStage, funnelType: funnel, currentStage: lead.stage })
            }
          />
        )}
      </main>

      {/* Modals */}
      {showForm && (
        <LeadForm funnelType={funnel} onClose={() => setShowForm(false)} />
      )}
      {selectedLead && (
        <LeadDrawer
          lead={selectedLead}
          funnelType={funnel}
          onClose={() => setSelectedLead(null)}
        />
      )}
    </div>
  );
}

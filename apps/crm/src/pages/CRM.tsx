import { useState } from "react";
import { Plus, Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { KanbanBoard } from "@/components/crm/KanbanBoard";
import { LeadForm } from "@/components/crm/LeadForm";
import { LeadDrawer } from "@/components/crm/LeadDrawer";
import { useAuth } from "@/contexts/AuthContext";
import { useCRMLeads, useAdvanceLeadStage } from "@/hooks/useCRMLeads";
import type { CRMLead, FunnelType } from "@/types/crm";
import { FUNNEL_CONFIG, getNextStage } from "@/types/crm";

// Os "funis" de hoje viram TIPOS DE LEAD de um kanban único: cadastra-se o lead
// escolhendo o tipo, e aqui filtramos por tipo. (Visual; a unificação real do
// pipeline é lógica — fica pra fase seguinte.)
const TIPOS: FunnelType[] = ["f1", "f2", "f3", "f4", "f5", "f6", "f7", "f8"];

export default function CRM() {
  const { isGestor } = useAuth();
  const [tipo, setTipo] = useState<FunnelType>("f1");
  const [showForm, setShowForm] = useState(false);
  const [selectedLead, setSelectedLead] = useState<CRMLead | null>(null);

  const { data: leads = [], isLoading } = useCRMLeads(tipo);
  const advance = useAdvanceLeadStage();
  const cfg = FUNNEL_CONFIG[tipo];

  function handleAdvance(lead: CRMLead) {
    const next = getNextStage(tipo, lead.stage);
    if (!next) return;
    advance.mutate({ id: lead.id, newStage: next, funnelType: tipo, currentStage: lead.stage });
  }

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Cabeçalho da tela + filtro por TIPO de lead */}
      <div className="px-4 pt-4 pb-2 flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="font-semibold">CRM — Funil</h1>
          <p className="text-xs text-muted-foreground">
            {cfg.description} · {leads.length} leads {isGestor ? "(visão global)" : "(seus)"}
          </p>
        </div>
        <Button size="sm" onClick={() => setShowForm(true)}>
          <Plus className="h-4 w-4 mr-1" /> Novo lead
        </Button>
      </div>

      {/* Filtro por tipo de lead (ex.: B2C, PDV...) */}
      <div className="border-b bg-muted/30">
        <div className="flex items-center gap-2 px-4 py-1.5 overflow-x-auto scrollbar-hide">
          <span className="flex items-center gap-1 text-xs text-muted-foreground shrink-0">
            <Filter className="h-3.5 w-3.5" /> Tipo:
          </span>
          {TIPOS.map((t) => {
            const c = FUNNEL_CONFIG[t];
            const active = t === tipo;
            return (
              <button key={t} onClick={() => setTipo(t)}
                className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  active ? "bg-background border shadow-sm text-foreground"
                         : "text-muted-foreground hover:text-foreground hover:bg-background/60"}`}>
                <span>{c.icon}</span><span>{c.shortName}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Kanban */}
      <main className="flex-1 overflow-hidden px-4 py-4">
        {isLoading ? (
          <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">Carregando leads…</div>
        ) : (
          <KanbanBoard
            leads={leads}
            funnelType={tipo}
            onAdvance={handleAdvance}
            onMarkLost={(lead) => setSelectedLead(lead)}
            onLeadClick={(lead) => setSelectedLead(lead)}
            onDragMove={(lead, toStage) =>
              advance.mutate({ id: lead.id, newStage: toStage, funnelType: tipo, currentStage: lead.stage })}
          />
        )}
      </main>

      {showForm && <LeadForm funnelType={tipo} onClose={() => setShowForm(false)} />}
      {selectedLead && (
        <LeadDrawer lead={selectedLead} funnelType={tipo} onClose={() => setSelectedLead(null)} />
      )}
    </div>
  );
}

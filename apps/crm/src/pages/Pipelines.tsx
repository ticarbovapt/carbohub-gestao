import { useState, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { CarboPageHeader } from "@/components/ui/carbo-page-header";
import { CarboKPI } from "@/components/ui/carbo-kpi";
import { CarboButton } from "@/components/ui/carbo-button";
import { CarboCard, CarboCardContent } from "@/components/ui/carbo-card";
import { CarboSearchInput } from "@/components/ui/carbo-input";
import { CarboSkeleton } from "@/components/ui/CarboSkeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Plus, Users, TrendingUp, AlertTriangle, Flame, LayoutGrid, List, KanbanSquare } from "lucide-react";
import { useCRMLeads, useAllCRMLeads, useCRMStats, useAdvanceLeadStage, useMarkLeadLost } from "@/hooks/useCRMLeads";
import { useVendedoresDir } from "@/hooks/useVendas";
import { useAuth } from "@/contexts/AuthContext";
import { KanbanBoard } from "@/components/crm/KanbanBoard";
import { LeadForm } from "@/components/crm/LeadForm";
import { LeadDrawer } from "@/components/crm/LeadDrawer";
import { FUNNEL_CONFIG, getStagesForFunnel, getNextStage, LOSS_REASONS } from "@/types/crm";
import type { FunnelType, CRMLead } from "@/types/crm";

const FUNNELS = Object.values(FUNNEL_CONFIG);

// Estágios normalizados para a visão "Todos" (funis têm estágios diferentes).
const NORMALIZED = [
  { id: "novo", label: "Novos", color: "#94A3B8", match: ["a_contatar"] },
  { id: "andamento", label: "Em andamento", color: "#F59E0B", match: ["tentativa_1", "tentativa_2", "contatado", "qualificado", "apresentacao", "diagnostico", "poc", "visita_agendada", "reagendar"] },
  { id: "negociacao", label: "Negociação / Proposta", color: "#3B82F6", match: ["em_negociacao", "proposta", "proposta_tecnica", "contrato", "pedido_inicial", "fechamento"] },
  { id: "ganho", label: "Ganhos", color: "#22C55E", match: ["convertido", "parceiro"] },
  { id: "perdido", label: "Perdidos", color: "#EF4444", match: ["sem_interesse", "descartado"] },
];
const normalizeStage = (stage: string) => NORMALIZED.find((n) => n.match.includes(stage))?.id ?? "andamento";

// ── Visão "Todos os funis": kanban read-only por estágio normalizado ───────
function tempColor(t?: string) {
  return t === "quente" ? "#ef4444" : t === "morno" ? "#f59e0b" : t === "frio" ? "#3b82f6" : "#94a3b8";
}

function AllFunnelsBoard({ leads, onLeadClick }: { leads: CRMLead[]; onLeadClick: (l: CRMLead) => void }) {
  const byCol = useMemo(() => {
    const map: Record<string, CRMLead[]> = {};
    for (const n of NORMALIZED) map[n.id] = [];
    for (const l of leads) (map[normalizeStage(l.stage)] ||= []).push(l);
    return map;
  }, [leads]);

  return (
    <div className="flex gap-3 overflow-x-auto pb-3 -mx-1 px-1">
      {NORMALIZED.map((col) => {
        const items = byCol[col.id] ?? [];
        return (
          <div key={col.id} className="w-[300px] shrink-0 rounded-2xl border border-border bg-board-surface/40 flex flex-col max-h-[calc(100vh-300px)]">
            {/* Header da coluna com faixa de cor */}
            <div className="rounded-t-2xl px-3 py-2.5 border-b border-border" style={{ background: col.color + "12" }}>
              <div className="flex items-center justify-between">
                <span className="inline-flex items-center gap-2 text-sm font-semibold">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: col.color }} /> {col.label}
                </span>
                <span className="text-xs font-bold tabular-nums rounded-full px-2 py-0.5" style={{ background: col.color + "20", color: col.color }}>{items.length}</span>
              </div>
            </div>
            {/* Cards */}
            <div className="flex-1 overflow-y-auto p-2 space-y-2">
              {items.map((lead) => {
                const cfg = FUNNEL_CONFIG[lead.funnel_type as FunnelType];
                const t = (lead as { temperature?: string }).temperature;
                return (
                  <button key={lead.id} onClick={() => onLeadClick(lead)}
                    className="w-full text-left rounded-xl border border-border bg-card p-3 hover:shadow-md hover:border-muted-foreground/30 transition-all relative overflow-hidden">
                    <div className="absolute left-0 top-0 bottom-0 w-1" style={{ background: cfg?.color ?? "#94A3B8" }} />
                    <div className="flex items-start justify-between gap-2 mb-1 pl-1.5">
                      <p className="font-semibold text-sm truncate leading-tight">{lead.trade_name || lead.legal_name || lead.contact_name || "Sem nome"}</p>
                      {t && <span className="shrink-0 h-2 w-2 rounded-full mt-1" style={{ background: tempColor(t) }} title={`Lead ${t}`} />}
                    </div>
                    <p className="text-xs text-muted-foreground truncate pl-1.5">{[lead.city, lead.contact_phone].filter(Boolean).join(" · ") || "—"}</p>
                    <span className="ml-1.5 inline-flex items-center gap-1 mt-2 text-[10px] font-medium rounded-full px-1.5 py-0.5" style={{ background: (cfg?.color ?? "#94A3B8") + "1a", color: cfg?.color ?? "#94A3B8" }}>
                      <span>{cfg?.icon}</span> {cfg?.shortName}
                    </span>
                  </button>
                );
              })}
              {items.length === 0 && (
                <div className="flex flex-col items-center justify-center gap-1 py-10 text-center">
                  <div className="h-8 w-8 rounded-full border-2 border-dashed border-muted-foreground/20" />
                  <p className="text-[11px] text-muted-foreground/50">Sem leads</p>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function Pipelines() {
  // Pipeline ÚNICA ativa: Vendas (f1 = jornada do cliente). Os demais funis ficam
  // ocultos por ora — escalamos pros outros depois.
  const funil = "f1" as FunnelType | "todos";

  const [searchQuery, setSearchQuery] = useState("");
  const [stageFilter, setStageFilter] = useState("all");
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [formStage, setFormStage] = useState<string | undefined>(undefined);
  const [lostDialogLead, setLostDialogLead] = useState<CRMLead | null>(null);
  const [lostReason, setLostReason] = useState<string>(LOSS_REASONS[0]);
  const [drawerLead, setDrawerLead] = useState<CRMLead | null>(null);
  const [viewMode, setViewMode] = useState<"kanban" | "list">("kanban");
  const [vendedorFilter, setVendedorFilter] = useState("all");
  const { isGestor } = useAuth();
  const { data: vendedoresDir = [] } = useVendedoresDir();

  const isAll = funil === "todos";
  const ft = (isAll ? "f1" : funil) as FunnelType;

  const { data: funnelLeads = [], isLoading: l1 } = useCRMLeads(ft);
  const { data: allLeads = [], isLoading: l2 } = useAllCRMLeads();
  const { data: stats } = useCRMStats(ft);
  const advanceLead = useAdvanceLeadStage();
  const markLost = useMarkLeadLost();
  const stages = getStagesForFunnel(ft);

  const baseLeads = isAll ? allLeads : funnelLeads;
  const isLoading = isAll ? l2 : l1;

  const filteredLeads = baseLeads.filter((lead) => {
    if (!isAll && stageFilter !== "all" && lead.stage !== stageFilter) return false;
    if (vendedorFilter !== "all") {
      const l = lead as { assigned_to?: string | null; created_by?: string | null };
      if (l.assigned_to !== vendedorFilter && l.created_by !== vendedorFilter) return false;
    }
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
    if (next) advanceLead.mutate({ id: lead.id, newStage: next, funnelType: ft, currentStage: lead.stage });
  };
  const handleDragMove = (lead: CRMLead, toStage: string) => {
    advanceLead.mutate({ id: lead.id, newStage: toStage, funnelType: ft, currentStage: lead.stage });
  };
  const confirmLost = () => {
    if (lostDialogLead) {
      markLost.mutate({ id: lostDialogLead.id, reason: lostReason, funnelType: lostDialogLead.funnel_type as FunnelType });
      setLostDialogLead(null);
    }
  };

  const allKpis = useMemo(() => {
    const now = Date.now(); const day3 = 3 * 24 * 60 * 60 * 1000;
    return {
      total: allLeads.length,
      hot: allLeads.filter((l) => (l as { temperature?: string }).temperature === "quente").length,
      stale: allLeads.filter((l) => now - new Date(l.updated_at).getTime() > day3).length,
    };
  }, [allLeads]);

  return (
    <div className="p-4 md:p-6">
      <div className="space-y-4">
        <CarboPageHeader
          title="Funil de Vendas"
          description="Jornada do cliente — do lead ao fechamento"
          icon={KanbanSquare}
          actions={<CarboButton onClick={() => { setFormStage(undefined); setIsFormOpen(true); }}><Plus className="h-4 w-4 mr-1" /> Novo Lead</CarboButton>}
        />

        {/* KPIs */}
        {isAll ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <CarboKPI title="Total Leads" value={allKpis.total} icon={Users} iconColor="blue" loading={l2} />
            <CarboKPI title="Quentes" value={allKpis.hot} icon={Flame} iconColor="warning" loading={l2} />
            <CarboKPI title="Sem Atividade >3d" value={allKpis.stale} icon={AlertTriangle} iconColor="warning" loading={l2} />
            <CarboKPI title="Funis" value={FUNNELS.length} icon={KanbanSquare} iconColor="green" />
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <CarboKPI title="Total Leads" value={stats?.total || 0} icon={Users} iconColor="blue" loading={!stats} />
            <CarboKPI title="Quentes" value={stats?.hot || 0} icon={Flame} iconColor="warning" loading={!stats} />
            <CarboKPI title="Sem Atividade >3d" value={stats?.stale || 0} icon={AlertTriangle} iconColor="warning" loading={!stats} />
            <CarboKPI title="Pipeline (R$)" value={new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(stats?.totalRevenue || 0)} icon={TrendingUp} iconColor="green" loading={!stats} />
            <CarboKPI title="Média Tentativas" value={stats?.avgAttempts || 0} icon={Users} iconColor="blue" loading={!stats} />
          </div>
        )}

        {/* Filtros */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex-1 max-w-sm">
            <CarboSearchInput placeholder="Buscar por nome, CNPJ, cidade..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
          </div>
          {!isAll && (
            <Select value={stageFilter} onValueChange={setStageFilter}>
              <SelectTrigger className="w-44 h-9 text-xs"><SelectValue placeholder="Estágio" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos Estágios</SelectItem>
                {stages.map((s) => <SelectItem key={s.id} value={s.id}>{s.icon} {s.label}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          {isGestor && (
            <Select value={vendedorFilter} onValueChange={setVendedorFilter}>
              <SelectTrigger className="w-48 h-9 text-xs"><span className="flex items-center gap-1.5"><Users className="h-3.5 w-3.5" /><SelectValue placeholder="Vendedor" /></span></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os vendedores</SelectItem>
                {vendedoresDir.map((v) => (
                  <SelectItem key={v.id} value={v.id}>
                    <span className="flex items-center gap-2">
                      {v.full_name || "—"}
                      {!v.is_vendedor && <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground border">Avulso</span>}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {!isAll && (
            <div className="flex gap-1 border rounded-lg p-0.5">
              <Button variant={viewMode === "kanban" ? "default" : "ghost"} size="sm" className="h-7" onClick={() => setViewMode("kanban")}><LayoutGrid className="h-3 w-3" /></Button>
              <Button variant={viewMode === "list" ? "default" : "ghost"} size="sm" className="h-7" onClick={() => setViewMode("list")}><List className="h-3 w-3" /></Button>
            </div>
          )}
          <span className="ml-auto text-xs text-muted-foreground">{filteredLeads.length} leads</span>
        </div>

        {/* Conteúdo */}
        {isLoading ? (
          <div className="space-y-3">{[1, 2, 3].map((i) => <CarboSkeleton key={i} className="h-20 w-full" />)}</div>
        ) : isAll ? (
          <AllFunnelsBoard leads={filteredLeads} onLeadClick={(lead) => setDrawerLead(lead)} />
        ) : viewMode === "kanban" ? (
          <KanbanBoard
            leads={filteredLeads}
            funnelType={ft}
            onAdvance={handleAdvance}
            onMarkLost={(lead) => { setLostReason(LOSS_REASONS[0]); setLostDialogLead(lead); }}
            onLeadClick={(lead) => setDrawerLead(lead)}
            onDragMove={handleDragMove}
            onAddLead={(stageId) => { setFormStage(stageId); setIsFormOpen(true); }}
          />
        ) : (
          <CarboCard>
            <CarboCardContent className="p-0">
              <div className="divide-y">
                {filteredLeads.map((lead) => {
                  const st = stages.find((s) => s.id === lead.stage);
                  return (
                    <div key={lead.id} className="flex items-center justify-between p-3 hover:bg-muted/50 cursor-pointer" onClick={() => setDrawerLead(lead)}>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">{lead.trade_name || lead.legal_name || lead.contact_name}</p>
                        <p className="text-xs text-muted-foreground">{lead.city} · {lead.contact_phone}</p>
                      </div>
                      <span className="text-xs px-2 py-0.5 rounded-full" style={{ backgroundColor: (st?.color ?? "#94A3B8") + "20", color: st?.color ?? "#94A3B8" }}>{st?.label}</span>
                    </div>
                  );
                })}
              </div>
            </CarboCardContent>
          </CarboCard>
        )}
      </div>

      {isFormOpen && !isAll && <LeadForm funnelType={ft} initialStage={formStage} onClose={() => setIsFormOpen(false)} />}
      {drawerLead && <LeadDrawer lead={drawerLead} funnelType={drawerLead.funnel_type as FunnelType} onClose={() => setDrawerLead(null)} />}

      <Dialog open={!!lostDialogLead} onOpenChange={(o) => { if (!o) setLostDialogLead(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Marcar lead como perdido</DialogTitle></DialogHeader>
          <div className="py-2 space-y-2">
            <p className="text-sm text-muted-foreground">Motivo da perda:</p>
            <Select value={lostReason} onValueChange={setLostReason}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{LOSS_REASONS.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLostDialogLead(null)}>Cancelar</Button>
            <Button variant="destructive" onClick={confirmLost}>Confirmar perda</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

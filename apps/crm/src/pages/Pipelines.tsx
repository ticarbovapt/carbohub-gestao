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
import { useCRMLeads, useAllCRMLeads, useCRMStats, useAdvanceLeadStage, useMarkLeadLost, useCRMLeadsRealtime } from "@/hooks/useCRMLeads";
import { useVendedoresDir } from "@/hooks/useVendas";
import { useAuth } from "@/contexts/AuthContext";
import { KanbanBoard } from "@/components/crm/KanbanBoard";
import { LeadCard, type LeadOwner } from "@/components/crm/LeadCard";
import { LeadForm } from "@/components/crm/LeadForm";
import { DealDetail } from "@/components/crm/DealDetail";
import { FUNNEL_CONFIG, getStagesForFunnel, getNextStage, LOSS_REASONS } from "@/types/crm";
import type { FunnelType, CRMLead } from "@/types/crm";
import { toast } from "sonner";
import { playMoveSuccess } from "@/lib/sfx";

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

// ── Visão "Todos os funis": mesmo card do pipeline + linha de origem ───────
const leadOwnerId = (l: CRMLead) =>
  (l as { assigned_to?: string | null; created_by?: string | null }).assigned_to ??
  (l as { created_by?: string | null }).created_by ?? "";

function AllFunnelsBoard({ leads, ownersById, onLeadClick, onAdvance, onMarkLost }: {
  leads: CRMLead[];
  ownersById: Record<string, LeadOwner>;
  onLeadClick: (l: CRMLead) => void;
  onAdvance: (l: CRMLead) => void;
  onMarkLost: (l: CRMLead) => void;
}) {
  const byCol = useMemo(() => {
    const map: Record<string, CRMLead[]> = {};
    for (const n of NORMALIZED) map[n.id] = [];
    for (const l of leads) (map[normalizeStage(l.stage)] ||= []).push(l);
    return map;
  }, [leads]);

  return (
    // Colunas se adaptam à largura da tela (5 estágios normalizados).
    <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
      {NORMALIZED.map((col) => {
        const items = byCol[col.id] ?? [];
        return (
          <div key={col.id} className="rounded-2xl border border-border bg-board-surface/40 flex flex-col min-h-[200px] max-h-[calc(100vh-280px)]">
            {/* Header da coluna com faixa de cor */}
            <div className="rounded-t-2xl px-3 py-2.5 border-b border-border" style={{ background: col.color + "12" }}>
              <div className="flex items-center justify-between">
                <span className="inline-flex items-center gap-2 text-sm font-semibold">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: col.color }} /> {col.label}
                </span>
                <span className="text-xs font-bold tabular-nums rounded-full px-2 py-0.5" style={{ background: col.color + "20", color: col.color }}>{items.length}</span>
              </div>
            </div>
            {/* Cards — idênticos aos do pipeline, com a linha de origem do funil */}
            <div className="flex-1 overflow-y-auto p-2 space-y-2">
              {items.map((lead) => {
                const cfg = FUNNEL_CONFIG[lead.funnel_type as FunnelType];
                return (
                  <LeadCard
                    key={lead.id}
                    lead={lead}
                    funnelType={lead.funnel_type as FunnelType}
                    owner={ownersById[leadOwnerId(lead)]}
                    originFunnel={cfg ? { icon: cfg.icon, name: cfg.shortName, color: cfg.color } : undefined}
                    onClick={onLeadClick}
                    onAdvance={onAdvance}
                    onMarkLost={onMarkLost}
                  />
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

const FUNNEL_IDS = FUNNELS.map((f) => f.id as string);

// Botão-aba de um funil, com contagem de leads (escopo já resolvido no query).
function FunnelTab({ active, onClick, icon, label, count, color, loading }: {
  active: boolean; onClick: () => void; icon?: string; label: string; count: number; color?: string; loading?: boolean;
}) {
  const accent = color ?? "#22C55E";
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group inline-flex items-center gap-2 rounded-lg border px-3 h-9 text-sm font-medium transition-colors ${
        active ? "text-foreground" : "border-border text-muted-foreground hover:bg-muted hover:text-foreground"
      }`}
      style={active ? { borderColor: accent, background: accent + "14" } : undefined}
    >
      {icon && <span className="text-[15px] leading-none">{icon}</span>}
      <span className="truncate max-w-[140px]">{label}</span>
      <span
        className={`ml-0.5 inline-flex min-w-[1.25rem] items-center justify-center rounded-full px-1.5 text-xs font-bold tabular-nums ${
          active ? "" : "bg-muted text-muted-foreground group-hover:bg-background"
        }`}
        style={active ? { background: accent + "26", color: accent } : undefined}
      >
        {loading ? "…" : count}
      </span>
    </button>
  );
}

export default function Pipelines() {
  // Funil ativo vem da URL (?funil=…): "todos" mostra o consolidado, ou um funil
  // específico (f1 = jornada do cliente, etc.). Default: f1.
  const [searchParams, setSearchParams] = useSearchParams();
  const funilParam = searchParams.get("funil");
  const funil = (funilParam === "todos" || (funilParam && FUNNEL_IDS.includes(funilParam))
    ? funilParam
    : "f1") as FunnelType | "todos";
  const setFunil = (v: string) => {
    setSearchParams((prev) => { prev.set("funil", v); return prev; }, { replace: true });
  };

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
  const ownersById = useMemo(
    () => Object.fromEntries(vendedoresDir.map((v) => [v.id, { id: v.id, name: v.full_name, avatar_url: v.avatar_url }])),
    [vendedoresDir],
  );

  const isAll = funil === "todos";
  const ft = (isAll ? "f1" : funil) as FunnelType;

  const { data: funnelLeads = [], isLoading: l1 } = useCRMLeads(ft);
  const { data: allLeads = [], isLoading: l2 } = useAllCRMLeads();
  const { data: stats } = useCRMStats(ft);
  useCRMLeadsRealtime(); // board ao vivo (ver os vendedores movimentando os cards)
  const advanceLead = useAdvanceLeadStage();
  const markLost = useMarkLeadLost();
  const stages = getStagesForFunnel(ft);

  const baseLeads = isAll ? allLeads : funnelLeads;
  const isLoading = isAll ? l2 : l1;

  // Dialog do negócio sempre lê o lead VIVO da lista (que já se atualiza via
  // invalidateQueries/realtime), em vez do snapshot tirado no clique — assim
  // uma edição (ex.: nome fantasia) aparece na hora, sem precisar de F5.
  const liveDrawerLead = drawerLead ? (baseLeads.find((l) => l.id === drawerLead.id) ?? drawerLead) : null;

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

  // Feedback do movimento disparado NO GESTO do usuário (clique/soltar) para o
  // som não esbarrar na autoplay policy e a confirmação ser instantânea. O toast
  // mostra ORIGEM → DESTINO para facilitar desfazer se mover errado. Em caso de
  // falha, o onError da mutation reverte e avisa.
  const notifyMove = (fromId: string, toId: string, funnel: FunnelType) => {
    playMoveSuccess();
    const stgs = getStagesForFunnel(funnel);
    const nameOf = (id: string) => stgs.find((s) => s.id === id)?.label ?? id;
    toast.success("Card movido", { description: `${nameOf(fromId)}  →  ${nameOf(toId)}` });
  };

  const handleAdvance = (lead: CRMLead) => {
    const next = getNextStage(ft, lead.stage);
    if (next) { advanceLead.mutate({ id: lead.id, newStage: next, funnelType: ft, currentStage: lead.stage }); notifyMove(lead.stage, next, ft); }
  };
  // Na visão "Todos", cada card avança no SEU próprio funil (não no `ft` ativo).
  const handleAdvanceAny = (lead: CRMLead) => {
    const lf = lead.funnel_type as FunnelType;
    const next = getNextStage(lf, lead.stage);
    if (next) { advanceLead.mutate({ id: lead.id, newStage: next, funnelType: lf, currentStage: lead.stage }); notifyMove(lead.stage, next, lf); }
  };
  const handleDragMove = (lead: CRMLead, toStage: string) => {
    advanceLead.mutate({ id: lead.id, newStage: toStage, funnelType: ft, currentStage: lead.stage });
    notifyMove(lead.stage, toStage, ft);
  };
  const confirmLost = () => {
    if (lostDialogLead) {
      markLost.mutate({ id: lostDialogLead.id, reason: lostReason, funnelType: lostDialogLead.funnel_type as FunnelType });
      setLostDialogLead(null);
    }
  };

  // Contagem de leads por funil (respeita o escopo: membro vê os seus, gestor vê todos).
  const countByFunnel = useMemo(() => {
    const m: Record<string, number> = {};
    for (const l of allLeads) m[l.funnel_type] = (m[l.funnel_type] ?? 0) + 1;
    return m;
  }, [allLeads]);

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
          title={isAll ? "Todos os funis" : (FUNNEL_CONFIG[ft]?.name ?? "Funil de Vendas")}
          description={isAll ? "Visão consolidada de todos os funis" : (FUNNEL_CONFIG[ft]?.description ?? "Jornada do cliente — do lead ao fechamento")}
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

        {/* Seletor de funil — botões, um por pipeline, com contagem de leads */}
        <div className="flex flex-wrap items-center gap-2">
          <FunnelTab active={isAll} onClick={() => setFunil("todos")} icon="🗂️" label="Todos" count={allLeads.length} loading={l2} />
          {FUNNELS.map((f) => (
            <FunnelTab key={f.id} active={funil === f.id} onClick={() => setFunil(f.id)}
              icon={f.icon} label={f.shortName} count={countByFunnel[f.id] ?? 0} color={f.color} loading={l2} />
          ))}
        </div>

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
          <AllFunnelsBoard
            leads={filteredLeads}
            ownersById={ownersById}
            onLeadClick={(lead) => setDrawerLead(lead)}
            onAdvance={handleAdvanceAny}
            onMarkLost={(lead) => { setLostReason(LOSS_REASONS[0]); setLostDialogLead(lead); }}
          />
        ) : viewMode === "kanban" ? (
          <KanbanBoard
            leads={filteredLeads}
            funnelType={ft}
            onAdvance={handleAdvance}
            onMarkLost={(lead) => { setLostReason(LOSS_REASONS[0]); setLostDialogLead(lead); }}
            onLeadClick={(lead) => setDrawerLead(lead)}
            onDragMove={handleDragMove}
            onAddLead={(stageId) => { setFormStage(stageId); setIsFormOpen(true); }}
            ownersById={ownersById}
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

      {isFormOpen && <LeadForm funnelType={ft} initialStage={isAll ? undefined : formStage} onClose={() => setIsFormOpen(false)} />}
      {liveDrawerLead && <DealDetail lead={liveDrawerLead} funnelType={liveDrawerLead.funnel_type as FunnelType} onClose={() => setDrawerLead(null)} />}

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

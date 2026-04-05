import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { BoardLayout } from "@/components/layouts/BoardLayout";
import { CarboPageHeader } from "@/components/ui/carbo-page-header";
import { CarboButton } from "@/components/ui/carbo-button";
import { CarboCard, CarboCardContent } from "@/components/ui/carbo-card";
import { CarboKPI } from "@/components/ui/carbo-kpi";
import { CarboBadge } from "@/components/ui/carbo-badge";
import { CarboSearchInput } from "@/components/ui/carbo-input";
import { CarboEmptyState } from "@/components/ui/carbo-empty-state";
import { CarboSkeleton } from "@/components/ui/CarboSkeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Users, Plus, RefreshCw, Building2, Phone, Mail, MapPin, ChevronRight,
  Target, TrendingUp, XCircle, Filter, ArrowRight,
} from "lucide-react";
import {
  useB2BLeads, useUpdateLeadStatus, useLeadStats,
  LEAD_STATUS_LABELS, LEAD_STATUS_COLORS,
  type LeadStatus, type B2BLead,
} from "@/hooks/useB2BLeads";

const PIPELINE_STAGES: LeadStatus[] = ["novo", "qualificado", "em_negociacao", "ganho", "perdido"];

const VERTICAL_LABELS: Record<string, string> = {
  posto: "Posto",
  oficina: "Oficina",
  frota: "Frota",
  locadora: "Locadora",
  concessionaria: "Concessionária",
  industria: "Indústria",
  agro: "Agro",
  transportadora: "Transportadora",
};

export default function B2BLeads() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<LeadStatus | "all">("all");
  const { data: leads = [], isLoading, refetch } = useB2BLeads(statusFilter);
  const { data: stats, isLoading: statsLoading } = useLeadStats();
  const updateStatus = useUpdateLeadStatus();

  const filteredLeads = useMemo(() => {
    if (!search) return leads;
    const s = search.toLowerCase();
    return leads.filter(
      (l) =>
        l.trade_name?.toLowerCase().includes(s) ||
        l.legal_name?.toLowerCase().includes(s) ||
        l.contact_name?.toLowerCase().includes(s) ||
        l.cnpj?.includes(s) ||
        l.city?.toLowerCase().includes(s)
    );
  }, [leads, search]);

  const leadsGrouped = useMemo(() => {
    const groups: Record<LeadStatus, B2BLead[]> = {
      novo: [], qualificado: [], em_negociacao: [], ganho: [], perdido: [],
    };
    for (const lead of filteredLeads) {
      groups[lead.status]?.push(lead);
    }
    return groups;
  }, [filteredLeads]);

  const handleMoveForward = (lead: B2BLead) => {
    const idx = PIPELINE_STAGES.indexOf(lead.status);
    if (idx < 3) {
      updateStatus.mutate({ id: lead.id, status: PIPELINE_STAGES[idx + 1] });
    }
  };

  const handleMarkLost = (lead: B2BLead) => {
    updateStatus.mutate({ id: lead.id, status: "perdido" });
  };

  const conversionRate = stats && stats.total > 0
    ? ((stats.ganho / stats.total) * 100).toFixed(1)
    : "0";

  return (
    <BoardLayout>
      <div className="space-y-6">
        <CarboPageHeader
          title="Funil B2B"
          description="Pipeline de leads e conversão"
          icon={Users}
          actions={
            <>
              <CarboButton variant="outline" size="sm" onClick={() => refetch()}>
                <RefreshCw className="h-4 w-4 mr-1" />
                Atualizar
              </CarboButton>
              <CarboButton onClick={() => navigate("/b2b/funnel")}>
                <Plus className="h-4 w-4 mr-1" />
                Novo Lead
              </CarboButton>
            </>
          }
        />

        {/* KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <CarboKPI title="Total Leads" value={stats?.total || 0} icon={Users} iconColor="blue" loading={statsLoading} delay={50} />
          <CarboKPI title="Qualificados" value={stats?.qualificado || 0} icon={Target} iconColor="blue" loading={statsLoading} delay={100} />
          <CarboKPI title="Em Negociação" value={stats?.em_negociacao || 0} icon={TrendingUp} iconColor="warning" loading={statsLoading} delay={150} />
          <CarboKPI title="Ganhos" value={stats?.ganho || 0} icon={Users} iconColor="success" loading={statsLoading} delay={200} />
          <CarboKPI title="Conversão" value={`${conversionRate}%`} icon={TrendingUp} iconColor="green" loading={statsLoading} delay={250} />
        </div>

        {/* Pipeline Visual */}
        <div className="grid grid-cols-5 gap-2">
          {PIPELINE_STAGES.map((stage) => {
            const count = leadsGrouped[stage].length;
            return (
              <div
                key={stage}
                className={`p-3 rounded-xl border text-center transition-all cursor-pointer hover:shadow-md ${
                  statusFilter === stage ? "border-carbo-green bg-carbo-green/5" : "bg-card"
                }`}
                onClick={() => setStatusFilter(statusFilter === stage ? "all" : stage)}
              >
                <p className="text-lg font-bold kpi-number">{count}</p>
                <p className="text-xs text-muted-foreground">{LEAD_STATUS_LABELS[stage]}</p>
              </div>
            );
          })}
        </div>

        {/* Filters */}
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1 max-w-md">
            <CarboSearchInput
              placeholder="Buscar por empresa, contato, CNPJ ou cidade..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as LeadStatus | "all")}>
            <SelectTrigger className="w-48 h-11 rounded-xl">
              <Filter className="h-4 w-4 mr-2" />
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              {Object.entries(LEAD_STATUS_LABELS).map(([key, label]) => (
                <SelectItem key={key} value={key}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Leads List */}
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <CarboSkeleton key={i} className="h-24 w-full" />
            ))}
          </div>
        ) : filteredLeads.length === 0 ? (
          <CarboCard>
            <CarboEmptyState
              icon={Users}
              title="Nenhum lead encontrado"
              description={search ? "Tente ajustar a busca" : "Cadastre seu primeiro lead B2B"}
              action={{ label: "Novo Lead", onClick: () => navigate("/b2b/funnel") }}
            />
          </CarboCard>
        ) : (
          <div className="space-y-3">
            {filteredLeads.map((lead) => (
              <LeadCard
                key={lead.id}
                lead={lead}
                onMoveForward={() => handleMoveForward(lead)}
                onMarkLost={() => handleMarkLost(lead)}
                onConvert={() => navigate(`/orders/new?lead_id=${lead.id}&cnpj=${lead.cnpj || ""}&name=${encodeURIComponent(lead.trade_name || lead.legal_name || "")}`)}
              />
            ))}
          </div>
        )}
      </div>
    </BoardLayout>
  );
}

function LeadCard({
  lead,
  onMoveForward,
  onMarkLost,
  onConvert,
}: {
  lead: B2BLead;
  onMoveForward: () => void;
  onMarkLost: () => void;
  onConvert: () => void;
}) {
  const canAdvance = lead.status !== "ganho" && lead.status !== "perdido";
  const canConvert = lead.status === "ganho";

  return (
    <CarboCard className="hover:shadow-md transition-all">
      <CarboCardContent className="p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 mb-2">
              <h3 className="font-semibold truncate">{lead.trade_name || lead.legal_name || "Sem nome"}</h3>
              <CarboBadge variant={LEAD_STATUS_COLORS[lead.status]} dot>
                {LEAD_STATUS_LABELS[lead.status]}
              </CarboBadge>
              {lead.business_vertical && (
                <CarboBadge variant="secondary" className="text-[10px]">
                  {VERTICAL_LABELS[lead.business_vertical] || lead.business_vertical}
                </CarboBadge>
              )}
              {lead.validation_score > 0 && (
                <CarboBadge variant={lead.validation_score >= 60 ? "success" : "warning"} className="text-[10px]">
                  Score: {lead.validation_score}
                </CarboBadge>
              )}
            </div>

            <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
              {lead.cnpj && (
                <span className="flex items-center gap-1">
                  <Building2 className="h-3 w-3" />
                  {lead.cnpj}
                </span>
              )}
              {lead.contact_name && (
                <span className="flex items-center gap-1">
                  <Users className="h-3 w-3" />
                  {lead.contact_name}
                </span>
              )}
              {lead.contact_phone && (
                <span className="flex items-center gap-1">
                  <Phone className="h-3 w-3" />
                  {lead.contact_phone}
                </span>
              )}
              {lead.city && (
                <span className="flex items-center gap-1">
                  <MapPin className="h-3 w-3" />
                  {lead.city}/{lead.state}
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {canAdvance && (
              <>
                <CarboButton variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); onMarkLost(); }}>
                  <XCircle className="h-3.5 w-3.5" />
                </CarboButton>
                <CarboButton size="sm" onClick={(e) => { e.stopPropagation(); onMoveForward(); }}>
                  <ArrowRight className="h-3.5 w-3.5 mr-1" />
                  Avançar
                </CarboButton>
              </>
            )}
            {canConvert && (
              <CarboButton size="sm" variant="default" onClick={(e) => { e.stopPropagation(); onConvert(); }}>
                <ChevronRight className="h-3.5 w-3.5 mr-1" />
                Criar Pedido
              </CarboButton>
            )}
          </div>
        </div>
      </CarboCardContent>
    </CarboCard>
  );
}

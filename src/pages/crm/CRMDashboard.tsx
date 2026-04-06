import React from "react";
import { useNavigate } from "react-router-dom";
import { BoardLayout } from "@/components/layouts/BoardLayout";
import { CarboPageHeader } from "@/components/ui/carbo-page-header";
import { CarboCard, CarboCardContent, CarboCardHeader, CarboCardTitle } from "@/components/ui/carbo-card";
import { CarboKPI } from "@/components/ui/carbo-kpi";
import { CarboButton } from "@/components/ui/carbo-button";
import { Users, TrendingUp, AlertTriangle, Flame, ChevronRight, BarChart3 } from "lucide-react";
import { useCRMAllStats } from "@/hooks/useCRMLeads";
import { FUNNEL_CONFIG } from "@/types/crm";
import type { FunnelType } from "@/types/crm";

export default function CRMDashboard() {
  const navigate = useNavigate();
  const { data: stats, isLoading } = useCRMAllStats();

  const funnels = Object.values(FUNNEL_CONFIG);

  return (
    <BoardLayout>
      <div className="space-y-6">
        <CarboPageHeader
          title="CRM — Funis de Venda"
          description="Gestão de leads, prospecção e pipeline comercial"
          icon={BarChart3}
        />

        {/* Global KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <CarboKPI title="Total Leads" value={stats?.total || 0} icon={Users} iconColor="blue" loading={isLoading} />
          <CarboKPI title="Quentes" value={stats?.hot || 0} icon={Flame} iconColor="warning" loading={isLoading} />
          <CarboKPI title="Sem Atividade >3d" value={stats?.stale || 0} icon={AlertTriangle} iconColor="warning" loading={isLoading} />
          <CarboKPI title="Funis Ativos" value={Object.keys(stats?.byFunnel || {}).length} icon={TrendingUp} iconColor="green" loading={isLoading} />
        </div>

        {/* Funnel Cards */}
        <div>
          <h3 className="text-sm font-semibold uppercase text-muted-foreground tracking-wider mb-3">Funis de Venda</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {funnels.map((funnel) => {
              const count = stats?.byFunnel?.[funnel.id] || 0;

              return (
                <CarboCard
                  key={funnel.id}
                  className="cursor-pointer hover:shadow-md transition-shadow"
                  onClick={() => navigate(`/crm/${funnel.id}`)}
                >
                  <CarboCardContent className="p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <span className="text-2xl">{funnel.icon}</span>
                        <div>
                          <p className="font-semibold text-sm">{funnel.shortName}</p>
                          <p className="text-[10px] text-muted-foreground">{funnel.cycleLabel}</p>
                        </div>
                      </div>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div className="flex items-end justify-between">
                      <div>
                        <p className="text-2xl font-bold kpi-number" style={{ color: funnel.color }}>{count}</p>
                        <p className="text-[10px] text-muted-foreground">leads ativos</p>
                      </div>
                      <div
                        className="h-8 w-8 rounded-full flex items-center justify-center"
                        style={{ backgroundColor: funnel.color + "20" }}
                      >
                        <span className="text-sm">{funnel.icon}</span>
                      </div>
                    </div>
                  </CarboCardContent>
                </CarboCard>
              );
            })}
          </div>
        </div>

        {/* Quick Actions */}
        <CarboCard>
          <CarboCardHeader>
            <CarboCardTitle className="text-sm">Ações Rápidas</CarboCardTitle>
          </CarboCardHeader>
          <CarboCardContent className="pt-0">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <CarboButton variant="outline" className="h-auto py-3 flex-col gap-1" onClick={() => navigate("/crm/f4")}>
                <span className="text-lg">🏪</span>
                <span className="text-xs">PDVs CarboZé</span>
                <span className="text-[10px] text-muted-foreground">{stats?.byFunnel?.f4 || 0} leads</span>
              </CarboButton>
              <CarboButton variant="outline" className="h-auto py-3 flex-col gap-1" onClick={() => navigate("/crm/f2")}>
                <span className="text-lg">🏢</span>
                <span className="text-xs">Licenciados</span>
                <span className="text-[10px] text-muted-foreground">{stats?.byFunnel?.f2 || 0} leads</span>
              </CarboButton>
              <CarboButton variant="outline" className="h-auto py-3 flex-col gap-1" onClick={() => navigate("/crm/f1")}>
                <span className="text-lg">🛒</span>
                <span className="text-xs">B2C</span>
                <span className="text-[10px] text-muted-foreground">{stats?.byFunnel?.f1 || 0} leads</span>
              </CarboButton>
              <CarboButton variant="outline" className="h-auto py-3 flex-col gap-1" onClick={() => navigate("/crm/f3")}>
                <span className="text-lg">🚛</span>
                <span className="text-xs">Frotistas</span>
                <span className="text-[10px] text-muted-foreground">{stats?.byFunnel?.f3 || 0} leads</span>
              </CarboButton>
            </div>
          </CarboCardContent>
        </CarboCard>
      </div>
    </BoardLayout>
  );
}

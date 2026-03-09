import { useState } from "react";
import { Building2, Cpu, AlertTriangle, TrendingUp, MapPin, Wrench, DollarSign, Package } from "lucide-react";
import { KPICard } from "@/components/board/KPICard";
import { useLicenseeStats } from "@/hooks/useLicensees";
import { useMachineStats, useMachineAlerts } from "@/hooks/useMachines";
import { useGeographicDistribution } from "@/hooks/useEcosystemTimeline";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { EcosystemCharts } from "./EcosystemCharts";
import { SafeGeographicMap } from "@/components/maps/SafeGeographicMap";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useNavigate } from "react-router-dom";

export function EcosystemKPIs() {
  const navigate = useNavigate();
  const [selectedState, setSelectedState] = useState<string | null>(null);
  const { data: licenseeStats, isLoading: licenseeLoading } = useLicenseeStats();
  const { data: machineStats, isLoading: machineLoading } = useMachineStats();
  const { data: machineAlerts, isLoading: alertsLoading } = useMachineAlerts();
  const { data: geoData, isLoading: geoLoading } = useGeographicDistribution();

  const isLoading = licenseeLoading || machineLoading || alertsLoading;

  // Handle state click - navigate to licensees filtered by state
  const handleStateClick = (stateSigla: string) => {
    if (selectedState === stateSigla) {
      setSelectedState(null);
    } else {
      setSelectedState(stateSigla);
      // Navigate to licensees page with state filter
      navigate(`/licensees?state=${stateSigla}`);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Skeleton className="h-8 w-48" />
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-border bg-board-surface p-6">
              <Skeleton className="h-5 w-28 mb-3" />
              <Skeleton className="h-9 w-16 mb-2" />
              <Skeleton className="h-4 w-24" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(value);
  };

  // Combine all geographic data
  const allGeoData = geoData
    ? [...geoData.licensees, ...geoData.machines, ...geoData.events]
    : [];

  return (
    <div className="space-y-8">
      {/* Licensee KPIs */}
      <div>
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10">
            <Building2 className="h-5 w-5 text-emerald-500" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-board-text">Licenciados</h3>
            <p className="text-sm text-board-muted">Rede de parceiros Carbo</p>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <KPICard
            title="Total de Licenciados"
            value={licenseeStats?.total || 0}
            subtitle={`${licenseeStats?.active || 0} ativos`}
            icon={<Building2 className="h-6 w-6" />}
            variant="success"
          />
          <KPICard
            title="Taxa de Ativação"
            value={`${licenseeStats?.total ? Math.round((licenseeStats.active / licenseeStats.total) * 100) : 0}%`}
            subtitle={`${licenseeStats?.pending || 0} pendentes`}
            icon={<TrendingUp className="h-6 w-6" />}
            variant={licenseeStats?.pending && licenseeStats.pending > 3 ? "warning" : "default"}
          />
          <KPICard
            title="Estados Cobertos"
            value={licenseeStats?.totalStates || 0}
            subtitle={`${licenseeStats?.totalCities || 0} cidades`}
            icon={<MapPin className="h-6 w-6" />}
          />
          <KPICard
            title="Performance Média"
            value={`${Math.round(licenseeStats?.avgPerformance || 0)}%`}
            subtitle="Score de desempenho"
            icon={<TrendingUp className="h-6 w-6" />}
            variant={
              licenseeStats?.avgPerformance && licenseeStats.avgPerformance >= 80
                ? "success"
                : licenseeStats?.avgPerformance && licenseeStats.avgPerformance >= 60
                ? "warning"
                : "default"
            }
          />
        </div>
      </div>

      {/* Machine KPIs */}
      <div>
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/10">
            <Cpu className="h-5 w-5 text-blue-500" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-board-text">Máquinas</h3>
            <p className="text-sm text-board-muted">Parque de equipamentos</p>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <KPICard
            title="Total de Máquinas"
            value={machineStats?.total || 0}
            subtitle={`${machineStats?.operational || 0} operacionais`}
            icon={<Cpu className="h-6 w-6" />}
            variant="success"
          />
          <KPICard
            title="Em Manutenção"
            value={machineStats?.maintenance || 0}
            subtitle={`${machineStats?.offline || 0} offline`}
            icon={<Wrench className="h-6 w-6" />}
            variant={
              machineStats?.maintenance && machineStats.maintenance > 5
                ? "danger"
                : machineStats?.maintenance && machineStats.maintenance > 2
                ? "warning"
                : "default"
            }
          />
          <KPICard
            title="Alertas Ativos"
            value={machineStats?.withAlerts || 0}
            subtitle={`${machineStats?.lowStock || 0} estoque baixo`}
            icon={<AlertTriangle className="h-6 w-6" />}
            variant={machineStats?.withAlerts && machineStats.withAlerts > 0 ? "warning" : "default"}
          />
          <KPICard
            title="Receita Gerada"
            value={formatCurrency(machineStats?.totalCredits || 0)}
            subtitle={`${(machineStats?.totalDispensed || 0).toLocaleString("pt-BR")} unidades`}
            icon={<DollarSign className="h-6 w-6" />}
          />
        </div>
      </div>

      {/* Alerts Section */}
      {machineAlerts && (machineAlerts.alerts.length > 0 || machineAlerts.lowStock.length > 0) && (
        <div className="rounded-xl border border-warning/30 bg-warning/5 p-6">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-warning/20">
              <AlertTriangle className="h-6 w-6 text-warning" />
            </div>
            <div className="flex-1">
              <h4 className="font-semibold text-board-text">Atenção Requerida</h4>
              <p className="mt-1 text-sm text-board-muted">
                {machineAlerts.alerts.length} máquina(s) com alertas ativos
                {machineAlerts.lowStock.length > 0 && `, ${machineAlerts.lowStock.length} com estoque baixo`}
              </p>

              {machineAlerts.alerts.slice(0, 3).map((alert) => (
                <div
                  key={alert.id}
                  className={cn(
                    "mt-3 flex items-center justify-between rounded-lg border px-4 py-3",
                    alert.status !== "operational"
                      ? "border-destructive/30 bg-destructive/5"
                      : "border-warning/30 bg-warning/5"
                  )}
                >
                  <div className="flex items-center gap-3">
                    <Cpu className={cn(
                      "h-5 w-5",
                      alert.status !== "operational" ? "text-destructive" : "text-warning"
                    )} />
                    <div>
                      <p className="text-sm font-medium text-board-text">
                        {alert.machine_id} - {alert.model}
                      </p>
                      <p className="text-xs text-board-muted">
                        {alert.last_alert_message || `Status: ${alert.status}`}
                      </p>
                    </div>
                  </div>
                  <span className={cn(
                    "rounded-full px-2 py-1 text-xs font-medium",
                    alert.status === "offline" && "bg-destructive/20 text-destructive",
                    alert.status === "maintenance" && "bg-warning/20 text-warning",
                    alert.status === "operational" && "bg-success/20 text-success"
                  )}>
                    {alert.status === "offline" ? "Offline" : 
                     alert.status === "maintenance" ? "Manutenção" : "Alerta"}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Evolution Charts */}
      <EcosystemCharts />

      {/* Geographic Maps */}
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-carbo-green/20 to-carbo-blue/20">
            <MapPin className="h-5 w-5 text-carbo-green" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-board-text">Distribuição Geográfica</h3>
            <p className="text-sm text-board-muted">Visualize a presença nacional do ecossistema Carbo</p>
          </div>
        </div>

        <Tabs defaultValue="all" className="w-full">
          <TabsList>
            <TabsTrigger value="all">Visão Geral</TabsTrigger>
            <TabsTrigger value="licensees">Licenciados</TabsTrigger>
            <TabsTrigger value="machines">Máquinas</TabsTrigger>
            <TabsTrigger value="events">Agendamentos</TabsTrigger>
          </TabsList>
          <TabsContent value="all" className="mt-4">
            <SafeGeographicMap
              data={allGeoData}
              title="Mapa Geral do Ecossistema"
              description="Clique em um estado ativo para filtrar licenciados"
              type="all"
              isLoading={geoLoading}
              onStateClick={handleStateClick}
              selectedState={selectedState}
            />
          </TabsContent>
          <TabsContent value="licensees" className="mt-4">
            <SafeGeographicMap
              data={geoData?.licensees || []}
              title="Mapa de Licenciados"
              description="Clique em um estado ativo para filtrar licenciados"
              type="licensee"
              isLoading={geoLoading}
              onStateClick={handleStateClick}
              selectedState={selectedState}
            />
          </TabsContent>
          <TabsContent value="machines" className="mt-4">
            <SafeGeographicMap
              data={geoData?.machines || []}
              title="Mapa de Máquinas"
              description="Localização do parque de equipamentos"
              type="machine"
              isLoading={geoLoading}
            />
          </TabsContent>
          <TabsContent value="events" className="mt-4">
            <SafeGeographicMap
              data={geoData?.events || []}
              title="Mapa de Agendamentos"
              description="Eventos e compromissos programados"
              type="event"
              isLoading={geoLoading}
            />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

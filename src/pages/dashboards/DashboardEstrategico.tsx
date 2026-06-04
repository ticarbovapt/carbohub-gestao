import { useState } from "react";
import { BoardLayout } from "@/components/layouts/BoardLayout";
import { CarboPageHeader } from "@/components/ui/carbo-page-header";
import { Star } from "lucide-react";
import { CeoDashboard } from "@/components/dashboard/CeoDashboard";
import { useCanViewStrategicDashboard } from "@/hooks/useActionPermissions";
import { DashboardFilterBar, DashboardFilters, EMPTY_FILTERS } from "@/components/dashboard/DashboardFilterBar";

export default function DashboardEstrategico() {
  const canView = useCanViewStrategicDashboard();
  const [filters, setFilters] = useState<DashboardFilters>(EMPTY_FILTERS);

  const renderContent = () => {
    if (canView) return <CeoDashboard />;

    return (
      <div className="flex flex-col items-center justify-center h-64 text-center gap-4">
        <Star className="h-12 w-12 text-muted-foreground opacity-40" />
        <div>
          <p className="text-lg font-semibold text-foreground">Acesso Restrito</p>
          <p className="text-sm text-muted-foreground mt-1">
            O Dashboard Estratégico está disponível apenas para a diretoria.
          </p>
        </div>
      </div>
    );
  };

  return (
    <BoardLayout>
      <div className="space-y-6">
        {canView && (
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
            <CarboPageHeader
              title="Dashboard — Estratégico"
              description="Visão executiva: KPIs consolidados, metas e performance geral"
              icon={Star}
            />
            <DashboardFilterBar filters={filters} onChange={setFilters} className="sm:pt-1 shrink-0" />
          </div>
        )}
        {renderContent()}
      </div>
    </BoardLayout>
  );
}

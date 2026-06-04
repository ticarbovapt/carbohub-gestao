import { BoardLayout } from "@/components/layouts/BoardLayout";
import { CarboPageHeader } from "@/components/ui/carbo-page-header";
import { Star } from "lucide-react";
import { CeoDashboard } from "@/components/dashboard/CeoDashboard";
import { useCanViewStrategicDashboard } from "@/hooks/useActionPermissions";

export default function DashboardEstrategico() {
  const canView = useCanViewStrategicDashboard();

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
          <CarboPageHeader
            title="Dashboard — Estratégico"
            description="Visão executiva: KPIs consolidados, metas e performance geral"
            icon={Star}
          />
        )}
        {renderContent()}
      </div>
    </BoardLayout>
  );
}

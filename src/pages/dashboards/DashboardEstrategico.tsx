import { BoardLayout } from "@/components/layouts/BoardLayout";
import { CarboPageHeader } from "@/components/ui/carbo-page-header";
import { Star } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { CeoDashboard } from "@/components/dashboard/CeoDashboard";
import { GestorDashboard } from "@/components/dashboard/GestorDashboard";

export default function DashboardEstrategico() {
  const { isCeo, isGestorAdm, isGestorFin, isGestorCompras, isAnyGestor } = useAuth();

  const renderContent = () => {
    if (isCeo) return <CeoDashboard />;
    if (isGestorAdm) return <GestorDashboard role="gestor_adm" />;
    if (isGestorFin) return <GestorDashboard role="gestor_fin" />;
    if (isGestorCompras) return <GestorDashboard role="gestor_compras" />;

    // Operadores veem uma mensagem de acesso restrito
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center gap-4">
        <Star className="h-12 w-12 text-muted-foreground opacity-40" />
        <div>
          <p className="text-lg font-semibold text-foreground">Acesso Restrito</p>
          <p className="text-sm text-muted-foreground mt-1">
            O Dashboard Estratégico está disponível para CEO e Gestores.
          </p>
        </div>
      </div>
    );
  };

  return (
    <BoardLayout>
      <div className="space-y-6">
        {!isCeo && !isAnyGestor && null}
        {(isCeo || isAnyGestor) && (
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

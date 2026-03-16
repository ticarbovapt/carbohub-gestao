import { TrendingUp, Target, CheckCircle, XCircle, Loader2 } from "lucide-react";
import { useConfirmationKPIs } from "@/hooks/useProductionConfirmation";
import { cn } from "@/lib/utils";

export function OPKpiCards() {
  const { data: kpis, isLoading } = useConfirmationKPIs();

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="rounded-xl border bg-card p-4 flex items-center justify-center h-24">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ))}
      </div>
    );
  }

  const avgYield = kpis?.avgYield || 0;
  const avgAdherence = kpis?.avgAdherence || 0;
  const totalConfirmed = kpis?.totalConfirmed || 0;
  const totalRejected = kpis?.totalRejected || 0;

  const yieldColor = avgYield >= 90 ? "text-green-500" : avgYield >= 75 ? "text-yellow-500" : "text-red-500";
  const adherenceColor = avgAdherence >= 90 ? "text-green-500" : avgAdherence >= 75 ? "text-yellow-500" : "text-red-500";

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <div className="rounded-xl border bg-card p-4 space-y-1">
        <div className={cn("flex items-center gap-2 text-sm", yieldColor)}>
          <TrendingUp className="h-4 w-4" />
          <span>Rendimento Médio</span>
        </div>
        <p className={cn("text-2xl font-bold", yieldColor)}>
          {totalConfirmed > 0 ? `${avgYield.toFixed(1)}%` : "—"}
        </p>
        <p className="text-xs text-muted-foreground">Últimos 30 dias</p>
      </div>

      <div className="rounded-xl border bg-card p-4 space-y-1">
        <div className={cn("flex items-center gap-2 text-sm", adherenceColor)}>
          <Target className="h-4 w-4" />
          <span>Aderência BOM</span>
        </div>
        <p className={cn("text-2xl font-bold", adherenceColor)}>
          {totalConfirmed > 0 ? `${avgAdherence.toFixed(1)}%` : "—"}
        </p>
        <p className="text-xs text-muted-foreground">Últimos 30 dias</p>
      </div>

      <div className="rounded-xl border bg-card p-4 space-y-1">
        <div className="flex items-center gap-2 text-green-500 text-sm">
          <CheckCircle className="h-4 w-4" />
          <span>OPs Confirmadas</span>
        </div>
        <p className="text-2xl font-bold">{totalConfirmed}</p>
        <p className="text-xs text-muted-foreground">Últimos 30 dias</p>
      </div>

      <div className="rounded-xl border bg-card p-4 space-y-1">
        <div className="flex items-center gap-2 text-red-500 text-sm">
          <XCircle className="h-4 w-4" />
          <span>Perdas Totais</span>
        </div>
        <p className="text-2xl font-bold">{totalRejected}</p>
        <p className="text-xs text-muted-foreground">Unidades rejeitadas</p>
      </div>
    </div>
  );
}

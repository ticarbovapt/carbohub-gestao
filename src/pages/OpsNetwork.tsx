import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Store, TrendingUp, DollarSign, AlertTriangle, BarChart2, Package,
} from "lucide-react";
import { BoardLayout } from "@/components/layouts/BoardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CarboSkeleton } from "@/components/ui/CarboSkeleton";
import { usePDVNetworkRanking } from "@/hooks/usePDVSales";
import { cn } from "@/lib/utils";

const fmt = (n: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);

type Period = "day" | "week" | "month" | "all";

const PERIOD_LABELS: Record<Period, string> = {
  day:   "Hoje",
  week:  "Semana",
  month: "Mês",
  all:   "Todos",
};

export default function OpsNetwork() {
  const navigate = useNavigate();
  const [period, setPeriod] = useState<Period>("month");
  const { data: ranking = [], isLoading } = usePDVNetworkRanking(period);

  const totalRevenue = ranking.reduce((acc, r) => acc + r.revenue, 0);
  const totalSales   = ranking.reduce((acc, r) => acc + r.qty, 0);
  const activePdvs   = ranking.length;

  if (isLoading) {
    return (
      <BoardLayout>
        <div className="p-4 sm:p-6 space-y-4">
          <CarboSkeleton className="h-10 w-56" />
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {[1, 2, 3].map(i => <CarboSkeleton key={i} className="h-24" />)}
          </div>
          <CarboSkeleton className="h-64" />
        </div>
      </BoardLayout>
    );
  }

  return (
    <BoardLayout>
    <div className="p-4 sm:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Store className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-xl sm:text-2xl font-bold">Rede PDV</h1>
            <p className="text-sm text-muted-foreground">Visão consolidada de todas as lojas</p>
          </div>
        </div>

        {/* Period filter */}
        <div className="flex gap-2">
          {(Object.keys(PERIOD_LABELS) as Period[]).map(p => (
            <Button
              key={p}
              variant={period === p ? "default" : "outline"}
              size="sm"
              className={period === p ? "carbo-gradient" : ""}
              onClick={() => setPeriod(p)}
            >
              {PERIOD_LABELS[p]}
            </Button>
          ))}
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {[
          { label: "Receita Total", value: fmt(totalRevenue), icon: DollarSign, color: "text-green-500" },
          { label: "Vendas Totais", value: String(totalSales), sub: "pedidos", icon: BarChart2, color: "text-blue-500" },
          { label: "PDVs Ativos", value: String(activePdvs), sub: "com vendas", icon: Store, color: "text-amber-500" },
        ].map(({ label, value, sub, icon: Icon, color }) => (
          <Card key={label}>
            <CardContent className="p-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs text-muted-foreground font-medium">{label}</p>
                  <p className="text-xl sm:text-2xl font-bold mt-1">{value}</p>
                  {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
                </div>
                <div className={cn("p-2 rounded-lg bg-muted/50", color)}>
                  <Icon className="h-4 w-4" />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Ranking table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <TrendingUp className="h-4 w-4" /> Ranking de PDVs — {PERIOD_LABELS[period]}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {ranking.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Store className="h-10 w-10 mx-auto mb-3 opacity-40" />
              <p>Nenhuma venda no período selecionado.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {/* Header row */}
              <div className="hidden sm:grid grid-cols-[2rem_1fr_auto_auto_auto] gap-3 px-3 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                <span>#</span>
                <span>PDV</span>
                <span className="text-right">Vendas</span>
                <span className="text-right">Ticket Médio</span>
                <span className="text-right">Receita</span>
              </div>
              {ranking.map((pdv, idx) => {
                const pos = idx + 1;
                const ticketAvg = pdv.qty > 0 ? pdv.revenue / pdv.qty : 0;
                return (
                  <div
                    key={pdv.pdv_id}
                    className={cn(
                      "grid grid-cols-1 sm:grid-cols-[2rem_1fr_auto_auto_auto] gap-2 sm:gap-3 items-center",
                      "rounded-lg border border-border px-3 py-3 hover:bg-muted/40 transition-colors",
                      pos === 1 && "border-yellow-500/30 bg-yellow-500/5"
                    )}
                  >
                    <span className={cn(
                      "font-bold text-sm w-8 text-center hidden sm:block",
                      pos === 1 ? "text-yellow-500" : pos === 2 ? "text-slate-400" : pos === 3 ? "text-amber-600" : "text-muted-foreground"
                    )}>{pos}</span>
                    <div className="flex items-center gap-2 sm:gap-0 sm:block">
                      <span className="sm:hidden font-bold text-sm text-muted-foreground">{pos}.</span>
                      <div>
                        <p className="font-semibold text-sm">{pdv.name}</p>
                        <p className="text-xs text-muted-foreground">{pdv.city}, {pdv.state}</p>
                      </div>
                    </div>
                    <div className="flex items-center sm:block justify-between sm:text-right gap-2">
                      <span className="sm:hidden text-xs text-muted-foreground">Vendas:</span>
                      <span className="text-sm font-medium">{pdv.qty}</span>
                    </div>
                    <div className="flex items-center sm:block justify-between sm:text-right gap-2">
                      <span className="sm:hidden text-xs text-muted-foreground">Ticket Médio:</span>
                      <span className="text-sm text-muted-foreground">{fmt(ticketAvg)}</span>
                    </div>
                    <div className="flex items-center sm:block justify-between sm:text-right gap-2">
                      <span className="sm:hidden text-xs text-muted-foreground">Receita:</span>
                      <span className="text-sm font-bold text-primary">{fmt(pdv.revenue)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
    </BoardLayout>
  );
}

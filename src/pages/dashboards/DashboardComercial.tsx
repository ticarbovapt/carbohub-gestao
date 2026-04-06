import { BoardLayout } from "@/components/layouts/BoardLayout";
import { CarboPageHeader } from "@/components/ui/carbo-page-header";
import { KPICard } from "@/components/board/KPICard";
import { TrendingUp, Building2, ShoppingCart, Star, DollarSign, Users, Loader2 } from "lucide-react";
import { useLicensees } from "@/hooks/useLicensees";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Link } from "react-router-dom";

export default function DashboardComercial() {
  const { data: licensees = [], isLoading: licenseesLoading } = useLicensees();

  const { data: orders = [], isLoading: ordersLoading } = useQuery({
    queryKey: ["orders-commercial-summary"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("id, status, total_value, created_at, client_name")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data ?? [];
    },
  });

  const isLoading = licenseesLoading || ordersLoading;

  // KPI calculations
  const totalLicensees = licensees.length;
  const activeLicensees = licensees.filter((l) => l.status === "active").length;
  const totalRevenue = licensees.reduce((sum, l) => sum + (l.total_revenue || 0), 0);
  const avgScore = totalLicensees
    ? Math.round(licensees.reduce((sum, l) => sum + (l.performance_score || 0), 0) / totalLicensees)
    : 0;

  const totalOrders = orders.length;
  const completedOrders = orders.filter((o: any) => o.status === "completed" || o.status === "concluido").length;

  const formatCurrency = (v: number) =>
    v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  const topLicensees = [...licensees]
    .sort((a, b) => (b.total_revenue || 0) - (a.total_revenue || 0))
    .slice(0, 5);

  return (
    <BoardLayout>
      <div className="space-y-8">
        <CarboPageHeader
          title="Dashboard — Comercial"
          description="Licenciados, pedidos e performance de vendas"
          icon={TrendingUp}
        />

        {/* KPIs */}
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          {isLoading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="rounded-xl border border-border bg-board-surface p-6">
                <Skeleton className="h-6 w-32 mb-2" />
                <Skeleton className="h-10 w-20 mb-2" />
                <Skeleton className="h-4 w-24" />
              </div>
            ))
          ) : (
            <>
              <KPICard
                title="Licenciados Ativos"
                value={`${activeLicensees}/${totalLicensees}`}
                subtitle="Em operação"
                icon={<Building2 className="h-6 w-6" />}
                variant={activeLicensees > 0 ? "success" : "default"}
              />
              <KPICard
                title="Receita Total"
                value={formatCurrency(totalRevenue)}
                subtitle="Acumulado licenciados"
                icon={<DollarSign className="h-6 w-6" />}
                variant="success"
              />
              <KPICard
                title="Pedidos (últ. 50)"
                value={`${completedOrders}/${totalOrders}`}
                subtitle="Concluídos"
                icon={<ShoppingCart className="h-6 w-6" />}
              />
              <KPICard
                title="Score Médio"
                value={`${avgScore}`}
                subtitle="Performance licenciados"
                icon={<Star className="h-6 w-6" />}
                variant={avgScore >= 80 ? "success" : avgScore >= 60 ? "warning" : "default"}
              />
            </>
          )}
        </div>

        {/* Top Licenciados */}
        <div className="rounded-xl border border-border bg-board-surface overflow-hidden">
          <div className="flex items-center justify-between border-b border-border px-6 py-4">
            <div>
              <h2 className="text-lg font-semibold text-board-text">Top Licenciados — Receita</h2>
              <p className="text-sm text-board-muted">Melhores desempenhos de faturamento</p>
            </div>
            <Link
              to="/licensees"
              className="text-sm text-primary hover:underline font-medium"
            >
              Ver todos →
            </Link>
          </div>
          <div className="divide-y divide-border">
            {isLoading
              ? Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="flex items-center justify-between px-6 py-4">
                    <Skeleton className="h-5 w-40" />
                    <Skeleton className="h-5 w-24" />
                  </div>
                ))
              : topLicensees.map((l, idx) => (
                  <div key={l.id} className="flex items-center justify-between px-6 py-4 hover:bg-secondary/20 transition-colors">
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-bold text-muted-foreground w-5">#{idx + 1}</span>
                      <div>
                        <p className="text-sm font-medium text-board-text">{l.name}</p>
                        <p className="text-xs text-board-muted">{l.address_city || "—"} · Score: {l.performance_score}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge variant={l.status === "active" ? "default" : "secondary"}>
                        {l.status === "active" ? "Ativo" : l.status === "inactive" ? "Inativo" : l.status}
                      </Badge>
                      <span className="text-sm font-semibold text-board-text">
                        {formatCurrency(l.total_revenue || 0)}
                      </span>
                    </div>
                  </div>
                ))}
          </div>
        </div>

        {/* Últimos Pedidos */}
        <div className="rounded-xl border border-border bg-board-surface overflow-hidden">
          <div className="flex items-center justify-between border-b border-border px-6 py-4">
            <div>
              <h2 className="text-lg font-semibold text-board-text">Últimos Pedidos CarboZé</h2>
              <p className="text-sm text-board-muted">50 pedidos mais recentes</p>
            </div>
            <Link
              to="/orders"
              className="text-sm text-primary hover:underline font-medium"
            >
              Ver todos →
            </Link>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-secondary/30">
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-board-muted">Cliente</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-board-muted">Data</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-board-muted">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-board-muted">Valor</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {ordersLoading
                  ? Array.from({ length: 5 }).map((_, i) => (
                      <tr key={i}>
                        {Array.from({ length: 4 }).map((_, j) => (
                          <td key={j} className="px-6 py-4"><Skeleton className="h-4 w-24" /></td>
                        ))}
                      </tr>
                    ))
                  : orders.slice(0, 10).map((o: any) => (
                      <tr key={o.id} className="hover:bg-secondary/20 transition-colors">
                        <td className="px-6 py-4 text-sm font-medium text-board-text">{o.client_name || "—"}</td>
                        <td className="px-6 py-4 text-sm text-board-muted">
                          {o.created_at ? new Date(o.created_at).toLocaleDateString("pt-BR") : "—"}
                        </td>
                        <td className="px-6 py-4">
                          <Badge variant="secondary">{o.status || "—"}</Badge>
                        </td>
                        <td className="px-6 py-4 text-sm font-semibold text-board-text">
                          {o.total_value != null ? formatCurrency(Number(o.total_value)) : "—"}
                        </td>
                      </tr>
                    ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </BoardLayout>
  );
}

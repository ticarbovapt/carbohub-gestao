import { BoardLayout } from "@/components/layouts/BoardLayout";
import { CarboPageHeader } from "@/components/ui/carbo-page-header";
import { KPICard } from "@/components/board/KPICard";
import { TrendingUp, Building2, ShoppingCart, Star, DollarSign, Loader2, BarChart3 } from "lucide-react";
import { useLicensees } from "@/hooks/useLicensees";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Link } from "react-router-dom";
import { useMemo, useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend, Cell,
} from "recharts";
import { DashboardFilterBar, DashboardFilters, EMPTY_FILTERS } from "@/components/dashboard/DashboardFilterBar";

export default function DashboardComercial() {
  const [filters, setFilters] = useState<DashboardFilters>(EMPTY_FILTERS);

  const { data: licensees = [], isLoading: licenseesLoading } = useLicensees();

  const { data: orders = [], isLoading: ordersLoading } = useQuery({
    queryKey: ["orders-commercial-summary", filters.from, filters.to],
    queryFn: async () => {
      let q = supabase
        .from("orders")
        .select("id, status, total_value, created_at, client_name")
        .order("created_at", { ascending: false })
        .limit(50);
      if (filters.from) q = q.gte("created_at", filters.from);
      if (filters.to)   q = q.lte("created_at", filters.to + "T23:59:59");
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

  // Evolução mensal — carboze_orders (Bling)
  const { data: carbozeOrders = [], isLoading: carbozeLoading } = useQuery({
    queryKey: ["carboze-orders-monthly", filters.from, filters.to, filters.vendedor],
    queryFn: async () => {
      let q = (supabase as any)
        .from("carboze_orders")
        .select("total, status, created_at, order_number, vendedor_name")
        .order("created_at", { ascending: true });
      if (filters.from)                   q = q.gte("created_at", filters.from);
      if (filters.to)                     q = q.lte("created_at", filters.to + "T23:59:59");
      if (filters.vendedor !== "all")     q = q.eq("vendedor_name", filters.vendedor);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as { total: number; status: string; created_at: string; order_number: string; vendedor_name: string }[];
    },
  });

  const isLoading = licenseesLoading || ordersLoading;

  // Agrupar carboze_orders por mês
  const monthlyData = useMemo(() => {
    const map: Record<string, { faturado: number; pedidos: number; concluidos: number }> = {};
    for (const o of carbozeOrders) {
      if (!o.created_at) continue;
      const key = o.created_at.slice(0, 7); // "YYYY-MM"
      if (!map[key]) map[key] = { faturado: 0, pedidos: 0, concluidos: 0 };
      map[key].pedidos++;
      map[key].faturado += Number(o.total ?? 0);
      if (o.status === "completed" || o.status === "concluido" || o.status === "faturado") {
        map[key].concluidos++;
      }
    }
    return Object.entries(map)
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-12) // últimos 12 meses
      .map(([key, v]) => {
        try {
          const [y, m] = key.split("-");
          const label = format(new Date(parseInt(y), parseInt(m) - 1, 1), "MMM/yy", { locale: ptBR });
          return { mes: label, ...v };
        } catch {
          return { mes: key, ...v };
        }
      });
  }, [carbozeOrders]);

  const totalCarboze = carbozeOrders.reduce((s, o) => s + Number(o.total ?? 0), 0);
  const totalCarbozeOrders = carbozeOrders.length;

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
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <CarboPageHeader
            title="Dashboard — Comercial"
            description="Licenciados, pedidos e performance de vendas"
            icon={TrendingUp}
          />
          <DashboardFilterBar
            filters={filters}
            onChange={setFilters}
            showVendedor
            className="sm:pt-1 shrink-0"
          />
        </div>

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

        {/* ── Evolução Mensal Bling ─────────────────────────────────────── */}
        <div className="rounded-xl border border-border bg-board-surface overflow-hidden">
          <div className="flex items-center justify-between border-b border-border px-6 py-4">
            <div>
              <h2 className="text-lg font-semibold text-board-text flex items-center gap-2">
                <BarChart3 className="h-5 w-5 text-primary" />
                Evolução Mensal — CarboZé (Bling)
              </h2>
              <p className="text-sm text-board-muted">
                Faturamento e volume de pedidos importados via Bling ·{" "}
                <span className="font-medium text-board-text">
                  {totalCarbozeOrders} pedidos · {(totalCarboze).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} acumulado
                </span>
              </p>
            </div>
            <Link to="/orders" className="text-sm text-primary hover:underline font-medium">
              Ver pedidos →
            </Link>
          </div>

          {carbozeLoading ? (
            <div className="flex items-center justify-center h-56">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : monthlyData.length === 0 ? (
            <div className="flex items-center justify-center h-56 text-sm text-board-muted">
              Nenhum pedido Bling encontrado.
            </div>
          ) : (
            <div className="p-6 space-y-6">
              {/* Area chart — faturamento */}
              <div>
                <p className="text-xs font-semibold text-board-muted uppercase tracking-wider mb-3">Faturamento (R$)</p>
                <ResponsiveContainer width="100%" height={200}>
                  <AreaChart data={monthlyData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                    <defs>
                      <linearGradient id="colorFat" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#1a7a4a" stopOpacity={0.35} />
                        <stop offset="95%" stopColor="#1a7a4a" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                    <XAxis dataKey="mes" tick={{ fontSize: 11, fill: "var(--board-muted, #9ca3af)" }} axisLine={false} tickLine={false} />
                    <YAxis
                      tick={{ fontSize: 11, fill: "var(--board-muted, #9ca3af)" }}
                      axisLine={false} tickLine={false}
                      tickFormatter={v => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)}
                      width={48}
                    />
                    <Tooltip
                      contentStyle={{ background: "var(--board-surface, #1a1f2e)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
                      labelStyle={{ color: "var(--board-text, #f1f5f9)", fontWeight: 600 }}
                      formatter={(v: number) => [v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }), "Faturado"]}
                    />
                    <Area type="monotone" dataKey="faturado" stroke="#1a7a4a" strokeWidth={2.5} fill="url(#colorFat)" dot={{ r: 3, fill: "#1a7a4a" }} activeDot={{ r: 5 }} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>

              {/* Bar chart — pedidos */}
              <div>
                <p className="text-xs font-semibold text-board-muted uppercase tracking-wider mb-3">Volume de Pedidos</p>
                <ResponsiveContainer width="100%" height={120}>
                  <BarChart data={monthlyData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                    <XAxis dataKey="mes" tick={{ fontSize: 11, fill: "var(--board-muted, #9ca3af)" }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: "var(--board-muted, #9ca3af)" }} axisLine={false} tickLine={false} width={32} allowDecimals={false} />
                    <Tooltip
                      contentStyle={{ background: "var(--board-surface, #1a1f2e)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
                      labelStyle={{ color: "var(--board-text, #f1f5f9)", fontWeight: 600 }}
                      formatter={(v: number, name: string) => [v, name === "pedidos" ? "Total pedidos" : "Concluídos"]}
                    />
                    <Legend
                      wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
                      formatter={(v) => v === "pedidos" ? "Total pedidos" : "Concluídos"}
                    />
                    <Bar dataKey="pedidos" fill="#2d4a6e" radius={[3, 3, 0, 0]} name="pedidos" />
                    <Bar dataKey="concluidos" fill="#1a7a4a" radius={[3, 3, 0, 0]} name="concluidos" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
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

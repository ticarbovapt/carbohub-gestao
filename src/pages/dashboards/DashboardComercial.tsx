import { BoardLayout } from "@/components/layouts/BoardLayout";
import { CarboPageHeader } from "@/components/ui/carbo-page-header";
import { KPICard } from "@/components/board/KPICard";
import { TrendingUp, ShoppingCart, DollarSign, Trophy, Loader2, BarChart3, Repeat2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "react-router-dom";
import { useMemo, useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, LabelList,
} from "recharts";
import { DashboardFilterBar, DashboardFilters, EMPTY_FILTERS } from "@/components/dashboard/DashboardFilterBar";

export default function DashboardComercial() {
  const [filters, setFilters] = useState<DashboardFilters>(EMPTY_FILTERS);

  // Últimos pedidos — tabela no rodapé
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

  // Vendas Bling — fonte principal (KPIs + gráfico)
  const { data: carbozeOrders = [], isLoading: carbozeLoading } = useQuery({
    queryKey: ["carboze-orders-monthly", filters.from, filters.to, filters.vendedor],
    queryFn: async () => {
      let q = (supabase as any)
        .from("carboze_orders")
        .select("id, total, status, created_at, order_number, vendedor_name, customer_name")
        .order("created_at", { ascending: true });
      if (filters.from)               q = q.gte("created_at", filters.from);
      if (filters.to)                 q = q.lte("created_at", filters.to + "T23:59:59");
      if (filters.vendedor !== "all") q = q.eq("vendedor_name", filters.vendedor);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as {
        id: string; total: number; status: string;
        created_at: string; order_number: string;
        vendedor_name: string; customer_name: string;
      }[];
    },
  });

  // ── KPIs derivados de carboze_orders ────────────────────────────────────────
  const kpis = useMemo(() => {
    const active = carbozeOrders.filter(o => o.status !== "cancelled" && o.status !== "cancelado");
    const totalVendas   = active.length;
    const totalBRL      = active.reduce((s, o) => s + Number(o.total ?? 0), 0);
    const maiorVenda    = active.reduce((max, o) => Math.max(max, Number(o.total ?? 0)), 0);

    // Cliente com mais recorrência
    const clientCount: Record<string, number> = {};
    for (const o of active) {
      const name = o.customer_name?.trim() || "—";
      clientCount[name] = (clientCount[name] || 0) + 1;
    }
    const [topCliente, topQtd] = Object.entries(clientCount)
      .sort(([, a], [, b]) => b - a)[0] ?? ["—", 0];

    return { totalVendas, totalBRL, maiorVenda, topCliente, topQtd };
  }, [carbozeOrders]);

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

  const totalCarboze    = kpis.totalBRL;
  const totalCarbozeOrders = kpis.totalVendas;

  // ── Crescimento Mês a Mês e Anual ────────────────────────────────────────────
  const growth = useMemo(() => {
    // Dados mensais (todos, sem slice de 12)
    const fullMap: Record<string, { faturado: number; pedidos: number }> = {};
    for (const o of carbozeOrders) {
      if (!o.created_at) continue;
      const key = o.created_at.slice(0, 7);
      if (!fullMap[key]) fullMap[key] = { faturado: 0, pedidos: 0 };
      fullMap[key].pedidos++;
      fullMap[key].faturado += Number(o.total ?? 0);
    }

    const sorted = Object.entries(fullMap).sort(([a], [b]) => a.localeCompare(b));

    // Mês atual e anterior (últimas 2 entradas com dados)
    const cur  = sorted[sorted.length - 1]?.[1] ?? { faturado: 0, pedidos: 0 };
    const prev = sorted[sorted.length - 2]?.[1] ?? { faturado: 0, pedidos: 0 };
    const curLabel  = sorted[sorted.length - 1]?.[0] ?? "";
    const prevLabel = sorted[sorted.length - 2]?.[0] ?? "";

    const pctBRLMonth   = prev.faturado > 0 ? ((cur.faturado - prev.faturado) / prev.faturado) * 100 : null;
    const pctQtyMonth   = prev.pedidos  > 0 ? ((cur.pedidos  - prev.pedidos)  / prev.pedidos)  * 100 : null;

    // Anual: ano atual (YTD) vs mesmo período ano anterior
    const currentYear = new Date().getFullYear();
    const currentMonthNum = new Date().getMonth() + 1; // 1-12

    let ytdCur  = { faturado: 0, pedidos: 0 };
    let ytdPrev = { faturado: 0, pedidos: 0 };

    for (const [key, val] of Object.entries(fullMap)) {
      const [y, m] = key.split("-").map(Number);
      if (y === currentYear && m <= currentMonthNum) {
        ytdCur.faturado += val.faturado;
        ytdCur.pedidos  += val.pedidos;
      }
      if (y === currentYear - 1 && m <= currentMonthNum) {
        ytdPrev.faturado += val.faturado;
        ytdPrev.pedidos  += val.pedidos;
      }
    }

    const pctBRLYear  = ytdPrev.faturado > 0 ? ((ytdCur.faturado - ytdPrev.faturado) / ytdPrev.faturado) * 100 : null;
    const pctQtyYear  = ytdPrev.pedidos  > 0 ? ((ytdCur.pedidos  - ytdPrev.pedidos)  / ytdPrev.pedidos)  * 100 : null;

    return {
      month: { brl: pctBRLMonth, qty: pctQtyMonth, curLabel, prevLabel },
      year:  { brl: pctBRLYear,  qty: pctQtyYear,  curYear: currentYear, prevYear: currentYear - 1 },
      raw: { cur, prev, ytdCur, ytdPrev },
    };
  }, [carbozeOrders]);

  const formatCurrency = (v: number) =>
    v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  function GrowthBadge({ pct }: { pct: number | null }) {
    if (pct === null) return <span className="text-xs text-board-muted">—</span>;
    const up = pct >= 0;
    return (
      <span className={`inline-flex items-center gap-0.5 text-sm font-bold ${up ? "text-green-500" : "text-red-400"}`}>
        {up ? "▲" : "▼"} {Math.abs(pct).toFixed(1)}%
      </span>
    );
  }

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
          {carbozeLoading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="rounded-xl border border-border bg-board-surface p-6">
                <Skeleton className="h-4 w-28 mb-3" />
                <Skeleton className="h-8 w-32 mb-2" />
                <Skeleton className="h-3 w-20" />
              </div>
            ))
          ) : (
            <>
              <KPICard
                title="Total de Vendas"
                value={kpis.totalVendas.toLocaleString("pt-BR")}
                subtitle="Pedidos ativos (excl. cancelados)"
                icon={<ShoppingCart className="h-6 w-6" />}
                variant="success"
              />
              <KPICard
                title="R$ Total Vendido"
                value={formatCurrency(kpis.totalBRL)}
                subtitle="Faturamento acumulado"
                icon={<DollarSign className="h-6 w-6" />}
                variant="success"
              />
              <KPICard
                title="Maior Venda"
                value={formatCurrency(kpis.maiorVenda)}
                subtitle="Maior pedido individual"
                icon={<Trophy className="h-6 w-6" />}
              />
              <KPICard
                title="Top Recorrência"
                value={kpis.topCliente.length > 18
                  ? kpis.topCliente.slice(0, 18) + "…"
                  : kpis.topCliente}
                subtitle={`${kpis.topQtd} pedido${kpis.topQtd !== 1 ? "s" : ""} · cliente mais frequente`}
                icon={<Repeat2 className="h-6 w-6" />}
              />
            </>
          )}
        </div>

        {/* ── Cards de Crescimento ─────────────────────────────────────── */}
        {!carbozeLoading && carbozeOrders.length > 0 && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">

            {/* Crescimento Mensal R$ */}
            <div className="rounded-xl border border-border bg-board-surface p-4 space-y-1">
              <p className="text-xs text-board-muted font-medium uppercase tracking-wider">Faturamento M/M</p>
              <GrowthBadge pct={growth.month.brl} />
              <div className="flex items-baseline gap-1 mt-1">
                <span className="text-sm font-semibold text-board-text">
                  {formatCurrency(growth.raw.cur.faturado)}
                </span>
              </div>
              <p className="text-[11px] text-board-muted">
                vs {growth.month.prevLabel}: {formatCurrency(growth.raw.prev.faturado)}
              </p>
            </div>

            {/* Crescimento Mensal Qtd */}
            <div className="rounded-xl border border-border bg-board-surface p-4 space-y-1">
              <p className="text-xs text-board-muted font-medium uppercase tracking-wider">Vendas M/M</p>
              <GrowthBadge pct={growth.month.qty} />
              <div className="flex items-baseline gap-1 mt-1">
                <span className="text-sm font-semibold text-board-text">
                  {growth.raw.cur.pedidos} pedidos
                </span>
              </div>
              <p className="text-[11px] text-board-muted">
                vs {growth.month.prevLabel}: {growth.raw.prev.pedidos} pedidos
              </p>
            </div>

            {/* Crescimento Anual R$ */}
            <div className="rounded-xl border border-border bg-board-surface p-4 space-y-1">
              <p className="text-xs text-board-muted font-medium uppercase tracking-wider">Faturamento YTD</p>
              <GrowthBadge pct={growth.year.brl} />
              <div className="flex items-baseline gap-1 mt-1">
                <span className="text-sm font-semibold text-board-text">
                  {formatCurrency(growth.raw.ytdCur.faturado)}
                </span>
                <span className="text-xs text-board-muted">{growth.year.curYear}</span>
              </div>
              <p className="text-[11px] text-board-muted">
                vs {growth.year.prevYear}: {formatCurrency(growth.raw.ytdPrev.faturado)}
              </p>
            </div>

            {/* Crescimento Anual Qtd */}
            <div className="rounded-xl border border-border bg-board-surface p-4 space-y-1">
              <p className="text-xs text-board-muted font-medium uppercase tracking-wider">Vendas YTD</p>
              <GrowthBadge pct={growth.year.qty} />
              <div className="flex items-baseline gap-1 mt-1">
                <span className="text-sm font-semibold text-board-text">
                  {growth.raw.ytdCur.pedidos} pedidos
                </span>
                <span className="text-xs text-board-muted">{growth.year.curYear}</span>
              </div>
              <p className="text-[11px] text-board-muted">
                vs {growth.year.prevYear}: {growth.raw.ytdPrev.pedidos} pedidos
              </p>
            </div>

          </div>
        )}

        {/* ── Evolução Mensal de Vendas ────────────────────────────────── */}
        <div className="rounded-xl border border-border bg-board-surface overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-border px-6 py-4">
            <div>
              <h2 className="text-lg font-semibold text-board-text flex items-center gap-2">
                <BarChart3 className="h-5 w-5 text-primary" />
                Evolução Mensal de Vendas
              </h2>
              <p className="text-sm text-board-muted mt-0.5">
                Total de vendas e faturamento mês a mês (via Bling) ·{" "}
                <span className="font-semibold text-board-text">
                  {totalCarbozeOrders} pedidos
                </span>
                {" · "}
                <span className="font-semibold text-green-500">
                  {totalCarboze.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} acumulado
                </span>
              </p>
            </div>
            <Link to="/vendas" className="text-sm text-primary hover:underline font-medium shrink-0">
              Ver vendas →
            </Link>
          </div>

          {carbozeLoading ? (
            <div className="flex items-center justify-center h-72">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : monthlyData.length === 0 ? (
            <div className="flex items-center justify-center h-72 text-sm text-board-muted">
              Nenhum dado encontrado para o período selecionado.
            </div>
          ) : (
            <div className="px-6 pt-4 pb-6 grid grid-cols-1 lg:grid-cols-2 gap-6">

              {/* ── Gráfico 1: Total Faturado R$ por mês ──────────────── */}
              <div className="rounded-xl border border-border bg-board-surface/50 p-4">
                <p className="text-xs font-semibold text-board-muted uppercase tracking-wider mb-1">
                  Total Faturado por Mês
                </p>
                <p className="text-lg font-bold text-green-500 mb-3">
                  {totalCarboze.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                  <span className="text-xs font-normal text-board-muted ml-1">acumulado</span>
                </p>
                <ResponsiveContainer width="100%" height={220}>
                  <ComposedChart data={monthlyData} margin={{ top: 24, right: 8, bottom: 0, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.08)" vertical={false} />
                    <XAxis dataKey="mes" tick={{ fontSize: 11, fill: "var(--board-muted, #94a3b8)" }} axisLine={false} tickLine={false} dy={4} />
                    <YAxis tick={{ fontSize: 10, fill: "var(--board-muted, #94a3b8)" }} axisLine={false} tickLine={false} width={44}
                      tickFormatter={v => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)} />
                    <Tooltip
                      cursor={{ fill: "rgba(148,163,184,0.06)" }}
                      contentStyle={{ background: "var(--board-surface, #1e2535)", border: "1px solid rgba(148,163,184,0.15)", borderRadius: 8, fontSize: 12 }}
                      labelStyle={{ color: "var(--board-text, #f1f5f9)", fontWeight: 700 }}
                      formatter={(v: number) => [v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }), "Faturado"]}
                    />
                    <Bar dataKey="faturado" fill="rgba(26,122,74,0.18)" stroke="#1a7a4a" strokeWidth={1.5} radius={[4, 4, 0, 0]} maxBarSize={48} isAnimationActive={false}>
                      <LabelList dataKey="faturado" position="top"
                        formatter={(v: number) => v >= 1000 ? `R$${(v / 1000).toFixed(0)}k` : `R$${v}`}
                        style={{ fontSize: 10, fill: "#1a7a4a", fontWeight: 700 }} />
                    </Bar>
                    <Line type="monotoneX" dataKey="faturado" stroke="#1a7a4a" strokeWidth={2.5}
                      dot={{ r: 3, fill: "#1a7a4a", stroke: "#fff", strokeWidth: 1.5 }} activeDot={{ r: 5 }} isAnimationActive={false} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>

              {/* ── Gráfico 2: Total de Vendas (qtd) por mês ─────────── */}
              <div className="rounded-xl border border-border bg-board-surface/50 p-4">
                <p className="text-xs font-semibold text-board-muted uppercase tracking-wider mb-1">
                  Total de Vendas por Mês
                </p>
                <p className="text-lg font-bold text-[#3b6ea5] mb-3">
                  {totalCarbozeOrders.toLocaleString("pt-BR")}
                  <span className="text-xs font-normal text-board-muted ml-1">pedidos no período</span>
                </p>
                <ResponsiveContainer width="100%" height={220}>
                  <ComposedChart data={monthlyData} margin={{ top: 24, right: 8, bottom: 0, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.08)" vertical={false} />
                    <XAxis dataKey="mes" tick={{ fontSize: 11, fill: "var(--board-muted, #94a3b8)" }} axisLine={false} tickLine={false} dy={4} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: "var(--board-muted, #94a3b8)" }} axisLine={false} tickLine={false} width={28} />
                    <Tooltip
                      cursor={{ fill: "rgba(148,163,184,0.06)" }}
                      contentStyle={{ background: "var(--board-surface, #1e2535)", border: "1px solid rgba(148,163,184,0.15)", borderRadius: 8, fontSize: 12 }}
                      labelStyle={{ color: "var(--board-text, #f1f5f9)", fontWeight: 700 }}
                      formatter={(v: number) => [v, "Vendas"]}
                    />
                    <Bar dataKey="pedidos" fill="rgba(59,110,165,0.75)" radius={[6, 6, 0, 0]} maxBarSize={48} isAnimationActive={false}>
                      <LabelList dataKey="pedidos" position="top"
                        style={{ fontSize: 11, fill: "var(--board-muted, #94a3b8)", fontWeight: 700 }} />
                    </Bar>
                    <Line type="monotoneX" dataKey="pedidos" stroke="#3b6ea5" strokeWidth={2} strokeDasharray="4 3"
                      dot={{ r: 3, fill: "#3b6ea5", stroke: "#fff", strokeWidth: 1.5 }} activeDot={{ r: 5 }} isAnimationActive={false} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>

            </div>
          )}
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

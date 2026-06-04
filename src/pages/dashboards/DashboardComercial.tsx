import { BoardLayout } from "@/components/layouts/BoardLayout";
import { CarboPageHeader } from "@/components/ui/carbo-page-header";
import { KPICard } from "@/components/board/KPICard";
import { TrendingUp, ShoppingCart, DollarSign, Trophy, Loader2, BarChart3, Repeat2, ArrowUpRight, ArrowDownRight, Minus } from "lucide-react";
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

    // Maior venda + cliente
    const maiorOrdem = active.reduce<{ total: number; cliente: string } | null>((best, o) => {
      const t = Number(o.total ?? 0);
      return !best || t > best.total ? { total: t, cliente: o.customer_name?.trim() || "—" } : best;
    }, null);
    const maiorVenda    = maiorOrdem?.total ?? 0;
    const maiorCliente  = maiorOrdem?.cliente ?? "—";

    // Cliente com mais recorrência
    const clientCount: Record<string, number> = {};
    for (const o of active) {
      const name = o.customer_name?.trim() || "—";
      clientCount[name] = (clientCount[name] || 0) + 1;
    }
    const [topCliente, topQtd] = Object.entries(clientCount)
      .sort(([, a], [, b]) => b - a)[0] ?? ["—", 0];

    return { totalVendas, totalBRL, maiorVenda, maiorCliente, topCliente, topQtd };
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

  // ── Crescimento M/M e Último Mês vs Janeiro ─────────────────────────────────
  const growth = useMemo(() => {
    const fullMap: Record<string, { faturado: number; pedidos: number }> = {};
    for (const o of carbozeOrders) {
      if (!o.created_at) continue;
      if (o.status === "cancelled" || o.status === "cancelado") continue;
      const key = o.created_at.slice(0, 7);
      if (!fullMap[key]) fullMap[key] = { faturado: 0, pedidos: 0 };
      fullMap[key].pedidos++;
      fullMap[key].faturado += Number(o.total ?? 0);
    }

    const sorted = Object.entries(fullMap).sort(([a], [b]) => a.localeCompare(b));
    const n = sorted.length;

    const pct = (cur: number, prev: number) =>
      prev > 0 ? ((cur - prev) / prev) * 100 : null;

    const fmtMonthKey = (key: string) => {
      try {
        const [y, m] = key.split("-");
        return format(new Date(parseInt(y), parseInt(m) - 1, 1), "MMM/yy", { locale: ptBR });
      } catch { return key; }
    };

    // Card 1: último mês vs mês anterior (M/M)
    const curEntry  = sorted[n - 1];
    const prevEntry = sorted[n - 2];
    const cur  = curEntry?.[1]  ?? { faturado: 0, pedidos: 0 };
    const prev = prevEntry?.[1] ?? { faturado: 0, pedidos: 0 };

    // Card 2: último mês vs Janeiro do ano corrente
    const currentYear = new Date().getFullYear();
    const janKey = `${currentYear}-01`;
    const jan    = fullMap[janKey] ?? null;

    return {
      mom: {
        brl: pct(cur.faturado, prev.faturado),
        qty: pct(cur.pedidos,  prev.pedidos),
        curLabel:  curEntry  ? fmtMonthKey(curEntry[0])  : "—",
        prevLabel: prevEntry ? fmtMonthKey(prevEntry[0]) : "—",
        cur, prev,
      },
      vsJan: {
        brl: jan ? pct(cur.faturado, jan.faturado) : null,
        qty: jan ? pct(cur.pedidos,  jan.pedidos)  : null,
        curLabel:  curEntry ? fmtMonthKey(curEntry[0]) : "—",
        janLabel:  fmtMonthKey(janKey),
        cur, jan: jan ?? { faturado: 0, pedidos: 0 },
      },
    };
  }, [carbozeOrders]);

  const formatCurrency = (v: number) =>
    v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  const fmtK = (v: number) =>
    v >= 1_000_000 ? `R$${(v / 1_000_000).toFixed(1)}M`
    : v >= 1000    ? `R$${(v / 1000).toFixed(0)}k`
    : formatCurrency(v);

  return (
    <BoardLayout>
      <div className="space-y-6 max-w-[1600px] mx-auto">
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
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {carbozeLoading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="rounded-2xl border border-border bg-board-surface p-6">
                <Skeleton className="h-4 w-28 mb-4" />
                <Skeleton className="h-10 w-36 mb-3" />
                <Skeleton className="h-3 w-24" />
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
                subtitle={kpis.maiorCliente.length > 22
                  ? kpis.maiorCliente.slice(0, 22) + "…"
                  : kpis.maiorCliente}
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
        {!carbozeLoading && carbozeOrders.length > 0 && (() => {
          const groups = [
            {
              groupLabel: "Crescimento Mês a Mês",
              groupSub: `${growth.mom.curLabel} vs ${growth.mom.prevLabel}`,
              color: "blue" as const,
              cards: [
                {
                  label: "Faturamento",
                  pct: growth.mom.brl,
                  current: fmtK(growth.mom.cur.faturado),
                  ref: `${growth.mom.prevLabel}: ${fmtK(growth.mom.prev.faturado)}`,
                },
                {
                  label: "Volume de Vendas",
                  pct: growth.mom.qty,
                  current: `${growth.mom.cur.pedidos} pedidos`,
                  ref: `${growth.mom.prevLabel}: ${growth.mom.prev.pedidos} pedidos`,
                },
              ],
            },
            {
              groupLabel: `Último Mês vs Janeiro`,
              groupSub: `${growth.vsJan.curLabel} vs ${growth.vsJan.janLabel}`,
              color: "green" as const,
              cards: [
                {
                  label: "Faturamento",
                  pct: growth.vsJan.brl,
                  current: fmtK(growth.vsJan.cur.faturado),
                  ref: `${growth.vsJan.janLabel}: ${fmtK(growth.vsJan.jan.faturado)}`,
                },
                {
                  label: "Volume de Vendas",
                  pct: growth.vsJan.qty,
                  current: `${growth.vsJan.cur.pedidos} pedidos`,
                  ref: `${growth.vsJan.janLabel}: ${growth.vsJan.jan.pedidos} pedidos`,
                },
              ],
            },
          ];

          const colorMap = {
            blue:  { stripe: "bg-blue-500",  border: "border-blue-500/20",  tag: "bg-blue-500/10 text-blue-500" },
            green: { stripe: "bg-green-500", border: "border-green-500/20", tag: "bg-green-500/10 text-green-600" },
          };

          return (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {groups.map(group => (
                <div key={group.groupLabel} className={`rounded-xl border overflow-hidden bg-board-surface ${colorMap[group.color].border}`}>
                  <div className={`h-1 w-full ${colorMap[group.color].stripe}`} />
                  <div className="px-5 pt-4 pb-3 border-b border-border/50">
                    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider ${colorMap[group.color].tag}`}>
                      {group.groupLabel}
                    </span>
                    <p className="text-xs text-board-muted mt-1 font-medium">{group.groupSub}</p>
                  </div>
                  <div className="grid grid-cols-2 divide-x divide-border/50">
                    {group.cards.map((card, ci) => {
                      const isUp      = card.pct !== null && card.pct >= 0;
                      const isNeutral = card.pct === null;
                      return (
                        <div key={ci} className="p-5 space-y-3">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-xs font-semibold text-board-muted uppercase tracking-wider">
                              {card.label}
                            </p>
                            {isNeutral ? (
                              <span className="flex items-center gap-0.5 rounded-md px-2 py-1 text-xs font-bold bg-muted text-board-muted shrink-0">
                                <Minus className="h-3 w-3" /> s/d
                              </span>
                            ) : (
                              <span className={`flex items-center gap-0.5 rounded-md px-2 py-1 text-sm font-bold shrink-0
                                ${isUp ? "bg-green-500/10 text-green-500" : "bg-red-400/10 text-red-400"}`}>
                                {isUp ? <ArrowUpRight className="h-4 w-4" /> : <ArrowDownRight className="h-4 w-4" />}
                                {Math.abs(card.pct!).toFixed(1)}%
                              </span>
                            )}
                          </div>
                          <p className={`text-2xl font-bold tabular-nums leading-none
                            ${isNeutral ? "text-board-text" : isUp ? "text-green-500" : "text-red-400"}`}>
                            {card.current}
                          </p>
                          <p className="text-xs text-board-muted">{card.ref}</p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          );
        })()}

        {/* ── Evolução Mensal de Vendas ────────────────────────────────── */}
        <div className="rounded-2xl border border-border bg-board-surface overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-border px-6 py-5">
            <div>
              <h2 className="text-xl font-bold text-board-text flex items-center gap-2">
                <BarChart3 className="h-5 w-5 text-primary" />
                Evolução Mensal de Vendas
              </h2>
              <p className="text-sm text-board-muted mt-1">
                Via Bling ·{" "}
                <span className="font-semibold text-board-text">{totalCarbozeOrders} pedidos</span>
                {" · "}
                <span className="font-semibold text-green-500">
                  {totalCarboze.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} acumulado
                </span>
              </p>
            </div>
            <Link to="/vendas" className="text-sm font-semibold text-primary hover:underline shrink-0 flex items-center gap-1">
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
            <div className="px-6 pt-6 pb-8 grid grid-cols-1 lg:grid-cols-2 gap-6">

              {/* ── Gráfico 1: Total Faturado R$ por mês ──────────────── */}
              <div className="rounded-xl border border-border bg-board-surface/40 p-5">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <p className="text-xs font-semibold text-board-muted uppercase tracking-widest mb-1">
                      Total Faturado por Mês
                    </p>
                    <p className="text-3xl font-bold text-green-500 leading-none tabular-nums">
                      {fmtK(totalCarboze)}
                    </p>
                    <p className="text-xs text-board-muted mt-1">acumulado no período</p>
                  </div>
                  <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase bg-green-500/10 text-green-500">R$</span>
                </div>
                <ResponsiveContainer width="100%" height={260}>
                  <ComposedChart data={monthlyData} margin={{ top: 28, right: 12, bottom: 4, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.08)" vertical={false} />
                    <XAxis dataKey="mes" tick={{ fontSize: 12, fill: "var(--board-muted, #94a3b8)" }} axisLine={false} tickLine={false} dy={6} />
                    <YAxis tick={{ fontSize: 11, fill: "var(--board-muted, #94a3b8)" }} axisLine={false} tickLine={false} width={48}
                      tickFormatter={v => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)} />
                    <Tooltip
                      cursor={{ fill: "rgba(148,163,184,0.06)" }}
                      contentStyle={{ background: "var(--board-surface, #1e2535)", border: "1px solid rgba(148,163,184,0.15)", borderRadius: 10, fontSize: 13, padding: "10px 14px" }}
                      labelStyle={{ color: "var(--board-text, #f1f5f9)", fontWeight: 700, marginBottom: 4 }}
                      formatter={(v: number) => [v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }), "Faturado"]}
                    />
                    <Bar dataKey="faturado" fill="rgba(26,122,74,0.18)" stroke="#1a7a4a" strokeWidth={1.5} radius={[5, 5, 0, 0]} maxBarSize={52} isAnimationActive={false}>
                      <LabelList dataKey="faturado" position="top"
                        formatter={(v: number) => v >= 1000 ? `R$${(v / 1000).toFixed(0)}k` : `R$${v}`}
                        style={{ fontSize: 11, fill: "#1a7a4a", fontWeight: 700 }} />
                    </Bar>
                    <Line type="monotoneX" dataKey="faturado" stroke="#1a7a4a" strokeWidth={2.5}
                      dot={{ r: 4, fill: "#1a7a4a", stroke: "#fff", strokeWidth: 2 }} activeDot={{ r: 6 }} isAnimationActive={false} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>

              {/* ── Gráfico 2: Total de Vendas (qtd) por mês ─────────── */}
              <div className="rounded-xl border border-border bg-board-surface/40 p-5">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <p className="text-xs font-semibold text-board-muted uppercase tracking-widest mb-1">
                      Total de Vendas por Mês
                    </p>
                    <p className="text-3xl font-bold text-[#3b6ea5] leading-none tabular-nums">
                      {totalCarbozeOrders.toLocaleString("pt-BR")}
                    </p>
                    <p className="text-xs text-board-muted mt-1">pedidos no período</p>
                  </div>
                  <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase bg-blue-500/10 text-blue-400">Qtd</span>
                </div>
                <ResponsiveContainer width="100%" height={260}>
                  <ComposedChart data={monthlyData} margin={{ top: 28, right: 12, bottom: 4, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.08)" vertical={false} />
                    <XAxis dataKey="mes" tick={{ fontSize: 12, fill: "var(--board-muted, #94a3b8)" }} axisLine={false} tickLine={false} dy={6} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "var(--board-muted, #94a3b8)" }} axisLine={false} tickLine={false} width={32} />
                    <Tooltip
                      cursor={{ fill: "rgba(148,163,184,0.06)" }}
                      contentStyle={{ background: "var(--board-surface, #1e2535)", border: "1px solid rgba(148,163,184,0.15)", borderRadius: 10, fontSize: 13, padding: "10px 14px" }}
                      labelStyle={{ color: "var(--board-text, #f1f5f9)", fontWeight: 700, marginBottom: 4 }}
                      formatter={(v: number) => [v, "Vendas"]}
                    />
                    <Bar dataKey="pedidos" fill="rgba(59,110,165,0.75)" radius={[6, 6, 0, 0]} maxBarSize={52} isAnimationActive={false}>
                      <LabelList dataKey="pedidos" position="top"
                        style={{ fontSize: 12, fill: "var(--board-muted, #94a3b8)", fontWeight: 700 }} />
                    </Bar>
                    <Line type="monotoneX" dataKey="pedidos" stroke="#3b6ea5" strokeWidth={2.5} strokeDasharray="5 3"
                      dot={{ r: 4, fill: "#3b6ea5", stroke: "#fff", strokeWidth: 2 }} activeDot={{ r: 6 }} isAnimationActive={false} />
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

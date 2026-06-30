import { BoardLayout } from "@/components/layouts/BoardLayout";
import { CarboPageHeader } from "@/components/ui/carbo-page-header";
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
  // orders table removed — use /orders page via link

  // Vendas Bling — fonte principal (KPIs + gráfico)
  const { data: carbozeOrders = [], isLoading: carbozeLoading } = useQuery({
    queryKey: ["carboze-orders-monthly", filters.from, filters.to, filters.vendedor, filters.segmento],
    queryFn: async () => {
      let q = (supabase as any)
        .from("carboze_orders")
        .select("id, total, status, created_at, order_number, vendedor_name, customer_name, segmento")
        .order("created_at", { ascending: true });
      if (filters.from)               q = q.gte("created_at", filters.from + "T00:00:00.000Z");
      if (filters.to)                 q = q.lte("created_at", filters.to + "T23:59:59.999Z");
      if (filters.vendedor !== "all") q = q.eq("vendedor_name", filters.vendedor);
      if (filters.segmento && filters.segmento !== "all") {
        q = filters.segmento === "none" ? q.is("segmento", null) : q.eq("segmento", filters.segmento);
      }
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as {
        id: string; total: number; status: string;
        created_at: string; order_number: string;
        vendedor_name: string; customer_name: string;
        segmento: "consumo" | "revenda" | "online" | null;
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

    const ticketMedio = totalVendas > 0 ? totalBRL / totalVendas : 0;
    return { totalVendas, totalBRL, maiorVenda, maiorCliente, topCliente, topQtd, ticketMedio };
  }, [carbozeOrders]);

  // ── Segmentação: Consumo (B2B) vs Revenda (PDV) ─────────────────────────────
  const segmentacao = useMemo(() => {
    const active = carbozeOrders.filter(o => o.status !== "cancelled" && o.status !== "cancelado");
    const acc = {
      consumo: { qtd: 0, brl: 0 },
      revenda: { qtd: 0, brl: 0 },
      online: { qtd: 0, brl: 0 },
      naoClassificado: { qtd: 0, brl: 0 },
    };
    for (const o of active) {
      const bucket = o.segmento === "consumo" ? acc.consumo
                   : o.segmento === "revenda" ? acc.revenda
                   : o.segmento === "online" ? acc.online
                   : acc.naoClassificado;
      bucket.qtd++;
      bucket.brl += Number(o.total ?? 0);
    }
    const totalBRL = acc.consumo.brl + acc.revenda.brl + acc.online.brl + acc.naoClassificado.brl;
    const pct = (v: number) => totalBRL > 0 ? (v / totalBRL) * 100 : 0;
    return { ...acc, totalBRL, pct };
  }, [carbozeOrders]);

  // ── Faturamento por Canal, mês a mês (para gráfico de barras empilhadas) ────
  const monthlySegmentData = useMemo(() => {
    const map: Record<string, { consumo: number; revenda: number; online: number; nc: number }> = {};
    for (const o of carbozeOrders) {
      if (!o.created_at) continue;
      if (o.status === "cancelled" || o.status === "cancelado") continue;
      const key = o.created_at.slice(0, 7);
      if (!map[key]) map[key] = { consumo: 0, revenda: 0, online: 0, nc: 0 };
      const v = Number(o.total ?? 0);
      if (o.segmento === "consumo") map[key].consumo += v;
      else if (o.segmento === "revenda") map[key].revenda += v;
      else if (o.segmento === "online") map[key].online += v;
      else map[key].nc += v;
    }
    return Object.entries(map)
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-12)
      .map(([key, v]) => {
        try {
          const [y, m] = key.split("-");
          const mes = format(new Date(parseInt(y), parseInt(m) - 1, 1), "MMM/yy", { locale: ptBR });
          return { mes, ...v };
        } catch {
          return { mes: key, ...v };
        }
      });
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
          const ticketMedio = v.pedidos > 0 ? Math.round(v.faturado / v.pedidos) : 0;
          return { mes: label, ...v, ticketMedio };
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

  // ── Crescimento Anual: real vs projeção +25%/mês desde R$30k ───────────────
  const annualGrowthData = useMemo(() => {
    const BASE_JAN = 30_000;
    const RATE     = 0.15;
    const currentYear = new Date().getFullYear();

    const realMap: Record<string, number> = {};
    for (const o of carbozeOrders) {
      if (!o.created_at) continue;
      if (o.status === "cancelled" || o.status === "cancelado") continue;
      const key = o.created_at.slice(0, 7);
      realMap[key] = (realMap[key] ?? 0) + Number(o.total ?? 0);
    }

    return Array.from({ length: 12 }, (_, i) => {
      const monthKey = `${currentYear}-${String(i + 1).padStart(2, "0")}`;
      const label    = format(new Date(currentYear, i, 1), "MMM/yy", { locale: ptBR });
      const projecao = Math.round(BASE_JAN * Math.pow(1 + RATE, i));
      const real     = realMap[monthKey] != null ? realMap[monthKey] : null;
      return { label, projecao, real };
    });
  }, [carbozeOrders]);

  const formatCurrency = (v: number) =>
    v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  const fmtK = (v: number) =>
    v >= 1_000_000 ? `R$${(v / 1_000_000).toFixed(1)}M`
    : v >= 1000    ? `R$${(v / 1000).toFixed(0)}k`
    : formatCurrency(v);

  // Tooltip customizado — evita entradas duplicadas (Bar + Line com mesmo dataKey)
  const TooltipBRL = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    const main = payload.find((p: any) => p.type === "bar") ?? payload[0];
    return (
      <div style={{ background: "#1a2234", border: "1px solid rgba(255,255,255,0.14)", boxShadow: "0 8px 28px rgba(0,0,0,0.45)", borderRadius: 10, padding: "8px 14px", fontSize: 12 }}>
        <p style={{ color: "#fff", fontWeight: 700, marginBottom: 6, fontSize: 13 }}>{label}</p>
        <p style={{ color: "#4ade80" }}>{Number(main.value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</p>
      </div>
    );
  };

  const TooltipQty = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    const main = payload.find((p: any) => p.type === "bar") ?? payload[0];
    return (
      <div style={{ background: "#1a2234", border: "1px solid rgba(255,255,255,0.14)", boxShadow: "0 8px 28px rgba(0,0,0,0.45)", borderRadius: 10, padding: "8px 14px", fontSize: 12 }}>
        <p style={{ color: "#fff", fontWeight: 700, marginBottom: 6, fontSize: 13 }}>{label}</p>
        <p style={{ color: "#93c5fd" }}>{Number(main.value)} vendas</p>
      </div>
    );
  };

  return (
    <BoardLayout>
      <div className="space-y-3 max-w-[1600px] mx-auto">
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
            showSegmento
            className="sm:pt-1 shrink-0"
          />
        </div>

        {/* KPIs */}
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-5">
          {carbozeLoading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="rounded-xl border border-border bg-board-surface p-4">
                <Skeleton className="h-3 w-24 mb-3" />
                <Skeleton className="h-7 w-28 mb-2" />
                <Skeleton className="h-3 w-20" />
              </div>
            ))
          ) : (
            <>
              {/* Helper: text size adapts to string length */}
              {[
                {
                  title: "Total de Vendas",
                  value: kpis.totalVendas.toLocaleString("pt-BR"),
                  sub: "Pedidos ativos (excl. cancelados)",
                  icon: ShoppingCart,
                  accent: "border-l-green-500",
                  iconBg: "bg-green-500/10 text-green-600",
                },
                {
                  title: "R$ Total Vendido",
                  value: fmtK(kpis.totalBRL),
                  sub: "Faturamento acumulado",
                  icon: DollarSign,
                  accent: "border-l-green-500",
                  iconBg: "bg-green-500/10 text-green-600",
                },
                {
                  title: "Maior Venda",
                  value: fmtK(kpis.maiorVenda),
                  sub: kpis.maiorCliente,
                  icon: Trophy,
                  accent: "border-l-amber-400",
                  iconBg: "bg-amber-400/10 text-amber-500",
                },
                {
                  title: "Top Recorrência",
                  value: kpis.topCliente,
                  sub: `${kpis.topQtd} pedido${kpis.topQtd !== 1 ? "s" : ""} · mais frequente`,
                  icon: Repeat2,
                  accent: "border-l-blue-400",
                  iconBg: "bg-blue-400/10 text-blue-500",
                },
                {
                  title: "Ticket Médio",
                  value: fmtK(kpis.ticketMedio),
                  sub: "Por pedido (período)",
                  icon: TrendingUp,
                  accent: "border-l-violet-400",
                  iconBg: "bg-violet-400/10 text-violet-500",
                },
              ].map(({ title, value, sub, icon: Icon, accent, iconBg }) => {
                // Responsive font: shrink if value is long
                const valLen = String(value).length;
                const valSize = valLen <= 6  ? "text-3xl"
                              : valLen <= 10 ? "text-2xl"
                              : valLen <= 16 ? "text-xl"
                              : "text-base";
                return (
                  <div key={title} className={`relative overflow-hidden rounded-xl bg-board-surface p-4 border-l-4 ${accent} kpi-glow transition-all hover:-translate-y-0.5`}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium text-board-muted truncate">{title}</p>
                        <p className={`mt-1.5 font-bold text-board-text leading-tight break-words ${valSize}`}>
                          {value}
                        </p>
                        {sub && (
                          <p className="mt-1 text-xs text-board-muted leading-snug line-clamp-2" title={sub}>
                            {sub}
                          </p>
                        )}
                      </div>
                      <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${iconBg}`}>
                        <Icon className="h-4.5 w-4.5" />
                      </div>
                    </div>
                  </div>
                );
              })}
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
                  <div className="px-4 pt-3 pb-2 border-b border-border/50">
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${colorMap[group.color].tag}`}>
                      {group.groupLabel}
                    </span>
                    <p className="text-[11px] text-board-muted mt-0.5 font-medium">{group.groupSub}</p>
                  </div>
                  <div className="grid grid-cols-2 divide-x divide-border/50">
                    {group.cards.map((card, ci) => {
                      const isUp      = card.pct !== null && card.pct >= 0;
                      const isNeutral = card.pct === null;
                      return (
                        <div key={ci} className="p-4 space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-[10px] font-semibold text-board-muted uppercase tracking-wider">
                              {card.label}
                            </p>
                            {isNeutral ? (
                              <span className="flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[11px] font-bold bg-muted text-board-muted shrink-0">
                                <Minus className="h-3 w-3" /> s/d
                              </span>
                            ) : (
                              <span className={`flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-xs font-bold shrink-0
                                ${isUp ? "bg-green-500/10 text-green-500" : "bg-red-400/10 text-red-400"}`}>
                                {isUp ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
                                {Math.abs(card.pct!).toFixed(1)}%
                              </span>
                            )}
                          </div>
                          <p className={`text-xl font-bold tabular-nums leading-none
                            ${isNeutral ? "text-board-text" : isUp ? "text-green-500" : "text-red-400"}`}>
                            {card.current}
                          </p>
                          <p className="text-[11px] text-board-muted">{card.ref}</p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          );
        })()}

        {/* ── Segmentação: Consumo (B2B) vs Revenda (PDV) ───────────────── */}
        {!carbozeLoading && carbozeOrders.length > 0 && (
          <div className="rounded-2xl border border-border bg-board-surface overflow-hidden">
            <div className="flex items-center justify-between border-b border-border px-6 py-3">
              <div>
                <h2 className="text-base font-bold text-board-text flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 text-blue-400" />
                  Vendas por Canal
                </h2>
                <p className="text-xs text-board-muted mt-0.5">
                  Consumo (B2B) vs Revenda (Ponto de Venda) · classifique cada pedido em{" "}
                  <Link to="/orders" className="font-semibold text-primary hover:underline">Pedidos</Link>
                </p>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 p-4">
              {[
                { key: "consumo", label: "Consumo (B2B)", data: segmentacao.consumo,
                  accent: "border-l-blue-500", bar: "bg-blue-500", text: "text-blue-400" },
                { key: "revenda", label: "Revenda (PDV)", data: segmentacao.revenda,
                  accent: "border-l-amber-400", bar: "bg-amber-400", text: "text-amber-500" },
                { key: "online", label: "On-line", data: segmentacao.online,
                  accent: "border-l-green-500", bar: "bg-green-500", text: "text-green-500" },
                { key: "naoClassificado", label: "Não classificado", data: segmentacao.naoClassificado,
                  accent: "border-l-slate-400", bar: "bg-slate-400", text: "text-board-muted" },
              ].map(({ key, label, data, accent, bar, text }) => {
                const pct = segmentacao.pct(data.brl);
                return (
                  <div key={key} className={`rounded-xl bg-board-surface/60 border-l-4 ${accent} p-4`}>
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold text-board-muted uppercase tracking-wider">{label}</p>
                      <span className={`text-xs font-bold ${text}`}>{pct.toFixed(0)}%</span>
                    </div>
                    <p className="mt-1.5 text-2xl font-bold text-board-text tabular-nums leading-none">
                      {fmtK(data.brl)}
                    </p>
                    <p className="mt-1 text-xs text-board-muted">
                      {data.qtd} pedido{data.qtd !== 1 ? "s" : ""}
                    </p>
                    <div className="mt-2 h-1.5 w-full rounded-full bg-muted overflow-hidden">
                      <div className={`h-full ${bar} rounded-full`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Faturamento por Canal (mês a mês) — barras empilhadas ─────── */}
        {!carbozeLoading && monthlySegmentData.length > 0 && (
          <div className="rounded-2xl border border-border bg-board-surface overflow-hidden">
            <div className="flex items-center justify-between border-b border-border px-6 py-3">
              <div>
                <h2 className="text-base font-bold text-board-text flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 text-blue-400" />
                  Faturamento por Canal (mês a mês)
                </h2>
                <p className="text-xs text-board-muted mt-0.5">
                  Composição mensal entre Consumo, Revenda, On-line e Não classificado
                </p>
              </div>
              {/* Legenda */}
              <div className="hidden sm:flex items-center gap-3 text-[10px] text-board-muted">
                {[
                  { label: "Consumo", color: "#3b82f6" },
                  { label: "Revenda", color: "#f59e0b" },
                  { label: "On-line", color: "#22c55e" },
                  { label: "Não class.", color: "#94a3b8" },
                ].map((l) => (
                  <span key={l.label} className="flex items-center gap-1">
                    <span className="inline-block w-3 h-3 rounded-sm" style={{ background: l.color }} />
                    {l.label}
                  </span>
                ))}
              </div>
            </div>
            <div className="px-4 pt-4 pb-4">
              <ResponsiveContainer width="100%" height={230}>
                <ComposedChart data={monthlySegmentData} margin={{ top: 12, right: 8, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.08)" vertical={false} />
                  <XAxis dataKey="mes" tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} dy={4} />
                  <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} width={44}
                    tickFormatter={v => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)} />
                  <Tooltip
                    cursor={{ fill: "rgba(148,163,184,0.08)" }}
                    content={({ active, payload, label }: any) => {
                      if (!active || !payload?.length) return null;
                      const rows = [
                        { k: "consumo", label: "Consumo", color: "#60a5fa" },
                        { k: "revenda", label: "Revenda", color: "#fbbf24" },
                        { k: "online",  label: "On-line", color: "#4ade80" },
                        { k: "nc",      label: "Não classificado", color: "#cbd5e1" },
                      ];
                      const get = (k: string) => Number(payload.find((p: any) => p.dataKey === k)?.value ?? 0);
                      const total = rows.reduce((s, r) => s + get(r.k), 0);
                      return (
                        <div style={{ background: "#1a2234", border: "1px solid rgba(255,255,255,0.14)", boxShadow: "0 8px 28px rgba(0,0,0,0.45)", borderRadius: 10, padding: "8px 14px", fontSize: 12 }}>
                          <p style={{ color: "#fff", fontWeight: 700, marginBottom: 6, fontSize: 13 }}>{label}</p>
                          {rows.filter(r => get(r.k) > 0).map(r => (
                            <p key={r.k} style={{ color: r.color }}>{r.label}: {fmtK(get(r.k))}</p>
                          ))}
                          <p style={{ color: "#fff", fontWeight: 600, marginTop: 4, borderTop: "1px solid rgba(255,255,255,0.1)", paddingTop: 4 }}>
                            Total: {fmtK(total)}
                          </p>
                        </div>
                      );
                    }}
                  />
                  <Bar dataKey="consumo" stackId="canal" fill="#3b82f6" maxBarSize={48} isAnimationActive={false} name="Consumo" />
                  <Bar dataKey="revenda" stackId="canal" fill="#f59e0b" maxBarSize={48} isAnimationActive={false} name="Revenda" />
                  <Bar dataKey="online"  stackId="canal" fill="#22c55e" maxBarSize={48} isAnimationActive={false} name="On-line" />
                  <Bar dataKey="nc"      stackId="canal" fill="#94a3b8" maxBarSize={48} radius={[4, 4, 0, 0]} isAnimationActive={false} name="Não classificado" />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* ── Evolução Mensal de Vendas ────────────────────────────────── */}
        <div className="rounded-2xl border border-border bg-board-surface overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-border px-6 py-3">
            <div>
              <h2 className="text-base font-bold text-board-text flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-primary" />
                Evolução Mensal de Vendas
              </h2>
              <p className="text-xs text-board-muted mt-0.5">
                Via Bling ·{" "}
                <span className="font-semibold text-board-text">{totalCarbozeOrders} pedidos</span>
                {" · "}
                <span className="font-semibold text-green-500">
                  {totalCarboze.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} acumulado
                </span>
              </p>
            </div>
            <Link to="/vendas" className="text-xs font-semibold text-primary hover:underline shrink-0">
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
            <div className="px-4 pt-4 pb-4 grid grid-cols-1 lg:grid-cols-2 gap-4">

              {/* ── Gráfico 1: Total Faturado R$ por mês ──────────────── */}
              <div className="rounded-lg border border-border bg-board-surface/40 p-4">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <p className="text-[10px] font-bold text-board-muted uppercase tracking-widest">Total Faturado por Mês</p>
                    <p className="text-xl font-bold text-green-500 leading-none tabular-nums mt-0.5">
                      {fmtK(totalCarboze)}
                      <span className="text-xs font-normal text-board-muted ml-1">acumulado</span>
                    </p>
                  </div>
                  <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold bg-green-500/10 text-green-500">R$</span>
                </div>
                <ResponsiveContainer width="100%" height={190}>
                  <ComposedChart data={monthlyData} margin={{ top: 22, right: 8, bottom: 0, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.08)" vertical={false} />
                    <XAxis dataKey="mes" tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} dy={4} />
                    <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} width={44}
                      tickFormatter={v => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)} />
                    <Tooltip cursor={{ fill: "rgba(148,163,184,0.08)" }} content={<TooltipBRL />} />
                    <Bar dataKey="faturado" fill="rgba(26,122,74,0.18)" stroke="#1a7a4a" strokeWidth={1.5} radius={[4, 4, 0, 0]} maxBarSize={48} isAnimationActive={false}>
                      <LabelList dataKey="faturado" position="top"
                        formatter={(v: number) => v >= 1000 ? `R$${(v / 1000).toFixed(0)}k` : `R$${v}`}
                        style={{ fontSize: 10, fill: "#1a7a4a", fontWeight: 700 }} />
                    </Bar>
                    <Line type="monotoneX" dataKey="faturado" stroke="#1a7a4a" strokeWidth={2.5}
                      dot={{ r: 3, fill: "#1a7a4a", stroke: "#fff", strokeWidth: 2 }} activeDot={{ r: 5 }} isAnimationActive={false} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>

              {/* ── Gráfico 2: Total de Vendas (qtd) por mês ─────────── */}
              <div className="rounded-lg border border-border bg-board-surface/40 p-4">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <p className="text-[10px] font-bold text-board-muted uppercase tracking-widest">Total de Vendas por Mês</p>
                    <p className="text-xl font-bold text-[#3b6ea5] leading-none tabular-nums mt-0.5">
                      {totalCarbozeOrders.toLocaleString("pt-BR")}
                      <span className="text-xs font-normal text-board-muted ml-1">pedidos</span>
                    </p>
                  </div>
                  <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold bg-blue-500/10 text-blue-400">Qtd</span>
                </div>
                <ResponsiveContainer width="100%" height={190}>
                  <ComposedChart data={monthlyData} margin={{ top: 22, right: 8, bottom: 0, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.08)" vertical={false} />
                    <XAxis dataKey="mes" tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} dy={4} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} width={28} />
                    <Tooltip cursor={{ fill: "rgba(148,163,184,0.08)" }} content={<TooltipQty />} />
                    <Bar dataKey="pedidos" fill="rgba(59,110,165,0.75)" radius={[5, 5, 0, 0]} maxBarSize={48} isAnimationActive={false}>
                      <LabelList dataKey="pedidos" position="top"
                        style={{ fontSize: 11, fill: "#94a3b8", fontWeight: 700 }} />
                    </Bar>
                    <Line type="monotoneX" dataKey="pedidos" stroke="#3b6ea5" strokeWidth={2.5} strokeDasharray="5 3"
                      dot={{ r: 3, fill: "#3b6ea5", stroke: "#fff", strokeWidth: 2 }} activeDot={{ r: 5 }} isAnimationActive={false} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>

            </div>
          )}
        </div>

        {/* ── Grid inferior: Crescimento Anual + Ticket Médio ─────────── */}
        {!carbozeLoading && monthlyData.length > 0 && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">

            {/* ── Crescimento Anual (Curva S) ─────────────────────────── */}
            <div className="rounded-2xl border border-border bg-board-surface overflow-hidden">
              <div className="flex items-center justify-between border-b border-border px-6 py-3">
                <div>
                  <h2 className="text-base font-bold text-board-text flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-orange-400" />
                    Crescimento Anual
                  </h2>
                  <p className="text-xs text-board-muted mt-0.5">
                    Real vs projeção +15%/mês ·{" "}
                    <span className="font-semibold text-orange-400">base R$30k jan/26</span>
                  </p>
                </div>
                {/* Legenda */}
                <div className="flex items-center gap-3 text-[10px] text-board-muted">
                  <span className="flex items-center gap-1">
                    <span className="inline-block w-3 h-3 rounded-sm bg-emerald-500/70" />
                    Real
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="inline-block w-5 border-t-2 border-dashed border-orange-400" />
                    Meta
                  </span>
                </div>
              </div>
              <div className="px-4 pt-4 pb-4">
                <ResponsiveContainer width="100%" height={175}>
                  <ComposedChart data={annualGrowthData} margin={{ top: 20, right: 8, bottom: 0, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.08)" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} dy={4} />
                    <YAxis
                      tick={{ fontSize: 10, fill: "#94a3b8" }}
                      axisLine={false} tickLine={false} width={44}
                      tickFormatter={v => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)}
                    />
                    <Tooltip
                      cursor={{ fill: "rgba(148,163,184,0.08)" }}
                      content={({ active, payload, label: lbl }: any) => {
                        if (!active || !payload?.length) return null;
                        const realEntry = payload.find((p: any) => p.dataKey === "real");
                        const projEntry = payload.find((p: any) => p.dataKey === "projecao");
                        const rv = realEntry?.value != null ? Number(realEntry.value) : null;
                        const pv = projEntry?.value != null ? Number(projEntry.value) : null;
                        const diff = rv != null && pv != null ? ((rv - pv) / pv) * 100 : null;
                        const fmtExact = (v: number) =>
                          v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
                        return (
                          <div style={{ background: "#1a2234", border: "1px solid rgba(255,255,255,0.14)", boxShadow: "0 8px 28px rgba(0,0,0,0.45)", borderRadius: 10, padding: "8px 14px", fontSize: 12 }}>
                            <p style={{ color: "#fff", fontWeight: 700, marginBottom: 6, fontSize: 13 }}>{lbl}</p>
                            {rv != null && <p style={{ color: "#34d399" }}>Real: {fmtExact(rv)}</p>}
                            {pv != null && <p style={{ color: "#fb923c" }}>Meta: {fmtExact(pv)}</p>}
                            {diff != null && (
                              <p style={{ color: diff >= 0 ? "#86efac" : "#f87171", marginTop: 4, fontWeight: 600 }}>
                                {diff >= 0 ? "▲" : "▼"} {Math.abs(diff).toFixed(1)}% vs meta
                              </p>
                            )}
                          </div>
                        );
                      }}
                    />
                    {/* Barras reais — null não renderiza barra (meses futuros) */}
                    <Bar dataKey="real" fill="rgba(16,185,129,0.55)" stroke="#10b981" strokeWidth={1.5}
                         radius={[4, 4, 0, 0]} maxBarSize={40} isAnimationActive={false}>
                      <LabelList dataKey="real" position="top"
                        formatter={(v: number | null) => v != null ? fmtK(v) : ""}
                        style={{ fontSize: 9, fill: "#6ee7b7", fontWeight: 700 }} />
                    </Bar>
                    {/* Linha de projeção tracejada */}
                    <Line dataKey="projecao" type="monotone" stroke="#fb923c" strokeWidth={2}
                          strokeDasharray="5 3" dot={false} isAnimationActive={false} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* ── Evolução Ticket Médio ────────────────────────────────── */}
            <div className="rounded-2xl border border-border bg-board-surface overflow-hidden">
              <div className="flex items-center justify-between border-b border-border px-6 py-3">
                <div>
                  <h2 className="text-base font-bold text-board-text flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-violet-500" />
                    Evolução do Ticket Médio
                  </h2>
                  <p className="text-xs text-board-muted mt-0.5">
                    Valor médio por pedido mês a mês ·{" "}
                    <span className="font-semibold text-violet-500">{fmtK(kpis.ticketMedio)} média geral</span>
                  </p>
                </div>
              </div>
              <div className="px-4 pt-4 pb-4">
                <ResponsiveContainer width="100%" height={175}>
                  <ComposedChart data={monthlyData} margin={{ top: 22, right: 8, bottom: 0, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.08)" vertical={false} />
                    <XAxis dataKey="mes" tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} dy={4} />
                    <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} width={48}
                      tickFormatter={v => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)} />
                    <Tooltip cursor={{ fill: "rgba(148,163,184,0.08)" }}
                      content={({ active, payload, label }: any) => {
                        if (!active || !payload?.length) return null;
                        const v = payload.find((p: any) => p.type === "bar")?.value ?? payload[0]?.value ?? 0;
                        return (
                          <div style={{ background: "#1a2234", border: "1px solid rgba(255,255,255,0.14)", boxShadow: "0 8px 28px rgba(0,0,0,0.45)", borderRadius: 10, padding: "8px 14px", fontSize: 12 }}>
                            <p style={{ color: "#fff", fontWeight: 700, marginBottom: 6, fontSize: 13 }}>{label}</p>
                            <p style={{ color: "#c4b5fd" }}>Ticket: {Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</p>
                          </div>
                        );
                      }}
                    />
                    <Bar dataKey="ticketMedio" fill="rgba(139,92,246,0.2)" stroke="#8b5cf6" strokeWidth={1.5} radius={[4, 4, 0, 0]} maxBarSize={48} isAnimationActive={false}>
                      <LabelList dataKey="ticketMedio" position="top"
                        formatter={(v: number) => v >= 1000 ? `R$${(v / 1000).toFixed(0)}k` : `R$${v}`}
                        style={{ fontSize: 10, fill: "#8b5cf6", fontWeight: 700 }} />
                    </Bar>
                    <Line type="monotoneX" dataKey="ticketMedio" stroke="#8b5cf6" strokeWidth={2.5}
                      dot={{ r: 3, fill: "#8b5cf6", stroke: "#fff", strokeWidth: 2 }} activeDot={{ r: 5 }} isAnimationActive={false} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>

          </div>
        )}

        {/* Atalhos para páginas detalhadas */}
        <div className="flex items-center justify-end gap-4 pb-1">
          <Link to="/orders" className="text-xs text-board-muted hover:text-primary transition-colors flex items-center gap-1">
            Ver todos os pedidos →
          </Link>
          <Link to="/vendas" className="text-xs text-board-muted hover:text-primary transition-colors flex items-center gap-1">
            Ver vendas detalhadas →
          </Link>
        </div>
      </div>
    </BoardLayout>
  );
}

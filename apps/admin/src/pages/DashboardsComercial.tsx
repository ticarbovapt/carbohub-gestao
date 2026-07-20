import { useState } from "react";
import {
  TrendingUp, DollarSign, ShoppingCart, Trophy, AlertTriangle,
  Repeat2, ArrowUpRight, ArrowDownRight, Minus, Users, Receipt,
} from "lucide-react";
import { startOfMonth, getDaysInMonth, getDate } from "date-fns";
import { CarboPageHeader } from "@/components/ui/carbo-page-header";
import { CarboBadge } from "@/components/ui/carbo-badge";
import { useAuth } from "@/contexts/AuthContext";
import { useDashComercial } from "@/hooks/useDashComercial";
import { useMetasVendedores } from "@/hooks/useMetasVendedores";
import { useComercialExtras } from "@/hooks/useComercialExtras";
import { useVendedoresDir } from "@/hooks/useVendedoresDir";
import { VendedorFilter } from "@/components/comercial/VendedorFilter";

function RestrictedNotice() {
  return (
    <div className="rounded-xl border border-dashed border-amber-500/40 bg-amber-500/5 p-6 flex flex-col items-center gap-2 text-center">
      <AlertTriangle className="h-8 w-8 text-amber-500/70" />
      <p className="text-sm font-medium">Área restrita a gestores.</p>
    </div>
  );
}

// ── Helpers portados VERBATIM do CRM (DashboardComercial.tsx) ─────────────────
const formatCurrency = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const fmtK = (v: number) =>
  v >= 1_000_000 ? `R$${(v / 1_000_000).toFixed(1)}M`
  : v >= 1000    ? `R$${(v / 1000).toFixed(0)}k`
  : formatCurrency(v);

function commercialWeekStartOf(d: Date): Date {
  const n = new Date(d);
  const diff = (n.getDay() - 5 + 7) % 7;
  n.setDate(n.getDate() - diff);
  n.setHours(0, 0, 0, 0);
  return n;
}

const META_COLORS = {
  green:  { bar: "#22c55e", badge: "success"     as const, text: "text-green-500",        ring: "border-green-500/30" },
  yellow: { bar: "#f59e0b", badge: "warning"     as const, text: "text-amber-500",        ring: "border-amber-500/30" },
  red:    { bar: "#ef4444", badge: "destructive" as const, text: "text-red-500",          ring: "border-red-500/30" },
  gray:   { bar: "#64748b", badge: "secondary"   as const, text: "text-muted-foreground", ring: "" },
};

export default function DashboardsComercial() {
  const { canAdmin } = useAuth();
  const [vendedor, setVendedor] = useState("all");
  const vendedorId = vendedor === "all" ? null : vendedor;
  const { data } = useDashComercial(vendedorId, 12);

  // Meta do mês (RPC crm_metas_board) + extras (top clientes / últimos pedidos)
  const month = startOfMonth(new Date());
  const weekStart = commercialWeekStartOf(new Date());
  const { data: metas = [] } = useMetasVendedores(month, weekStart);
  const { data: extras } = useComercialExtras(vendedorId);
  const { data: vendedoresDir = [] } = useVendedoresDir();

  if (!canAdmin) {
    return (
      <main className="mx-auto max-w-6xl px-4 sm:px-6 py-8">
        <RestrictedNotice />
      </main>
    );
  }

  const kpis = data?.kpis ?? {
    totalVendas: 0, totalBRL: 0, maiorVenda: 0, maiorCliente: "—",
    topCliente: "—", topQtd: 0, ticketMedio: 0,
  };
  const growth = data?.growth ?? {
    mom: { brl: null, qty: null, curLabel: "", prevLabel: "", cur: { mes: "", faturado: 0, pedidos: 0, ticketMedio: 0 }, prev: { mes: "", faturado: 0, pedidos: 0, ticketMedio: 0 } },
    vsJan: { brl: null, qty: null, curLabel: "", janLabel: "", cur: { mes: "", faturado: 0, pedidos: 0, ticketMedio: 0 }, jan: { mes: "", faturado: 0, pedidos: 0, ticketMedio: 0 } },
  };

  // ── Meta do mês — time (todos) ou vendedor selecionado ──
  const metaRow = vendedorId ? metas.find((m) => m.vendedor_id === vendedorId) : null;
  const metaActual = vendedorId ? (metaRow?.actual_amount ?? 0) : (metas[0]?.team_actual ?? 0);
  const metaTarget = vendedorId ? (metaRow?.target_amount ?? 0) : (metas[0]?.team_target ?? 0);
  const metaPct = vendedorId ? (metaRow?.pct_amount ?? 0) : (metas[0]?.team_pct ?? 0);
  const today = new Date();
  const expectedPct = (getDate(today) / getDaysInMonth(today)) * 100;
  const metaKey: keyof typeof META_COLORS =
    metaTarget <= 0 ? "gray"
    : metaPct >= expectedPct ? "green"
    : metaPct >= expectedPct - 15 ? "yellow"
    : "red";
  const mc = META_COLORS[metaKey];

  // Nome do vendedor para a tabela de últimos pedidos
  const vendedorNome = new Map(vendedoresDir.map((v) => [v.id, v.full_name || "—"]));
  const topClientes = extras?.topClientes ?? [];
  const recentes = extras?.recentes ?? [];

  // 5 KPIs ricos — porta FIEL do CRM (kpiCards).
  const kpiCards = [
    { title: "Total de Vendas", value: kpis.totalVendas.toLocaleString("pt-BR"), sub: "Vendas (status pedido)", icon: ShoppingCart, accent: "border-l-green-500", iconBg: "bg-green-500/10 text-green-600" },
    { title: "R$ Total Vendido", value: fmtK(kpis.totalBRL), sub: "Faturamento acumulado", icon: DollarSign, accent: "border-l-green-500", iconBg: "bg-green-500/10 text-green-600" },
    { title: "Maior Venda", value: fmtK(kpis.maiorVenda), sub: kpis.maiorCliente, icon: Trophy, accent: "border-l-amber-400", iconBg: "bg-amber-400/10 text-amber-500" },
    { title: "Top Recorrência", value: kpis.topCliente, sub: kpis.topQtd > 0 ? `${kpis.topQtd} pedidos · mais frequente` : "—", icon: Repeat2, accent: "border-l-blue-400", iconBg: "bg-blue-400/10 text-blue-500" },
    { title: "Ticket Médio", value: fmtK(kpis.ticketMedio), sub: "Por pedido (período)", icon: TrendingUp, accent: "border-l-violet-400", iconBg: "bg-violet-400/10 text-violet-500" },
  ];

  // 2 cards de crescimento — porta FIEL do CRM (growthGroups).
  const growthGroups = [
    {
      groupLabel: "Crescimento Mês a Mês", groupSub: `${growth.mom.curLabel} vs ${growth.mom.prevLabel}`, color: "blue" as const,
      cards: [
        { label: "Faturamento", pct: growth.mom.brl, current: fmtK(growth.mom.cur.faturado), ref: `${growth.mom.prevLabel}: ${fmtK(growth.mom.prev.faturado)}` },
        { label: "Volume de Vendas", pct: growth.mom.qty, current: `${growth.mom.cur.pedidos} pedidos`, ref: `${growth.mom.prevLabel}: ${growth.mom.prev.pedidos} pedidos` },
      ],
    },
    {
      groupLabel: "Último Mês vs Janeiro", groupSub: `${growth.vsJan.curLabel} vs ${growth.vsJan.janLabel}`, color: "green" as const,
      cards: [
        { label: "Faturamento", pct: growth.vsJan.brl, current: fmtK(growth.vsJan.cur.faturado), ref: `${growth.vsJan.janLabel}: ${fmtK(growth.vsJan.jan.faturado)}` },
        { label: "Volume de Vendas", pct: growth.vsJan.qty, current: `${growth.vsJan.cur.pedidos} pedidos`, ref: `${growth.vsJan.janLabel}: ${growth.vsJan.jan.pedidos} pedidos` },
      ],
    },
  ];
  const colorMap = {
    blue: { stripe: "bg-blue-500", border: "border-blue-500/20", tag: "bg-blue-500/10 text-blue-500" },
    green: { stripe: "bg-green-500", border: "border-green-500/20", tag: "bg-green-500/10 text-green-600" },
  };

  return (
    <main className="mx-auto max-w-6xl px-4 sm:px-6 py-8 space-y-6">
      {/* Header + filtro */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <CarboPageHeader
          icon={TrendingUp}
          iconColor="green"
          title="Comercial — Visão Geral"
          description="Números da operação comercial · gráficos detalhados em Análise de Vendas"
        />
        <div className="flex flex-wrap items-end gap-2 shrink-0">
          <VendedorFilter value={vendedor} onChange={setVendedor} />
        </div>
      </div>

      {/* Meta do mês (semáforo) */}
      <div className={`rounded-2xl border bg-card p-5 ${mc.ring}`}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <TrendingUp className="h-3.5 w-3.5" /> {vendedorId ? "Meta do vendedor · mês" : "Comercial do mês · realizado vs meta"}
            </p>
            <div className="flex items-end gap-2 mt-1">
              <p className={`text-3xl font-bold tabular-nums ${mc.text}`}>{fmtK(metaActual)}</p>
              <p className="text-muted-foreground mb-1">/ {fmtK(metaTarget)}</p>
            </div>
          </div>
          <div className="text-right shrink-0">
            <CarboBadge variant={mc.badge} size="lg">{metaPct.toFixed(1)}% da meta</CarboBadge>
            <p className="text-[11px] text-muted-foreground mt-1">Esperado hoje: {expectedPct.toFixed(0)}%</p>
          </div>
        </div>
        <div className="relative h-2.5 bg-muted rounded-full overflow-hidden mt-3">
          <div className="h-full rounded-full transition-all duration-700" style={{ width: `${Math.min(100, metaPct)}%`, backgroundColor: mc.bar }} />
          {expectedPct > 0 && expectedPct < 100 && <div className="absolute top-0 bottom-0 w-0.5 bg-foreground/40" style={{ left: `${expectedPct}%` }} />}
        </div>
      </div>

      {/* KPIs ricos (5) — porta FIEL do CRM */}
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-5">
        {kpiCards.map(({ title, value, sub, icon: Icon, accent, iconBg }) => {
          const valLen = String(value).length;
          const valSize = valLen <= 6 ? "text-3xl" : valLen <= 10 ? "text-2xl" : valLen <= 16 ? "text-xl" : "text-base";
          return (
            <div key={title} className={`relative overflow-hidden rounded-xl bg-card p-4 border border-border border-l-4 ${accent} kpi-glow transition-all hover:-translate-y-0.5`}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-muted-foreground truncate">{title}</p>
                  <p className={`mt-1.5 font-bold text-foreground leading-tight break-words ${valSize}`}>{value}</p>
                  {sub && <p className="mt-1 text-xs text-muted-foreground leading-snug line-clamp-2" title={sub}>{sub}</p>}
                </div>
                <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${iconBg}`}>
                  <Icon className="h-[18px] w-[18px]" />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Cards de Crescimento (2) — porta FIEL do CRM */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {growthGroups.map((group) => (
          <div key={group.groupLabel} className={`rounded-xl border overflow-hidden bg-card ${colorMap[group.color].border}`}>
            <div className={`h-1 w-full ${colorMap[group.color].stripe}`} />
            <div className="px-4 pt-3 pb-2 border-b border-border/50">
              <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${colorMap[group.color].tag}`}>{group.groupLabel}</span>
              <p className="text-[11px] text-muted-foreground mt-0.5 font-medium">{group.groupSub}</p>
            </div>
            <div className="grid grid-cols-2 divide-x divide-border/50">
              {group.cards.map((card, ci) => {
                const isUp = card.pct !== null && card.pct >= 0;
                const isNeutral = card.pct === null;
                return (
                  <div key={ci} className="p-4 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">{card.label}</p>
                      {isNeutral ? (
                        <span className="flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[11px] font-bold bg-muted text-muted-foreground shrink-0"><Minus className="h-3 w-3" /> s/d</span>
                      ) : (
                        <span className={`flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-xs font-bold shrink-0 ${isUp ? "bg-green-500/10 text-green-500" : "bg-red-400/10 text-red-400"}`}>
                          {isUp ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}{Math.abs(card.pct!).toFixed(1)}%
                        </span>
                      )}
                    </div>
                    <p className={`text-xl font-bold tabular-nums leading-none ${isNeutral ? "text-foreground" : isUp ? "text-green-500" : "text-red-400"}`}>{card.current}</p>
                    <p className="text-[11px] text-muted-foreground">{card.ref}</p>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Top clientes + Últimos pedidos */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Top clientes por receita */}
        <div className="rounded-2xl border border-border bg-card overflow-hidden">
          <div className="flex items-center gap-2 border-b border-border px-5 py-3">
            <Users className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold text-foreground">Top Clientes por Receita</h2>
          </div>
          <div className="divide-y divide-border">
            {topClientes.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-muted-foreground">Sem vendas no período.</p>
            ) : topClientes.map((c, idx) => (
              <div key={c.name} className="flex items-center justify-between px-5 py-2.5">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="w-5 text-center shrink-0 text-sm font-bold text-muted-foreground">{idx + 1}</span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{c.name}</p>
                    <p className="text-xs text-muted-foreground">{c.pedidos} pedido{c.pedidos !== 1 ? "s" : ""}</p>
                  </div>
                </div>
                <span className="text-sm font-semibold tabular-nums text-foreground shrink-0">{fmtK(c.receita)}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Últimos pedidos */}
        <div className="rounded-2xl border border-border bg-card overflow-hidden">
          <div className="flex items-center gap-2 border-b border-border px-5 py-3">
            <Receipt className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold text-foreground">Últimos Pedidos</h2>
          </div>
          <div className="divide-y divide-border">
            {recentes.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-muted-foreground">Sem pedidos recentes.</p>
            ) : recentes.map((p, idx) => (
              <div key={idx} className="flex items-center justify-between px-5 py-2.5 gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{p.customer_name}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {vendedorNome.get(p.vendedor_id ?? "") || "—"}
                    {p.created_at ? ` · ${new Date(p.created_at).toLocaleDateString("pt-BR")}` : ""}
                  </p>
                </div>
                <span className="text-sm font-semibold tabular-nums text-foreground shrink-0">{fmtK(p.total)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}

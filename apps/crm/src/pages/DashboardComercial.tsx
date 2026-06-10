import { useMemo, useState } from "react";
import {
  TrendingUp, ShoppingCart, DollarSign, Trophy, BarChart3, Repeat2,
  ArrowUpRight, ArrowDownRight, Minus, CalendarRange, User,
} from "lucide-react";
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, LabelList,
} from "recharts";
import { CarboPageHeader } from "@/components/ui/carbo-page-header";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

// ⚠️ PORT VISUAL FIEL ao Controle (/dashboards/comercial) — dados MOCK.
// TODO: ligar em carboze_orders (Supabase) na fase de lógica.

const VENDEDORES = ["Lucas Padilha", "Marcio Vannucci", "Marcius D'Ávila"];

// Mock mensal no formato real: faturado (R$) + pedidos (qtd) + ticket médio
const MESES = ["set/25", "out/25", "nov/25", "dez/25", "jan/26", "fev/26", "mar/26", "abr/26", "mai/26"];
const FATURADO = [2000, 18000, 4000, 53000, 33000, 46000, 40000, 86000, 101000];
const PEDIDOS = [7, 6, 4, 23, 18, 20, 20, 25, 20];
const monthlyData = MESES.map((mes, i) => ({
  mes,
  faturado: FATURADO[i],
  pedidos: PEDIDOS[i],
  ticketMedio: PEDIDOS[i] > 0 ? Math.round(FATURADO[i] / PEDIDOS[i]) : 0,
}));

// KPIs mock
const kpis = {
  totalVendas: 143,
  totalBRL: 382740.5,
  maiorVenda: 55000,
  maiorCliente: "BRISANET SERVICOS DE TELECOMUNICACOES S.A.",
  topCliente: "M CONSTRUÇÕES & SERVIÇOS LTDA",
  topQtd: 11,
  ticketMedio: 382740.5 / 143,
};

const formatCurrency = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtK = (v: number) =>
  v >= 1_000_000 ? `R$${(v / 1_000_000).toFixed(1)}M`
  : v >= 1000 ? `R$${(v / 1000).toFixed(0)}k`
  : formatCurrency(v);
const pct = (cur: number, prev: number) => (prev > 0 ? ((cur - prev) / prev) * 100 : null);

// Crescimento M/M e vs Janeiro (derivado do mock)
const lastIdx = monthlyData.length - 1;
const cur = monthlyData[lastIdx];
const prev = monthlyData[lastIdx - 1];
const jan = monthlyData.find((m) => m.mes === "jan/26")!;
const growth = {
  mom: {
    brl: pct(cur.faturado, prev.faturado), qty: pct(cur.pedidos, prev.pedidos),
    curLabel: cur.mes, prevLabel: prev.mes, cur, prev,
  },
  vsJan: {
    brl: pct(cur.faturado, jan.faturado), qty: pct(cur.pedidos, jan.pedidos),
    curLabel: cur.mes, janLabel: jan.mes, cur, jan,
  },
};

// Crescimento anual: real vs projeção +15%/mês desde R$30k
const BASE_JAN = 30_000, RATE = 0.15;
const annualGrowthData = Array.from({ length: 12 }, (_, i) => {
  const label = ["jan/26","fev/26","mar/26","abr/26","mai/26","jun/26","jul/26","ago/26","set/26","out/26","nov/26","dez/26"][i];
  const projecao = Math.round(BASE_JAN * Math.pow(1 + RATE, i));
  const realMatch = monthlyData.find((m) => m.mes === label);
  return { label, projecao, real: realMatch ? realMatch.faturado : null };
});

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

export default function DashboardComercial() {
  const [vendedor, setVendedor] = useState("all");
  const totalCarboze = kpis.totalBRL;
  const totalCarbozeOrders = kpis.totalVendas;

  const kpiCards = useMemo(() => [
    { title: "Total de Vendas", value: kpis.totalVendas.toLocaleString("pt-BR"), sub: "Pedidos ativos (excl. cancelados)", icon: ShoppingCart, accent: "border-l-green-500", iconBg: "bg-green-500/10 text-green-600" },
    { title: "R$ Total Vendido", value: fmtK(kpis.totalBRL), sub: "Faturamento acumulado", icon: DollarSign, accent: "border-l-green-500", iconBg: "bg-green-500/10 text-green-600" },
    { title: "Maior Venda", value: fmtK(kpis.maiorVenda), sub: kpis.maiorCliente, icon: Trophy, accent: "border-l-amber-400", iconBg: "bg-amber-400/10 text-amber-500" },
    { title: "Top Recorrência", value: kpis.topCliente, sub: `${kpis.topQtd} pedidos · mais frequente`, icon: Repeat2, accent: "border-l-blue-400", iconBg: "bg-blue-400/10 text-blue-500" },
    { title: "Ticket Médio", value: fmtK(kpis.ticketMedio), sub: "Por pedido (período)", icon: TrendingUp, accent: "border-l-violet-400", iconBg: "bg-violet-400/10 text-violet-500" },
  ], []);

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
    <div className="p-4 md:p-6">
      <div className="space-y-3 max-w-[1600px] mx-auto">
        {/* Header + filtros */}
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <CarboPageHeader title="Dashboard — Comercial" description="Licenciados, pedidos e performance de vendas" icon={TrendingUp} />
          <div className="flex flex-wrap items-end gap-2 shrink-0">
            <div className="space-y-1">
              <Label className="text-[10px] text-muted-foreground flex items-center gap-1"><CalendarRange className="h-3 w-3" /> Período</Label>
              <div className="flex items-center gap-1">
                <Input type="date" className="h-8 w-[130px] text-xs" />
                <span className="text-xs text-muted-foreground">até</span>
                <Input type="date" className="h-8 w-[130px] text-xs" />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-[10px] text-muted-foreground flex items-center gap-1"><User className="h-3 w-3" /> Vendedor</Label>
              <Select value={vendedor} onValueChange={setVendedor}>
                <SelectTrigger className="h-8 w-[160px] text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos vendedores</SelectItem>
                  {VENDEDORES.map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        {/* KPIs */}
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-5">
          {kpiCards.map(({ title, value, sub, icon: Icon, accent, iconBg }) => {
            const valLen = String(value).length;
            const valSize = valLen <= 6 ? "text-3xl" : valLen <= 10 ? "text-2xl" : valLen <= 16 ? "text-xl" : "text-base";
            return (
              <div key={title} className={`relative overflow-hidden rounded-xl bg-board-surface p-4 border border-border border-l-4 ${accent} kpi-glow transition-all hover:-translate-y-0.5`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-board-muted truncate">{title}</p>
                    <p className={`mt-1.5 font-bold text-board-text leading-tight break-words ${valSize}`}>{value}</p>
                    {sub && <p className="mt-1 text-xs text-board-muted leading-snug line-clamp-2" title={sub}>{sub}</p>}
                  </div>
                  <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${iconBg}`}>
                    <Icon className="h-[18px] w-[18px]" />
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Cards de Crescimento */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {growthGroups.map((group) => (
            <div key={group.groupLabel} className={`rounded-xl border overflow-hidden bg-board-surface ${colorMap[group.color].border}`}>
              <div className={`h-1 w-full ${colorMap[group.color].stripe}`} />
              <div className="px-4 pt-3 pb-2 border-b border-border/50">
                <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${colorMap[group.color].tag}`}>{group.groupLabel}</span>
                <p className="text-[11px] text-board-muted mt-0.5 font-medium">{group.groupSub}</p>
              </div>
              <div className="grid grid-cols-2 divide-x divide-border/50">
                {group.cards.map((card, ci) => {
                  const isUp = card.pct !== null && card.pct >= 0;
                  const isNeutral = card.pct === null;
                  return (
                    <div key={ci} className="p-4 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-[10px] font-semibold text-board-muted uppercase tracking-wider">{card.label}</p>
                        {isNeutral ? (
                          <span className="flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[11px] font-bold bg-muted text-board-muted shrink-0"><Minus className="h-3 w-3" /> s/d</span>
                        ) : (
                          <span className={`flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-xs font-bold shrink-0 ${isUp ? "bg-green-500/10 text-green-500" : "bg-red-400/10 text-red-400"}`}>
                            {isUp ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}{Math.abs(card.pct!).toFixed(1)}%
                          </span>
                        )}
                      </div>
                      <p className={`text-xl font-bold tabular-nums leading-none ${isNeutral ? "text-board-text" : isUp ? "text-green-500" : "text-red-400"}`}>{card.current}</p>
                      <p className="text-[11px] text-board-muted">{card.ref}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Evolução Mensal de Vendas */}
        <div className="rounded-2xl border border-border bg-board-surface overflow-hidden">
          <div className="flex items-center justify-between border-b border-border px-6 py-3">
            <div>
              <h2 className="text-base font-bold text-board-text flex items-center gap-2"><BarChart3 className="h-4 w-4 text-primary" /> Evolução Mensal de Vendas</h2>
              <p className="text-xs text-board-muted mt-0.5">
                Via Bling · <span className="font-semibold text-board-text">{totalCarbozeOrders} pedidos</span>
                {" · "}<span className="font-semibold text-green-500">{totalCarboze.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} acumulado</span>
              </p>
            </div>
          </div>
          <div className="px-4 pt-4 pb-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Total Faturado por Mês */}
            <div className="rounded-lg border border-border bg-board-surface/40 p-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="text-[10px] font-bold text-board-muted uppercase tracking-widest">Total Faturado por Mês</p>
                  <p className="text-xl font-bold text-green-500 leading-none tabular-nums mt-0.5">{fmtK(totalCarboze)}<span className="text-xs font-normal text-board-muted ml-1">acumulado</span></p>
                </div>
                <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold bg-green-500/10 text-green-500">R$</span>
              </div>
              <ResponsiveContainer width="100%" height={190}>
                <ComposedChart data={monthlyData} margin={{ top: 22, right: 8, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.08)" vertical={false} />
                  <XAxis dataKey="mes" tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} dy={4} />
                  <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} width={44} tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v))} />
                  <Tooltip cursor={{ fill: "rgba(148,163,184,0.08)" }} content={<TooltipBRL />} />
                  <Bar dataKey="faturado" fill="rgba(26,122,74,0.18)" stroke="#1a7a4a" strokeWidth={1.5} radius={[4, 4, 0, 0]} maxBarSize={48} isAnimationActive={false}>
                    <LabelList dataKey="faturado" position="top" formatter={(v: number) => (v >= 1000 ? `R$${(v / 1000).toFixed(0)}k` : `R$${v}`)} style={{ fontSize: 10, fill: "#1a7a4a", fontWeight: 700 }} />
                  </Bar>
                  <Line type="monotoneX" dataKey="faturado" stroke="#1a7a4a" strokeWidth={2.5} dot={{ r: 3, fill: "#1a7a4a", stroke: "#fff", strokeWidth: 2 }} activeDot={{ r: 5 }} isAnimationActive={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
            {/* Total de Vendas por Mês */}
            <div className="rounded-lg border border-border bg-board-surface/40 p-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="text-[10px] font-bold text-board-muted uppercase tracking-widest">Total de Vendas por Mês</p>
                  <p className="text-xl font-bold text-[#3b6ea5] leading-none tabular-nums mt-0.5">{totalCarbozeOrders.toLocaleString("pt-BR")}<span className="text-xs font-normal text-board-muted ml-1">pedidos</span></p>
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
                    <LabelList dataKey="pedidos" position="top" style={{ fontSize: 11, fill: "#94a3b8", fontWeight: 700 }} />
                  </Bar>
                  <Line type="monotoneX" dataKey="pedidos" stroke="#3b6ea5" strokeWidth={2.5} strokeDasharray="5 3" dot={{ r: 3, fill: "#3b6ea5", stroke: "#fff", strokeWidth: 2 }} activeDot={{ r: 5 }} isAnimationActive={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Crescimento Anual + Ticket Médio */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {/* Crescimento Anual */}
          <div className="rounded-2xl border border-border bg-board-surface overflow-hidden">
            <div className="flex items-center justify-between border-b border-border px-6 py-3">
              <div>
                <h2 className="text-base font-bold text-board-text flex items-center gap-2"><TrendingUp className="h-4 w-4 text-orange-400" /> Crescimento Anual</h2>
                <p className="text-xs text-board-muted mt-0.5">Real vs projeção +15%/mês · <span className="font-semibold text-orange-400">base R$30k jan/26</span></p>
              </div>
              <div className="flex items-center gap-3 text-[10px] text-board-muted">
                <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm bg-emerald-500/70" /> Real</span>
                <span className="flex items-center gap-1.5"><span className="inline-block w-5 border-t-2 border-dashed border-orange-400" /> Meta</span>
              </div>
            </div>
            <div className="px-4 pt-4 pb-4">
              <ResponsiveContainer width="100%" height={175}>
                <ComposedChart data={annualGrowthData} margin={{ top: 20, right: 8, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.08)" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} dy={4} />
                  <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} width={44} tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v))} />
                  <Tooltip cursor={{ fill: "rgba(148,163,184,0.08)" }} content={({ active, payload, label: lbl }: any) => {
                    if (!active || !payload?.length) return null;
                    const rv = payload.find((p: any) => p.dataKey === "real")?.value;
                    const pv = payload.find((p: any) => p.dataKey === "projecao")?.value;
                    const diff = rv != null && pv != null ? ((Number(rv) - Number(pv)) / Number(pv)) * 100 : null;
                    const fx = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
                    return (
                      <div style={{ background: "#1a2234", border: "1px solid rgba(255,255,255,0.14)", boxShadow: "0 8px 28px rgba(0,0,0,0.45)", borderRadius: 10, padding: "8px 14px", fontSize: 12 }}>
                        <p style={{ color: "#fff", fontWeight: 700, marginBottom: 6, fontSize: 13 }}>{lbl}</p>
                        {rv != null && <p style={{ color: "#34d399" }}>Real: {fx(Number(rv))}</p>}
                        {pv != null && <p style={{ color: "#fb923c" }}>Meta: {fx(Number(pv))}</p>}
                        {diff != null && <p style={{ color: diff >= 0 ? "#86efac" : "#f87171", marginTop: 4, fontWeight: 600 }}>{diff >= 0 ? "▲" : "▼"} {Math.abs(diff).toFixed(1)}% vs meta</p>}
                      </div>
                    );
                  }} />
                  <Bar dataKey="real" fill="rgba(16,185,129,0.55)" stroke="#10b981" strokeWidth={1.5} radius={[4, 4, 0, 0]} maxBarSize={40} isAnimationActive={false}>
                    <LabelList dataKey="real" position="top" formatter={(v: number | null) => (v != null ? fmtK(v) : "")} style={{ fontSize: 9, fill: "#6ee7b7", fontWeight: 700 }} />
                  </Bar>
                  <Line dataKey="projecao" type="monotone" stroke="#fb923c" strokeWidth={2} strokeDasharray="5 3" dot={false} isAnimationActive={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Evolução Ticket Médio */}
          <div className="rounded-2xl border border-border bg-board-surface overflow-hidden">
            <div className="flex items-center justify-between border-b border-border px-6 py-3">
              <div>
                <h2 className="text-base font-bold text-board-text flex items-center gap-2"><TrendingUp className="h-4 w-4 text-violet-500" /> Evolução do Ticket Médio</h2>
                <p className="text-xs text-board-muted mt-0.5">Valor médio por pedido mês a mês · <span className="font-semibold text-violet-500">{fmtK(kpis.ticketMedio)} média geral</span></p>
              </div>
            </div>
            <div className="px-4 pt-4 pb-4">
              <ResponsiveContainer width="100%" height={175}>
                <ComposedChart data={monthlyData} margin={{ top: 22, right: 8, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.08)" vertical={false} />
                  <XAxis dataKey="mes" tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} dy={4} />
                  <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} width={48} tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v))} />
                  <Tooltip cursor={{ fill: "rgba(148,163,184,0.08)" }} content={({ active, payload, label }: any) => {
                    if (!active || !payload?.length) return null;
                    const v = payload.find((p: any) => p.type === "bar")?.value ?? payload[0]?.value ?? 0;
                    return (
                      <div style={{ background: "#1a2234", border: "1px solid rgba(255,255,255,0.14)", boxShadow: "0 8px 28px rgba(0,0,0,0.45)", borderRadius: 10, padding: "8px 14px", fontSize: 12 }}>
                        <p style={{ color: "#fff", fontWeight: 700, marginBottom: 6, fontSize: 13 }}>{label}</p>
                        <p style={{ color: "#c4b5fd" }}>Ticket: {Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</p>
                      </div>
                    );
                  }} />
                  <Bar dataKey="ticketMedio" fill="rgba(139,92,246,0.2)" stroke="#8b5cf6" strokeWidth={1.5} radius={[4, 4, 0, 0]} maxBarSize={48} isAnimationActive={false}>
                    <LabelList dataKey="ticketMedio" position="top" formatter={(v: number) => (v >= 1000 ? `R$${(v / 1000).toFixed(0)}k` : `R$${v}`)} style={{ fontSize: 10, fill: "#8b5cf6", fontWeight: 700 }} />
                  </Bar>
                  <Line type="monotoneX" dataKey="ticketMedio" stroke="#8b5cf6" strokeWidth={2.5} dot={{ r: 3, fill: "#8b5cf6", stroke: "#fff", strokeWidth: 2 }} activeDot={{ r: 5 }} isAnimationActive={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        <p className="text-xs text-muted-foreground text-center pt-1">
          Tela em port visual — números de exemplo. Os dados reais (carboze_orders / Bling) entram na fase de lógica.
        </p>
      </div>
    </div>
  );
}

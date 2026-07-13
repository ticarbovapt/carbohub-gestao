import {
  TrendingUp, DollarSign, ShoppingCart, Receipt, Trophy, AlertTriangle,
} from "lucide-react";
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, LabelList,
} from "recharts";
import { CarboPageHeader } from "@/components/ui/carbo-page-header";
import { CarboKPI } from "@/components/ui/carbo-kpi";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/contexts/AuthContext";
import { fmtBRL, fmtBRLc } from "@/lib/dash-format";
import { useDashComercial } from "@/hooks/useDashComercial";

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

export default function DashboardsComercial() {
  const { canAdmin } = useAuth();
  const { data, isLoading } = useDashComercial(12);

  if (!canAdmin) {
    return (
      <main className="mx-auto max-w-6xl px-4 sm:px-6 py-8">
        <RestrictedNotice />
      </main>
    );
  }

  const monthlyData = data?.monthly ?? [];
  const annualGrowthData = data?.annualGrowth ?? [];
  const totalCarboze = data?.totalBRL ?? 0;
  const totalCarbozeOrders = data?.totalVendas ?? 0;
  const ticketMedio = data?.ticketMedio ?? 0;

  return (
    <main className="mx-auto max-w-6xl px-4 sm:px-6 py-8 space-y-6">
      <CarboPageHeader
        icon={TrendingUp}
        iconColor="green"
        title="Comercial — Visão Geral"
        description="Vendas, pedidos e performance comercial (todos os vendedores)"
      />

      {/* KPIs — mesmos valores do CRM (todos os vendedores) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <CarboKPI title="Total faturado" value={fmtBRL(data?.totalBRL ?? 0)} icon={DollarSign}
          iconColor="green" loading={isLoading} />
        <CarboKPI title="Nº de pedidos" value={data?.totalVendas ?? 0} icon={ShoppingCart}
          iconColor="blue" loading={isLoading} />
        <CarboKPI title="Ticket médio" value={fmtBRLc(data?.ticketMedio ?? 0)} icon={Receipt}
          iconColor="green" loading={isLoading} />
        <CarboKPI title="Maior venda" value={fmtBRL(data?.maiorVenda ?? 0)} icon={Trophy}
          iconColor="warning" loading={isLoading} />
      </div>

      {/* ── 4 gráficos portados do CRM (2×2) ───────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">

        {/* ── Gráfico 1: Total Faturado R$ por mês ──────────────── */}
        <Card className="rounded-2xl border-0 shadow-sm">
          <CardHeader className="pb-1 pt-5 px-5">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                  Total Faturado por Mês
                </CardTitle>
                <p className="text-xl font-bold text-green-500 leading-none tabular-nums mt-0.5">
                  {fmtK(totalCarboze)}
                  <span className="text-xs font-normal text-muted-foreground ml-1">acumulado</span>
                </p>
              </div>
              <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold bg-green-500/10 text-green-500">R$</span>
            </div>
          </CardHeader>
          <CardContent className="px-2 pb-4">
            <ResponsiveContainer width="100%" height={220}>
              <ComposedChart data={monthlyData} margin={{ top: 22, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.08)" vertical={false} />
                <XAxis dataKey="mes" tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} dy={4} />
                <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} width={44}
                  tickFormatter={v => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)} />
                <Tooltip cursor={{ fill: "rgba(148,163,184,0.08)" }} content={<TooltipBRL />} />
                <Bar dataKey="faturado" fill="rgba(26,122,74,0.18)" stroke="#1a7a4a" strokeWidth={1.5} radius={[4, 4, 0, 0]} maxBarSize={48} isAnimationActive={false}>
                  <LabelList dataKey="faturado" position="top"
                    formatter={(v: number) => v >= 1000 ? `R$${(v / 1000).toFixed(0)}k` : v > 0 ? `R$${v}` : ""}
                    style={{ fontSize: 10, fill: "#1a7a4a", fontWeight: 700 }} />
                </Bar>
                <Line type="monotoneX" dataKey="faturado" stroke="#1a7a4a" strokeWidth={2.5}
                  dot={{ r: 3, fill: "#1a7a4a", stroke: "#fff", strokeWidth: 2 }} activeDot={{ r: 5 }} isAnimationActive={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* ── Gráfico 2: Total de Vendas (qtd) por mês ─────────── */}
        <Card className="rounded-2xl border-0 shadow-sm">
          <CardHeader className="pb-1 pt-5 px-5">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                  Total de Vendas por Mês
                </CardTitle>
                <p className="text-xl font-bold text-[#3b6ea5] leading-none tabular-nums mt-0.5">
                  {totalCarbozeOrders.toLocaleString("pt-BR")}
                  <span className="text-xs font-normal text-muted-foreground ml-1">pedidos</span>
                </p>
              </div>
              <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold bg-blue-500/10 text-blue-400">Qtd</span>
            </div>
          </CardHeader>
          <CardContent className="px-2 pb-4">
            <ResponsiveContainer width="100%" height={220}>
              <ComposedChart data={monthlyData} margin={{ top: 22, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.08)" vertical={false} />
                <XAxis dataKey="mes" tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} dy={4} />
                <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} width={28} />
                <Tooltip cursor={{ fill: "rgba(148,163,184,0.08)" }} content={<TooltipQty />} />
                <Bar dataKey="pedidos" fill="rgba(59,110,165,0.75)" radius={[5, 5, 0, 0]} maxBarSize={48} isAnimationActive={false}>
                  <LabelList dataKey="pedidos" position="top"
                    formatter={(v: number) => v > 0 ? String(v) : ""}
                    style={{ fontSize: 11, fill: "#94a3b8", fontWeight: 700 }} />
                </Bar>
                <Line type="monotoneX" dataKey="pedidos" stroke="#3b6ea5" strokeWidth={2.5} strokeDasharray="5 3"
                  dot={{ r: 3, fill: "#3b6ea5", stroke: "#fff", strokeWidth: 2 }} activeDot={{ r: 5 }} isAnimationActive={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* ── Gráfico 3: Crescimento Anual (real vs meta configurada) ─────────── */}
        <Card className="rounded-2xl border-0 shadow-sm">
          <CardHeader className="pb-1 pt-5 px-5">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base font-bold flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-orange-400" />
                  Crescimento Anual
                </CardTitle>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Faturamento real vs{" "}
                  <span className="font-semibold text-orange-400">meta configurada</span> (Metas de Vendedores)
                </p>
              </div>
              {/* Legenda */}
              <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
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
          </CardHeader>
          <CardContent className="px-2 pb-4">
            <ResponsiveContainer width="100%" height={220}>
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
                    const rv = payload.find((p: any) => p.dataKey === "real")?.value;
                    const pv = payload.find((p: any) => p.dataKey === "meta")?.value;
                    const diff = rv != null && pv != null ? ((Number(rv) - Number(pv)) / Number(pv)) * 100 : null;
                    const fx = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
                    return (
                      <div style={{ background: "#1a2234", border: "1px solid rgba(255,255,255,0.14)", boxShadow: "0 8px 28px rgba(0,0,0,0.45)", borderRadius: 10, padding: "8px 14px", fontSize: 12 }}>
                        <p style={{ color: "#fff", fontWeight: 700, marginBottom: 6, fontSize: 13 }}>{lbl}</p>
                        {rv != null && <p style={{ color: "#34d399" }}>Real: {fx(Number(rv))}</p>}
                        {pv != null && <p style={{ color: "#fb923c" }}>Meta: {fx(Number(pv))}</p>}
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
                {/* Linha de meta configurada tracejada (laranja) */}
                <Line dataKey="meta" type="monotone" stroke="#fb923c" strokeWidth={2}
                      strokeDasharray="5 3" dot={false} isAnimationActive={false} connectNulls />
              </ComposedChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* ── Gráfico 4: Evolução Ticket Médio ────────────────────── */}
        <Card className="rounded-2xl border-0 shadow-sm">
          <CardHeader className="pb-1 pt-5 px-5">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base font-bold flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-violet-500" />
                  Evolução do Ticket Médio
                </CardTitle>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Valor médio por pedido mês a mês ·{" "}
                  <span className="font-semibold text-violet-500">{fmtK(ticketMedio)} média geral</span>
                </p>
              </div>
            </div>
          </CardHeader>
          <CardContent className="px-2 pb-4">
            <ResponsiveContainer width="100%" height={220}>
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
                    formatter={(v: number) => v >= 1000 ? `R$${(v / 1000).toFixed(0)}k` : v > 0 ? `R$${v}` : ""}
                    style={{ fontSize: 10, fill: "#8b5cf6", fontWeight: 700 }} />
                </Bar>
                <Line type="monotoneX" dataKey="ticketMedio" stroke="#8b5cf6" strokeWidth={2.5}
                  dot={{ r: 3, fill: "#8b5cf6", stroke: "#fff", strokeWidth: 2 }} activeDot={{ r: 5 }} isAnimationActive={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

      </div>
    </main>
  );
}

import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LabelList,
} from "recharts";
import {
  TrendingUp, ShoppingCart, DollarSign, Trophy, Repeat2, BarChart3,
  ArrowUpRight, ArrowDownRight, Minus, Loader2, Pencil, AlertTriangle,
} from "lucide-react";
import { CarboPageHeader } from "@/components/ui/carbo-page-header";
import { useAuth } from "@/contexts/AuthContext";
import { useDashComercial } from "@/hooks/useDashComercial";
import { useComercialCanais, type CanalKey } from "@/hooks/useComercialCanais";
import { useCanalMetas } from "@/hooks/useCanalMetas";
import { ComercialFilterBar, EMPTY_FILTERS, type DashFilters } from "@/components/comercial/ComercialFilterBar";
import { ComercialTabs } from "@/components/comercial/ComercialTabs";
import { CanalMetasDialog } from "@/components/comercial/CanalMetasDialog";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

// ── Helpers ───────────────────────────────────────────────────────────────────
const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtK = (v: number) => (v >= 1_000_000 ? `R$${(v / 1_000_000).toFixed(1)}M` : v >= 1000 ? `R$${(v / 1000).toFixed(0)}k` : brl(v));
const kAxis = (v: number) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v));
const mesLbl = (y: number, m: number) => format(new Date(y, m - 1, 1), "MMM/yy", { locale: ptBR });

const boxStyle = { background: "#1a2234", border: "1px solid rgba(255,255,255,0.14)", boxShadow: "0 8px 28px rgba(0,0,0,0.45)", borderRadius: 10, padding: "8px 14px", fontSize: 12 } as const;
const titleStyle = { color: "#fff", fontWeight: 700, marginBottom: 6, fontSize: 13 } as const;

function DarkTip({ active, payload, label, fmt, unit }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div style={boxStyle}>
      <p style={titleStyle}>{label}</p>
      {payload.map((p: any, i: number) => (
        <p key={i} style={{ color: p.color }}>{p.name}: {fmt ? fmt(Number(p.value)) : `${Number(p.value)}${unit ?? ""}`}</p>
      ))}
    </div>
  );
}

function RestrictedNotice() {
  return (
    <div className="rounded-xl border border-dashed border-amber-500/40 bg-amber-500/5 p-6 flex flex-col items-center gap-2 text-center">
      <AlertTriangle className="h-8 w-8 text-amber-500/70" />
      <p className="text-sm font-medium">Área restrita a gestores.</p>
    </div>
  );
}

// ── KPI card ──────────────────────────────────────────────────────────────────
function KpiCard({ title, value, sub, Icon, accent, iconBg }: {
  title: string; value: string; sub?: string; Icon: React.ElementType; accent: string; iconBg: string;
}) {
  const len = value.length;
  const valSize = len <= 6 ? "text-3xl" : len <= 10 ? "text-2xl" : len <= 16 ? "text-xl" : "text-base";
  return (
    <div className={`relative overflow-hidden rounded-xl bg-board-surface p-4 border-l-4 ${accent} kpi-glow transition-all hover:-translate-y-0.5`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-board-muted truncate">{title}</p>
          <p className={`mt-1.5 font-bold text-board-text leading-tight break-words ${valSize}`}>{value}</p>
          {sub && <p className="mt-1 text-xs text-board-muted leading-snug line-clamp-2" title={sub}>{sub}</p>}
        </div>
        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${iconBg}`}><Icon className="h-4.5 w-4.5" /></div>
      </div>
    </div>
  );
}

// ── Growth group ──────────────────────────────────────────────────────────────
function PctBadge({ pct }: { pct: number | null }) {
  if (pct == null) return <span className="flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[11px] font-bold bg-muted text-board-muted shrink-0"><Minus className="h-3 w-3" /> s/d</span>;
  const up = pct >= 0;
  return (
    <span className={`flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-xs font-bold shrink-0 ${up ? "bg-green-500/10 text-green-500" : "bg-red-400/10 text-red-400"}`}>
      {up ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}{Math.abs(pct).toFixed(1)}%
    </span>
  );
}
function GrowthSub({ label, pct, value, refLine }: { label: string; pct: number | null; value: string; refLine: string }) {
  const tone = pct == null ? "text-board-text" : pct >= 0 ? "text-green-500" : "text-red-400";
  return (
    <div className="p-4 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] font-semibold text-board-muted uppercase tracking-wider">{label}</p>
        <PctBadge pct={pct} />
      </div>
      <p className={`text-xl font-bold tabular-nums leading-none ${tone}`}>{value}</p>
      <p className="text-[11px] text-board-muted">{refLine}</p>
    </div>
  );
}

const CANAL_CARDS: { key: CanalKey | "naoClassificado"; label: string; accent: string; bar: string; text: string }[] = [
  { key: "consumo", label: "Consumo (B2B)", accent: "border-l-blue-500", bar: "bg-blue-500", text: "text-blue-400" },
  { key: "revenda", label: "Revenda (PDV)", accent: "border-l-amber-400", bar: "bg-amber-400", text: "text-amber-500" },
  { key: "online", label: "On-line", accent: "border-l-green-500", bar: "bg-green-500", text: "text-green-500" },
  { key: "naoClassificado", label: "Não classificado", accent: "border-l-slate-400", bar: "bg-slate-400", text: "text-board-muted" },
];
const META_CARDS: { key: CanalKey; title: string; color: string; note: string }[] = [
  { key: "consumo", title: "Consumo (B2B)", color: "#3b82f6", note: "Meta = real do mês anterior + 15%" },
  { key: "revenda", title: "Revenda (PDV)", color: "#f59e0b", note: "Meta R$75k/mês (NE 25k + SE 50k)" },
  { key: "online", title: "On-line", color: "#22c55e", note: "Meta R$27k/mês a partir de jul/26" },
];
const MODO_LABEL: Record<string, string> = {
  acum: "Total acumulado (tamanho da base)", ativos: "Ativos no mês (compraram no mês)", novos: "Novos no mês (1ª compra)",
};

export default function DashboardComercial() {
  const { canAdmin } = useAuth();
  const [filters, setFilters] = useState<DashFilters>(EMPTY_FILTERS);
  const [modoClientes, setModoClientes] = useState<"acum" | "ativos" | "novos">("acum");
  const [metasOpen, setMetasOpen] = useState(false);

  const vendedorId = filters.vendedor === "all" ? null : filters.vendedor;
  const { data, isLoading } = useDashComercial(vendedorId, 12, { from: filters.from, to: filters.to, segmento: filters.segmento });
  const { data: canais } = useComercialCanais({ vendedorId, from: filters.from, to: filters.to });
  const year = canais?.year ?? new Date().getFullYear();
  const { data: canalMetas } = useCanalMetas(year);

  const canalSeries = useMemo(() => {
    const real = canais?.realByCanal;
    if (!real) return null;
    const metas = canalMetas ?? { consumo: {}, revenda: {}, online: {} };
    const build = (canal: CanalKey) =>
      Array.from({ length: 12 }, (_, i) => {
        const mes = i + 1;
        const stored = (metas as any)[canal]?.[mes];
        let meta: number | null = stored != null ? Number(stored) : null;
        if (meta == null && canal === "consumo") { const prev = real.consumo[mes - 1]; meta = mes > 1 && prev > 0 ? Math.round(prev * 1.15) : null; }
        return { mes: mesLbl(year, mes), real: real[canal][mes], meta };
      });
    return { consumo: build("consumo"), revenda: build("revenda"), online: build("online") };
  }, [canais, canalMetas, year]);

  const clientesChart = useMemo(
    () => (canais?.clientes ?? []).map((r: any) => ({ mes: r.mes, b2b: r[`consumo_${modoClientes}`], pdv: r[`revenda_${modoClientes}`], online: r[`online_${modoClientes}`] })),
    [canais, modoClientes],
  );
  const pdvDelta = useMemo(() => {
    const n = clientesChart.length;
    if (n < 2) return null;
    const cur = Number(clientesChart[n - 1].pdv ?? 0), prev = Number(clientesChart[n - 2].pdv ?? 0);
    if (prev <= 0) return null;
    return { pct: ((cur - prev) / prev) * 100, cur, prev, curLabel: clientesChart[n - 1].mes, prevLabel: clientesChart[n - 2].mes };
  }, [clientesChart]);

  if (!canAdmin) return <main className="mx-auto max-w-6xl px-4 sm:px-6 py-8"><RestrictedNotice /></main>;

  const k = data?.kpis, g = data?.growth, monthly = data?.monthly ?? [], seg = canais?.segmentacao;
  const hasData = (monthly.reduce((s, m) => s + m.pedidos, 0)) > 0;

  return (
    <main className="p-4 lg:p-6 board-fade-in">
      <div className="space-y-3 max-w-[1600px] mx-auto">
        {/* 1. Header + filtros */}
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <CarboPageHeader icon={TrendingUp} title="Dashboard — Comercial" description="Licenciados, pedidos e performance de vendas" />
          <div className="flex flex-col items-end gap-2 shrink-0">
            <ComercialTabs />
            <ComercialFilterBar filters={filters} onChange={setFilters} />
          </div>
        </div>

        {/* 2. KPIs */}
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-5">
          <KpiCard title="Total de Vendas" value={String(k?.totalVendas ?? 0)} sub="Pedidos ativos (excl. cancelados)" Icon={ShoppingCart} accent="border-l-green-500" iconBg="bg-green-500/10 text-green-600" />
          <KpiCard title="R$ Total Vendido" value={fmtK(k?.totalBRL ?? 0)} sub="Faturamento acumulado" Icon={DollarSign} accent="border-l-green-500" iconBg="bg-green-500/10 text-green-600" />
          <KpiCard title="Maior Venda" value={fmtK(k?.maiorVenda ?? 0)} sub={k?.maiorCliente} Icon={Trophy} accent="border-l-amber-400" iconBg="bg-amber-400/10 text-amber-500" />
          <KpiCard title="Top Recorrência" value={k?.topCliente ?? "—"} sub={`${k?.topQtd ?? 0} pedido(s) · mais frequente`} Icon={Repeat2} accent="border-l-blue-400" iconBg="bg-blue-400/10 text-blue-500" />
          <KpiCard title="Ticket Médio" value={fmtK(k?.ticketMedio ?? 0)} sub="Por pedido (período)" Icon={TrendingUp} accent="border-l-violet-400" iconBg="bg-violet-400/10 text-violet-500" />
        </div>

        {/* 3. Crescimento */}
        {g && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
            <div className="rounded-xl border overflow-hidden bg-board-surface border-blue-500/20">
              <div className="h-1 w-full bg-blue-500" />
              <div className="px-4 pt-3 pb-2 border-b border-border/50">
                <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-blue-500/10 text-blue-500">Crescimento Mês a Mês</span>
                <p className="text-[11px] text-board-muted mt-0.5 font-medium">{g.mom.curLabel} vs {g.mom.prevLabel}</p>
              </div>
              <div className="grid grid-cols-2 divide-x divide-border/50">
                <GrowthSub label="Faturamento" pct={g.mom.brl} value={fmtK(g.mom.cur.faturado)} refLine={`${g.mom.prevLabel}: ${fmtK(g.mom.prev.faturado)}`} />
                <GrowthSub label="Volume de Vendas" pct={g.mom.qty} value={`${g.mom.cur.pedidos} pedidos`} refLine={`${g.mom.prevLabel}: ${g.mom.prev.pedidos} pedidos`} />
              </div>
            </div>
            <div className="rounded-xl border overflow-hidden bg-board-surface border-green-500/20">
              <div className="h-1 w-full bg-green-500" />
              <div className="px-4 pt-3 pb-2 border-b border-border/50">
                <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-green-500/10 text-green-600">Último Mês vs Janeiro</span>
                <p className="text-[11px] text-board-muted mt-0.5 font-medium">{g.vsJan.curLabel} vs {g.vsJan.janLabel}</p>
              </div>
              <div className="grid grid-cols-2 divide-x divide-border/50">
                <GrowthSub label="Faturamento" pct={g.vsJan.brl} value={fmtK(g.vsJan.cur.faturado)} refLine={`${g.vsJan.janLabel}: ${fmtK(g.vsJan.jan.faturado)}`} />
                <GrowthSub label="Volume de Vendas" pct={g.vsJan.qty} value={`${g.vsJan.cur.pedidos} pedidos`} refLine={`${g.vsJan.janLabel}: ${g.vsJan.jan.pedidos} pedidos`} />
              </div>
            </div>
          </div>
        )}

        {/* 4. Evolução Mensal */}
        <div className="rounded-2xl border border-border bg-board-surface overflow-hidden">
          <div className="flex items-center justify-between border-b border-border px-6 py-3">
            <div>
              <h2 className="text-base font-bold text-board-text flex items-center gap-2"><BarChart3 className="h-4 w-4 text-primary" /> Evolução Mensal de Vendas</h2>
              <p className="text-xs text-board-muted mt-0.5">Via Bling · <span className="font-semibold text-board-text">{k?.totalVendas ?? 0} pedidos</span> · <span className="font-semibold text-green-500">{brl(k?.totalBRL ?? 0)} acumulado</span></p>
            </div>
            <Link to="/comercial/vendas" className="text-xs font-semibold text-primary hover:underline shrink-0">Ver vendas →</Link>
          </div>
          {isLoading ? (
            <div className="flex items-center justify-center h-72"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : !hasData ? (
            <div className="flex items-center justify-center h-72 text-sm text-board-muted">Nenhum dado encontrado para o período selecionado.</div>
          ) : (
            <div className="px-4 pt-4 pb-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Faturado */}
              <div className="rounded-lg border border-border bg-board-surface/40 p-4">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <p className="text-[10px] font-bold text-board-muted uppercase tracking-widest">Total Faturado por Mês</p>
                    <p className="text-xl font-bold text-green-500 leading-none tabular-nums mt-0.5">{fmtK(k?.totalBRL ?? 0)} <span className="text-xs font-normal text-board-muted ml-1">acumulado</span></p>
                  </div>
                  <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold bg-green-500/10 text-green-500">R$</span>
                </div>
                <ResponsiveContainer width="100%" height={190}>
                  <ComposedChart data={monthly} margin={{ top: 22, right: 8, bottom: 0, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.08)" vertical={false} />
                    <XAxis dataKey="mes" tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} dy={4} />
                    <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} width={44} tickFormatter={kAxis} />
                    <Tooltip cursor={{ fill: "rgba(148,163,184,0.08)" }} content={<DarkTip fmt={brl} />} />
                    <Bar dataKey="faturado" name="Faturado" fill="rgba(26,122,74,0.18)" stroke="#1a7a4a" strokeWidth={1.5} radius={[4, 4, 0, 0]} maxBarSize={48} isAnimationActive={false}>
                      <LabelList dataKey="faturado" position="top" formatter={(v: any) => (v >= 1000 ? `R$${(v / 1000).toFixed(0)}k` : `R$${v}`)} style={{ fontSize: 10, fill: "#1a7a4a", fontWeight: 700 }} />
                    </Bar>
                    <Line type="monotoneX" dataKey="faturado" name="Faturado" stroke="#1a7a4a" strokeWidth={2.5} dot={{ r: 3, fill: "#1a7a4a", stroke: "#fff", strokeWidth: 2 }} activeDot={{ r: 5 }} isAnimationActive={false} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
              {/* Pedidos */}
              <div className="rounded-lg border border-border bg-board-surface/40 p-4">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <p className="text-[10px] font-bold text-board-muted uppercase tracking-widest">Total de Vendas por Mês</p>
                    <p className="text-xl font-bold text-[#3b6ea5] leading-none tabular-nums mt-0.5">{k?.totalVendas ?? 0} <span className="text-xs font-normal text-board-muted ml-1">pedidos</span></p>
                  </div>
                  <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold bg-blue-500/10 text-blue-400">Qtd</span>
                </div>
                <ResponsiveContainer width="100%" height={190}>
                  <ComposedChart data={monthly} margin={{ top: 22, right: 8, bottom: 0, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.08)" vertical={false} />
                    <XAxis dataKey="mes" tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} dy={4} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} width={28} />
                    <Tooltip cursor={{ fill: "rgba(148,163,184,0.08)" }} content={<DarkTip unit=" vendas" />} />
                    <Bar dataKey="pedidos" name="Pedidos" fill="rgba(59,110,165,0.75)" radius={[5, 5, 0, 0]} maxBarSize={48} isAnimationActive={false}>
                      <LabelList dataKey="pedidos" position="top" style={{ fontSize: 11, fill: "#94a3b8", fontWeight: 700 }} />
                    </Bar>
                    <Line type="monotoneX" dataKey="pedidos" name="Pedidos" stroke="#3b6ea5" strokeWidth={2.5} strokeDasharray="5 3" dot={{ r: 3, fill: "#3b6ea5", stroke: "#fff", strokeWidth: 2 }} activeDot={{ r: 5 }} isAnimationActive={false} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </div>

        {/* 5. Crescimento Anual + Ticket */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <div className="rounded-2xl border border-border bg-board-surface overflow-hidden">
            <div className="flex items-center justify-between border-b border-border px-6 py-3">
              <div>
                <h2 className="text-base font-bold text-board-text flex items-center gap-2"><TrendingUp className="h-4 w-4 text-orange-400" /> Crescimento Anual</h2>
                <p className="text-xs text-board-muted mt-0.5">Real (barras) vs <span className="font-semibold text-orange-400">meta configurada</span> · {year}</p>
              </div>
              <div className="flex items-center gap-3 text-[10px] text-board-muted">
                <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm bg-emerald-500/70" /> Real</span>
                <span className="flex items-center gap-1"><span className="inline-block w-5 border-t-2 border-dashed border-orange-400" /> Meta</span>
              </div>
            </div>
            <div className="px-4 pt-4 pb-4">
              <ResponsiveContainer width="100%" height={175}>
                <ComposedChart data={data?.annualGrowth ?? []} margin={{ top: 20, right: 8, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.08)" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} dy={4} />
                  <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} width={44} tickFormatter={kAxis} />
                  <Tooltip content={<DarkTip fmt={fmtK} />} />
                  <Bar dataKey="real" name="Real" fill="rgba(16,185,129,0.55)" stroke="#10b981" strokeWidth={1.5} radius={[4, 4, 0, 0]} maxBarSize={40} isAnimationActive={false}>
                    <LabelList dataKey="real" position="top" formatter={(v: any) => (v != null ? fmtK(v) : "")} style={{ fontSize: 9, fill: "#6ee7b7", fontWeight: 700 }} />
                  </Bar>
                  <Line dataKey="meta" name="Meta" type="monotone" stroke="#fb923c" strokeWidth={2} strokeDasharray="5 3" dot={false} connectNulls isAnimationActive={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-board-surface overflow-hidden">
            <div className="flex items-center justify-between border-b border-border px-6 py-3">
              <div>
                <h2 className="text-base font-bold text-board-text flex items-center gap-2"><TrendingUp className="h-4 w-4 text-violet-500" /> Evolução do Ticket Médio</h2>
                <p className="text-xs text-board-muted mt-0.5">Valor médio por pedido mês a mês · <span className="font-semibold text-violet-500">{fmtK(k?.ticketMedio ?? 0)} média geral</span></p>
              </div>
            </div>
            <div className="px-4 pt-4 pb-4">
              <ResponsiveContainer width="100%" height={175}>
                <ComposedChart data={monthly} margin={{ top: 22, right: 8, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.08)" vertical={false} />
                  <XAxis dataKey="mes" tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} dy={4} />
                  <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} width={48} tickFormatter={kAxis} />
                  <Tooltip content={<DarkTip fmt={brl} />} />
                  <Bar dataKey="ticketMedio" name="Ticket" fill="rgba(139,92,246,0.2)" stroke="#8b5cf6" strokeWidth={1.5} radius={[4, 4, 0, 0]} maxBarSize={48} isAnimationActive={false}>
                    <LabelList dataKey="ticketMedio" position="top" formatter={(v: any) => (v >= 1000 ? `R$${(v / 1000).toFixed(0)}k` : `R$${v}`)} style={{ fontSize: 10, fill: "#8b5cf6", fontWeight: 700 }} />
                  </Bar>
                  <Line type="monotoneX" dataKey="ticketMedio" name="Ticket" stroke="#8b5cf6" strokeWidth={2.5} dot={{ r: 3, fill: "#8b5cf6", stroke: "#fff", strokeWidth: 2 }} activeDot={{ r: 5 }} isAnimationActive={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* 6. Divider */}
        <div className="flex items-center gap-2 pt-2">
          <div className="h-px flex-1 bg-border" />
          <span className="text-xs font-semibold uppercase tracking-wider text-board-muted">Análise por Canal</span>
          <div className="h-px flex-1 bg-border" />
        </div>

        {/* 7. Vendas por canal + Clientes por canal */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 items-start">
          <div className="rounded-2xl border border-border bg-board-surface overflow-hidden">
            <div className="border-b border-border px-6 py-3">
              <h2 className="text-base font-bold text-board-text flex items-center gap-2"><BarChart3 className="h-4 w-4 text-blue-400" /> Vendas por Canal</h2>
              <p className="text-xs text-board-muted mt-0.5">Consumo (B2B) vs Revenda (Ponto de Venda) · classifique cada pedido em <Link to="/comercial/vendas" className="font-semibold text-primary hover:underline">Pedidos</Link></p>
            </div>
            <div className="grid grid-cols-2 gap-3 p-4">
              {seg && CANAL_CARDS.map((c) => {
                const b = (seg as any)[c.key] as { qtd: number; brl: number };
                const p = seg.pct(b.brl);
                return (
                  <div key={c.key} className={`rounded-xl bg-board-surface/60 border-l-4 ${c.accent} p-4`}>
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-board-muted uppercase tracking-wider">{c.label}</span>
                      <span className={`text-xs font-bold ${c.text}`}>{p.toFixed(0)}%</span>
                    </div>
                    <p className="mt-1.5 text-2xl font-bold text-board-text tabular-nums leading-none">{fmtK(b.brl)}</p>
                    <p className="mt-1 text-xs text-board-muted">{b.qtd} pedido(s)</p>
                    <div className="mt-2 h-1.5 w-full rounded-full bg-muted overflow-hidden"><div className={`h-full ${c.bar} rounded-full`} style={{ width: `${p}%` }} /></div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-board-surface overflow-hidden">
            <div className="flex items-center justify-between border-b border-border px-6 py-3">
              <div>
                <h2 className="text-base font-bold text-board-text flex items-center gap-2"><Repeat2 className="h-4 w-4 text-blue-400" /> Crescimento de Clientes por Canal</h2>
                <p className="text-xs text-board-muted mt-0.5">{MODO_LABEL[modoClientes]} — B2B (Consumo) vs PDV (Revenda) vs On-line</p>
                {pdvDelta && (
                  <div className="mt-1.5 inline-flex items-center gap-1.5 rounded-md bg-amber-400/10 px-2 py-1">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-amber-500">PDV {pdvDelta.curLabel} vs {pdvDelta.prevLabel}</span>
                    <span className={`flex items-center gap-0.5 text-xs font-bold ${pdvDelta.pct >= 0 ? "text-green-500" : "text-red-400"}`}>
                      {pdvDelta.pct >= 0 ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}{pdvDelta.pct >= 0 ? "+" : ""}{pdvDelta.pct.toFixed(1)}%
                    </span>
                    <span className="text-[10px] text-board-muted">({pdvDelta.prev} → {pdvDelta.cur})</span>
                  </div>
                )}
              </div>
              <div className="flex flex-col items-end gap-1.5">
                <div className="inline-flex rounded-lg border border-border overflow-hidden text-[11px]">
                  {([["acum", "Acumulado"], ["ativos", "Ativos/mês"], ["novos", "Novos/mês"]] as const).map(([k2, l]) => (
                    <button key={k2} onClick={() => setModoClientes(k2)} className={`px-2.5 py-1 font-medium transition-colors ${modoClientes === k2 ? "bg-primary text-primary-foreground" : "text-board-muted hover:bg-muted/50"}`}>{l}</button>
                  ))}
                </div>
                <div className="hidden sm:flex items-center gap-3 text-[10px] text-board-muted">
                  <span className="flex items-center gap-1"><span className="inline-block w-4 border-t-2" style={{ borderColor: "#3b82f6" }} /> B2B (Consumo)</span>
                  <span className="flex items-center gap-1"><span className="inline-block w-4 border-t-2" style={{ borderColor: "#f59e0b" }} /> PDV (Revenda)</span>
                  <span className="flex items-center gap-1"><span className="inline-block w-4 border-t-2" style={{ borderColor: "#22c55e" }} /> On-line</span>
                </div>
              </div>
            </div>
            <div className="px-4 pt-4 pb-4">
              <ResponsiveContainer width="100%" height={200}>
                <ComposedChart data={clientesChart} margin={{ top: 22, right: 8, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.08)" vertical={false} />
                  <XAxis dataKey="mes" tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} dy={4} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} width={28} />
                  <Tooltip cursor={{ stroke: "rgba(148,163,184,0.2)" }} content={<DarkTip unit=" clientes" />} />
                  <Line type="monotone" dataKey="b2b" name="B2B (Consumo)" stroke="#3b82f6" strokeWidth={2.5} dot={{ r: 3, fill: "#3b82f6", stroke: "#fff", strokeWidth: 1.5 }} activeDot={{ r: 5 }} isAnimationActive={false}>
                    <LabelList dataKey="b2b" position="top" style={{ fontSize: 10, fill: "#60a5fa", fontWeight: 700 }} />
                  </Line>
                  <Line type="monotone" dataKey="pdv" name="PDV (Revenda)" stroke="#f59e0b" strokeWidth={2.5} dot={{ r: 3, fill: "#f59e0b", stroke: "#fff", strokeWidth: 1.5 }} activeDot={{ r: 5 }} isAnimationActive={false}>
                    <LabelList dataKey="pdv" position="bottom" style={{ fontSize: 10, fill: "#fbbf24", fontWeight: 700 }} />
                  </Line>
                  <Line type="monotone" dataKey="online" name="On-line" stroke="#22c55e" strokeWidth={2} strokeDasharray="4 3" dot={{ r: 2.5, fill: "#22c55e" }} isAnimationActive={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* 8. Metas por canal */}
        <div className="rounded-2xl border border-border bg-board-surface overflow-hidden">
          <div className="flex items-center justify-between border-b border-border px-6 py-3">
            <div>
              <h2 className="text-base font-bold text-board-text flex items-center gap-2"><BarChart3 className="h-4 w-4 text-blue-400" /> Metas por Canal · {year}</h2>
              <p className="text-xs text-board-muted mt-0.5">Real (barras) vs meta (linha) de cada canal · a meta geral está na curva acima</p>
            </div>
            <button onClick={() => setMetasOpen(true)} className="text-xs font-semibold text-primary hover:underline shrink-0 flex items-center gap-1"><Pencil className="h-3.5 w-3.5" /> Editar metas</button>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 p-4">
            {META_CARDS.map((c) => (
              <div key={c.key} className="rounded-xl border border-border bg-board-surface/40 p-3">
                <div className="flex items-center justify-between mb-0.5">
                  <span className="text-sm font-semibold text-board-text">{c.title}</span>
                  <div className="flex items-center gap-2 text-[9px] text-board-muted">
                    <span className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: c.color }} />Real</span>
                    <span className="flex items-center gap-1"><span className="inline-block w-4 border-t-2 border-dashed border-orange-400" />Meta</span>
                  </div>
                </div>
                <p className="text-[10px] text-board-muted mb-1.5">{c.note}</p>
                <ResponsiveContainer width="100%" height={160}>
                  <ComposedChart data={canalSeries?.[c.key] ?? []} margin={{ top: 16, right: 6, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.08)" vertical={false} />
                    <XAxis dataKey="mes" tick={{ fontSize: 9, fill: "#94a3b8" }} axisLine={false} tickLine={false} interval={1} />
                    <YAxis tick={{ fontSize: 9, fill: "#94a3b8" }} axisLine={false} tickLine={false} width={34} tickFormatter={kAxis} />
                    <Tooltip content={<DarkTip fmt={fmtK} />} />
                    <Bar dataKey="real" name="Real" fill={c.color} fillOpacity={0.75} radius={[3, 3, 0, 0]} maxBarSize={26} isAnimationActive={false} />
                    <Line dataKey="meta" name="Meta" type="monotone" stroke="#fb923c" strokeWidth={2} strokeDasharray="5 3" dot={false} connectNulls isAnimationActive={false} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            ))}
          </div>
        </div>

        {/* 9. Footer */}
        <div className="flex items-center justify-end gap-4 pb-1">
          <Link to="/comercial/vendas" className="text-xs text-board-muted hover:text-primary transition-colors flex items-center gap-1">Ver vendas detalhadas →</Link>
        </div>
      </div>

      <CanalMetasDialog open={metasOpen} onOpenChange={setMetasOpen} ano={year} />
    </main>
  );
}

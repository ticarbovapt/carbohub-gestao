import { useState } from "react";
import { BoardLayout } from "@/components/layouts/BoardLayout";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import {
  ShoppingCart, Package, TrendingUp, XCircle, Clock,
  CheckCircle2, Star, Boxes, AlertCircle, BarChart3,
} from "lucide-react";
import {
  useDashEcommerce, useEcommerceComparativo, useEcommerceRawCheck,
  type EcommercePlatform, type EcommercePeriod, type RawCheckMetrics, type EcommerceMetrics,
} from "@/hooks/useDashEcommerce";
import { cn } from "@/lib/utils";

// ─────────────────────────────────────────────────────────────────────────────
// Platform config
// ─────────────────────────────────────────────────────────────────────────────

interface PlatformConfig {
  id: EcommercePlatform;
  label: string;
  color: string;
  gradient: string;
  textClass: string;
  bgClass: string;
  borderClass: string;
  emoji: string;
}

const PLATFORMS: PlatformConfig[] = [
  {
    id: "mercadolivre", label: "Mercado Livre",
    color: "#FFD700", gradient: "from-yellow-500 to-yellow-400",
    textClass: "text-yellow-600 dark:text-yellow-300",
    bgClass: "bg-yellow-500/10", borderClass: "border-yellow-500/50",
    emoji: "🛒",
  },
  {
    id: "amazon", label: "Amazon",
    color: "#FF9900", gradient: "from-orange-500 to-amber-400",
    textClass: "text-orange-600 dark:text-orange-300",
    bgClass: "bg-orange-500/10", borderClass: "border-orange-500/50",
    emoji: "📦",
  },
  {
    id: "tiktok", label: "TikTok Shop",
    color: "#FF0050", gradient: "from-pink-600 to-rose-400",
    textClass: "text-pink-600 dark:text-pink-300",
    bgClass: "bg-pink-500/10", borderClass: "border-pink-500/50",
    emoji: "🎵",
  },
  {
    id: "shopee", label: "Shopee",
    color: "#EE4D2D", gradient: "from-red-500 to-orange-400",
    textClass: "text-red-600 dark:text-red-300",
    bgClass: "bg-red-500/10", borderClass: "border-red-500/50",
    emoji: "🧡",
  },
];

const PMAP = Object.fromEntries(PLATFORMS.map(p => [p.id, p])) as Record<EcommercePlatform, PlatformConfig>;

const fmtBRL = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const fmtNum = (v: number) => v.toLocaleString("pt-BR");
const pct = (a: number, b: number) => b > 0 ? ((a / b) * 100).toFixed(1) + "%" : "0%";

const PERIOD_OPTIONS: { value: EcommercePeriod; label: string }[] = [
  { value: "today", label: "Hoje" },
  { value: "7d",    label: "Últimos 7 dias" },
  { value: "30d",   label: "Últimos 30 dias" },
  { value: "month", label: "Este mês" },
];

// ─────────────────────────────────────────────────────────────────────────────
// Metric card — custom for this page
// ─────────────────────────────────────────────────────────────────────────────

function MetricCard({
  label, value, sub, icon, accent, big,
}: {
  label: string; value: string; sub?: string;
  icon: React.ReactNode; accent: string; big?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border bg-card p-5 flex flex-col gap-2 transition-all hover:-translate-y-0.5 hover:shadow-md",
        big && "col-span-2"
      )}
      style={{ borderLeftColor: accent, borderLeftWidth: 3 }}
    >
      <div className="flex items-start justify-between">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</p>
        <div className="p-2 rounded-xl" style={{ background: accent + "20" }}>
          <div style={{ color: accent }}>{icon}</div>
        </div>
      </div>
      <p className={cn("font-bold leading-none", big ? "text-4xl" : "text-2xl")}>{value}</p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Reconciliation panel — Path 1 (raw DB) vs Path 2 (system logic)
// ─────────────────────────────────────────────────────────────────────────────

function DiffBadge({ raw, sys }: { raw: number; sys: number }) {
  const diff = raw === 0 ? 0 : Math.abs((sys - raw) / raw) * 100;
  const label = raw === 0 && sys === 0 ? "—" : `${diff.toFixed(1)}%`;
  const cls =
    raw === 0 && sys === 0
      ? "bg-muted text-muted-foreground"
      : diff <= 1
      ? "bg-green-500/10 text-green-700 dark:text-green-400"
      : diff <= 5
      ? "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400"
      : "bg-red-500/10 text-red-700 dark:text-red-400";
  return (
    <span className={cn("inline-block rounded-md px-2 py-0.5 text-xs font-semibold tabular-nums", cls)}>
      {label}
    </span>
  );
}

function ReconciliacaoPanel({
  platform,
  period,
  m,
}: {
  platform: EcommercePlatform;
  period: EcommercePeriod;
  m: EcommerceMetrics;
}) {
  const raw: RawCheckMetrics | null = useEcommerceRawCheck(platform, period);

  if (!m.isConnected || raw === null) return null;

  const rows: { label: string; rawVal: number; sysVal: number; fmt: (v: number) => string }[] = [
    {
      label: "Pedidos",
      rawVal: raw.totalOrders,
      sysVal: m.totalOrders,
      fmt: fmtNum,
    },
    {
      label: "Unidades reais",
      rawVal: raw.totalUnitsReal,
      sysVal: m.totalUnitsSold,
      fmt: fmtNum,
    },
    {
      label: "Receita",
      rawVal: raw.totalRevenue,
      sysVal: m.totalRevenue,
      fmt: fmtBRL,
    },
    {
      label: "Cancelamentos",
      rawVal: raw.cancelledOrders,
      sysVal: m.cancelledOrders,
      fmt: fmtNum,
    },
  ];

  return (
    <Card className="rounded-2xl border-0 shadow-sm">
      <CardHeader className="pt-5 px-5 pb-3 flex flex-row items-center gap-2">
        <BarChart3 className="h-4 w-4 text-violet-500" />
        <CardTitle className="text-sm font-semibold">Verificação de Integridade</CardTitle>
        <span className="ml-auto text-xs text-muted-foreground">Caminho 1 (Raw DB) vs Caminho 2 (Sistema)</span>
      </CardHeader>
      <CardContent className="p-0 pb-4">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-y border-border/50 bg-muted/30 text-muted-foreground text-xs">
                <th className="text-left px-5 py-2 font-medium">Métrica</th>
                <th className="text-right px-4 py-2 font-medium">Caminho 1 — Raw DB</th>
                <th className="text-right px-4 py-2 font-medium">Caminho 2 — Sistema</th>
                <th className="text-center px-5 py-2 font-medium">Diferença</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/30">
              {rows.map(({ label, rawVal, sysVal, fmt }) => (
                <tr key={label} className="hover:bg-muted/20 transition-colors">
                  <td className="px-5 py-2.5 font-medium text-muted-foreground">{label}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{fmt(rawVal)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums font-semibold">{fmt(sysVal)}</td>
                  <td className="px-5 py-2.5 text-center">
                    <DiffBadge raw={rawVal} sys={sysVal} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Platform view
// ─────────────────────────────────────────────────────────────────────────────

function PlatformView({ platform, period }: { platform: EcommercePlatform; period: EcommercePeriod }) {
  const cfg = PMAP[platform];
  const { data: m } = useDashEcommerce(platform, period);

  return (
    <div className="space-y-5">
      {/* Platform header bar */}
      <div
        className={cn("rounded-2xl border p-4 flex items-center justify-between", cfg.bgClass, cfg.borderClass)}
      >
        <div className="flex items-center gap-3">
          <span className="text-3xl">{cfg.emoji}</span>
          <div>
            <p className={cn("text-lg font-bold", cfg.textClass)}>{cfg.label}</p>
            <p className="text-xs text-muted-foreground">Dados de vendas externos — período selecionado</p>
          </div>
        </div>
        {m.isConnected ? (
          <Badge className="bg-green-500/10 text-green-600 border-green-500/30 gap-1.5 text-xs">
            <span className="h-1.5 w-1.5 rounded-full bg-green-500 inline-block animate-pulse" />
            Conectado
          </Badge>
        ) : (
          <Badge variant="outline" className={cn("gap-1.5 text-xs", cfg.bgClass, cfg.textClass, cfg.borderClass)}>
            <AlertCircle className="h-3 w-3" />
            Aguardando integração
          </Badge>
        )}
      </div>

      {/* Not connected notice */}
      {!m.isConnected && (
        <div className="rounded-xl border border-dashed border-muted-foreground/30 bg-muted/20 p-6 flex flex-col items-center gap-2 text-center">
          <AlertCircle className="h-8 w-8 text-muted-foreground/50" />
          <p className="text-sm font-medium text-muted-foreground">Aguardando sincronização</p>
          <p className="text-xs text-muted-foreground/70 max-w-md">
            A integração será estabelecida automaticamente. Os dados aparecerão assim que a próxima sincronização ocorrer.
          </p>
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <MetricCard
          label="Pedidos" value={fmtNum(m.totalOrders)}
          icon={<ShoppingCart className="h-4 w-4" />} accent={cfg.color}
        />
        <MetricCard
          label="Receita Total" value={fmtBRL(m.totalRevenue)}
          icon={<TrendingUp className="h-4 w-4" />} accent={cfg.color}
        />
        <MetricCard
          label="Ticket Médio" value={fmtBRL(m.avgTicket)}
          icon={<Package className="h-4 w-4" />} accent={cfg.color}
        />
        <MetricCard
          label="Cancelamentos" value={fmtNum(m.cancelledOrders)}
          sub={m.totalOrders > 0 ? `${pct(m.cancelledOrders, m.totalOrders)} dos pedidos` : undefined}
          icon={<XCircle className="h-4 w-4" />}
          accent="#f59e0b"
        />
      </div>

      {/* Unidades reais destaque + status pedidos */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <MetricCard
          label="Unidades Reais Vendidas" value={fmtNum(m.totalUnitsSold)}
          sub="considera multiplicador de pack"
          icon={<Boxes className="h-5 w-5" />} accent={cfg.color} big
        />
        <MetricCard
          label="Em transporte" value={fmtNum(m.shippedOrders)}
          icon={<Clock className="h-4 w-4" />} accent="#f59e0b"
        />
        <MetricCard
          label="Entregues" value={fmtNum(m.deliveredOrders)}
          icon={<CheckCircle2 className="h-4 w-4" />} accent="#22c55e"
        />
      </div>

      {/* Reconciliation panel — Path 1 vs Path 2 (only shown when connected) */}
      <ReconciliacaoPanel platform={platform} period={period} m={m} />

      {/* Chart — only shown when connected */}
      {m.isConnected && (
        <Card className="rounded-2xl border-0 shadow-sm bg-card">
          <CardHeader className="pb-1 pt-5 px-5">
            <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              Evolução de Vendas
            </CardTitle>
          </CardHeader>
          <CardContent className="px-2 pb-4">
            <ResponsiveContainer width="100%" height={210}>
              <AreaChart data={m.dailySales} margin={{ top: 4, right: 12, left: -10, bottom: 0 }}>
                <defs>
                  <linearGradient id={`g1-${platform}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor={cfg.color} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={cfg.color} stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id={`g2-${platform}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#818cf8" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#818cf8" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                <YAxis yAxisId="l" tick={{ fontSize: 10 }} />
                <YAxis yAxisId="r" orientation="right" tick={{ fontSize: 10 }} />
                <Tooltip
                  contentStyle={{ background: "var(--background)", border: "1px solid var(--border)", borderRadius: 10, fontSize: 12 }}
                  formatter={(v: number, n: string) => [fmtNum(v), n === "orders" ? "Pedidos" : "Unidades"]}
                />
                <Legend iconType="circle" iconSize={8} formatter={v => v === "orders" ? "Pedidos" : "Unidades reais"} />
                <Area yAxisId="l" type="monotone" dataKey="orders" stroke={cfg.color} fill={`url(#g1-${platform})`} strokeWidth={2} name="orders" />
                <Area yAxisId="r" type="monotone" dataKey="units"  stroke="#818cf8" fill={`url(#g2-${platform})`} strokeWidth={2} name="units" />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Products */}
      <Card className="rounded-2xl border-0 shadow-sm">
        <CardHeader className="pt-5 px-5 pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Boxes className="h-4 w-4" style={{ color: cfg.color }} />
            Produtos Vendidos
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0 pb-2">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-y border-border/50 text-muted-foreground text-xs bg-muted/30">
                  <th className="text-left px-5 py-2 font-medium">Produto</th>
                  <th className="text-left px-4 py-2 font-medium">SKU</th>
                  <th className="text-right px-4 py-2 font-medium">Pedidos</th>
                  <th className="text-center px-4 py-2 font-medium">Pack</th>
                  <th className="text-right px-4 py-2 font-medium">Unidades reais</th>
                  <th className="text-right px-5 py-2 font-medium">Receita</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/30">
                {m.products.map(p => (
                  <tr key={p.id} className="hover:bg-muted/20 transition-colors">
                    <td className="px-5 py-3 font-medium">{p.name}</td>
                    <td className="px-4 py-3 text-muted-foreground font-mono text-xs">{p.sku}</td>
                    <td className="px-4 py-3 text-right">{fmtNum(p.orders)}</td>
                    <td className="px-4 py-3 text-center">
                      <Badge variant="outline" className="text-xs font-mono px-2">×{p.units_per_pack}</Badge>
                    </td>
                    <td className="px-4 py-3 text-right font-semibold">{fmtNum(p.units_sold)}</td>
                    <td className="px-5 py-3 text-right">{fmtBRL(p.revenue)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-border font-semibold bg-muted/20">
                  <td className="px-5 py-3" colSpan={2}>Total</td>
                  <td className="px-4 py-3 text-right">{fmtNum(m.totalOrders)}</td>
                  <td />
                  <td className="px-4 py-3 text-right" style={{ color: cfg.color }}>{fmtNum(m.totalUnitsSold)}</td>
                  <td className="px-5 py-3 text-right">{fmtBRL(m.totalRevenue)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </CardContent>
      </Card>

      {m.avgRating !== null && (
        <div className="flex items-center gap-1.5 text-sm text-muted-foreground px-1">
          <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
          Avaliação média: <strong className="text-foreground ml-0.5">{m.avgRating.toFixed(1)}</strong>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Comparativo
// ─────────────────────────────────────────────────────────────────────────────

function ComparativoView({ period }: { period: EcommercePeriod }) {
  const [selected, setSelected] = useState<EcommercePlatform[]>(["mercadolivre", "amazon"]);
  const [metric, setMetric] = useState<"orders" | "units">("orders");
  const valid = selected.length >= 2 ? selected : (["mercadolivre", "amazon"] as EcommercePlatform[]);
  const { data } = useEcommerceComparativo(valid, period);

  const toggle = (p: EcommercePlatform) => setSelected(prev => {
    if (prev.includes(p)) return prev.length <= 2 ? prev : prev.filter(x => x !== p);
    return prev.length >= 4 ? prev : [...prev, p];
  });

  const anyConnected = data.some(c => c.totalOrders > 0);

  const barData = data.map(c => ({
    name: PMAP[c.platform].label,
    receita: c.totalRevenue,
    color: PMAP[c.platform].color,
  }));

  const maxDays = Math.max(0, ...data.map(c => c.dailySales.length));
  const lineData = Array.from({ length: maxDays }, (_, i) => {
    const entry: Record<string, number | string> = { label: data[0]?.dailySales[i]?.label ?? "" };
    data.forEach(c => { entry[c.platform] = c.dailySales[i]?.[metric === "orders" ? "orders" : "units"] ?? 0; });
    return entry;
  });

  return (
    <div className="space-y-5">
      {/* Platform selector */}
      <Card className="rounded-2xl border-0 shadow-sm">
        <CardHeader className="pb-2 pt-5 px-5">
          <CardTitle className="text-sm font-semibold">Selecionar plataformas (2 a 4)</CardTitle>
        </CardHeader>
        <CardContent className="px-5 pb-5">
          <div className="flex flex-wrap gap-2">
            {PLATFORMS.map(p => {
              const on = selected.includes(p.id);
              return (
                <button
                  key={p.id}
                  onClick={() => toggle(p.id)}
                  className={cn(
                    "flex items-center gap-2 px-4 py-2.5 rounded-xl border-2 text-sm font-semibold transition-all",
                    on
                      ? cn(p.bgClass, p.borderClass, p.textClass, "shadow-sm")
                      : "border-border text-muted-foreground hover:border-muted-foreground/40 hover:bg-muted/30"
                  )}
                >
                  <span>{p.emoji}</span>
                  <span>{p.label}</span>
                  {on && <CheckCircle2 className="h-3.5 w-3.5 ml-0.5" />}
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Not connected notice */}
      {!anyConnected && (
        <div className="rounded-xl border border-dashed border-muted-foreground/30 bg-muted/20 p-6 flex flex-col items-center gap-2 text-center">
          <AlertCircle className="h-8 w-8 text-muted-foreground/50" />
          <p className="text-sm font-medium text-muted-foreground">Nenhuma plataforma conectada</p>
          <p className="text-xs text-muted-foreground/70 max-w-md">
            Quando as integrações forem configuradas, o comparativo mostrará dados reais de cada plataforma selecionada.
          </p>
        </div>
      )}

      {/* Summary table */}
      <Card className="rounded-2xl border-0 shadow-sm">
        <CardHeader className="pb-2 pt-5 px-5">
          <CardTitle className="text-sm font-semibold">Resumo Comparativo</CardTitle>
        </CardHeader>
        <CardContent className="p-0 pb-2">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-y border-border/50 bg-muted/30 text-muted-foreground text-xs">
                  <th className="text-left px-5 py-2.5 font-medium">Plataforma</th>
                  <th className="text-right px-4 py-2.5 font-medium">Pedidos</th>
                  <th className="text-right px-4 py-2.5 font-medium">Unidades reais</th>
                  <th className="text-right px-4 py-2.5 font-medium">Receita</th>
                  <th className="text-right px-4 py-2.5 font-medium">Ticket médio</th>
                  <th className="text-right px-5 py-2.5 font-medium">Cancelamentos</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/30">
                {data.map(c => {
                  const cfg = PMAP[c.platform];
                  return (
                    <tr key={c.platform} className="hover:bg-muted/20">
                      <td className="px-5 py-3">
                        <span className={cn("font-semibold", cfg.textClass)}>{cfg.emoji} {cfg.label}</span>
                      </td>
                      <td className="px-4 py-3 text-right">{fmtNum(c.totalOrders)}</td>
                      <td className="px-4 py-3 text-right font-semibold">{fmtNum(c.totalUnitsSold)}</td>
                      <td className="px-4 py-3 text-right">{fmtBRL(c.totalRevenue)}</td>
                      <td className="px-4 py-3 text-right">{fmtBRL(c.avgTicket)}</td>
                      <td className="px-5 py-3 text-right text-destructive">{fmtNum(c.cancelledOrders)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Charts — only shown when at least one platform has data */}
      {anyConnected && (
        <>
          <Card className="rounded-2xl border-0 shadow-sm">
            <CardHeader className="pb-1 pt-5 px-5">
              <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                Receita por Plataforma
              </CardTitle>
            </CardHeader>
            <CardContent className="px-2 pb-4">
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={barData} margin={{ top: 4, right: 12, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `R$${(v / 1000).toFixed(0)}k`} />
                  <Tooltip
                    contentStyle={{ background: "var(--background)", border: "1px solid var(--border)", borderRadius: 10, fontSize: 12 }}
                    formatter={(v: number) => [fmtBRL(v), "Receita"]}
                  />
                  <Bar dataKey="receita" radius={[6, 6, 0, 0]}>
                    {barData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card className="rounded-2xl border-0 shadow-sm">
            <CardHeader className="pb-1 pt-5 px-5 flex flex-row items-center justify-between">
              <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                Evolução — {metric === "orders" ? "Pedidos" : "Unidades reais"}
              </CardTitle>
              <div className="flex gap-1.5">
                {(["orders", "units"] as const).map(m2 => (
                  <button
                    key={m2}
                    onClick={() => setMetric(m2)}
                    className={cn(
                      "text-xs px-3 py-1 rounded-lg border transition-all font-medium",
                      metric === m2
                        ? "bg-primary text-primary-foreground border-transparent"
                        : "border-border text-muted-foreground hover:bg-muted"
                    )}
                  >
                    {m2 === "orders" ? "Pedidos" : "Unidades"}
                  </button>
                ))}
              </div>
            </CardHeader>
            <CardContent className="px-2 pb-4">
              <ResponsiveContainer width="100%" height={210}>
                <LineChart data={lineData} margin={{ top: 4, right: 12, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
                  <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip
                    contentStyle={{ background: "var(--background)", border: "1px solid var(--border)", borderRadius: 10, fontSize: 12 }}
                  />
                  <Legend iconType="circle" iconSize={8} formatter={v => PMAP[v as EcommercePlatform]?.label ?? v} />
                  {valid.map(p => (
                    <Line key={p} type="monotone" dataKey={p} stroke={PMAP[p].color} strokeWidth={2.5} dot={false} name={p} />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main page
// ─────────────────────────────────────────────────────────────────────────────

type ActiveView = EcommercePlatform | "comparativo";

const TAB_KEY = "ecommerce_active_tab";

export default function DashEcommerceVendas() {
  const [period, setPeriod] = useState<EcommercePeriod>("7d");
  const [active, setActive] = useState<ActiveView>(() => {
    const saved = localStorage.getItem(TAB_KEY) as ActiveView | null;
    return saved ?? "mercadolivre";
  });

  const handleSetActive = (v: ActiveView) => {
    setActive(v);
    localStorage.setItem(TAB_KEY, v);
  };

  return (
    <BoardLayout>
      <div className="space-y-5">
        {/* Page header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <ShoppingCart className="h-6 w-6 text-primary" />
              Vendas Online
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Acompanhamento de pedidos, receita e unidades por plataforma de e-commerce
            </p>
          </div>
          <Select value={period} onValueChange={v => setPeriod(v as EcommercePeriod)}>
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PERIOD_OPTIONS.map(o => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Platform selector buttons */}
        <div className="flex flex-wrap gap-2">
          {PLATFORMS.map(p => {
            const on = active === p.id;
            return (
              <button
                key={p.id}
                onClick={() => handleSetActive(p.id)}
                className={cn(
                  "flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold border-2 transition-all",
                  on
                    ? cn(p.bgClass, p.borderClass, p.textClass, "shadow-sm scale-[1.02]")
                    : "border-border text-muted-foreground hover:bg-muted/40 hover:border-muted-foreground/40"
                )}
              >
                <span className="text-base">{p.emoji}</span>
                {p.label}
              </button>
            );
          })}
          <button
            onClick={() => handleSetActive("comparativo")}
            className={cn(
              "flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold border-2 transition-all",
              active === "comparativo"
                ? "bg-violet-500/10 border-violet-500/50 text-violet-600 dark:text-violet-300 shadow-sm scale-[1.02]"
                : "border-border text-muted-foreground hover:bg-muted/40 hover:border-muted-foreground/40"
            )}
          >
            <BarChart3 className="h-4 w-4" />
            Comparativo
          </button>
        </div>

        {/* Content */}
        {active === "comparativo" ? (
          <ComparativoView period={period} />
        ) : (
          <PlatformView platform={active} period={period} />
        )}
      </div>
    </BoardLayout>
  );
}

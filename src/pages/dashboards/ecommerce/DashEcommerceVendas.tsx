import { useState, useMemo } from "react";
import { BoardLayout } from "@/components/layouts/BoardLayout";
import { CarboPageHeader } from "@/components/ui/carbo-page-header";
import { KPICard } from "@/components/board/KPICard";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer,
} from "recharts";
import {
  ShoppingCart, Package, TrendingUp, TrendingDown,
  XCircle, Clock, CheckCircle2, Star, Boxes, AlertCircle,
} from "lucide-react";
import {
  useDashEcommerce, useEcommerceComparativo,
  type EcommercePlatform, type EcommercePeriod, type EcommerceMetrics,
} from "@/hooks/useDashEcommerce";

// ─────────────────────────────────────────────────────────────────────────────
// Platform config
// ─────────────────────────────────────────────────────────────────────────────

interface PlatformConfig {
  id: EcommercePlatform;
  label: string;
  color: string;
  bgColor: string;
  textColor: string;
  emoji: string;
}

const PLATFORMS: PlatformConfig[] = [
  { id: "mercadolivre", label: "Mercado Livre", color: "#FFE600", bgColor: "bg-yellow-400/10", textColor: "text-yellow-600 dark:text-yellow-400", emoji: "🛒" },
  { id: "amazon",       label: "Amazon",        color: "#FF9900", bgColor: "bg-orange-400/10", textColor: "text-orange-600 dark:text-orange-400", emoji: "📦" },
  { id: "tiktok",       label: "TikTok Shop",   color: "#FF0050", bgColor: "bg-pink-500/10",   textColor: "text-pink-600 dark:text-pink-400",   emoji: "🎵" },
  { id: "shopee",       label: "Shopee",         color: "#EE4D2D", bgColor: "bg-red-500/10",    textColor: "text-red-600 dark:text-red-400",    emoji: "🧡" },
];

const PLATFORM_MAP = Object.fromEntries(PLATFORMS.map(p => [p.id, p])) as Record<EcommercePlatform, PlatformConfig>;

function fmtBRL(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}
function fmtNum(v: number) {
  return v.toLocaleString("pt-BR");
}

// ─────────────────────────────────────────────────────────────────────────────
// Connection badge
// ─────────────────────────────────────────────────────────────────────────────

function ConnectionBadge({ connected }: { connected: boolean }) {
  return connected ? (
    <Badge className="bg-green-500/10 text-green-600 border-green-500/30 gap-1.5">
      <span className="h-1.5 w-1.5 rounded-full bg-green-500 inline-block animate-pulse" />
      Conectado
    </Badge>
  ) : (
    <Badge variant="outline" className="bg-amber-500/10 text-amber-600 border-amber-500/30 gap-1.5">
      <AlertCircle className="h-3 w-3" />
      Aguardando integração
    </Badge>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Platform view
// ─────────────────────────────────────────────────────────────────────────────

function PlatformView({ platform, period }: { platform: EcommercePlatform; period: EcommercePeriod }) {
  const { data: m } = useDashEcommerce(platform, period);
  const cfg = PLATFORM_MAP[platform];

  return (
    <div className="space-y-6">
      {/* Status */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xl">{cfg.emoji}</span>
          <span className="font-semibold">{cfg.label}</span>
        </div>
        <ConnectionBadge connected={m.isConnected} />
      </div>

      {/* KPIs row 1 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard
          title="Pedidos"
          value={fmtNum(m.totalOrders)}
          icon={<ShoppingCart className="h-5 w-5" />}
          variant="default"
        />
        <KPICard
          title="Receita Total"
          value={fmtBRL(m.totalRevenue)}
          icon={<TrendingUp className="h-5 w-5" />}
          variant="success"
        />
        <KPICard
          title="Ticket Médio"
          value={fmtBRL(m.avgTicket)}
          icon={<Package className="h-5 w-5" />}
          variant="default"
        />
        <KPICard
          title="Cancelamentos"
          value={fmtNum(m.cancelledOrders)}
          subtitle={`${m.totalOrders > 0 ? ((m.cancelledOrders / m.totalOrders) * 100).toFixed(1) : 0}% dos pedidos`}
          icon={<XCircle className="h-5 w-5" />}
          variant={m.cancelledOrders / m.totalOrders > 0.06 ? "danger" : "warning"}
        />
      </div>

      {/* KPI row 2 — unidades reais destaque */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="col-span-2 bg-gradient-to-br from-board-surface to-muted/30 border-l-4" style={{ borderLeftColor: cfg.color }}>
          <CardContent className="pt-5 pb-4">
            <p className="text-sm text-muted-foreground font-medium">Unidades Reais Vendidas</p>
            <p className="text-4xl font-bold mt-1">{fmtNum(m.totalUnitsSold)}</p>
            <p className="text-xs text-muted-foreground mt-1">considera multiplicador de pack por produto</p>
          </CardContent>
        </Card>
        <KPICard
          title="Em transporte"
          value={fmtNum(m.shippedOrders)}
          icon={<Clock className="h-5 w-5" />}
          variant="warning"
        />
        <KPICard
          title="Entregues"
          value={fmtNum(m.deliveredOrders)}
          icon={<CheckCircle2 className="h-5 w-5" />}
          variant="success"
        />
      </div>

      {/* Chart — vendas por dia */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">Evolução de Vendas</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={m.dailySales} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id={`grad-${platform}-orders`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={cfg.color} stopOpacity={0.25} />
                  <stop offset="95%" stopColor={cfg.color} stopOpacity={0} />
                </linearGradient>
                <linearGradient id={`grad-${platform}-units`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#6366f1" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} />
              <YAxis yAxisId="orders" tick={{ fontSize: 11 }} />
              <YAxis yAxisId="units" orientation="right" tick={{ fontSize: 11 }} />
              <Tooltip
                contentStyle={{ background: "var(--background)", border: "1px solid var(--border)", borderRadius: 8 }}
                formatter={(v: number, name: string) => [fmtNum(v), name === "orders" ? "Pedidos" : "Unidades"]}
              />
              <Legend formatter={v => v === "orders" ? "Pedidos" : "Unidades reais"} />
              <Area yAxisId="orders" type="monotone" dataKey="orders" stroke={cfg.color} fill={`url(#grad-${platform}-orders)`} strokeWidth={2} name="orders" />
              <Area yAxisId="units"  type="monotone" dataKey="units"  stroke="#6366f1" fill={`url(#grad-${platform}-units)`}  strokeWidth={2} name="units" />
            </AreaChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Products table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Boxes className="h-4 w-4" /> Produtos Vendidos
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-muted-foreground text-xs">
                  <th className="text-left px-4 py-2.5 font-medium">Produto</th>
                  <th className="text-left px-4 py-2.5 font-medium">SKU</th>
                  <th className="text-right px-4 py-2.5 font-medium">Pedidos</th>
                  <th className="text-center px-4 py-2.5 font-medium">Pack</th>
                  <th className="text-right px-4 py-2.5 font-medium">Unidades reais</th>
                  <th className="text-right px-4 py-2.5 font-medium">Receita</th>
                </tr>
              </thead>
              <tbody>
                {m.products.map((p, i) => (
                  <tr key={p.id} className={i % 2 === 0 ? "bg-muted/20" : ""}>
                    <td className="px-4 py-2.5 font-medium truncate max-w-[180px]">{p.name}</td>
                    <td className="px-4 py-2.5 text-muted-foreground font-mono text-xs">{p.sku}</td>
                    <td className="px-4 py-2.5 text-right">{fmtNum(p.orders)}</td>
                    <td className="px-4 py-2.5 text-center">
                      <Badge variant="outline" className="text-xs font-mono">×{p.units_per_pack}</Badge>
                    </td>
                    <td className="px-4 py-2.5 text-right font-semibold">{fmtNum(p.units_sold)}</td>
                    <td className="px-4 py-2.5 text-right">{fmtBRL(p.revenue)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-border font-semibold bg-muted/30">
                  <td className="px-4 py-2.5" colSpan={2}>Total</td>
                  <td className="px-4 py-2.5 text-right">{fmtNum(m.totalOrders)}</td>
                  <td />
                  <td className="px-4 py-2.5 text-right">{fmtNum(m.totalUnitsSold)}</td>
                  <td className="px-4 py-2.5 text-right">{fmtBRL(m.totalRevenue)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Rating */}
      {m.avgRating !== null && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
          <span>Avaliação média na plataforma: <strong className="text-foreground">{m.avgRating.toFixed(1)}</strong></span>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Comparativo view
// ─────────────────────────────────────────────────────────────────────────────

function ComparativoView({ period }: { period: EcommercePeriod }) {
  const [selected, setSelected] = useState<EcommercePlatform[]>(["mercadolivre", "amazon"]);
  const [metric, setMetric] = useState<"orders" | "units">("orders");

  const validSelected = selected.length >= 2 ? selected : (["mercadolivre", "amazon"] as EcommercePlatform[]);
  const { data: comparativo } = useEcommerceComparativo(validSelected, period);

  function togglePlatform(p: EcommercePlatform) {
    setSelected(prev => {
      if (prev.includes(p)) {
        if (prev.length <= 2) return prev; // minimum 2
        return prev.filter(x => x !== p);
      }
      if (prev.length >= 4) return prev; // maximum 4
      return [...prev, p];
    });
  }

  // Build bar chart data: one entry per platform
  const barData = comparativo.map(c => ({
    name: PLATFORM_MAP[c.platform].label,
    receita: c.totalRevenue,
    pedidos: c.totalOrders,
    unidades: c.totalUnitsSold,
    color: PLATFORM_MAP[c.platform].color,
  }));

  // Build multi-line daily data: merge all platforms by date index
  const maxDays = Math.max(...comparativo.map(c => c.dailySales.length));
  const lineData = Array.from({ length: maxDays }, (_, i) => {
    const entry: Record<string, number | string> = {
      label: comparativo[0]?.dailySales[i]?.label ?? "",
    };
    comparativo.forEach(c => {
      const d = c.dailySales[i];
      entry[c.platform] = d ? (metric === "orders" ? d.orders : d.units) : 0;
    });
    return entry;
  });

  return (
    <div className="space-y-6">
      {/* Platform selector */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">Selecione as plataformas (2 a 4)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3">
            {PLATFORMS.map(p => {
              const isOn = selected.includes(p.id);
              return (
                <button
                  key={p.id}
                  onClick={() => togglePlatform(p.id)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg border-2 text-sm font-medium transition-all ${
                    isOn
                      ? `border-current ${p.bgColor} ${p.textColor}`
                      : "border-border text-muted-foreground hover:border-muted-foreground/50"
                  }`}
                >
                  <Checkbox checked={isOn} className="pointer-events-none" />
                  <span>{p.emoji} {p.label}</span>
                </button>
              );
            })}
          </div>
          {selected.length < 2 && (
            <p className="text-xs text-destructive mt-2">Selecione pelo menos 2 plataformas.</p>
          )}
        </CardContent>
      </Card>

      {/* Summary table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">Resumo Comparativo</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-muted-foreground text-xs">
                  <th className="text-left px-4 py-2.5 font-medium">Plataforma</th>
                  <th className="text-right px-4 py-2.5 font-medium">Pedidos</th>
                  <th className="text-right px-4 py-2.5 font-medium">Unidades reais</th>
                  <th className="text-right px-4 py-2.5 font-medium">Receita</th>
                  <th className="text-right px-4 py-2.5 font-medium">Ticket Médio</th>
                  <th className="text-right px-4 py-2.5 font-medium">Cancelamentos</th>
                </tr>
              </thead>
              <tbody>
                {comparativo.map((c, i) => {
                  const cfg = PLATFORM_MAP[c.platform];
                  return (
                    <tr key={c.platform} className={i % 2 === 0 ? "bg-muted/20" : ""}>
                      <td className="px-4 py-2.5">
                        <span className={`font-semibold ${cfg.textColor}`}>{cfg.emoji} {cfg.label}</span>
                      </td>
                      <td className="px-4 py-2.5 text-right">{fmtNum(c.totalOrders)}</td>
                      <td className="px-4 py-2.5 text-right font-semibold">{fmtNum(c.totalUnitsSold)}</td>
                      <td className="px-4 py-2.5 text-right">{fmtBRL(c.totalRevenue)}</td>
                      <td className="px-4 py-2.5 text-right">{fmtBRL(c.avgTicket)}</td>
                      <td className="px-4 py-2.5 text-right text-destructive">{fmtNum(c.cancelledOrders)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Bar chart — revenue by platform */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">Receita por Plataforma</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={barData} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `R$${(v / 1000).toFixed(0)}k`} />
              <Tooltip
                contentStyle={{ background: "var(--background)", border: "1px solid var(--border)", borderRadius: 8 }}
                formatter={(v: number) => [fmtBRL(v), "Receita"]}
              />
              <Bar dataKey="receita" radius={[4, 4, 0, 0]}>
                {barData.map((entry, i) => (
                  <rect key={i} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Line chart — evolution */}
      <Card>
        <CardHeader className="pb-2 flex flex-row items-center justify-between">
          <CardTitle className="text-sm font-semibold">Evolução — {metric === "orders" ? "Pedidos" : "Unidades reais"}</CardTitle>
          <div className="flex gap-2">
            {(["orders", "units"] as const).map(m2 => (
              <button
                key={m2}
                onClick={() => setMetric(m2)}
                className={`text-xs px-3 py-1 rounded-md border transition-colors ${
                  metric === m2 ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:bg-muted"
                }`}
              >
                {m2 === "orders" ? "Pedidos" : "Unidades"}
              </button>
            ))}
          </div>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={lineData} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip
                contentStyle={{ background: "var(--background)", border: "1px solid var(--border)", borderRadius: 8 }}
              />
              <Legend formatter={v => PLATFORM_MAP[v as EcommercePlatform]?.label ?? v} />
              {validSelected.map(p => (
                <Line
                  key={p}
                  type="monotone"
                  dataKey={p}
                  stroke={PLATFORM_MAP[p].color}
                  strokeWidth={2}
                  dot={false}
                  name={p}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main page
// ─────────────────────────────────────────────────────────────────────────────

const PERIOD_OPTIONS: { value: EcommercePeriod; label: string }[] = [
  { value: "today",  label: "Hoje" },
  { value: "7d",     label: "Últimos 7 dias" },
  { value: "30d",    label: "Últimos 30 dias" },
  { value: "month",  label: "Este mês" },
];

export default function DashEcommerceVendas() {
  const [period, setPeriod] = useState<EcommercePeriod>("7d");

  return (
    <BoardLayout>
      <div className="space-y-6">
        <CarboPageHeader
          title="Vendas Online"
          description="Acompanhamento de pedidos e receita por plataforma de e-commerce"
          icon={ShoppingCart}
          actions={
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
          }
        />

        <Tabs defaultValue="mercadolivre" className="w-full">
          <TabsList className="flex flex-wrap h-auto gap-1">
            {PLATFORMS.map(p => (
              <TabsTrigger key={p.id} value={p.id} className="gap-1.5">
                <span>{p.emoji}</span>
                <span className="hidden sm:inline">{p.label}</span>
                <span className="sm:hidden">{p.label.split(" ")[0]}</span>
              </TabsTrigger>
            ))}
            <TabsTrigger value="comparativo" className="gap-1.5">
              <TrendingUp className="h-3.5 w-3.5" />
              <span>Comparativo</span>
            </TabsTrigger>
          </TabsList>

          {PLATFORMS.map(p => (
            <TabsContent key={p.id} value={p.id} className="mt-4">
              <PlatformView platform={p.id} period={period} />
            </TabsContent>
          ))}

          <TabsContent value="comparativo" className="mt-4">
            <ComparativoView period={period} />
          </TabsContent>
        </Tabs>
      </div>
    </BoardLayout>
  );
}

import { useState } from "react";
import { BoardLayout } from "@/components/layouts/BoardLayout";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import {
  ShoppingCart, Package, TrendingUp, XCircle, Clock,
  CheckCircle2, Star, Boxes, AlertCircle, BarChart3, Calendar,
  Percent, Wallet, Receipt, Trophy, Hourglass, Pencil, X, Check, History,
} from "lucide-react";
import {
  useDashEcommerce, useEcommerceComparativo, useEcommerceRawCheck, useCommissionRates,
  useEcommerceHistoricoMensal,
  type EcommercePlatform, type EcommercePeriod, type RawCheckMetrics, type EcommerceMetrics,
  type MonthlyMetrics,
  PLATFORM_FEE_DEFAULT,
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
  label, value, sub, icon, accent,
}: {
  label: string; value: string; sub?: string;
  icon: React.ReactNode; accent: string;
}) {
  return (
    <div
      className="rounded-xl border bg-card p-4 flex flex-col gap-1.5 transition-all hover:-translate-y-0.5 hover:shadow-md"
      style={{ borderLeftColor: accent, borderLeftWidth: 3 }}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide leading-tight">{label}</p>
        <div className="p-1.5 rounded-lg shrink-0" style={{ background: accent + "20" }}>
          <div style={{ color: accent }}>{icon}</div>
        </div>
      </div>
      <p className="text-xl font-bold leading-none">{value}</p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Commission card — editable rate with history
// ─────────────────────────────────────────────────────────────────────────────

function CommissionCard({ platform, commissionTotal, netRevenue }: {
  platform: EcommercePlatform; commissionTotal: number; netRevenue: number;
}) {
  const { history, currentRate, saveRate, saving } = useCommissionRates(platform);
  const [open, setOpen]     = useState(false);
  const [newRate, setNewRate] = useState("");
  const [newDate, setNewDate] = useState(() => new Date().toISOString().slice(0, 10));

  const handleSave = async () => {
    const r = parseFloat(newRate.replace(",", ".")) / 100;
    if (isNaN(r) || r < 0 || r > 1) return;
    const ok = await saveRate(r, newDate);
    if (ok) { setNewRate(""); }
  };

  const revenueAfterFee = netRevenue - commissionTotal;

  return (
    <>
      <div
        className="rounded-xl border bg-card p-4 flex flex-col gap-1.5 transition-all hover:-translate-y-0.5 hover:shadow-md cursor-pointer"
        style={{ borderLeftColor: "#94a3b8", borderLeftWidth: 3 }}
        onClick={() => setOpen(true)}
      >
        <div className="flex items-start justify-between gap-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide leading-tight">Comissão da Plataforma</p>
          <div className="p-1.5 rounded-lg shrink-0" style={{ background: "#94a3b820" }}>
            <Receipt className="h-4 w-4 text-slate-400" />
          </div>
        </div>
        <p className="text-xl font-bold leading-none">{fmtBRL(commissionTotal)}</p>
        <p className="text-xs text-muted-foreground">taxa: {(currentRate * 100).toFixed(2)}% · clique para gerenciar</p>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Receipt className="h-4 w-4 text-slate-400" />
              Comissão — {PMAP[platform].label}
            </DialogTitle>
            <DialogDescription>
              Gerencie a taxa de comissão da plataforma. Cada taxa vale a partir da data informada, preservando o cálculo de pedidos anteriores.
            </DialogDescription>
          </DialogHeader>

          {/* Resumo financeiro */}
          <div className="grid grid-cols-3 gap-3 py-2">
            <div className="rounded-lg bg-muted/40 p-3 text-center">
              <p className="text-xs text-muted-foreground mb-1">Receita Líquida</p>
              <p className="text-sm font-bold">{fmtBRL(netRevenue)}</p>
            </div>
            <div className="rounded-lg bg-red-500/10 p-3 text-center">
              <p className="text-xs text-muted-foreground mb-1">Comissão</p>
              <p className="text-sm font-bold text-red-500">− {fmtBRL(commissionTotal)}</p>
            </div>
            <div className="rounded-lg bg-green-500/10 p-3 text-center">
              <p className="text-xs text-muted-foreground mb-1">Após Comissão</p>
              <p className="text-sm font-bold text-green-600">{fmtBRL(revenueAfterFee)}</p>
            </div>
          </div>

          {/* Nova taxa */}
          <div className="border rounded-xl p-4 flex flex-col gap-3">
            <p className="text-sm font-semibold flex items-center gap-1.5">
              <Pencil className="h-3.5 w-3.5" /> Cadastrar nova taxa
            </p>
            <div className="grid grid-cols-2 gap-2">
              <div className="flex flex-col gap-1">
                <label className="text-xs text-muted-foreground">Taxa (%)</label>
                <div className="flex items-center gap-1">
                  <Input className="h-8 text-sm" placeholder={`${(currentRate * 100).toFixed(2)}`} value={newRate} onChange={e => setNewRate(e.target.value)} />
                  <span className="text-sm text-muted-foreground">%</span>
                </div>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-muted-foreground">Válida a partir de</label>
                <Input type="date" className="h-8 text-sm" value={newDate} onChange={e => setNewDate(e.target.value)} />
              </div>
            </div>
            <Button size="sm" onClick={handleSave} disabled={saving || !newRate}>
              <Check className="h-3.5 w-3.5 mr-1.5" /> Salvar taxa
            </Button>
          </div>

          {/* Histórico */}
          {history.length > 0 && (
            <div className="flex flex-col gap-2">
              <p className="text-sm font-semibold flex items-center gap-1.5">
                <History className="h-3.5 w-3.5" /> Histórico de taxas
              </p>
              <div className="rounded-xl border overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-muted/30 border-b text-xs text-muted-foreground">
                      <th className="text-left px-4 py-2 font-medium">Válida a partir de</th>
                      <th className="text-right px-4 py-2 font-medium">Taxa</th>
                      <th className="text-right px-4 py-2 font-medium">Cadastrada em</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/30">
                    {history.map((r, i) => (
                      <tr key={r.id} className={cn("hover:bg-muted/20", i === 0 && "bg-green-500/5")}>
                        <td className="px-4 py-2.5">{r.valid_from}{i === 0 && <Badge className="ml-2 text-xs py-0 h-4 bg-green-500/10 text-green-600 border-green-500/30">atual</Badge>}</td>
                        <td className="px-4 py-2.5 text-right font-semibold">{(r.rate * 100).toFixed(2)}%</td>
                        <td className="px-4 py-2.5 text-right text-muted-foreground text-xs">{new Date(r.created_at).toLocaleDateString("pt-BR")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
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

      {/* KPIs — linha 1: pedidos e receita */}
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
          label="Receita Líquida" value={fmtBRL(m.netRevenue)}
          sub="excluindo cancelados"
          icon={<Wallet className="h-4 w-4" />} accent="#22c55e"
        />
        <CommissionCard platform={platform} commissionTotal={m.commissionTotal} netRevenue={m.netRevenue} />
      </div>

      {/* KPIs — linha 2: unidades e status */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <MetricCard
          label="Unidades Reais Vendidas" value={fmtNum(m.totalUnitsSold)}
          sub="considera multiplicador de pack"
          icon={<Boxes className="h-4 w-4" />} accent={cfg.color}
        />
        <MetricCard
          label="Ticket Médio" value={fmtBRL(m.avgTicket)}
          icon={<Package className="h-4 w-4" />} accent={cfg.color}
        />
        <MetricCard
          label="Em Transporte" value={fmtNum(m.shippedOrders)}
          icon={<Clock className="h-4 w-4" />} accent="#f59e0b"
        />
        <MetricCard
          label="Entregues" value={fmtNum(m.deliveredOrders)}
          icon={<CheckCircle2 className="h-4 w-4" />} accent="#22c55e"
        />
      </div>

      {/* KPIs — linha 3: cancelamentos e pendentes */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <MetricCard
          label="Cancelamentos" value={fmtNum(m.cancelledOrders)}
          sub={m.totalOrders > 0 ? `${pct(m.cancelledOrders, m.totalOrders)} dos pedidos` : undefined}
          icon={<XCircle className="h-4 w-4" />} accent="#f59e0b"
        />
        <MetricCard
          label="Taxa de Cancelamento" value={`${m.cancellationRate.toFixed(1)}%`}
          sub={`${fmtNum(m.cancelledOrders)} de ${fmtNum(m.totalOrders)} pedidos`}
          icon={<Percent className="h-4 w-4" />} accent="#f43f5e"
        />
        <MetricCard
          label="Pedidos Pendentes" value={fmtNum(m.pendingOrders)}
          sub="aguardando pagamento ou confirmação"
          icon={<Hourglass className="h-4 w-4" />} accent="#a78bfa"
        />
        <MetricCard
          label="Avaliação Média" value={m.avgRating !== null ? m.avgRating.toFixed(1) : "—"}
          sub="média do período"
          icon={<Star className="h-4 w-4" />} accent="#facc15"
        />
      </div>

      {/* Produto destaque */}
      {m.topProduct && (
        <div
          className="rounded-2xl border p-4 flex items-center gap-4"
          style={{ borderLeftColor: cfg.color, borderLeftWidth: 3 }}
        >
          <div className="p-2.5 rounded-xl" style={{ background: cfg.color + "20" }}>
            <Trophy className="h-5 w-5" style={{ color: cfg.color }} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-0.5">Produto mais vendido</p>
            <p className="font-bold truncate">{m.topProduct.name}</p>
            <p className="text-xs text-muted-foreground font-mono">{m.topProduct.sku}</p>
          </div>
          <div className="text-right shrink-0">
            <p className="text-lg font-bold">{fmtBRL(m.topProduct.revenue)}</p>
            <p className="text-xs text-muted-foreground">{fmtNum(m.topProduct.units_sold)} unid.</p>
          </div>
        </div>
      )}

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
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={m.dailySales} margin={{ top: 4, right: 12, left: -10, bottom: 0 }} barCategoryGap="25%" barGap={2}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{ background: "var(--background)", border: "1px solid var(--border)", borderRadius: 10, fontSize: 12 }}
                  formatter={(v: number, n: string) => [fmtNum(v), n === "orders" ? "Pedidos" : "Unidades reais"]}
                  cursor={{ fill: "var(--muted)", opacity: 0.3 }}
                />
                <Legend iconType="square" iconSize={10} formatter={v => v === "orders" ? "Pedidos" : "Unidades reais"} />
                <Bar dataKey="orders" name="orders" fill={cfg.color} radius={[4, 4, 0, 0]} maxBarSize={28} />
                <Bar dataKey="units"  name="units"  fill="#818cf8"  radius={[4, 4, 0, 0]} maxBarSize={28} />
              </BarChart>
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
            <CardContent className="px-4 pb-5">
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={barData} margin={{ top: 16, right: 16, left: 8, bottom: 0 }} barCategoryGap="35%">
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border/40" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis
                    tick={{ fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={v => v === 0 ? "R$0" : `R$${(v / 1000).toFixed(0)}k`}
                    width={52}
                  />
                  <Tooltip
                    contentStyle={{ background: "var(--background)", border: "1px solid var(--border)", borderRadius: 10, fontSize: 12 }}
                    formatter={(v: number) => [fmtBRL(v), "Receita"]}
                    cursor={{ fill: "var(--muted)", opacity: 0.3 }}
                  />
                  <Bar dataKey="receita" radius={[6, 6, 0, 0]} maxBarSize={64} label={{ position: "top", fontSize: 11, formatter: (v: number) => v > 0 ? `R$${(v/1000).toFixed(1)}k` : "", fill: "var(--muted-foreground)" }}>
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
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={lineData} margin={{ top: 4, right: 16, left: 8, bottom: 0 }} barCategoryGap="20%" barGap={2}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border/40" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false} width={28} />
                  <Tooltip
                    contentStyle={{ background: "var(--background)", border: "1px solid var(--border)", borderRadius: 10, fontSize: 12 }}
                    formatter={(v: number, name: string) => [fmtNum(v), PMAP[name as EcommercePlatform]?.label ?? name]}
                    cursor={{ fill: "var(--muted)", opacity: 0.3 }}
                  />
                  <Legend iconType="square" iconSize={10} formatter={v => PMAP[v as EcommercePlatform]?.label ?? v} />
                  {valid.map(p => (
                    <Bar key={p} dataKey={p} fill={PMAP[p].color} radius={[3, 3, 0, 0]} maxBarSize={20} name={p} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Histórico Mensal helpers
// ─────────────────────────────────────────────────────────────────────────────

const MN_SHORT = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];

function getMonthLabel(ym: string) {
  const [y, m] = ym.split("-");
  return `${MN_SHORT[parseInt(m) - 1]}/${y.slice(2)}`;
}

function monthsBetween(from: string, to: string): string[] {
  const result: string[] = [];
  const cur = new Date(`${from}-02T12:00:00Z`);
  const end = new Date(`${to}-02T12:00:00Z`);
  while (cur <= end) {
    result.push(cur.toISOString().slice(0, 7));
    cur.setUTCMonth(cur.getUTCMonth() + 1);
  }
  return result;
}

function generateMonthOptions(): { value: string; label: string }[] {
  const opts: { value: string; label: string }[] = [];
  const start = new Date(2024, 0, 1);
  const now   = new Date();
  while (start <= now) {
    const y = start.getFullYear();
    const m = start.getMonth();
    opts.push({ value: `${y}-${String(m + 1).padStart(2, "0")}`, label: `${MN_SHORT[m]}/${y}` });
    start.setMonth(start.getMonth() + 1);
  }
  return opts;
}

// ─────────────────────────────────────────────────────────────────────────────
// Histórico Mensal view
// ─────────────────────────────────────────────────────────────────────────────

function HistoricoMensalView() {
  const now = new Date();
  const curMonthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const def12ago = (() => {
    const d = new Date(now); d.setMonth(d.getMonth() - 12);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  })();

  const [selected, setSelected]   = useState<EcommercePlatform[]>(["mercadolivre", "amazon"]);
  const [fromMonth, setFromMonth] = useState(def12ago);
  const [toMonth,   setToMonth]   = useState(curMonthStr);

  const { data, isLoading } = useEcommerceHistoricoMensal(selected, fromMonth, toMonth);

  const toggle = (p: EcommercePlatform) =>
    setSelected(prev => prev.includes(p) ? (prev.length <= 1 ? prev : prev.filter(x => x !== p)) : [...prev, p]);

  const monthOpts  = generateMonthOptions();
  const allMonths  = monthsBetween(fromMonth, toMonth);

  // Chart data: one row per month with keys per platform
  const barData = allMonths.map(month => {
    const entry: Record<string, string | number> = { month, label: getMonthLabel(month) };
    for (const p of selected) {
      const m = data.find(d => d.month === month && d.platform === p);
      entry[`${p}_receita`]  = m?.totalRevenue   ?? 0;
      entry[`${p}_pedidos`]  = m?.totalOrders     ?? 0;
      entry[`${p}_unidades`] = m?.totalUnitsSold  ?? 0;
      entry[`${p}_ticket`]   = m?.avgTicket        ?? 0;
      entry[`${p}_cancel`]   = m?.cancellationRate ?? 0;
    }
    return entry;
  });

  // Aggregate KPIs
  const totalReceita    = data.reduce((s, d) => s + d.totalRevenue,   0);
  const totalPedidos    = data.reduce((s, d) => s + d.totalOrders,    0);
  const totalUnidades   = data.reduce((s, d) => s + d.totalUnitsSold, 0);
  const totalCancelados = data.reduce((s, d) => s + d.cancelledOrders, 0);
  const avgTicketGeral  = totalPedidos > 0 ? totalReceita / totalPedidos : 0;
  const cancelRateGeral = totalPedidos > 0 ? (totalCancelados / totalPedidos) * 100 : 0;

  // Per-platform aggregates
  const byPlatform = selected.map(p => {
    const rows     = data.filter(d => d.platform === p);
    const receita  = rows.reduce((s, r) => s + r.totalRevenue,   0);
    const pedidos  = rows.reduce((s, r) => s + r.totalOrders,    0);
    const unidades = rows.reduce((s, r) => s + r.totalUnitsSold, 0);
    return { platform: p, receita, pedidos, unidades, pct: totalReceita > 0 ? (receita / totalReceita) * 100 : 0 };
  });

  // Combined month totals (all selected platforms summed)
  const monthTotals = allMonths.map(month => ({
    month,
    label:        getMonthLabel(month),
    totalRevenue: selected.reduce((s, p) => s + (data.find(d => d.month === month && d.platform === p)?.totalRevenue ?? 0), 0),
    totalOrders:  selected.reduce((s, p) => s + (data.find(d => d.month === month && d.platform === p)?.totalOrders  ?? 0), 0),
  })).filter(m => m.totalRevenue > 0 || m.totalOrders > 0);

  const bestMonth  = monthTotals.length ? monthTotals.reduce((a, b) => a.totalRevenue > b.totalRevenue ? a : b) : null;
  const worstMonth = monthTotals.length > 1 ? monthTotals.reduce((a, b) => a.totalRevenue < b.totalRevenue ? a : b) : null;

  // Month-over-month (last 2 months with data)
  const lastTwo  = monthTotals.slice(-2);
  const momChange = lastTwo.length === 2 && lastTwo[0].totalRevenue > 0
    ? ((lastTwo[1].totalRevenue - lastTwo[0].totalRevenue) / lastTwo[0].totalRevenue) * 100 : null;

  const hasData = data.length > 0;

  return (
    <div className="space-y-5">
      {/* ── Filter bar ── */}
      <Card className="rounded-2xl border-0 shadow-sm">
        <CardContent className="px-5 py-4">
          <div className="flex flex-col sm:flex-row gap-4 sm:items-end">
            {/* Platform toggles */}
            <div className="flex-1">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Plataformas</p>
              <div className="flex flex-wrap gap-2">
                {PLATFORMS.map(p => {
                  const on = selected.includes(p.id);
                  return (
                    <button key={p.id} onClick={() => toggle(p.id)}
                      className={cn(
                        "flex items-center gap-2 px-3.5 py-2 rounded-xl border-2 text-sm font-semibold transition-all",
                        on ? cn(p.bgClass, p.borderClass, p.textClass, "shadow-sm")
                           : "border-border text-muted-foreground hover:border-muted-foreground/40 hover:bg-muted/30"
                      )}>
                      <span>{p.emoji}</span><span>{p.label}</span>
                      {on && <CheckCircle2 className="h-3.5 w-3.5 ml-0.5" />}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Date range */}
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Período</p>
              <div className="flex items-center gap-2">
                <Select value={fromMonth} onValueChange={v => { setFromMonth(v); if (v > toMonth) setToMonth(v); }}>
                  <SelectTrigger className="w-[118px] h-9 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {monthOpts.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                  </SelectContent>
                </Select>
                <span className="text-muted-foreground text-sm font-medium">→</span>
                <Select value={toMonth} onValueChange={v => { setToMonth(v); if (v < fromMonth) setFromMonth(v); }}>
                  <SelectTrigger className="w-[118px] h-9 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {monthOpts.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Badge variant="secondary" className="hidden sm:flex text-xs">
                  {allMonths.length} {allMonths.length === 1 ? "mês" : "meses"}
                </Badge>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {isLoading && (
        <div className="flex items-center gap-2 px-1 text-sm text-muted-foreground animate-pulse">
          <div className="h-4 w-4 rounded-full border-2 border-primary border-t-transparent animate-spin" />
          Carregando histórico...
        </div>
      )}

      {!isLoading && !hasData && (
        <div className="rounded-xl border border-dashed border-muted-foreground/30 bg-muted/20 p-10 flex flex-col items-center gap-2 text-center">
          <AlertCircle className="h-8 w-8 text-muted-foreground/40" />
          <p className="text-sm font-medium text-muted-foreground">Nenhum dado no período selecionado</p>
          <p className="text-xs text-muted-foreground/60">Ajuste o período ou aguarde a sincronização.</p>
        </div>
      )}

      {!isLoading && hasData && (
        <>
          {/* ── KPI Summary row ── */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 px-0.5">
              Resumo · {getMonthLabel(fromMonth)} → {getMonthLabel(toMonth)}
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              {/* Receita Total */}
              <div className="col-span-2 sm:col-span-1 rounded-xl border bg-card p-4" style={{ borderLeftColor: "#22c55e", borderLeftWidth: 3 }}>
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Receita Total</p>
                <p className="text-xl font-bold mt-1 leading-none">{fmtBRL(totalReceita)}</p>
                {momChange !== null && (
                  <p className={cn("text-xs font-semibold mt-1", momChange >= 0 ? "text-green-500" : "text-red-500")}>
                    {momChange >= 0 ? "▲" : "▼"} {Math.abs(momChange).toFixed(1)}% vs mês ant.
                  </p>
                )}
              </div>
              {/* Pedidos */}
              <div className="rounded-xl border bg-card p-4" style={{ borderLeftColor: "#3b82f6", borderLeftWidth: 3 }}>
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Pedidos</p>
                <p className="text-xl font-bold mt-1 leading-none">{fmtNum(totalPedidos)}</p>
                <p className="text-xs text-muted-foreground mt-1">{allMonths.length} meses</p>
              </div>
              {/* Unidades */}
              <div className="rounded-xl border bg-card p-4" style={{ borderLeftColor: "#8b5cf6", borderLeftWidth: 3 }}>
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Unidades</p>
                <p className="text-xl font-bold mt-1 leading-none">{fmtNum(totalUnidades)}</p>
              </div>
              {/* Ticket médio */}
              <div className="rounded-xl border bg-card p-4" style={{ borderLeftColor: "#f59e0b", borderLeftWidth: 3 }}>
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Ticket Médio</p>
                <p className="text-xl font-bold mt-1 leading-none">{fmtBRL(avgTicketGeral)}</p>
              </div>
              {/* Cancelamentos */}
              <div className="rounded-xl border bg-card p-4" style={{ borderLeftColor: "#ef4444", borderLeftWidth: 3 }}>
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Cancelamentos</p>
                <p className="text-xl font-bold mt-1 leading-none">{cancelRateGeral.toFixed(1)}%</p>
                <p className="text-xs text-muted-foreground mt-1">{fmtNum(totalCancelados)} pedidos</p>
              </div>
              {/* Melhor mês */}
              {bestMonth && (
                <div className="rounded-xl border bg-green-500/5 border-green-500/20 p-4">
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Melhor Mês</p>
                  <p className="text-lg font-bold text-green-600 mt-1 leading-none">{bestMonth.label}</p>
                  <p className="text-xs text-muted-foreground mt-1">{fmtBRL(bestMonth.totalRevenue)}</p>
                </div>
              )}
            </div>
          </div>

          {/* ── Per-platform breakdown ── */}
          <div className={cn("grid gap-3", byPlatform.length === 1 ? "grid-cols-1" : "grid-cols-1 sm:grid-cols-2")}>
            {byPlatform.map(({ platform: p, receita, pedidos, unidades, pct: pctReceita }) => {
              const cfg = PMAP[p];
              const pRows = data.filter(d => d.platform === p).sort((a, b) => a.month.localeCompare(b.month));
              const lastM = pRows[pRows.length - 1];
              const prevM = pRows[pRows.length - 2];
              const mom = lastM && prevM && prevM.totalRevenue > 0
                ? ((lastM.totalRevenue - prevM.totalRevenue) / prevM.totalRevenue) * 100 : null;
              return (
                <Card key={p} className="rounded-2xl border-0 shadow-sm">
                  <CardContent className="px-5 py-4">
                    <div className="flex items-center justify-between mb-3">
                      <span className={cn("text-sm font-bold flex items-center gap-1.5", cfg.textClass)}>
                        <span>{cfg.emoji}</span>{cfg.label}
                      </span>
                      <div className="flex items-center gap-2">
                        {mom !== null && (
                          <span className={cn("text-xs font-semibold", mom >= 0 ? "text-green-500" : "text-red-500")}>
                            {mom >= 0 ? "▲" : "▼"}{Math.abs(mom).toFixed(1)}% último mês
                          </span>
                        )}
                        <Badge variant="outline" className="text-xs">{pctReceita.toFixed(0)}% receita</Badge>
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-3 mb-3">
                      <div>
                        <p className="text-xs text-muted-foreground mb-0.5">Receita</p>
                        <p className="font-bold text-sm">{fmtBRL(receita)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground mb-0.5">Pedidos</p>
                        <p className="font-bold text-sm">{fmtNum(pedidos)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground mb-0.5">Unidades</p>
                        <p className="font-bold text-sm">{fmtNum(unidades)}</p>
                      </div>
                    </div>
                    <div className="h-1.5 rounded-full bg-muted/40">
                      <div className="h-1.5 rounded-full transition-all"
                        style={{ width: `${Math.min(pctReceita, 100)}%`, background: cfg.color }} />
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* ── Receita Mensal ── */}
          <Card className="rounded-2xl border-0 shadow-sm">
            <CardHeader className="pb-1 pt-5 px-5">
              <CardTitle className="text-sm font-semibold">Receita Mensal por Plataforma</CardTitle>
            </CardHeader>
            <CardContent className="px-2 pb-4">
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={barData} margin={{ top: 20, right: 16, left: 8, bottom: 0 }} barCategoryGap="28%" barGap={3}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border/40" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false} width={60}
                    tickFormatter={v => v === 0 ? "R$0" : `R$${(v / 1000).toFixed(0)}k`} />
                  <Tooltip
                    contentStyle={{ background: "var(--background)", border: "1px solid var(--border)", borderRadius: 10, fontSize: 12 }}
                    formatter={(v: number, name: string) => [fmtBRL(v), PMAP[name.replace("_receita","") as EcommercePlatform]?.label ?? name]}
                    cursor={{ fill: "var(--muted)", opacity: 0.3 }}
                  />
                  <Legend iconType="square" iconSize={10}
                    formatter={v => PMAP[v.replace("_receita","") as EcommercePlatform]?.label ?? v} />
                  {selected.map(p => (
                    <Bar key={p} dataKey={`${p}_receita`} name={`${p}_receita`}
                      fill={PMAP[p].color} radius={[4,4,0,0]} maxBarSize={38} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* ── Pedidos Mensais ── */}
          <Card className="rounded-2xl border-0 shadow-sm">
            <CardHeader className="pb-1 pt-5 px-5">
              <CardTitle className="text-sm font-semibold">Pedidos Mensais por Plataforma</CardTitle>
            </CardHeader>
            <CardContent className="px-2 pb-4">
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={barData} margin={{ top: 20, right: 16, left: 8, bottom: 0 }} barCategoryGap="28%" barGap={3}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border/40" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false} width={38} />
                  <Tooltip
                    contentStyle={{ background: "var(--background)", border: "1px solid var(--border)", borderRadius: 10, fontSize: 12 }}
                    formatter={(v: number, name: string) => [fmtNum(v) + " pedidos", PMAP[name.replace("_pedidos","") as EcommercePlatform]?.label ?? name]}
                    cursor={{ fill: "var(--muted)", opacity: 0.3 }}
                  />
                  <Legend iconType="square" iconSize={10}
                    formatter={v => PMAP[v.replace("_pedidos","") as EcommercePlatform]?.label ?? v} />
                  {selected.map(p => (
                    <Bar key={p} dataKey={`${p}_pedidos`} name={`${p}_pedidos`}
                      fill={PMAP[p].color} radius={[4,4,0,0]} maxBarSize={38} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* ── Ticket Médio + Taxa Cancelamento ── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Card className="rounded-2xl border-0 shadow-sm">
              <CardHeader className="pb-1 pt-5 px-5">
                <CardTitle className="text-sm font-semibold">Ticket Médio por Mês</CardTitle>
              </CardHeader>
              <CardContent className="px-2 pb-4">
                <ResponsiveContainer width="100%" height={210}>
                  <LineChart data={barData} margin={{ top: 10, right: 16, left: 8, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border/40" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false} width={54}
                      tickFormatter={v => `R$${v.toFixed(0)}`} />
                    <Tooltip
                      contentStyle={{ background: "var(--background)", border: "1px solid var(--border)", borderRadius: 10, fontSize: 12 }}
                      formatter={(v: number, name: string) => [fmtBRL(v), PMAP[name.replace("_ticket","") as EcommercePlatform]?.label ?? name]}
                    />
                    <Legend iconType="circle" iconSize={8}
                      formatter={v => PMAP[v.replace("_ticket","") as EcommercePlatform]?.label ?? v} />
                    {selected.map(p => (
                      <Line key={p} type="monotone" dataKey={`${p}_ticket`} name={`${p}_ticket`}
                        stroke={PMAP[p].color} strokeWidth={2.5} dot={{ r: 3, fill: PMAP[p].color }} activeDot={{ r: 5 }} />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card className="rounded-2xl border-0 shadow-sm">
              <CardHeader className="pb-1 pt-5 px-5">
                <CardTitle className="text-sm font-semibold">Taxa de Cancelamento por Mês</CardTitle>
              </CardHeader>
              <CardContent className="px-2 pb-4">
                <ResponsiveContainer width="100%" height={210}>
                  <LineChart data={barData} margin={{ top: 10, right: 16, left: 8, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border/40" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false} width={36}
                      tickFormatter={v => `${v}%`} />
                    <Tooltip
                      contentStyle={{ background: "var(--background)", border: "1px solid var(--border)", borderRadius: 10, fontSize: 12 }}
                      formatter={(v: number, name: string) => [`${v.toFixed(1)}%`, PMAP[name.replace("_cancel","") as EcommercePlatform]?.label ?? name]}
                    />
                    <Legend iconType="circle" iconSize={8}
                      formatter={v => PMAP[v.replace("_cancel","") as EcommercePlatform]?.label ?? v} />
                    {selected.map(p => (
                      <Line key={p} type="monotone" dataKey={`${p}_cancel`} name={`${p}_cancel`}
                        stroke={PMAP[p].color} strokeWidth={2.5} dot={{ r: 3, fill: PMAP[p].color }} activeDot={{ r: 5 }} />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          {/* ── Tabela detalhada ── */}
          <Card className="rounded-2xl border-0 shadow-sm">
            <CardHeader className="pt-5 px-5 pb-3 flex flex-row items-center justify-between">
              <CardTitle className="text-sm font-semibold">Detalhamento por Mês e Plataforma</CardTitle>
              <p className="text-xs text-muted-foreground">{allMonths.length} meses · {selected.length} plataforma{selected.length > 1 ? "s" : ""}</p>
            </CardHeader>
            <CardContent className="p-0 pb-3">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-y border-border/50 bg-muted/30 text-muted-foreground text-xs">
                      <th className="text-left px-5 py-2.5 font-medium">Mês</th>
                      <th className="text-left px-4 py-2.5 font-medium">Plataforma</th>
                      <th className="text-right px-4 py-2.5 font-medium">Pedidos</th>
                      <th className="text-right px-4 py-2.5 font-medium">Unidades</th>
                      <th className="text-right px-4 py-2.5 font-medium">Receita</th>
                      <th className="text-right px-4 py-2.5 font-medium">Ticket Médio</th>
                      <th className="text-right px-4 py-2.5 font-medium">Cancel.</th>
                      <th className="text-right px-5 py-2.5 font-medium">MoM</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/30">
                    {selected.flatMap(p => {
                      const pRows = data.filter(d => d.platform === p).sort((a, b) => a.month.localeCompare(b.month));
                      const maxRev = Math.max(...pRows.map(r => r.totalRevenue), 0);
                      return pRows.map((r, i) => {
                        const prev = pRows[i - 1];
                        const mom  = prev && prev.totalRevenue > 0
                          ? ((r.totalRevenue - prev.totalRevenue) / prev.totalRevenue) * 100 : null;
                        const cfg    = PMAP[r.platform];
                        const isTop  = pRows.length > 1 && r.totalRevenue === maxRev;
                        return (
                          <tr key={`${r.platform}-${r.month}`}
                            className={cn("hover:bg-muted/20 transition-colors", isTop && "bg-green-500/5")}>
                            <td className="px-5 py-2.5 font-semibold">{r.label}</td>
                            <td className="px-4 py-2.5">
                              <span className={cn("text-xs font-semibold", cfg.textClass)}>{cfg.emoji} {cfg.label}</span>
                            </td>
                            <td className="px-4 py-2.5 text-right">{fmtNum(r.totalOrders)}</td>
                            <td className="px-4 py-2.5 text-right">{fmtNum(r.totalUnitsSold)}</td>
                            <td className={cn("px-4 py-2.5 text-right font-semibold", isTop && "text-green-600")}>
                              {fmtBRL(r.totalRevenue)}
                              {isTop && <span className="ml-1 text-xs">🏆</span>}
                            </td>
                            <td className="px-4 py-2.5 text-right">{fmtBRL(r.avgTicket)}</td>
                            <td className="px-4 py-2.5 text-right text-destructive">{r.cancellationRate.toFixed(1)}%</td>
                            <td className="px-5 py-2.5 text-right">
                              {mom !== null ? (
                                <span className={cn("text-xs font-semibold", mom >= 0 ? "text-green-500" : "text-red-500")}>
                                  {mom >= 0 ? "▲" : "▼"}{Math.abs(mom).toFixed(1)}%
                                </span>
                              ) : <span className="text-xs text-muted-foreground">—</span>}
                            </td>
                          </tr>
                        );
                      });
                    })}
                  </tbody>
                  {/* Footer totals */}
                  <tfoot>
                    <tr className="border-t-2 border-border bg-muted/20 font-semibold text-xs">
                      <td className="px-5 py-3" colSpan={2}>Total</td>
                      <td className="px-4 py-3 text-right">{fmtNum(totalPedidos)}</td>
                      <td className="px-4 py-3 text-right">{fmtNum(totalUnidades)}</td>
                      <td className="px-4 py-3 text-right">{fmtBRL(totalReceita)}</td>
                      <td className="px-4 py-3 text-right">{fmtBRL(avgTicketGeral)}</td>
                      <td className="px-4 py-3 text-right text-destructive">{cancelRateGeral.toFixed(1)}%</td>
                      <td className="px-5 py-3" />
                    </tr>
                  </tfoot>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* ── Pior mês highlight ── */}
          {worstMonth && bestMonth && worstMonth.month !== bestMonth.month && (
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-green-500/20 bg-green-500/5 p-4 flex items-start gap-3">
                <Trophy className="h-5 w-5 text-green-600 shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Melhor mês do período</p>
                  <p className="text-base font-bold text-green-600">{bestMonth.label}</p>
                  <p className="text-xs text-muted-foreground">{fmtBRL(bestMonth.totalRevenue)} · {fmtNum(bestMonth.totalOrders)} pedidos</p>
                </div>
              </div>
              <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4 flex items-start gap-3">
                <TrendingUp className="h-5 w-5 text-red-500 shrink-0 mt-0.5 rotate-180" />
                <div>
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Mês de menor receita</p>
                  <p className="text-base font-bold text-red-500">{worstMonth.label}</p>
                  <p className="text-xs text-muted-foreground">{fmtBRL(worstMonth.totalRevenue)} · {fmtNum(worstMonth.totalOrders)} pedidos</p>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main page
// ─────────────────────────────────────────────────────────────────────────────

type ActiveView = EcommercePlatform | "comparativo" | "historico";

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
          {active !== "historico" && (
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
          )}
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
          <button
            onClick={() => handleSetActive("historico")}
            className={cn(
              "flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold border-2 transition-all",
              active === "historico"
                ? "bg-indigo-500/10 border-indigo-500/50 text-indigo-600 dark:text-indigo-300 shadow-sm scale-[1.02]"
                : "border-border text-muted-foreground hover:bg-muted/40 hover:border-muted-foreground/40"
            )}
          >
            <Calendar className="h-4 w-4" />
            Histórico Mensal
          </button>
        </div>

        {/* Content */}
        {active === "historico" ? (
          <HistoricoMensalView />
        ) : active === "comparativo" ? (
          <ComparativoView period={period} />
        ) : (
          <PlatformView platform={active} period={period} />
        )}
      </div>
    </BoardLayout>
  );
}

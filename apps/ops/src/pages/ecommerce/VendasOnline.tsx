import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AreaChart, Area, BarChart, Bar, Cell, PieChart, Pie,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import {
  ShoppingCart, Package, TrendingUp, XCircle, Clock, CheckCircle2, Boxes,
  AlertCircle, BarChart3, Calendar, Percent, Wallet, Receipt, Trophy, Hourglass,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ⚠️ PORT VISUAL FIEL ao Controle (/dashboards/ecommerce/vendas-online → DashEcommerceVendas) — dados MOCK.
// Finanças internas (Vindi, reconciliação, editor de comissão) entram na fase de lógica.

type Platform = "mercadolivre" | "amazon" | "nuvemshop" | "tiktok" | "shopee";
type Period = "today" | "7d" | "30d" | "month";

interface PlatformConfig {
  id: Platform; label: string; color: string;
  textClass: string; bgClass: string; borderClass: string; emoji: string; disabled?: boolean;
}
const PLATFORMS: PlatformConfig[] = [
  { id: "mercadolivre", label: "Mercado Livre", color: "#FFD700", textClass: "text-yellow-600 dark:text-yellow-300", bgClass: "bg-yellow-500/10", borderClass: "border-yellow-500/50", emoji: "🛒" },
  { id: "amazon", label: "Amazon", color: "#FF9900", textClass: "text-orange-600 dark:text-orange-300", bgClass: "bg-orange-500/10", borderClass: "border-orange-500/50", emoji: "📦" },
  { id: "nuvemshop", label: "Nuvemshop", color: "#2D7FF9", textClass: "text-blue-600 dark:text-blue-300", bgClass: "bg-blue-500/10", borderClass: "border-blue-500/50", emoji: "🏪" },
  { id: "tiktok", label: "TikTok Shop", color: "#FF0050", textClass: "text-pink-600 dark:text-pink-300", bgClass: "bg-pink-500/10", borderClass: "border-pink-500/50", emoji: "🎵", disabled: true },
  { id: "shopee", label: "Shopee", color: "#EE4D2D", textClass: "text-red-600 dark:text-red-300", bgClass: "bg-red-500/10", borderClass: "border-red-500/50", emoji: "🧡", disabled: true },
];
const ACTIVE_PLATFORMS = PLATFORMS.filter((p) => !p.disabled);
const PMAP = Object.fromEntries(PLATFORMS.map((p) => [p.id, p])) as Record<Platform, PlatformConfig>;

const fmtBRL = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const fmtNum = (v: number) => v.toLocaleString("pt-BR");
const pct = (a: number, b: number) => (b > 0 ? ((a / b) * 100).toFixed(1) + "%" : "0%");

const PERIOD_OPTIONS: { value: Period; label: string }[] = [
  { value: "today", label: "Hoje" }, { value: "7d", label: "Últimos 7 dias" },
  { value: "30d", label: "Últimos 30 dias" }, { value: "month", label: "Este mês" },
];

interface ProductRow { id: string; name: string; sku: string; orders: number; units_per_pack: number; units_sold: number; revenue: number; }
interface Metrics {
  isConnected: boolean; totalOrders: number; totalRevenue: number; netRevenue: number; commissionTotal: number;
  totalUnitsSold: number; avgTicket: number; shippedOrders: number; deliveredOrders: number;
  cancelledOrders: number; cancellationRate: number; pendingOrders: number; paidOrders: number;
  topProduct: { name: string; sku: string; revenue: number; orders: number; units_sold: number } | null;
  dailySales: { label: string; orders: number; units: number }[];
  products: ProductRow[];
}
const DAILY = (base: number) => ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"].map((label, i) => ({ label, orders: base + ((i * 7) % 13), units: (base + ((i * 7) % 13)) * 3 }));

const MOCK_METRICS: Record<Platform, Metrics> = {
  mercadolivre: {
    isConnected: true, totalOrders: 420, totalRevenue: 86400, netRevenue: 78200, commissionTotal: 8200,
    totalUnitsSold: 1260, avgTicket: 206, shippedOrders: 38, deliveredOrders: 360, cancelledOrders: 22,
    cancellationRate: 5.2, pendingOrders: 12, paidOrders: 28,
    topProduct: { name: "CarboZé 100ml", sku: "SKU-ZE-100", revenue: 41200, orders: 210, units_sold: 630 },
    dailySales: DAILY(48),
    products: [
      { id: "1", name: "CarboZé 100ml", sku: "SKU-ZE-100", orders: 210, units_per_pack: 3, units_sold: 630, revenue: 41200 },
      { id: "2", name: "CarboPRO", sku: "SKU-PRO", orders: 120, units_per_pack: 1, units_sold: 120, revenue: 28600 },
      { id: "3", name: "CarboZé Sachê", sku: "SKU-ZE-SCH", orders: 90, units_per_pack: 10, units_sold: 900, revenue: 16600 },
    ],
  },
  amazon: {
    isConnected: true, totalOrders: 260, totalRevenue: 61200, netRevenue: 54800, commissionTotal: 6400,
    totalUnitsSold: 740, avgTicket: 235, shippedOrders: 26, deliveredOrders: 215, cancelledOrders: 11,
    cancellationRate: 4.2, pendingOrders: 5, paidOrders: 14,
    topProduct: { name: "CarboZé 1L", sku: "SKU-ZE-1L", revenue: 33000, orders: 130, units_sold: 130 },
    dailySales: DAILY(31),
    products: [
      { id: "1", name: "CarboZé 1L", sku: "SKU-ZE-1L", orders: 130, units_per_pack: 1, units_sold: 130, revenue: 33000 },
      { id: "2", name: "CarboPRO", sku: "SKU-PRO", orders: 80, units_per_pack: 1, units_sold: 80, revenue: 19200 },
      { id: "3", name: "CarboZé 100ml", sku: "SKU-ZE-100", orders: 50, units_per_pack: 3, units_sold: 150, revenue: 9000 },
    ],
  },
  nuvemshop: {
    isConnected: true, totalOrders: 180, totalRevenue: 39800, netRevenue: 36900, commissionTotal: 2900,
    totalUnitsSold: 520, avgTicket: 221, shippedOrders: 18, deliveredOrders: 150, cancelledOrders: 6,
    cancellationRate: 3.3, pendingOrders: 4, paidOrders: 8,
    topProduct: { name: "CarboPRO", sku: "SKU-PRO", revenue: 19800, orders: 82, units_sold: 82 },
    dailySales: DAILY(21),
    products: [
      { id: "1", name: "CarboPRO", sku: "SKU-PRO", orders: 82, units_per_pack: 1, units_sold: 82, revenue: 19800 },
      { id: "2", name: "CarboZé 100ml", sku: "SKU-ZE-100", orders: 60, units_per_pack: 3, units_sold: 180, revenue: 13200 },
      { id: "3", name: "CarboVapt", sku: "SKU-VAPT", orders: 38, units_per_pack: 1, units_sold: 38, revenue: 6800 },
    ],
  },
  tiktok: { isConnected: false, totalOrders: 0, totalRevenue: 0, netRevenue: 0, commissionTotal: 0, totalUnitsSold: 0, avgTicket: 0, shippedOrders: 0, deliveredOrders: 0, cancelledOrders: 0, cancellationRate: 0, pendingOrders: 0, paidOrders: 0, topProduct: null, dailySales: [], products: [] },
  shopee: { isConnected: false, totalOrders: 0, totalRevenue: 0, netRevenue: 0, commissionTotal: 0, totalUnitsSold: 0, avgTicket: 0, shippedOrders: 0, deliveredOrders: 0, cancelledOrders: 0, cancellationRate: 0, pendingOrders: 0, paidOrders: 0, topProduct: null, dailySales: [], products: [] },
};

function MetricCard({ label, value, sub, icon, accent }: { label: string; value: string; sub?: string; icon: React.ReactNode; accent: string }) {
  return (
    <div className="rounded-xl border bg-card p-4 flex flex-col gap-1.5 transition-all hover:-translate-y-0.5 hover:shadow-md">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        <span className="p-1.5 rounded-lg" style={{ background: accent + "20", color: accent }}>{icon}</span>
      </div>
      <span className="text-xl font-bold tabular-nums leading-tight">{value}</span>
      {sub && <span className="text-[11px] text-muted-foreground leading-snug">{sub}</span>}
    </div>
  );
}

function PlatformView({ platform }: { platform: Platform }) {
  const cfg = PMAP[platform];
  const m = MOCK_METRICS[platform];
  return (
    <div className="space-y-5">
      <div className={cn("rounded-2xl border p-4 flex items-center justify-between", cfg.bgClass, cfg.borderClass)}>
        <div className="flex items-center gap-3">
          <span className="text-3xl">{cfg.emoji}</span>
          <div>
            <p className={cn("text-lg font-bold", cfg.textClass)}>{cfg.label}</p>
            <p className="text-xs text-muted-foreground">Dados de vendas externos — período selecionado</p>
          </div>
        </div>
        {m.isConnected ? (
          <Badge className="bg-green-500/10 text-green-600 border-green-500/30 gap-1.5 text-xs">
            <span className="h-1.5 w-1.5 rounded-full bg-green-500 inline-block animate-pulse" /> Conectado
          </Badge>
        ) : (
          <Badge variant="outline" className={cn("gap-1.5 text-xs", cfg.bgClass, cfg.textClass, cfg.borderClass)}><AlertCircle className="h-3 w-3" /> Aguardando integração</Badge>
        )}
      </div>

      {!m.isConnected && (
        <div className="rounded-xl border border-dashed border-muted-foreground/30 bg-muted/20 p-6 flex flex-col items-center gap-2 text-center">
          <AlertCircle className="h-8 w-8 text-muted-foreground/50" />
          <p className="text-sm font-medium text-muted-foreground">Aguardando sincronização</p>
          <p className="text-xs text-muted-foreground/70 max-w-md">A integração será estabelecida automaticamente. Os dados aparecerão assim que a próxima sincronização ocorrer.</p>
        </div>
      )}

      {m.isConnected && (<>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <MetricCard label="Pedidos" value={fmtNum(m.totalOrders)} icon={<ShoppingCart className="h-4 w-4" />} accent={cfg.color} />
          <MetricCard label="Receita Total" value={fmtBRL(m.totalRevenue)} icon={<TrendingUp className="h-4 w-4" />} accent={cfg.color} />
          <MetricCard label="Receita Líquida" value={fmtBRL(m.netRevenue)} sub="excluindo cancelados" icon={<Wallet className="h-4 w-4" />} accent="#22c55e" />
          <MetricCard label="Comissões" value={fmtBRL(m.commissionTotal)} sub={`${pct(m.commissionTotal, m.netRevenue)} da líquida`} icon={<Percent className="h-4 w-4" />} accent="#f43f5e" />
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <MetricCard label="Unidades Reais Vendidas" value={fmtNum(m.totalUnitsSold)} sub="considera multiplicador de pack" icon={<Boxes className="h-4 w-4" />} accent={cfg.color} />
          <MetricCard label="Ticket Médio" value={fmtBRL(m.avgTicket)} icon={<Package className="h-4 w-4" />} accent={cfg.color} />
          <MetricCard label="Em Transporte" value={fmtNum(m.shippedOrders)} icon={<Clock className="h-4 w-4" />} accent="#f59e0b" />
          <MetricCard label="Entregues" value={fmtNum(m.deliveredOrders)} icon={<CheckCircle2 className="h-4 w-4" />} accent="#22c55e" />
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <MetricCard label="Cancelamentos" value={fmtNum(m.cancelledOrders)} sub={`${pct(m.cancelledOrders, m.totalOrders)} dos pedidos`} icon={<XCircle className="h-4 w-4" />} accent="#f59e0b" />
          <MetricCard label="Taxa de Cancelamento" value={`${m.cancellationRate.toFixed(1)}%`} sub={`${fmtNum(m.cancelledOrders)} de ${fmtNum(m.totalOrders)} pedidos`} icon={<Percent className="h-4 w-4" />} accent="#f43f5e" />
          <MetricCard label="Pedidos Pendentes" value={fmtNum(m.pendingOrders)} sub="aguardando pagamento" icon={<Hourglass className="h-4 w-4" />} accent="#a78bfa" />
          <MetricCard label="A enviar" value={fmtNum(m.paidOrders)} sub="pago, aguardando despacho" icon={<Package className="h-4 w-4" />} accent="#38bdf8" />
        </div>

        {m.topProduct && (
          <div className="rounded-2xl border p-4 flex items-center gap-4" style={{ borderLeftColor: cfg.color, borderLeftWidth: 3 }}>
            <div className="p-2.5 rounded-xl" style={{ background: cfg.color + "20" }}><Trophy className="h-5 w-5" style={{ color: cfg.color }} /></div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-0.5">Produto mais vendido</p>
              <p className="font-bold truncate">{m.topProduct.name}</p>
              <p className="text-xs text-muted-foreground font-mono">{m.topProduct.sku}</p>
            </div>
            <div className="text-right shrink-0">
              <p className="text-lg font-bold">{fmtBRL(m.topProduct.revenue)}</p>
              <p className="text-xs text-muted-foreground">{fmtNum(m.topProduct.orders)} pedidos · {fmtNum(m.topProduct.units_sold)} un.</p>
            </div>
          </div>
        )}

        <Card className="rounded-2xl border-0 shadow-sm bg-card">
          <CardHeader className="pb-1 pt-5 px-5"><CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Evolução de Vendas</CardTitle></CardHeader>
          <CardContent className="px-2 pb-4">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={m.dailySales} margin={{ top: 4, right: 12, left: -10, bottom: 0 }} barCategoryGap="25%" barGap={2}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 10, fontSize: 12 }} formatter={(v: number, n: string) => [fmtNum(v), n === "orders" ? "Pedidos" : "Unidades reais"]} cursor={{ fill: "hsl(var(--muted))", opacity: 0.3 }} />
                <Legend iconType="square" iconSize={10} formatter={(v) => (v === "orders" ? "Pedidos" : "Unidades reais")} />
                <Bar dataKey="orders" name="orders" fill={cfg.color} radius={[4, 4, 0, 0]} maxBarSize={28} />
                <Bar dataKey="units" name="units" fill="#818cf8" radius={[4, 4, 0, 0]} maxBarSize={28} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-0 shadow-sm">
          <CardHeader className="pt-5 px-5 pb-3"><CardTitle className="text-sm font-semibold flex items-center gap-2"><Boxes className="h-4 w-4" style={{ color: cfg.color }} /> Produtos Vendidos</CardTitle></CardHeader>
          <CardContent className="p-0 pb-2">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-y border-border/50 text-muted-foreground text-xs bg-muted/30">
                    <th className="text-left px-5 py-2 font-medium">Produto</th>
                    <th className="text-left px-4 py-2 font-medium">SKU</th>
                    <th className="text-right px-4 py-2 font-medium">Qtd. packs</th>
                    <th className="text-center px-4 py-2 font-medium">Un./pack</th>
                    <th className="text-right px-4 py-2 font-medium">Unidades reais</th>
                    <th className="text-right px-5 py-2 font-medium">Receita</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/30">
                  {m.products.map((p) => (
                    <tr key={p.id} className="hover:bg-muted/20 transition-colors">
                      <td className="px-5 py-3 font-medium">{p.name}</td>
                      <td className="px-4 py-3 text-muted-foreground font-mono text-xs">{p.sku}</td>
                      <td className="px-4 py-3 text-right">{fmtNum(p.orders)}</td>
                      <td className="px-4 py-3 text-center"><Badge variant="outline" className="text-xs font-mono px-2">×{p.units_per_pack}</Badge></td>
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
      </>)}
    </div>
  );
}

function ComparativoView() {
  const [selected, setSelected] = useState<Platform[]>(["mercadolivre", "amazon", "nuvemshop"]);
  const toggle = (id: Platform) => setSelected((prev) => prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]);
  const data = selected.map((p) => ({ platform: p, ...MOCK_METRICS[p] }));

  const totalRevenue = data.reduce((s, c) => s + c.totalRevenue, 0);
  const totalOrders = data.reduce((s, c) => s + c.totalOrders, 0);
  const totalUnits = data.reduce((s, c) => s + c.totalUnitsSold, 0);
  const totalCancel = data.reduce((s, c) => s + c.cancelledOrders, 0);
  const overallTicket = totalOrders > 0 ? totalRevenue / totalOrders : 0;
  const leaderRevenue = [...data].sort((a, b) => b.totalRevenue - a.totalRevenue)[0];
  const leaderTicket = [...data].sort((a, b) => b.avgTicket - a.avgTicket)[0];
  const leaderLowCancel = [...data].filter((c) => c.totalOrders > 0).sort((a, b) => a.cancellationRate - b.cancellationRate)[0];
  const pieData = data.map((c) => ({ name: PMAP[c.platform].label, value: c.totalRevenue, color: PMAP[c.platform].color }));
  const evo = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"].map((label, i) => {
    const row: Record<string, number | string> = { label };
    selected.forEach((p) => { row[p] = Math.round(MOCK_METRICS[p].totalRevenue / 7 * (0.7 + (i % 4) * 0.15)); });
    return row;
  });

  return (
    <div className="space-y-5">
      <Card className="rounded-2xl border-0 shadow-sm">
        <CardHeader className="pb-2 pt-5 px-5"><CardTitle className="text-sm font-semibold">Selecionar plataformas (2 a 3)</CardTitle></CardHeader>
        <CardContent className="px-5 pb-5">
          <div className="flex flex-wrap gap-2">
            {ACTIVE_PLATFORMS.map((p) => {
              const on = selected.includes(p.id);
              return (
                <button key={p.id} onClick={() => toggle(p.id)} className={cn("flex items-center gap-2 px-4 py-2.5 rounded-xl border-2 text-sm font-semibold transition-all", on ? cn(p.bgClass, p.borderClass, p.textClass, "shadow-sm") : "border-border text-muted-foreground hover:border-muted-foreground/40 hover:bg-muted/30")}>
                  <span>{p.emoji}</span><span>{p.label}</span>{on && <CheckCircle2 className="h-3.5 w-3.5 ml-0.5" />}
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <MetricCard label="Receita total" value={fmtBRL(totalRevenue)} sub={`${fmtNum(totalOrders)} pedidos · ${fmtNum(totalUnits)} un · ticket ${fmtBRL(overallTicket)}`} icon={<Wallet className="h-4 w-4" />} accent="#22c55e" />
        <MetricCard label="Líder em receita" value={leaderRevenue ? `${PMAP[leaderRevenue.platform].emoji} ${PMAP[leaderRevenue.platform].label}` : "—"} sub={leaderRevenue ? `${fmtBRL(leaderRevenue.totalRevenue)} · ${pct(leaderRevenue.totalRevenue, totalRevenue)} do total` : undefined} icon={<Trophy className="h-4 w-4" />} accent={leaderRevenue ? PMAP[leaderRevenue.platform].color : "#94a3b8"} />
        <MetricCard label="Maior ticket médio" value={leaderTicket ? `${PMAP[leaderTicket.platform].emoji} ${PMAP[leaderTicket.platform].label}` : "—"} sub={leaderTicket ? `${fmtBRL(leaderTicket.avgTicket)} por pedido` : undefined} icon={<Receipt className="h-4 w-4" />} accent={leaderTicket ? PMAP[leaderTicket.platform].color : "#94a3b8"} />
        <MetricCard label="Menor cancelamento" value={leaderLowCancel ? `${PMAP[leaderLowCancel.platform].emoji} ${PMAP[leaderLowCancel.platform].label}` : "—"} sub={leaderLowCancel ? `${pct(leaderLowCancel.cancelledOrders, leaderLowCancel.totalOrders)} dos pedidos` : undefined} icon={<CheckCircle2 className="h-4 w-4" />} accent="#22c55e" />
      </div>

      <Card className="rounded-2xl border-0 shadow-sm">
        <CardHeader className="pb-2 pt-5 px-5"><CardTitle className="text-sm font-semibold">Resumo Comparativo</CardTitle></CardHeader>
        <CardContent className="p-0 pb-2">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-y border-border/50 bg-muted/30 text-muted-foreground text-xs">
                  <th className="text-left px-5 py-2.5 font-medium">Plataforma</th>
                  <th className="text-right px-4 py-2.5 font-medium">Pedidos</th>
                  <th className="text-right px-4 py-2.5 font-medium">Unidades</th>
                  <th className="text-left px-4 py-2.5 font-medium">Receita · participação</th>
                  <th className="text-right px-4 py-2.5 font-medium">Ticket médio</th>
                  <th className="text-right px-5 py-2.5 font-medium">Cancel.</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/30">
                {[...data].sort((a, b) => b.totalRevenue - a.totalRevenue).map((c) => {
                  const cfg = PMAP[c.platform];
                  const share = totalRevenue > 0 ? (c.totalRevenue / totalRevenue) * 100 : 0;
                  const isLeader = leaderRevenue?.platform === c.platform && c.totalRevenue > 0;
                  return (
                    <tr key={c.platform} className={cn("hover:bg-muted/20", isLeader && "bg-muted/10")}>
                      <td className="px-5 py-3"><span className="inline-flex items-center gap-1.5"><span className={cn("font-semibold", cfg.textClass)}>{cfg.emoji} {cfg.label}</span>{isLeader && <Trophy className="h-3.5 w-3.5 text-amber-500" />}</span></td>
                      <td className="px-4 py-3 text-right tabular-nums">{fmtNum(c.totalOrders)}</td>
                      <td className="px-4 py-3 text-right tabular-nums font-semibold">{fmtNum(c.totalUnitsSold)}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="tabular-nums w-20 shrink-0">{fmtBRL(c.totalRevenue)}</span>
                          <div className="flex-1 min-w-[60px] h-1.5 rounded-full bg-muted overflow-hidden"><div className="h-full rounded-full" style={{ width: `${share}%`, background: cfg.color }} /></div>
                          <span className="text-xs text-muted-foreground tabular-nums w-10 text-right">{share.toFixed(0)}%</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">{fmtBRL(c.avgTicket)}</td>
                      <td className="px-5 py-3 text-right tabular-nums"><span className={cn(c.cancelledOrders > 0 ? "text-destructive" : "text-muted-foreground")}>{fmtNum(c.cancelledOrders)}<span className="text-xs text-muted-foreground ml-1">({pct(c.cancelledOrders, c.totalOrders)})</span></span></td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-border/60 bg-muted/20 font-semibold">
                  <td className="px-5 py-3">Total</td>
                  <td className="px-4 py-3 text-right tabular-nums">{fmtNum(totalOrders)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{fmtNum(totalUnits)}</td>
                  <td className="px-4 py-3 tabular-nums">{fmtBRL(totalRevenue)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{fmtBRL(overallTicket)}</td>
                  <td className="px-5 py-3 text-right tabular-nums">{fmtNum(totalCancel)}<span className="text-xs text-muted-foreground ml-1">({pct(totalCancel, totalOrders)})</span></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Card className="rounded-2xl border-0 shadow-sm">
          <CardHeader className="pb-1 pt-5 px-5"><CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Mix de Receita</CardTitle></CardHeader>
          <CardContent className="px-4 pb-5">
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={58} outerRadius={88} paddingAngle={2} stroke="hsl(var(--card))" strokeWidth={2}>
                  {pieData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                </Pie>
                <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 10, fontSize: 12 }} formatter={(v: number, n: string) => [`${fmtBRL(v)} · ${pct(v, totalRevenue)}`, n]} />
                <Legend iconType="circle" iconSize={9} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-0 shadow-sm">
          <CardHeader className="pb-1 pt-5 px-5"><CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Evolução de Receita</CardTitle></CardHeader>
          <CardContent className="px-2 pb-4">
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={evo} margin={{ top: 8, right: 16, left: 8, bottom: 0 }}>
                <defs>
                  {selected.map((p) => (
                    <linearGradient key={p} id={`grad-${p}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={PMAP[p].color} stopOpacity={0.35} />
                      <stop offset="100%" stopColor={PMAP[p].color} stopOpacity={0.02} />
                    </linearGradient>
                  ))}
                </defs>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border/40" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false} width={44} tickFormatter={(v) => (v === 0 ? "0" : `${(v / 1000).toFixed(0)}k`)} />
                <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 10, fontSize: 12 }} formatter={(v: number, name: string) => [fmtBRL(v), PMAP[name as Platform]?.label ?? name]} />
                <Legend iconType="circle" iconSize={9} formatter={(v) => PMAP[v as Platform]?.label ?? v} />
                {selected.map((p) => <Area key={p} type="monotone" dataKey={p} name={p} stroke={PMAP[p].color} strokeWidth={2} fill={`url(#grad-${p})`} dot={false} activeDot={{ r: 4 }} />)}
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

const MESES = ["jan/26", "fev/26", "mar/26", "abr/26", "mai/26", "jun/26"];
function HistoricoMensalView() {
  const data = MESES.map((mes, i) => ({ mes, mercadolivre: 60000 + i * 4500, amazon: 42000 + i * 3200, nuvemshop: 28000 + i * 2100 }));
  const last = data[data.length - 1];
  const totalReceita = data.reduce((s, d) => s + d.mercadolivre + d.amazon + d.nuvemshop, 0);
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <MetricCard label="Receita Total (6 meses)" value={fmtBRL(totalReceita)} icon={<Wallet className="h-4 w-4" />} accent="#22c55e" />
        <MetricCard label="Melhor mês" value="jun/26" sub={fmtBRL(last.mercadolivre + last.amazon + last.nuvemshop)} icon={<TrendingUp className="h-4 w-4" />} accent="#3b82f6" />
        <MetricCard label="Plataformas ativas" value="3" sub="ML · Amazon · Nuvemshop" icon={<BarChart3 className="h-4 w-4" />} accent="#a78bfa" />
      </div>
      <Card className="rounded-2xl border-0 shadow-sm">
        <CardHeader className="pb-1 pt-5 px-5"><CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Receita Mensal por Plataforma</CardTitle></CardHeader>
        <CardContent className="px-2 pb-4">
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border/40" vertical={false} />
              <XAxis dataKey="mes" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false} width={44} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
              <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 10, fontSize: 12 }} formatter={(v: number, n: string) => [fmtBRL(v), PMAP[n as Platform]?.label ?? n]} cursor={{ fill: "hsl(var(--muted))", opacity: 0.3 }} />
              <Legend iconType="square" iconSize={10} formatter={(v) => PMAP[v as Platform]?.label ?? v} />
              <Bar dataKey="mercadolivre" stackId="a" fill={PMAP.mercadolivre.color} maxBarSize={44} />
              <Bar dataKey="amazon" stackId="a" fill={PMAP.amazon.color} maxBarSize={44} />
              <Bar dataKey="nuvemshop" stackId="a" fill={PMAP.nuvemshop.color} radius={[4, 4, 0, 0]} maxBarSize={44} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}

type ActiveView = Platform | "comparativo" | "historico";

export default function Ecommerce() {
  const [period, setPeriod] = useState<Period>("7d");
  const [active, setActive] = useState<ActiveView>("mercadolivre");

  return (
    <div className="p-4 md:p-6">
      <div className="space-y-5 max-w-[1500px] mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2"><ShoppingCart className="h-6 w-6 text-primary" /> Vendas Online</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Acompanhamento de pedidos, receita e unidades por plataforma de e-commerce</p>
          </div>
          {active !== "historico" && (
            <Select value={period} onValueChange={(v) => setPeriod(v as Period)}>
              <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
              <SelectContent>{PERIOD_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
            </Select>
          )}
        </div>

        {/* Seletor de plataformas */}
        <div className="flex flex-wrap gap-2">
          {PLATFORMS.map((p) => {
            const on = active === p.id;
            if (p.disabled) {
              return (
                <span key={p.id} title="Em breve — integração ainda não disponível" className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold border-2 border-border/50 text-muted-foreground/40 cursor-not-allowed select-none">
                  <span className="text-base grayscale opacity-50">{p.emoji}</span>{p.label}<span className="text-[10px] font-normal">(em breve)</span>
                </span>
              );
            }
            return (
              <button key={p.id} onClick={() => setActive(p.id)} className={cn("flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold border-2 transition-all", on ? cn(p.bgClass, p.borderClass, p.textClass, "shadow-sm scale-[1.02]") : "border-border text-muted-foreground hover:bg-muted/40 hover:border-muted-foreground/40")}>
                <span className="text-base">{p.emoji}</span>{p.label}
              </button>
            );
          })}
          <button onClick={() => setActive("comparativo")} className={cn("flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold border-2 transition-all", active === "comparativo" ? "bg-violet-500/10 border-violet-500/50 text-violet-600 dark:text-violet-300 shadow-sm scale-[1.02]" : "border-border text-muted-foreground hover:bg-muted/40 hover:border-muted-foreground/40")}>
            <BarChart3 className="h-4 w-4" /> Comparativo
          </button>
          <button onClick={() => setActive("historico")} className={cn("flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold border-2 transition-all", active === "historico" ? "bg-indigo-500/10 border-indigo-500/50 text-indigo-600 dark:text-indigo-300 shadow-sm scale-[1.02]" : "border-border text-muted-foreground hover:bg-muted/40 hover:border-muted-foreground/40")}>
            <Calendar className="h-4 w-4" /> Histórico Mensal
          </button>
        </div>

        {/* Conteúdo */}
        {active === "historico" ? <HistoricoMensalView /> : active === "comparativo" ? <ComparativoView /> : <PlatformView platform={active as Platform} />}

        <p className="text-xs text-muted-foreground text-center">
          Tela em port visual — dados de exemplo. Integrações reais (ML, Amazon, Nuvemshop) e finanças entram na fase de lógica.
        </p>
      </div>
    </div>
  );
}

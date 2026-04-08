import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Package, TrendingDown, RefreshCw, AlertTriangle, ShoppingCart,
  Link as LinkIcon, Plus, TrendingUp, DollarSign, Users, BarChart2,
  Store, Medal, Trophy,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { usePDVStatus, usePDVData, useRequestReplenishment } from "@/hooks/usePDV";
import { useAuth } from "@/contexts/AuthContext";
import { LinkPDVDialog } from "@/components/pdv/LinkPDVDialog";
import { CarboSkeleton } from "@/components/ui/CarboSkeleton";
import { usePDVProductStock } from "@/hooks/usePDVProducts";
import { useAdminAllProductStock } from "@/hooks/usePDVProducts";
import { usePDVSales, usePDVSalesStats, usePDVNetworkRanking } from "@/hooks/usePDVSales";
import { useMyPDVSeller } from "@/hooks/usePDVSellers";
import { useAdminAllSellerRanking } from "@/hooks/usePDVSellers";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

const fmt = (n: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);

type Period = "day" | "week" | "month" | "all";
const PERIOD_LABELS: Record<Period, string> = { day: "Hoje", week: "Semana", month: "Mês", all: "Tudo" };
const MEDAL_COLORS = ["text-yellow-500", "text-slate-400", "text-amber-600"];
const MEDAL_BG    = ["bg-yellow-500/10", "bg-slate-400/10", "bg-amber-600/10"];

// ── StockBar (manager view) ──────────────────────────────────────────────────
function StockBar({ label, current, min, max, color }: {
  label: string; current: number; min: number; max: number; color: string;
}) {
  const pct = max > 0 ? Math.min((current / max) * 100, 100) : 0;
  const alert = current <= min;
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between text-sm">
        <span className="font-medium">{label}</span>
        <span className={cn("font-mono font-semibold", alert ? "text-destructive" : "text-foreground")}>
          {current.toFixed(0)} un
          {alert && <span className="ml-1 text-[10px] font-bold">⚠ MIN</span>}
        </span>
      </div>
      <div className="h-2 rounded-full bg-muted overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-all", alert ? "bg-destructive" : color)}
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="text-[10px] text-muted-foreground">Mín: {min} un</p>
    </div>
  );
}

// ── ADMIN VIEW ───────────────────────────────────────────────────────────────
function PDVDashboardAdmin() {
  const navigate = useNavigate();
  const [period, setPeriod] = useState<Period>("month");
  const { data: ranking = [], isLoading: rankingLoading } = usePDVNetworkRanking(period);
  const { data: sellerRanking = [], isLoading: sellerLoading } = useAdminAllSellerRanking(period);
  const { data: allStock = [], isLoading: stockLoading } = useAdminAllProductStock();

  const totalRevenue = ranking.reduce((acc, r) => acc + r.revenue, 0);
  const totalSales   = ranking.reduce((acc, r) => acc + r.qty, 0);
  const activePdvs   = ranking.length;
  const avgTicket    = totalSales > 0 ? totalRevenue / totalSales : 0;

  // Per-product data for charts
  const productIds = Array.from(new Set(allStock.map(r => r.product_id)));
  const productNames: Record<string, string> = {};
  allStock.forEach(r => { productNames[r.product_id] = r.product_name; });
  const sortedProductIds = productIds.sort((a, b) => {
    const so_a = allStock.find(r => r.product_id === a)?.sort_order ?? 0;
    const so_b = allStock.find(r => r.product_id === b)?.sort_order ?? 0;
    return so_a - so_b;
  });

  return (
    <div className="p-4 sm:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Store className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-xl sm:text-2xl font-bold">Rede PDV — Visão Consolidada</h1>
            <p className="text-sm text-muted-foreground">Todos os pontos de venda da rede Carbo</p>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          {(Object.keys(PERIOD_LABELS) as Period[]).map(p => (
            <Button
              key={p}
              variant={period === p ? "default" : "outline"}
              size="sm"
              className={period === p ? "carbo-gradient" : ""}
              onClick={() => setPeriod(p)}
            >
              {PERIOD_LABELS[p]}
            </Button>
          ))}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: "Receita Total", value: fmt(totalRevenue), sub: PERIOD_LABELS[period], icon: DollarSign, color: "text-green-500" },
          { label: "Vendas Totais", value: String(totalSales), sub: "pedidos na rede", icon: BarChart2, color: "text-blue-500" },
          { label: "PDVs Ativos", value: String(activePdvs), sub: "com vendas", icon: Store, color: "text-amber-500" },
          { label: "Ticket Médio", value: fmt(avgTicket), sub: "por venda", icon: TrendingUp, color: "text-purple-500" },
        ].map(({ label, value, sub, icon: Icon, color }) => (
          <Card key={label}>
            <CardContent className="p-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs text-muted-foreground font-medium">{label}</p>
                  <p className="text-xl sm:text-2xl font-bold mt-1">{value}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>
                </div>
                <div className={cn("p-2 rounded-lg bg-muted/50", color)}>
                  <Icon className="h-4 w-4" />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* PDV Ranking */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="h-4 w-4" /> Ranking de PDVs — {PERIOD_LABELS[period]}
            </CardTitle>
            <Button variant="ghost" size="sm" onClick={() => navigate("/ops/pdv-network")}>
              Ver detalhes →
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {rankingLoading ? (
            <div className="space-y-2">{[1,2,3].map(i => <CarboSkeleton key={i} className="h-12" />)}</div>
          ) : ranking.length === 0 ? (
            <p className="text-center py-6 text-muted-foreground text-sm">Nenhuma venda no período.</p>
          ) : (
            <div className="space-y-2">
              {ranking.map((pdv, idx) => {
                const pos = idx + 1;
                const hasMedal = pos <= 3;
                const ticketAvg = pdv.qty > 0 ? pdv.revenue / pdv.qty : 0;
                return (
                  <div
                    key={pdv.pdv_id}
                    className={cn(
                      "flex items-center gap-3 rounded-lg border border-border px-3 py-2.5",
                      pos === 1 && "border-yellow-500/30 bg-yellow-500/5"
                    )}
                  >
                    <div className={cn(
                      "h-8 w-8 rounded-full flex items-center justify-center flex-shrink-0 font-bold text-sm",
                      hasMedal ? MEDAL_BG[idx] : "bg-muted",
                      hasMedal ? MEDAL_COLORS[idx] : "text-muted-foreground"
                    )}>
                      {hasMedal ? <Medal className="h-4 w-4" /> : pos}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm truncate">{pdv.name}</p>
                      <p className="text-xs text-muted-foreground">{pdv.city}, {pdv.state} · {pdv.qty} vendas · ticket {fmt(ticketAvg)}</p>
                    </div>
                    <p className="font-bold text-primary text-sm flex-shrink-0">{fmt(pdv.revenue)}</p>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Seller Ranking */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Trophy className="h-4 w-4" /> Ranking de Vendedores — Rede Completa
          </CardTitle>
        </CardHeader>
        <CardContent>
          {sellerLoading ? (
            <div className="space-y-2">{[1,2,3].map(i => <CarboSkeleton key={i} className="h-12" />)}</div>
          ) : sellerRanking.length === 0 ? (
            <p className="text-center py-6 text-muted-foreground text-sm">Nenhuma venda no período.</p>
          ) : (
            <div className="space-y-2">
              {sellerRanking.slice(0, 10).map((entry, idx) => {
                const pos = idx + 1;
                const hasMedal = pos <= 3;
                return (
                  <div
                    key={entry.seller_id}
                    className={cn(
                      "flex items-center gap-3 rounded-lg border border-border px-3 py-2.5",
                      pos === 1 && "border-yellow-500/30 bg-yellow-500/5"
                    )}
                  >
                    <div className={cn(
                      "h-8 w-8 rounded-full flex items-center justify-center flex-shrink-0 font-bold text-sm",
                      hasMedal ? MEDAL_BG[idx] : "bg-muted",
                      hasMedal ? MEDAL_COLORS[idx] : "text-muted-foreground"
                    )}>
                      {hasMedal ? <Medal className="h-4 w-4" /> : pos}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-sm truncate">{entry.seller_name}</p>
                        <Badge className="text-[10px] h-4 px-1.5 bg-muted border-0 text-muted-foreground">{entry.pdv_name}</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">{entry.qty_sales} vendas · ticket {fmt(entry.avg_ticket)}{entry.commission > 0 ? ` · comissão ${fmt(entry.commission)}` : ""}</p>
                    </div>
                    <p className="font-bold text-primary text-sm flex-shrink-0">{fmt(entry.revenue)}</p>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Per-product stock charts */}
      <div className="space-y-2">
        <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Estoque por Produto — Todos os PDVs</p>
        {stockLoading ? (
          <div className="grid gap-4 sm:grid-cols-3">{[1,2,3].map(i => <CarboSkeleton key={i} className="h-52" />)}</div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-1 lg:grid-cols-3">
            {sortedProductIds.map(productId => {
              const rows = allStock.filter(r => r.product_id === productId);
              const productName = productNames[productId] ?? "Produto";
              const hasAnyAlert = rows.some(r => r.has_alert);

              const chartData = rows.map(r => ({
                pdv: r.pdv_name.length > 12 ? r.pdv_name.slice(0, 12) + "…" : r.pdv_name,
                qty: r.qty_current,
                min: r.qty_min_threshold,
                max: r.qty_max_capacity,
                alert: r.has_alert,
                fullName: r.pdv_name,
              }));

              return (
                <Card key={productId} className={cn(hasAnyAlert && "border-amber-500/30")}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Package className="h-4 w-4 text-primary" />
                        {productName}
                      </div>
                      {hasAnyAlert && (
                        <Badge className="text-[10px] h-4 px-1.5 bg-amber-500/10 text-amber-600 border-0">ALERTA</Badge>
                      )}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0">
                    {chartData.length === 0 ? (
                      <p className="text-xs text-muted-foreground text-center py-6">Sem dados de estoque.</p>
                    ) : (
                      <ResponsiveContainer width="100%" height={160}>
                        <BarChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                          <XAxis dataKey="pdv" tick={{ fontSize: 10 }} />
                          <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                          <Tooltip
                            contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                            formatter={(value: number, _name: string, props: any) => [
                              `${value} un (mín ${props.payload.min})`,
                              props.payload.fullName,
                            ]}
                          />
                          <Bar dataKey="qty" radius={[4, 4, 0, 0]}>
                            {chartData.map((entry, i) => (
                              <Cell
                                key={i}
                                fill={entry.qty === 0 ? "hsl(var(--destructive))" : entry.alert ? "#f59e0b" : "#22c55e"}
                              />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    )}
                    <div className="flex items-center gap-3 mt-2 text-[10px] text-muted-foreground justify-center">
                      <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500 inline-block" />OK</span>
                      <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500 inline-block" />Alerta</span>
                      <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-destructive inline-block" />Crítico</span>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ── MANAGER VIEW ─────────────────────────────────────────────────────────────
function PDVDashboardManager() {
  const navigate = useNavigate();
  const { data: pdvStatus, isLoading: statusLoading } = usePDVStatus();
  const { isAdmin, isCeo } = useAuth();
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);

  const pdvId = pdvStatus?.pdv?.id;
  const { data: pdv, isLoading: pdvLoading } = usePDVData(pdvId);
  const { data: productStock = [] } = usePDVProductStock(pdvId);
  const { data: sales = [] } = usePDVSales(pdvId, 10);
  const { data: stats } = usePDVSalesStats(pdvId);
  const requestReplenishment = useRequestReplenishment();

  const isMasterAdmin = isAdmin && isCeo;
  const isLoading = statusLoading || pdvLoading;

  if (isLoading) {
    return (
      <div className="p-4 sm:p-6 space-y-6">
        <CarboSkeleton className="h-10 w-64" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[1,2,3,4].map(i => <CarboSkeleton key={i} className="h-28" />)}
        </div>
        <CarboSkeleton className="h-40" />
      </div>
    );
  }

  if (!pdv) {
    return (
      <div className="p-6">
        <div className="text-center py-16">
          <Package className="h-16 w-16 mx-auto text-muted-foreground/40 mb-4" />
          <h2 className="text-xl font-semibold mb-2">PDV não encontrado</h2>
          <p className="text-muted-foreground mb-6">Seu usuário não está vinculado a nenhum PDV.</p>
          {(isAdmin || isMasterAdmin) && (
            <>
              <Button onClick={() => setLinkDialogOpen(true)}>
                <LinkIcon className="h-4 w-4 mr-2" /> Vincular PDV
              </Button>
              <LinkPDVDialog open={linkDialogOpen} onOpenChange={setLinkDialogOpen} />
            </>
          )}
        </div>
      </div>
    );
  }

  const hasAnyAlert = productStock.some(s => s.has_alert);

  return (
    <div className="p-4 sm:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold">{pdv.name}</h1>
          <p className="text-sm text-muted-foreground">{pdv.addressCity}, {pdv.addressState} · {pdv.pdvCode}</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            className="gap-2 h-10"
            onClick={() => requestReplenishment.mutate({ pdvId: pdv.id, quantity: 50, notes: "Reposição solicitada via dashboard" })}
            disabled={requestReplenishment.isPending}
          >
            <RefreshCw className={cn("h-4 w-4", requestReplenishment.isPending && "animate-spin")} />
            Solicitar Reposição
          </Button>
          <Button size="sm" className="gap-2 h-10 carbo-gradient" onClick={() => navigate("/pdv/pos")}>
            <Plus className="h-4 w-4" /> Nova Venda
          </Button>
        </div>
      </div>

      {hasAnyAlert && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 flex items-center gap-3">
          <AlertTriangle className="h-5 w-5 text-amber-500 flex-shrink-0" />
          <div>
            <p className="text-sm font-semibold text-amber-600">Estoque em alerta!</p>
            <p className="text-xs text-amber-600/80">Um ou mais produtos abaixo do mínimo. Solicite reposição.</p>
          </div>
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: "Vendas Hoje",       value: fmt(stats?.today_revenue ?? 0), sub: `${stats?.today_count ?? 0} vendas`,    icon: DollarSign, color: "text-green-500" },
          { label: "No Mês",            value: fmt(stats?.month_revenue ?? 0), sub: `${stats?.month_count ?? 0} vendas`,    icon: BarChart2,  color: "text-blue-500" },
          { label: "Ticket Médio",      value: fmt(stats?.avg_ticket ?? 0),    sub: "por venda",                            icon: TrendingUp, color: "text-purple-500" },
          { label: "Produtos Vendidos", value: String(productStock.length),    sub: "itens no catálogo",                    icon: Package,    color: "text-amber-500" },
        ].map(({ label, value, sub, icon: Icon, color }) => (
          <Card key={label}>
            <CardContent className="p-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs text-muted-foreground font-medium">{label}</p>
                  <p className="text-xl sm:text-2xl font-bold mt-1">{value}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>
                </div>
                <div className={cn("p-2 rounded-lg bg-muted/50", color)}>
                  <Icon className="h-4 w-4" />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {productStock.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <Package className="h-4 w-4" /> Estoque por Produto
              </CardTitle>
              <Button variant="ghost" size="sm" onClick={() => navigate("/pdv/estoque")}>
                Ver detalhes →
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {productStock.map(s => (
              <StockBar
                key={s.id}
                label={s.product?.name ?? "Produto"}
                current={s.qty_current}
                min={s.qty_min_threshold}
                max={s.qty_max_capacity}
                color="bg-green-500"
              />
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <ShoppingCart className="h-4 w-4" /> Últimas Vendas
            </CardTitle>
            <Button variant="ghost" size="sm" onClick={() => navigate("/pdv/ranking")}>
              Ver todas →
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {sales.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">
              Nenhuma venda registrada ainda.{" "}
              <button onClick={() => navigate("/pdv/pos")} className="text-primary underline">Registrar agora</button>
            </div>
          ) : (
            <div className="space-y-2">
              {sales.filter(s => !s.is_voided).slice(0, 8).map(sale => (
                <div key={sale.id} className="flex items-center justify-between rounded-lg border border-border px-3 py-2.5">
                  <div>
                    <p className="text-sm font-medium">{sale.customer_name || "Venda avulsa"}</p>
                    <p className="text-xs text-muted-foreground">
                      {sale.pdv_sellers?.name ?? "—"} · {sale.payment_type.toUpperCase()}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold">{fmt(sale.total)}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {format(new Date(sale.created_at), "dd/MM HH:mm", { locale: ptBR })}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ── ROOT EXPORT ──────────────────────────────────────────────────────────────
export default function PDVDashboard() {
  const { isAdmin, isCeo } = useAuth();
  const isAdminView = isAdmin || isCeo;
  if (isAdminView) return <PDVDashboardAdmin />;
  return <PDVDashboardManager />;
}

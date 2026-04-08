import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Package, TrendingDown, RefreshCw, AlertTriangle, ShoppingCart,
  Link as LinkIcon, Plus, TrendingUp, DollarSign, Users, BarChart2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { usePDVStatus, usePDVData, useRequestReplenishment } from "@/hooks/usePDV";
import { useAuth } from "@/contexts/AuthContext";
import { LinkPDVDialog } from "@/components/pdv/LinkPDVDialog";
import { CarboSkeleton } from "@/components/ui/CarboSkeleton";
import { usePDVProductStock } from "@/hooks/usePDVProducts";
import { usePDVSales, usePDVSalesStats } from "@/hooks/usePDVSales";
import { useMyPDVSeller } from "@/hooks/usePDVSellers";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

const fmt = (n: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);

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

export default function PDVDashboard() {
  const navigate = useNavigate();
  const { data: pdvStatus, isLoading: statusLoading } = usePDVStatus();
  const { isAdmin, isCeo } = useAuth();
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);

  const pdvId = pdvStatus?.pdv?.id;
  const { data: pdv, isLoading: pdvLoading } = usePDVData(pdvId);
  const { data: productStock = [] } = usePDVProductStock(pdvId);
  const { data: sales = [] } = usePDVSales(pdvId, 10);
  const { data: stats } = usePDVSalesStats(pdvId);
  const { data: mySeller } = useMyPDVSeller(pdvId);
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
          <Button
            size="sm"
            className="gap-2 h-10 carbo-gradient"
            onClick={() => navigate("/pdv/pos")}
          >
            <Plus className="h-4 w-4" /> Nova Venda
          </Button>
        </div>
      </div>

      {/* Alert Banner */}
      {hasAnyAlert && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 flex items-center gap-3">
          <AlertTriangle className="h-5 w-5 text-amber-500 flex-shrink-0" />
          <div>
            <p className="text-sm font-semibold text-amber-600">Estoque em alerta!</p>
            <p className="text-xs text-amber-600/80">Um ou mais produtos abaixo do mínimo. Solicite reposição.</p>
          </div>
        </div>
      )}

      {/* KPIs vendas */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: "Vendas Hoje", value: fmt(stats?.today_revenue ?? 0), sub: `${stats?.today_count ?? 0} vendas`, icon: DollarSign, color: "text-green-500" },
          { label: "No Mês", value: fmt(stats?.month_revenue ?? 0), sub: `${stats?.month_count ?? 0} vendas`, icon: BarChart2, color: "text-blue-500" },
          { label: "Ticket Médio", value: fmt(stats?.avg_ticket ?? 0), sub: "por venda", icon: TrendingUp, color: "text-purple-500" },
          { label: "Produtos Vendidos", value: String(productStock.length), sub: "itens no catálogo", icon: Package, color: "text-amber-500" },
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

      {/* Estoque por produto */}
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

      {/* Últimas vendas */}
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
                <div
                  key={sale.id}
                  className="flex items-center justify-between rounded-lg border border-border px-3 py-2.5"
                >
                  <div>
                    <p className="text-sm font-medium">
                      {sale.customer_name || "Venda avulsa"}
                    </p>
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

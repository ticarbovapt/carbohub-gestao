import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from "recharts";
import { RefreshCw, Cloud } from "lucide-react";
import { CarboCard, CarboCardContent, CarboCardHeader, CarboCardTitle } from "@/components/ui/carbo-card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { usePurchasePayables, usePurchaseOrders } from "@/hooks/usePurchasing";

const COLORS = ["hsl(145, 55%, 51%)", "hsl(207, 77%, 61%)", "hsl(45, 93%, 54%)", "hsl(0, 72%, 51%)", "hsl(280, 60%, 55%)"];

export function PurchasingDashboard() {
  const queryClient = useQueryClient();
  const { data: payables } = usePurchasePayables();
  const { data: orders } = usePurchaseOrders();
  const [syncing, setSyncing] = useState(false);

  // Quantos registros vieram do Bling (apenas informativo)
  const blingPayables = (payables || []).filter((p) => (p as any).source === "bling").length;
  const blingOrders = (orders || []).filter((o) => (o as any).source === "bling").length;
  const hasBlingData = blingPayables > 0 || blingOrders > 0;

  // Cost by status (pie chart)
  const statusData = (() => {
    if (!payables) return [];
    const byStatus: Record<string, number> = {};
    payables.forEach((p) => {
      const label = p.status === "programado" ? "Programado" : p.status === "pago" ? "Pago" : p.status === "atrasado" ? "Atrasado" : "Cancelado";
      byStatus[label] = (byStatus[label] || 0) + Number(p.amount);
    });
    return Object.entries(byStatus).map(([name, value]) => ({ name, value }));
  })();

  // Cost by cost center (bar chart) - from orders
  const costCenterData = (() => {
    if (!orders) return [];
    // We don't have cost_center on purchase_orders directly, so we show by supplier
    const bySupplier: Record<string, number> = {};
    orders.forEach((o) => {
      if (o.status !== "cancelada") {
        bySupplier[o.supplier_name] = (bySupplier[o.supplier_name] || 0) + Number(o.total_value);
      }
    });
    return Object.entries(bySupplier)
      .map(([name, valor]) => ({ name: name.length > 15 ? name.slice(0, 15) + "…" : name, valor }))
      .sort((a, b) => b.valor - a.valor)
      .slice(0, 8);
  })();

  const formatCurrency = (val: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", notation: "compact" }).format(val);

  // Puxa Contas a Pagar e Pedidos de Compra do Bling sob demanda
  const handleSyncBling = async () => {
    setSyncing(true);
    try {
      for (const entity of ["contas_pagar", "pedidos_compra"]) {
        const res = await supabase.functions.invoke("bling-sync", { body: { entity } });
        if (!res.data?.success) {
          throw new Error(res.data?.error || `Falha ao sincronizar ${entity}`);
        }
      }
      await queryClient.invalidateQueries({ queryKey: ["purchase-payables"] });
      await queryClient.invalidateQueries({ queryKey: ["purchase-orders"] });
      toast({ title: "Dados do Bling atualizados" });
    } catch (e: any) {
      toast({
        title: "Erro ao sincronizar com o Bling",
        description: e.message + " — verifique se a integração está conectada com permissão de Finanças/Compras.",
        variant: "destructive",
      });
    } finally {
      setSyncing(false);
    }
  };

  const EmptyState = ({ what }: { what: string }) => (
    <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
      <p className="text-muted-foreground text-sm">Nenhum dado de {what} ainda.</p>
      <p className="text-xs text-muted-foreground/80 max-w-xs">
        Os dados aparecem quando há registros no módulo de Compras ou após sincronizar do Bling.
      </p>
      <Button size="sm" variant="outline" className="mt-1 gap-1.5" onClick={handleSyncBling} disabled={syncing}>
        <Cloud className="h-3.5 w-3.5" /> {syncing ? "Sincronizando…" : "Buscar do Bling"}
      </Button>
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Barra de ação: sincronização com o Bling */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          {hasBlingData && (
            <Badge variant="outline" className="gap-1">
              <Cloud className="h-3 w-3" /> {blingOrders} pedidos · {blingPayables} contas do Bling
            </Badge>
          )}
        </div>
        <Button size="sm" variant="outline" className="gap-1.5" onClick={handleSyncBling} disabled={syncing}>
          <RefreshCw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
          {syncing ? "Sincronizando…" : "Atualizar do Bling"}
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <CarboCard>
          <CarboCardHeader>
            <CarboCardTitle>Contas a Pagar por Status</CarboCardTitle>
          </CarboCardHeader>
          <CarboCardContent>
            {statusData.length === 0 ? (
              <EmptyState what="contas a pagar" />
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie data={statusData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} label={({ name, value }) => `${name}: ${formatCurrency(value)}`}>
                    {statusData.map((_, idx) => (
                      <Cell key={idx} fill={COLORS[idx % COLORS.length]} />
                    ))}
                  </Pie>
                  <Legend />
                  <Tooltip formatter={(value: number) => formatCurrency(value)} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CarboCardContent>
        </CarboCard>

        <CarboCard>
          <CarboCardHeader>
            <CarboCardTitle>Custo por Fornecedor (Top 8)</CarboCardTitle>
          </CarboCardHeader>
          <CarboCardContent>
            {costCenterData.length === 0 ? (
              <EmptyState what="pedidos de compra" />
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={costCenterData} layout="vertical" margin={{ left: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis type="number" tickFormatter={formatCurrency} />
                  <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 12 }} />
                  <Tooltip formatter={(value: number) => formatCurrency(value)} />
                  <Bar dataKey="valor" fill="hsl(145, 55%, 51%)" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CarboCardContent>
        </CarboCard>
      </div>
    </div>
  );
}

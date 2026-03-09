import React, { useState } from "react";
import { motion } from "framer-motion";
import { 
  Package, 
  TrendingDown, 
  RefreshCw, 
  AlertTriangle,
  CheckCircle,
  Clock,
  Link as LinkIcon,
  ShoppingCart,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { usePDVStatus, usePDVData, usePDVReplenishmentHistory, useRequestReplenishment } from "@/hooks/usePDV";
import { useAuth } from "@/contexts/AuthContext";
import { LinkPDVDialog } from "@/components/pdv/LinkPDVDialog";
import { CarboSkeleton } from "@/components/ui/CarboSkeleton";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";

export default function PDVDashboard() {
  const { data: pdvStatus, isLoading: statusLoading } = usePDVStatus();
  const { isAdmin, isCeo } = useAuth();
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const pdvId = pdvStatus?.pdv?.id;
  const { data: pdv, isLoading: pdvLoading } = usePDVData(pdvId);
  const { data: history, isLoading: historyLoading } = usePDVReplenishmentHistory(pdvId);
  const requestReplenishment = useRequestReplenishment();
  const licenseeId = pdvStatus?.pdv?.assigned_licensee_id;

  // Fetch orders linked to this PDV's licensee
  const { data: relatedOrders, isLoading: ordersLoading } = useQuery({
    queryKey: ["pdv-related-orders", licenseeId],
    queryFn: async () => {
      if (!licenseeId) return [];
      const { data, error } = await supabase
        .from("carboze_orders")
        .select("id, order_number, customer_name, status, total, product_code, created_at")
        .eq("licensee_id", licenseeId)
        .order("created_at", { ascending: false })
        .limit(10);
      if (error) throw error;
      return data || [];
    },
    enabled: !!licenseeId,
  });

  const isMasterAdmin = isAdmin && isCeo;
  const isLoading = statusLoading || pdvLoading;

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <CarboSkeleton className="h-10 w-64" />
        <div className="grid gap-4 md:grid-cols-3">
          <CarboSkeleton className="h-32" />
          <CarboSkeleton className="h-32" />
          <CarboSkeleton className="h-32" />
        </div>
      </div>
    );
  }

  if (!pdv) {
    return (
      <div className="p-6">
        <div className="text-center py-12">
          <Package className="h-16 w-16 mx-auto text-muted-foreground/50 mb-4" />
          <h2 className="text-xl font-semibold text-foreground mb-2">PDV não encontrado</h2>
          <p className="text-muted-foreground mb-6">
            Seu usuário não está vinculado a nenhum PDV.
          </p>
          {(isAdmin || isMasterAdmin) && (
            <>
              <Button onClick={() => setLinkDialogOpen(true)} variant="default">
                <LinkIcon className="h-4 w-4 mr-2" />
                Vincular PDV
              </Button>
              <LinkPDVDialog open={linkDialogOpen} onOpenChange={setLinkDialogOpen} />
            </>
          )}
        </div>
      </div>
    );
  }

  const stockPercentage = pdv.minStockThreshold > 0 
    ? Math.min((pdv.currentStock / (pdv.minStockThreshold * 5)) * 100, 100)
    : 100;
  
  const daysUntilEmpty = pdv.avgDailyConsumption > 0 
    ? Math.floor(pdv.currentStock / pdv.avgDailyConsumption)
    : 999;

  const handleRequestReplenishment = async () => {
    // Calculate recommended quantity (3x min threshold)
    const recommendedQty = pdv.minStockThreshold * 3;
    
    try {
      await requestReplenishment.mutateAsync({
        pdvId: pdv.id,
        quantity: recommendedQty,
        notes: `Solicitação automática - Estoque atual: ${pdv.currentStock} unidades`,
      });
      toast.success("Reposição solicitada com sucesso!", {
        description: `OS gerada para ${recommendedQty} unidades.`,
      });
    } catch (error) {
      toast.error("Erro ao solicitar reposição");
    }
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{pdv.name}</h1>
          <p className="text-muted-foreground">
            {pdv.addressCity}, {pdv.addressState} • {pdv.pdvCode}
          </p>
        </div>
        
        <Button
          onClick={handleRequestReplenishment}
          disabled={requestReplenishment.isPending}
          className="bg-gradient-to-r from-carbo-green to-carbo-blue text-white"
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${requestReplenishment.isPending ? 'animate-spin' : ''}`} />
          Solicitar Reposição
        </Button>
      </div>

      {/* Stock Alert Banner */}
      {pdv.hasStockAlert && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-xl p-4"
        >
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-100 dark:bg-amber-900 rounded-lg">
              <AlertTriangle className="h-6 w-6 text-amber-600 dark:text-amber-400" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-amber-800 dark:text-amber-200">
                Estoque Baixo!
              </h3>
              <p className="text-sm text-amber-600 dark:text-amber-400">
                {pdv.currentStock} unidades restantes. Considere solicitar reposição.
              </p>
            </div>
            <Badge variant="outline" className="border-amber-500 text-amber-700">
              ~{daysUntilEmpty} dias restantes
            </Badge>
          </div>
        </motion.div>
      )}

      {/* KPI Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        {/* Current Stock */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Package className="h-4 w-4" />
              Estoque Atual
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-foreground">
              {pdv.currentStock}
              <span className="text-lg font-normal text-muted-foreground ml-1">un</span>
            </div>
            <Progress 
              value={stockPercentage} 
              className="mt-3 h-2"
            />
            <p className="text-xs text-muted-foreground mt-2">
              Mínimo recomendado: {pdv.minStockThreshold} unidades
            </p>
          </CardContent>
        </Card>

        {/* Daily Consumption */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <TrendingDown className="h-4 w-4" />
              Consumo Médio Diário
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-foreground">
              {pdv.avgDailyConsumption?.toFixed(1) || "0"}
              <span className="text-lg font-normal text-muted-foreground ml-1">un/dia</span>
            </div>
            <p className="text-sm text-muted-foreground mt-2">
              {daysUntilEmpty < 999 ? (
                <span className={daysUntilEmpty <= 3 ? "text-red-500 font-medium" : ""}>
                  ~{daysUntilEmpty} dias até precisar reposição
                </span>
              ) : (
                "Consumo não calculado ainda"
              )}
            </p>
          </CardContent>
        </Card>

        {/* Last Replenishment */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <RefreshCw className="h-4 w-4" />
              Última Reposição
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-foreground">
              {pdv.lastReplenishmentQty || 0}
              <span className="text-lg font-normal text-muted-foreground ml-1">un</span>
            </div>
            <p className="text-sm text-muted-foreground mt-2">
              {pdv.lastReplenishmentAt 
                ? format(new Date(pdv.lastReplenishmentAt), "dd 'de' MMM 'às' HH:mm", { locale: ptBR })
                : "Nenhuma reposição registrada"
              }
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Recent History */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Histórico Recente
          </CardTitle>
        </CardHeader>
        <CardContent>
          {historyLoading ? (
            <div className="space-y-3">
              <CarboSkeleton className="h-12" />
              <CarboSkeleton className="h-12" />
            </div>
          ) : history && history.length > 0 ? (
            <div className="space-y-3">
              {history.slice(0, 5).map((item) => (
                <div 
                  key={item.id}
                  className="flex items-center justify-between p-3 bg-muted/50 rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-green-100 dark:bg-green-900 rounded-lg">
                      <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400" />
                    </div>
                    <div>
                      <p className="font-medium text-foreground">
                        +{item.quantity} unidades
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Estoque: {item.previousStock} → {item.newStock}
                      </p>
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {format(new Date(item.createdAt), "dd/MM/yy HH:mm")}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              Nenhum histórico de reposição ainda.
            </div>
          )}
        </CardContent>
      </Card>

      {/* Related Orders */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShoppingCart className="h-5 w-5" />
            Pedidos Recentes
          </CardTitle>
        </CardHeader>
        <CardContent>
          {ordersLoading ? (
            <div className="space-y-3">
              <CarboSkeleton className="h-12" />
              <CarboSkeleton className="h-12" />
            </div>
          ) : relatedOrders && relatedOrders.length > 0 ? (
            <div className="space-y-3">
              {relatedOrders.map((order) => {
                const statusMap: Record<string, { label: string; className: string }> = {
                  pending: { label: "Pendente", className: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300" },
                  confirmed: { label: "Confirmado", className: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300" },
                  invoiced: { label: "Faturado", className: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-300" },
                  shipped: { label: "Enviado", className: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300" },
                  delivered: { label: "Entregue", className: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300" },
                  cancelled: { label: "Cancelado", className: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300" },
                };
                const st = statusMap[order.status] || { label: order.status, className: "bg-muted text-muted-foreground" };
                return (
                  <div
                    key={order.id}
                    className="flex items-center justify-between p-3 bg-muted/50 rounded-lg"
                  >
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-primary/10 rounded-lg">
                        <ShoppingCart className="h-4 w-4 text-primary" />
                      </div>
                      <div>
                        <p className="font-medium text-foreground">{order.order_number}</p>
                        <p className="text-xs text-muted-foreground">
                          {order.customer_name} • {order.product_code}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge className={st.className}>{st.label}</Badge>
                      <div className="text-right">
                        <p className="text-sm font-medium text-foreground">
                          {order.total ? `R$ ${Number(order.total).toFixed(2)}` : "—"}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {format(new Date(order.created_at), "dd/MM/yy")}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              Nenhum pedido encontrado para este PDV.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

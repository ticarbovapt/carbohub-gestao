import React, { useState } from "react";
import { motion } from "framer-motion";
import { 
  Package, 
  TrendingDown, 
  RefreshCw, 
  AlertTriangle,
  ArrowUpCircle,
  ArrowDownCircle,
  Calendar,
  Link as LinkIcon,
} from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { usePDVStatus, usePDVData, useRequestReplenishment } from "@/hooks/usePDV";
import { useAuth } from "@/contexts/AuthContext";
import { LinkPDVDialog } from "@/components/pdv/LinkPDVDialog";
import { CarboSkeleton } from "@/components/ui/CarboSkeleton";
import { toast } from "sonner";
import { format, differenceInDays } from "date-fns";
import { ptBR } from "date-fns/locale";

export default function PDVStock() {
  const { data: pdvStatus, isLoading: statusLoading } = usePDVStatus();
  const { isAdmin, isCeo } = useAuth();
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const pdvId = pdvStatus?.pdv?.id;
  const { data: pdv, isLoading: pdvLoading } = usePDVData(pdvId);
  const requestReplenishment = useRequestReplenishment();

  const isLoading = statusLoading || pdvLoading;

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <CarboSkeleton className="h-10 w-64" />
        <div className="grid gap-4 md:grid-cols-2">
          <CarboSkeleton className="h-64" />
          <CarboSkeleton className="h-64" />
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
          {(isAdmin || isCeo) && (
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

  // Calculations
  const stockPercentage = pdv.minStockThreshold > 0 
    ? Math.min((pdv.currentStock / (pdv.minStockThreshold * 5)) * 100, 100)
    : 100;
  
  const daysUntilEmpty = pdv.avgDailyConsumption > 0 
    ? Math.floor(pdv.currentStock / pdv.avgDailyConsumption)
    : 999;

  const stockStatus = pdv.currentStock <= pdv.minStockThreshold 
    ? "critical" 
    : pdv.currentStock <= pdv.minStockThreshold * 2 
      ? "warning" 
      : "healthy";

  const handleRequestReplenishment = async (quantity: number) => {
    try {
      await requestReplenishment.mutateAsync({
        pdvId: pdv.id,
        quantity,
        notes: `Solicitação manual - Estoque atual: ${pdv.currentStock} unidades`,
      });
      toast.success("Reposição solicitada com sucesso!", {
        description: `OS gerada para ${quantity} unidades.`,
      });
    } catch (error) {
      toast.error("Erro ao solicitar reposição");
    }
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <PageHeader
        title="Controle de Estoque"
        description="Gerencie o estoque do seu ponto de venda CarboZé"
        icon={<Package className="h-6 w-6 text-amber-500" />}
      />

      {/* Alert Banner */}
      {stockStatus !== "healthy" && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className={`rounded-xl p-4 border ${
            stockStatus === "critical" 
              ? "bg-destructive/10 border-destructive/30"
              : "bg-amber-50 dark:bg-amber-950 border-amber-200 dark:border-amber-800"
          }`}
        >
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${
              stockStatus === "critical" 
                ? "bg-destructive/20" 
                : "bg-amber-100 dark:bg-amber-900"
            }`}>
              <AlertTriangle className={`h-6 w-6 ${
                stockStatus === "critical" 
                  ? "text-destructive" 
                  : "text-amber-600 dark:text-amber-400"
              }`} />
            </div>
            <div className="flex-1">
              <h3 className={`font-semibold ${
                stockStatus === "critical" 
                  ? "text-destructive" 
                  : "text-amber-800 dark:text-amber-200"
              }`}>
                {stockStatus === "critical" ? "Estoque Crítico!" : "Estoque Baixo"}
              </h3>
              <p className={`text-sm ${
                stockStatus === "critical" 
                  ? "text-destructive/80" 
                  : "text-amber-600 dark:text-amber-400"
              }`}>
                {pdv.currentStock} unidades restantes. 
                {daysUntilEmpty < 999 && ` Aproximadamente ${daysUntilEmpty} dias até esgotar.`}
              </p>
            </div>
            <Button
              onClick={() => handleRequestReplenishment(pdv.minStockThreshold * 3)}
              disabled={requestReplenishment.isPending}
              variant={stockStatus === "critical" ? "destructive" : "default"}
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${requestReplenishment.isPending ? 'animate-spin' : ''}`} />
              Solicitar Agora
            </Button>
          </div>
        </motion.div>
      )}

      {/* Main Grid */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Current Stock Card */}
        <Card className="lg:row-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Package className="h-5 w-5 text-primary" />
              Estoque Atual
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Big Number */}
            <div className="text-center py-8">
              <div className={`text-6xl font-bold ${
                stockStatus === "critical" 
                  ? "text-destructive" 
                  : stockStatus === "warning" 
                    ? "text-amber-500" 
                    : "text-foreground"
              }`}>
                {pdv.currentStock}
              </div>
              <p className="text-lg text-muted-foreground mt-2">unidades disponíveis</p>
            </div>

            {/* Progress Bar */}
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Nível de Estoque</span>
                <span className={`font-medium ${
                  stockStatus === "critical" 
                    ? "text-destructive" 
                    : stockStatus === "warning" 
                      ? "text-amber-500" 
                      : "text-carbo-green"
                }`}>
                  {stockPercentage.toFixed(0)}%
                </span>
              </div>
              <Progress 
                value={stockPercentage} 
                className={`h-3 ${
                  stockStatus === "critical" 
                    ? "[&>div]:bg-destructive" 
                    : stockStatus === "warning" 
                      ? "[&>div]:bg-amber-500" 
                      : ""
                }`}
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>0</span>
                <span className="text-amber-500">Mínimo: {pdv.minStockThreshold}</span>
                <span>{pdv.minStockThreshold * 5}</span>
              </div>
            </div>

            {/* Quick Actions */}
            <div className="grid grid-cols-3 gap-3 pt-4">
              {[
                { qty: pdv.minStockThreshold * 2, label: "Reposição Mínima" },
                { qty: pdv.minStockThreshold * 3, label: "Reposição Padrão" },
                { qty: pdv.minStockThreshold * 5, label: "Reposição Completa" },
              ].map((option) => (
                <Button
                  key={option.qty}
                  variant="outline"
                  className="flex flex-col h-auto py-3"
                  onClick={() => handleRequestReplenishment(option.qty)}
                  disabled={requestReplenishment.isPending}
                >
                  <span className="text-lg font-bold">{option.qty}</span>
                  <span className="text-xs text-muted-foreground">{option.label}</span>
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Consumption Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingDown className="h-5 w-5 text-amber-500" />
              Consumo
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-3xl font-bold text-foreground">
                  {pdv.avgDailyConsumption?.toFixed(1) || "0"}
                </p>
                <p className="text-sm text-muted-foreground">unidades/dia (média)</p>
              </div>
              <div className="p-3 bg-amber-100 dark:bg-amber-900/30 rounded-xl">
                <ArrowDownCircle className="h-8 w-8 text-amber-500" />
              </div>
            </div>

            <div className="pt-4 border-t">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Previsão de esgotamento</span>
                <Badge variant={daysUntilEmpty <= 3 ? "destructive" : daysUntilEmpty <= 7 ? "secondary" : "outline"}>
                  {daysUntilEmpty < 999 ? `${daysUntilEmpty} dias` : "N/A"}
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Last Replenishment Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ArrowUpCircle className="h-5 w-5 text-carbo-green" />
              Última Reposição
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-3xl font-bold text-foreground">
                  +{pdv.lastReplenishmentQty || 0}
                </p>
                <p className="text-sm text-muted-foreground">unidades recebidas</p>
              </div>
              <div className="p-3 bg-carbo-green/10 rounded-xl">
                <RefreshCw className="h-8 w-8 text-carbo-green" />
              </div>
            </div>

            <div className="pt-4 border-t">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  Data
                </span>
                <span className="text-sm font-medium">
                  {pdv.lastReplenishmentAt 
                    ? format(new Date(pdv.lastReplenishmentAt), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })
                    : "Nenhuma reposição"
                  }
                </span>
              </div>
              {pdv.lastReplenishmentAt && (
                <p className="text-xs text-muted-foreground mt-2">
                  há {differenceInDays(new Date(), new Date(pdv.lastReplenishmentAt))} dias
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

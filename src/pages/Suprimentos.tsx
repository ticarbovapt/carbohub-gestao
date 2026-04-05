import { useState } from "react";
import { Package, ArrowDownToLine, ArrowUpFromLine, BarChart3, AlertTriangle, Layers, History, Lightbulb, Shield } from "lucide-react";
import { BoardLayout } from "@/components/layouts/BoardLayout";
import { CarboPageHeader } from "@/components/ui/carbo-page-header";
import { CarboCard, CarboCardContent } from "@/components/ui/carbo-card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/contexts/AuthContext";
import { useSuprimentosKPIs } from "@/hooks/useStockMovements";
import { StockOverview } from "@/components/suprimentos/StockOverview";
import { StockMovementsList } from "@/components/suprimentos/StockMovementsList";
import { ReceivingsList } from "@/components/purchasing/ReceivingsList";
import { InvoicesList } from "@/components/purchasing/InvoicesList";

import { PendingSuggestions } from "@/components/suprimentos/PendingSuggestions";
import { SkuStockPolicy } from "@/components/suprimentos/SkuStockPolicy";

export default function Suprimentos() {
  const [activeTab, setActiveTab] = useState("estoque");
  const [planningMode, setPlanningMode] = useState(false);
  const { data: kpis } = useSuprimentosKPIs();
  const { isMasterAdmin, isAdmin, isGestorCompras } = useAuth();

  const canApprove = isMasterAdmin || isAdmin || isGestorCompras;

  return (
    <BoardLayout>
      <div className="space-y-6">
        {/* Header with planning toggle */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <CarboPageHeader
            title="Suprimentos"
            description="Estoque, Movimentações e Recebimento"
            icon={Package}
          />
          <div className="flex items-center gap-3 shrink-0 pt-1">
            <div className="flex items-center gap-2">
              <Lightbulb className={`h-4 w-4 transition-colors ${planningMode ? "text-warning" : "text-muted-foreground"}`} />
              <Label htmlFor="planning-mode" className="text-xs font-medium cursor-pointer select-none">
                Modo Planejamento
              </Label>
              <Switch
                id="planning-mode"
                checked={planningMode}
                onCheckedChange={setPlanningMode}
              />
            </div>
          </div>
        </div>

        {/* KPIs */}
        {kpis && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <CarboCard variant="kpi" padding="sm">
              <CarboCardContent>
                <div className="flex items-center gap-2 mb-1">
                  <Layers className="h-4 w-4 text-carbo-blue" />
                  <span className="text-xs text-muted-foreground">Total Produtos</span>
                </div>
                <p className="text-2xl font-bold kpi-number">{kpis.totalProdutos}</p>
              </CarboCardContent>
            </CarboCard>
            <CarboCard variant="kpi" padding="sm">
              <CarboCardContent>
                <div className="flex items-center gap-2 mb-1">
                  <AlertTriangle className="h-4 w-4 text-destructive" />
                  <span className="text-xs text-muted-foreground">Em Baixa</span>
                </div>
                <p className="text-2xl font-bold kpi-number text-destructive">{kpis.produtosEmBaixa}</p>
              </CarboCardContent>
            </CarboCard>
            <CarboCard variant="kpi" padding="sm">
              <CarboCardContent>
                <div className="flex items-center gap-2 mb-1">
                  <ArrowDownToLine className="h-4 w-4 text-carbo-green" />
                  <span className="text-xs text-muted-foreground">Entradas (7d)</span>
                </div>
                <p className="text-2xl font-bold kpi-number">{kpis.entradasRecentes}</p>
              </CarboCardContent>
            </CarboCard>
            <CarboCard variant="kpi" padding="sm">
              <CarboCardContent>
                <div className="flex items-center gap-2 mb-1">
                  <ArrowUpFromLine className="h-4 w-4 text-warning" />
                  <span className="text-xs text-muted-foreground">Saídas (7d)</span>
                </div>
                <p className="text-2xl font-bold kpi-number">{kpis.saidasRecentes}</p>
              </CarboCardContent>
            </CarboCard>
            <CarboCard variant="kpi" padding="sm">
              <CarboCardContent>
                <div className="flex items-center gap-2 mb-1">
                  <History className="h-4 w-4 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">Movimentações (7d)</span>
                </div>
                <p className="text-2xl font-bold kpi-number">{kpis.movimentosRecentes}</p>
              </CarboCardContent>
            </CarboCard>
          </div>
        )}

        {/* Planning Mode Panel */}
        {planningMode && (
          <PendingSuggestions canApprove={canApprove} />
        )}

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="w-full justify-start flex-wrap h-auto gap-1 bg-muted/50 p-1">
            <TabsTrigger value="estoque" className="gap-1.5">
              <Layers className="h-3.5 w-3.5" />
              Estoque
            </TabsTrigger>
            <TabsTrigger value="movimentacoes" className="gap-1.5">
              <History className="h-3.5 w-3.5" />
              Movimentações
            </TabsTrigger>
            <TabsTrigger value="recebimento" className="gap-1.5">
              <ArrowDownToLine className="h-3.5 w-3.5" />
              Recebimento
            </TabsTrigger>
            <TabsTrigger value="notas" className="gap-1.5">
              <BarChart3 className="h-3.5 w-3.5" />
              Notas Fiscais
            </TabsTrigger>
            <TabsTrigger value="politica" className="gap-1.5">
              <Shield className="h-3.5 w-3.5" />
              Política de Estoque
            </TabsTrigger>
          </TabsList>

          <TabsContent value="estoque">
            <StockOverview />
          </TabsContent>
          <TabsContent value="movimentacoes">
            <StockMovementsList />
          </TabsContent>
          <TabsContent value="recebimento">
            <ReceivingsList />
          </TabsContent>
          <TabsContent value="notas">
            <InvoicesList />
          </TabsContent>
          <TabsContent value="politica">
            <SkuStockPolicy />
          </TabsContent>
        </Tabs>
      </div>
    </BoardLayout>
  );
}

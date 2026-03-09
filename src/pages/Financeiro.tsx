import { useState } from "react";
import { DollarSign, FileText, CheckCircle2, Clock, AlertTriangle, CreditCard, BarChart3 } from "lucide-react";
import { BoardLayout } from "@/components/layouts/BoardLayout";
import { CarboPageHeader } from "@/components/ui/carbo-page-header";
import { CarboCard, CarboCardContent } from "@/components/ui/carbo-card";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/contexts/AuthContext";
import { useFinanceiroKPIs } from "@/hooks/useRCPurchasing";
import { RCRequestsList } from "@/components/financeiro/RCRequestsList";
import { RCDetailsPanel } from "@/components/financeiro/RCDetailsPanel";
import { PayablesList } from "@/components/purchasing/PayablesList";
import { PurchaseOrdersList } from "@/components/purchasing/PurchaseOrdersList";
import { PurchasingDashboard } from "@/components/purchasing/PurchasingDashboard";

export default function Financeiro() {
  const { isCeo, isAnyGestor } = useAuth();
  const [activeTab, setActiveTab] = useState("requisicoes");
  const [selectedRCId, setSelectedRCId] = useState<string | null>(null);
  const { data: kpis } = useFinanceiroKPIs();

  const canSeeDashboard = isCeo || isAnyGestor;

  const formatCurrency = (val: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(val);

  return (
    <BoardLayout>
      <div className="space-y-6">
        <CarboPageHeader
          title="Financeiro"
          description="Requisições de Compra, Cotações, Aprovações e Contas a Pagar"
          icon={DollarSign}
        />

        {kpis && (kpis.totalRCs > 0 || kpis.pagamentosAtrasados > 0 || kpis.totalAPagar > 0) && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <CarboCard variant="kpi" padding="sm">
              <CarboCardContent>
                <div className="flex items-center gap-2 mb-1">
                  <Clock className="h-4 w-4 text-warning" />
                  <span className="text-xs text-muted-foreground">RC Pendentes</span>
                </div>
                <p className="text-2xl font-bold kpi-number">{kpis.rcPendentes}</p>
              </CarboCardContent>
            </CarboCard>
            <CarboCard variant="kpi" padding="sm">
              <CarboCardContent>
                <div className="flex items-center gap-2 mb-1">
                  <FileText className="h-4 w-4 text-carbo-blue" />
                  <span className="text-xs text-muted-foreground">Em Cotação</span>
                </div>
                <p className="text-2xl font-bold kpi-number">{kpis.rcEmCotacao}</p>
              </CarboCardContent>
            </CarboCard>
            <CarboCard variant="kpi" padding="sm">
              <CarboCardContent>
                <div className="flex items-center gap-2 mb-1">
                  <BarChart3 className="h-4 w-4 text-carbo-green" />
                  <span className="text-xs text-muted-foreground">Total RCs</span>
                </div>
                <p className="text-2xl font-bold kpi-number">{kpis.totalRCs}</p>
              </CarboCardContent>
            </CarboCard>
            <CarboCard variant="kpi" padding="sm">
              <CarboCardContent>
                <div className="flex items-center gap-2 mb-1">
                  <AlertTriangle className="h-4 w-4 text-destructive" />
                  <span className="text-xs text-muted-foreground">Pgtos Atrasados</span>
                </div>
                <p className="text-2xl font-bold kpi-number text-destructive">{kpis.pagamentosAtrasados}</p>
              </CarboCardContent>
            </CarboCard>
            <CarboCard variant="kpi" padding="sm">
              <CarboCardContent>
                <div className="flex items-center gap-2 mb-1">
                  <CreditCard className="h-4 w-4 text-warning" />
                  <span className="text-xs text-muted-foreground">A Pagar</span>
                </div>
                <p className="text-lg font-bold kpi-number">{formatCurrency(kpis.totalAPagar)}</p>
              </CarboCardContent>
            </CarboCard>
          </div>
        )}

        {selectedRCId ? (
          <RCDetailsPanel rcId={selectedRCId} onBack={() => setSelectedRCId(null)} />
        ) : (
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="w-full justify-start flex-wrap h-auto gap-1 bg-muted/50 p-1">
              <TabsTrigger value="requisicoes" className="gap-1.5">
                <FileText className="h-3.5 w-3.5" />
                Requisições (RC)
              </TabsTrigger>
              <TabsTrigger value="ordens" className="gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Pedidos de Compra (PC)
              </TabsTrigger>
              <TabsTrigger value="pagar" className="gap-1.5">
                <CreditCard className="h-3.5 w-3.5" />
                Contas a Pagar
              </TabsTrigger>
              {canSeeDashboard && (
                <TabsTrigger value="dashboard" className="gap-1.5">
                  <BarChart3 className="h-3.5 w-3.5" />
                  Dashboard
                </TabsTrigger>
              )}
            </TabsList>

            <TabsContent value="requisicoes">
              <RCRequestsList onSelectRC={setSelectedRCId} />
            </TabsContent>
            <TabsContent value="ordens">
              <PurchaseOrdersList />
            </TabsContent>
            <TabsContent value="pagar">
              <PayablesList />
            </TabsContent>
            {canSeeDashboard && (
              <TabsContent value="dashboard">
                <PurchasingDashboard />
              </TabsContent>
            )}
          </Tabs>
        )}
      </div>
    </BoardLayout>
  );
}

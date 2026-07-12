import { useState } from "react";
import { Wallet, Plus, FileText, Package, Receipt, CreditCard, BarChart3, Clock, AlertTriangle, CheckCircle2, Building2, Wallet as WalletIcon, RefreshCw, DollarSign } from "lucide-react";
import { CarboPageHeader } from "@/components/ui/carbo-page-header";
import { CarboCard, CarboCardContent, CarboCardHeader, CarboCardTitle } from "@/components/ui/carbo-card";
import { CarboBadge } from "@/components/ui/carbo-badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/contexts/AuthContext";
import {
  usePurchaseRequests,
  usePurchaseOrders,
  usePurchasePayables,
  usePurchasingKPIs,
  usePurchaseReceivings,
  usePurchaseInvoices,
} from "@/hooks/usePurchasing";
import { PurchaseRequestForm } from "@/components/purchasing/PurchaseRequestForm";
import { PurchaseRequestsList } from "@/components/purchasing/PurchaseRequestsList";
import { PurchaseOrdersList } from "@/components/purchasing/PurchaseOrdersList";
import { ReceivingsList } from "@/components/purchasing/ReceivingsList";
import { InvoicesList } from "@/components/purchasing/InvoicesList";
import { PayablesList } from "@/components/purchasing/PayablesList";
import { PurchasingDashboard } from "@/components/purchasing/PurchasingDashboard";
import { SuppliersList } from "@/components/purchasing/SuppliersList";
import { PaymentMethodsList } from "@/components/purchasing/PaymentMethodsList";
import { SubscriptionsList } from "@/components/purchasing/SubscriptionsList";

export default function Purchasing() {
  const { gestor } = useAuth();
  const [showNewRC, setShowNewRC] = useState(false);
  const [activeTab, setActiveTab] = useState("requisicoes");
  const [payFilter, setPayFilter] = useState<string>("all");

  // Abre uma aba já com um filtro aplicado (deep-link a partir dos KPIs).
  const goPayables = (filter: string) => { setPayFilter(filter); setActiveTab("pagar"); };

  const { data: kpis } = usePurchasingKPIs();

  const canSeeDashboard = gestor;

  const formatCurrency = (val: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(val);

  return (
    <>
      <div className="space-y-6">
        <CarboPageHeader
          title="Financeiro & Suprimentos"
          description="Requisições, ordens de compra, recebimento, notas fiscais e contas a pagar"
          icon={Wallet}
          actions={
            <Button onClick={() => { setShowNewRC(true); setActiveTab("requisicoes"); }} className="gap-2 carbo-gradient text-white">
              <Plus className="h-4 w-4" />
              Nova Requisição
            </Button>
          }
        />

        {/* KPI Cards */}
        {kpis && (
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
            <CarboCard variant="kpi" padding="sm" className="cursor-pointer" onClick={() => setActiveTab("requisicoes")} title="Ver requisições">
              <CarboCardContent>
                <div className="flex items-center gap-2 mb-1">
                  <Clock className="h-4 w-4 text-warning" />
                  <span className="text-xs text-muted-foreground">RC Pendentes</span>
                </div>
                <p className="text-2xl font-bold kpi-number">{kpis.rcPendentes}</p>
              </CarboCardContent>
            </CarboCard>
            <CarboCard variant="kpi" padding="sm" className="cursor-pointer" onClick={() => setActiveTab("ordens")} title="Ver ordens de compra">
              <CarboCardContent>
                <div className="flex items-center gap-2 mb-1">
                  <Package className="h-4 w-4 text-carbo-blue" />
                  <span className="text-xs text-muted-foreground">OC Abertas</span>
                </div>
                <p className="text-2xl font-bold kpi-number">{kpis.ocAbertas}</p>
              </CarboCardContent>
            </CarboCard>
            <CarboCard variant="kpi" padding="sm" className="cursor-pointer" onClick={() => goPayables("atrasado")} title="Ver contas atrasadas">
              <CarboCardContent>
                <div className="flex items-center gap-2 mb-1">
                  <AlertTriangle className="h-4 w-4 text-destructive" />
                  <span className="text-xs text-muted-foreground">Pgtos Atrasados</span>
                </div>
                <p className="text-2xl font-bold kpi-number text-destructive">{kpis.pagamentosAtrasados}</p>
              </CarboCardContent>
            </CarboCard>
            <CarboCard variant="kpi" padding="sm" className="cursor-pointer" onClick={() => setActiveTab("ordens")} title="Ver ordens de compra">
              <CarboCardContent>
                <div className="flex items-center gap-2 mb-1">
                  <DollarSign className="h-4 w-4 text-carbo-green" />
                  <span className="text-xs text-muted-foreground">Comprometido</span>
                </div>
                <p className="text-lg font-bold kpi-number">{formatCurrency(kpis.totalComprometido)}</p>
              </CarboCardContent>
            </CarboCard>
            <CarboCard variant="kpi" padding="sm" className="cursor-pointer" onClick={() => goPayables("all")} title="Ver contas a pagar">
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

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="w-full justify-start flex-wrap h-auto gap-1 bg-muted/50 p-1">
            <TabsTrigger value="requisicoes" className="gap-1.5">
              <FileText className="h-3.5 w-3.5" />
              Requisições
            </TabsTrigger>
            <TabsTrigger value="ordens" className="gap-1.5">
              <Package className="h-3.5 w-3.5" />
              Ordens de Compra
            </TabsTrigger>
            <TabsTrigger value="recebimento" className="gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Recebimento
            </TabsTrigger>
            <TabsTrigger value="notas" className="gap-1.5">
              <Receipt className="h-3.5 w-3.5" />
              Notas Fiscais
            </TabsTrigger>
            <TabsTrigger value="pagar" className="gap-1.5">
              <CreditCard className="h-3.5 w-3.5" />
              Contas a Pagar
            </TabsTrigger>

            <div className="w-px self-stretch bg-border mx-1 my-1" aria-hidden />

            <TabsTrigger value="fornecedores" className="gap-1.5">
              <Building2 className="h-3.5 w-3.5" />
              Fornecedores
            </TabsTrigger>
            <TabsTrigger value="cartoes" className="gap-1.5">
              <WalletIcon className="h-3.5 w-3.5" />
              Cartões
            </TabsTrigger>
            <TabsTrigger value="assinaturas" className="gap-1.5">
              <RefreshCw className="h-3.5 w-3.5" />
              Assinaturas
            </TabsTrigger>
            {canSeeDashboard && (
              <>
                <div className="w-px self-stretch bg-border mx-1 my-1" aria-hidden />
                <TabsTrigger value="dashboard" className="gap-1.5">
                  <BarChart3 className="h-3.5 w-3.5" />
                  Dashboard
                </TabsTrigger>
              </>
            )}
          </TabsList>

          <TabsContent value="requisicoes">
            <PurchaseRequestsList showNewForm={showNewRC} onCloseForm={() => setShowNewRC(false)} />
          </TabsContent>
          <TabsContent value="ordens">
            <PurchaseOrdersList />
          </TabsContent>
          <TabsContent value="recebimento">
            <ReceivingsList />
          </TabsContent>
          <TabsContent value="notas">
            <InvoicesList />
          </TabsContent>
          <TabsContent value="pagar">
            <PayablesList initialStatus={payFilter} />
          </TabsContent>
          <TabsContent value="fornecedores">
            <SuppliersList />
          </TabsContent>
          <TabsContent value="cartoes">
            <PaymentMethodsList />
          </TabsContent>
          <TabsContent value="assinaturas">
            <SubscriptionsList />
          </TabsContent>
          {canSeeDashboard && (
            <TabsContent value="dashboard">
              <PurchasingDashboard />
            </TabsContent>
          )}
        </Tabs>
      </div>
    </>
  );
}

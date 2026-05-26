import { useState } from "react";
import {
  Package, ArrowDownToLine, ArrowUpFromLine, BarChart3,
  AlertTriangle, Layers, History, Lightbulb, Shield,
  MapPin, Send, Truck, AlertCircle,
} from "lucide-react";
import { BoardLayout } from "@/components/layouts/BoardLayout";
import { CarboPageHeader } from "@/components/ui/carbo-page-header";
import { CarboCard, CarboCardContent } from "@/components/ui/carbo-card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCanManageStock } from "@/hooks/useActionPermissions";
import { useSuprimentosKPIs, useSuprimentosKPIsByHub } from "@/hooks/useStockMovements";
import { StockOverview } from "@/components/suprimentos/StockOverview";
import { StockMovementsList } from "@/components/suprimentos/StockMovementsList";
import { ReceivingsList } from "@/components/purchasing/ReceivingsList";
import { InvoicesList } from "@/components/purchasing/InvoicesList";
import { PendingSuggestions } from "@/components/suprimentos/PendingSuggestions";
import { SkuStockPolicy } from "@/components/suprimentos/SkuStockPolicy";
import { CDSPTransito } from "@/components/suprimentos/CDSPTransito";
import { CDSPRegistrarEnvio } from "@/components/suprimentos/CDSPRegistrarEnvio";
import { RNEnviosSP } from "@/components/suprimentos/RNEnviosSP";

type HubView = "sp" | "rn";

const PERIOD_OPTIONS = [
  { value: "7",  label: "Últimos 7 dias"  },
  { value: "15", label: "Últimos 15 dias" },
  { value: "30", label: "Últimos 30 dias" },
  { value: "90", label: "Últimos 90 dias" },
];

function useWarehouses() {
  return useQuery({
    queryKey: ["warehouses"],
    queryFn: async () => {
      const { data } = await supabase.from("warehouses").select("*").eq("is_active", true);
      return data || [];
    },
  });
}

function useSpLowStockProducts(spWarehouseId: string | undefined) {
  return useQuery({
    queryKey: ["sp-low-stock", spWarehouseId],
    enabled: !!spWarehouseId,
    queryFn: async () => {
      const { data: stockRows } = await supabase
        .from("warehouse_stock")
        .select("product_id, quantity, mrp_products:product_id(name, safety_stock_qty, min_order_qty)")
        .eq("warehouse_id", spWarehouseId!);

      return (stockRows || []).filter((s: any) => {
        const p = s.mrp_products as any;
        const safety = p?.safety_stock_qty || p?.min_order_qty || 5;
        return s.quantity <= safety;
      }) as any[];
    },
  });
}

export default function Suprimentos() {
  const [activeTab,    setActiveTab]    = useState("estoque");
  const [planningMode, setPlanningMode] = useState(false);
  const [hubView,      setHubView]      = useState<HubView>("sp");
  const [period,       setPeriod]       = useState("7");
  const [envioOpen,    setEnvioOpen]    = useState(false);

  const isSP = hubView === "sp";
  const warehouseCode = isSP ? "HUB-SP" : "HUB-RN";

  const { data: warehouses } = useWarehouses();
  const spWarehouse = warehouses?.find(w => w.code === "HUB-SP");
  const rnWarehouse = warehouses?.find(w => w.code === "HUB-RN");

  const { data: kpisHub    } = useSuprimentosKPIsByHub(warehouseCode, Number(period));
  const { data: kpisGlobal } = useSuprimentosKPIs();
  const kpis = isSP ? kpisHub : kpisGlobal;

  const { data: lowStockProducts } = useSpLowStockProducts(spWarehouse?.id);

  const canApprove = useCanManageStock();
  const periodLabel = PERIOD_OPTIONS.find(o => o.value === period)?.label.replace("Últimos ", "") ?? `${period}d`;

  // Reset tab to valid option when switching hubs
  const handleHubChange = (hub: HubView) => {
    setHubView(hub);
    if (hub === "sp" && (activeTab === "recebimento" || activeTab === "notas" || activeTab === "envios-sp")) setActiveTab("estoque");
    if (hub === "rn" && activeTab === "transito") setActiveTab("estoque");
  };

  return (
    <BoardLayout>
      <div className="space-y-6">
        {/* Header */}
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
              <Switch id="planning-mode" checked={planningMode} onCheckedChange={setPlanningMode} />
            </div>
          </div>
        </div>

        {/* Hub selector + SP actions */}
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant={isSP ? "default" : "outline"}
            size="sm"
            className={`gap-2 ${isSP ? "bg-carbo-blue hover:bg-carbo-blue/90 text-white" : ""}`}
            onClick={() => handleHubChange("sp")}
          >
            <MapPin className="h-4 w-4" />
            CD São Paulo
          </Button>
          <Button
            variant={!isSP ? "default" : "outline"}
            size="sm"
            className={`gap-2 ${!isSP ? "bg-carbo-blue hover:bg-carbo-blue/90 text-white" : ""}`}
            onClick={() => handleHubChange("rn")}
          >
            <MapPin className="h-4 w-4" />
            Hub Natal
          </Button>

          {!isSP && spWarehouse && rnWarehouse && (
            <Button
              size="sm"
              variant="outline"
              className="gap-2 ml-auto border-blue-500/30 text-blue-400 hover:bg-blue-500/10"
              onClick={() => setEnvioOpen(true)}
            >
              <Send className="h-4 w-4" />
              Registrar Envio para CD SP
            </Button>
          )}
        </div>

        {/* Alerta de reposição — SP only */}
        {isSP && lowStockProducts && lowStockProducts.length > 0 && (
          <div className="flex items-start gap-3 px-4 py-3 rounded-lg bg-destructive/10 border border-destructive/30">
            <AlertCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-destructive">
                {lowStockProducts.length} produto{lowStockProducts.length > 1 ? "s" : ""} abaixo do nível de segurança — enviar reposição ao CD
              </p>
              <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1">
                {lowStockProducts.map((s: any) => (
                  <span key={s.product_id} className="text-xs text-muted-foreground">
                    {(s.mrp_products as any)?.name} ({s.quantity} un)
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* KPIs */}
        {kpis && (
          <div className="space-y-2">
            {isSP && (
              <div className="flex items-center gap-2 justify-end">
                <span className="text-xs text-muted-foreground">Período dos KPIs:</span>
                <Select value={period} onValueChange={setPeriod}>
                  <SelectTrigger className="w-[160px] h-7 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PERIOD_OPTIONS.map(o => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
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
                    <span className="text-xs text-muted-foreground">Entradas ({periodLabel})</span>
                  </div>
                  <p className="text-2xl font-bold kpi-number">{kpis.entradasRecentes}</p>
                </CarboCardContent>
              </CarboCard>
              <CarboCard variant="kpi" padding="sm">
                <CarboCardContent>
                  <div className="flex items-center gap-2 mb-1">
                    <ArrowUpFromLine className="h-4 w-4 text-warning" />
                    <span className="text-xs text-muted-foreground">Saídas ({periodLabel})</span>
                  </div>
                  <p className="text-2xl font-bold kpi-number">{kpis.saidasRecentes}</p>
                </CarboCardContent>
              </CarboCard>
              <CarboCard variant="kpi" padding="sm">
                <CarboCardContent>
                  <div className="flex items-center gap-2 mb-1">
                    <History className="h-4 w-4 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">Movimentações ({periodLabel})</span>
                  </div>
                  <p className="text-2xl font-bold kpi-number">{kpis.movimentosRecentes}</p>
                </CarboCardContent>
              </CarboCard>
            </div>
          </div>
        )}

        {/* Planning Mode Panel — RN only */}
        {planningMode && !isSP && (
          <PendingSuggestions canApprove={canApprove} />
        )}

        {/* Tabs — diferentes por hub */}
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
            {isSP ? (
              <TabsTrigger value="transito" className="gap-1.5">
                <Truck className="h-3.5 w-3.5" />
                Em Trânsito
              </TabsTrigger>
            ) : (
              <>
                <TabsTrigger value="envios-sp" className="gap-1.5">
                  <Send className="h-3.5 w-3.5" />
                  Envios para SP
                </TabsTrigger>
                <TabsTrigger value="recebimento" className="gap-1.5">
                  <ArrowDownToLine className="h-3.5 w-3.5" />
                  Recebimento
                </TabsTrigger>
                <TabsTrigger value="notas" className="gap-1.5">
                  <BarChart3 className="h-3.5 w-3.5" />
                  Notas Fiscais
                </TabsTrigger>
              </>
            )}
            <TabsTrigger value="politica" className="gap-1.5">
              <Shield className="h-3.5 w-3.5" />
              Política de Estoque
            </TabsTrigger>
          </TabsList>

          <TabsContent value="estoque">
            <StockOverview hubView={hubView} />
          </TabsContent>
          <TabsContent value="movimentacoes">
            <StockMovementsList hubView={hubView} />
          </TabsContent>
          {isSP && spWarehouse ? (
            <TabsContent value="transito">
              <CDSPTransito spWarehouseId={spWarehouse.id} />
            </TabsContent>
          ) : (
            <>
              {rnWarehouse && (
                <TabsContent value="envios-sp">
                  <RNEnviosSP rnWarehouseId={rnWarehouse.id} />
                </TabsContent>
              )}
              <TabsContent value="recebimento">
                <ReceivingsList />
              </TabsContent>
              <TabsContent value="notas">
                <InvoicesList />
              </TabsContent>
            </>
          )}
          <TabsContent value="politica">
            <SkuStockPolicy hubView={hubView} />
          </TabsContent>
        </Tabs>
      </div>

      {/* Dialog de registro de envio — SP only */}
      {spWarehouse && rnWarehouse && (
        <CDSPRegistrarEnvio
          open={envioOpen}
          onClose={() => setEnvioOpen(false)}
          spWarehouseId={spWarehouse.id}
          rnWarehouseId={rnWarehouse.id}
        />
      )}
    </BoardLayout>
  );
}

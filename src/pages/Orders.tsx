import React, { useState, useMemo } from "react";
import { BoardLayout } from "@/components/layouts/BoardLayout";
import { CarboPageHeader } from "@/components/ui/carbo-page-header";
import { CarboButton } from "@/components/ui/carbo-button";
import { CarboKPI } from "@/components/ui/carbo-kpi";
import { CarboBadge } from "@/components/ui/carbo-badge";
import { CarboSearchInput } from "@/components/ui/carbo-input";
import { CarboTable, CarboTableHeader, CarboTableBody, CarboTableRow, CarboTableHead, CarboTableCell } from "@/components/ui/carbo-table";
import { CarboCard } from "@/components/ui/carbo-card";
import { CarboEmptyState } from "@/components/ui/carbo-empty-state";
import { CarboSkeleton } from "@/components/ui/CarboSkeleton";
import {
  ShoppingBag,
  Plus,
  RefreshCw,
  Filter,
  ChevronRight,
  Clock,
  CheckCircle,
  Truck,
  Package,
  XCircle,
  DollarSign,
  BarChart3,
  Repeat,
  Zap,
  Calendar,
  Users,
} from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { useOrders, useOrderStats, OrderStatus, ORDER_STATUS_LABELS, ORDER_TYPE_LABELS, CarbozeOrder, OrderItem } from "@/hooks/useCarbozeOrders";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { format, parseISO, startOfMonth, endOfMonth, isWithinInterval } from "date-fns";
import { ptBR } from "date-fns/locale";
import { OrdersAnalytics } from "@/components/orders/OrdersAnalytics";
import { EditOrderDialog } from "@/components/orders/EditOrderDialog";
import { Pencil, ChevronLeft } from "lucide-react";

const STATUS_VARIANTS: Record<OrderStatus, "secondary" | "info" | "warning" | "success" | "destructive"> = {
  pending: "warning",
  confirmed: "info",
  invoiced: "info",
  shipped: "info",
  delivered: "success",
  cancelled: "destructive",
};

const STATUS_ICONS: Record<OrderStatus, React.ComponentType<{ className?: string }>> = {
  pending: Clock,
  confirmed: CheckCircle,
  invoiced: Package,
  shipped: Truck,
  delivered: CheckCircle,
  cancelled: XCircle,
};

export default function Orders() {
  const navigate = useNavigate();
  const { isManager, isAdmin } = useAuth();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<OrderStatus | "all">("all");
  const [typeFilter, setTypeFilter] = useState<"all" | "spot" | "recorrente">("all");
  const [productFilter, setProductFilter] = useState<string>("all");
  const [vendedorFilter, setVendedorFilter] = useState<string>("all");
  const [clienteFilter, setClienteFilter] = useState<string>("all");
  const [monthOffset, setMonthOffset] = useState(0);
  const [showAllMonths, setShowAllMonths] = useState(true);
  const [activeTab, setActiveTab] = useState<"list" | "analytics">("list");
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<CarbozeOrder | null>(null);

  const { data: orders = [], isLoading, refetch } = useOrders(statusFilter);
  const { data: allOrders = [] } = useOrders("all");
  const { data: stats, isLoading: statsLoading } = useOrderStats();

  // Current month for date filter
  const currentMonth = useMemo(() => {
    const d = new Date();
    d.setMonth(d.getMonth() + monthOffset);
    return d;
  }, [monthOffset]);

  const monthLabel = useMemo(() => {
    if (showAllMonths) return "Todos os períodos";
    return format(currentMonth, "MMM yyyy", { locale: ptBR }).replace(/^\w/, (c) => c.toUpperCase());
  }, [currentMonth, showAllMonths]);

  // Unique vendedores and clients for dropdowns
  const vendedores = useMemo(() => {
    const names = new Set<string>();
    orders.forEach((o) => { if (o.vendedor_name) names.add(o.vendedor_name); });
    return Array.from(names).sort();
  }, [orders]);

  const clientes = useMemo(() => {
    const names = new Set<string>();
    orders.forEach((o) => { if (o.customer_name) names.add(o.customer_name); });
    return Array.from(names).sort();
  }, [orders]);

  // Filter by all criteria
  const filteredOrders = useMemo(() => {
    return orders.filter((order) => {
      // Date filter
      if (!showAllMonths) {
        const orderDate = parseISO(order.created_at);
        const start = startOfMonth(currentMonth);
        const end = endOfMonth(currentMonth);
        if (!isWithinInterval(orderDate, { start, end })) return false;
      }
      // Type filter
      if (typeFilter !== "all" && order.order_type !== typeFilter) return false;
      // Product filter (by linha)
      if (productFilter !== "all" && order.linha !== productFilter) return false;
      // Vendedor filter
      if (vendedorFilter !== "all" && order.vendedor_name !== vendedorFilter) return false;
      // Cliente filter
      if (clienteFilter !== "all" && order.customer_name !== clienteFilter) return false;
      // Search filter
      if (!searchQuery) return true;
      const search = searchQuery.toLowerCase();
      return (
        order.order_number.toLowerCase().includes(search) ||
        order.customer_name.toLowerCase().includes(search) ||
        order.customer_email?.toLowerCase().includes(search) ||
        order.licensee?.name?.toLowerCase().includes(search)
      );
    });
  }, [orders, searchQuery, statusFilter, typeFilter, productFilter, vendedorFilter, clienteFilter, showAllMonths, currentMonth]);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  };

  return (
    <BoardLayout>
      <div className="space-y-6">
        <CarboPageHeader
          title="Controle de pedidos"
          description="Gestão de pedidos, faturamento e entregas"
          icon={ShoppingBag}
          actions={
            <>
              <CarboButton variant="outline" size="sm" onClick={() => refetch()}>
                <RefreshCw className="h-4 w-4 mr-1" />
                Atualizar
              </CarboButton>
              {isManager && (
                <CarboButton onClick={() => navigate("/orders/new")}>
                  <Plus className="h-4 w-4 mr-1" />
                  Novo Pedido
                </CarboButton>
              )}
            </>
          }
        />

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "list" | "analytics")}>
          <TabsList className="grid w-fit grid-cols-2">
            <TabsTrigger value="list" className="gap-2">
              <ShoppingBag className="h-4 w-4" />
              Pedidos
            </TabsTrigger>
            <TabsTrigger value="analytics" className="gap-2">
              <BarChart3 className="h-4 w-4" />
              Relatórios
            </TabsTrigger>
          </TabsList>

          <TabsContent value="analytics" className="mt-6">
            <OrdersAnalytics orders={allOrders} isLoading={isLoading} />
          </TabsContent>

          <TabsContent value="list" className="mt-6 space-y-6">
            {/* KPIs */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <CarboKPI
                title="Total Pedidos"
                value={stats?.total || 0}
                icon={ShoppingBag}
                iconColor="blue"
                loading={statsLoading}
                delay={50}
              />
              <CarboKPI
                title="Pendentes"
                value={stats?.pending || 0}
                icon={Clock}
                iconColor="warning"
                loading={statsLoading}
                delay={100}
              />
              <CarboKPI
                title="Enviados"
                value={stats?.shipped || 0}
                icon={Truck}
                iconColor="blue"
                loading={statsLoading}
                delay={150}
              />
              <CarboKPI
                title="Entregues"
                value={stats?.delivered || 0}
                icon={CheckCircle}
                iconColor="success"
                loading={statsLoading}
                delay={200}
              />
              <CarboKPI
                title="Faturamento"
                value={formatCurrency(stats?.totalRevenue || 0)}
                icon={DollarSign}
                iconColor="green"
                loading={statsLoading}
                delay={250}
              />
            </div>

        {/* Pipeline Visual */}
        <div className="grid grid-cols-6 gap-2">
          {(["pending", "confirmed", "invoiced", "shipped", "delivered", "cancelled"] as OrderStatus[]).map((status) => {
            const count = orders.filter((o) => o.status === status).length;
            const Icon = STATUS_ICONS[status];
            return (
              <div
                key={status}
                className={`p-3 rounded-xl border text-center transition-all cursor-pointer hover:shadow-md ${
                  statusFilter === status ? "border-carbo-green bg-carbo-green/5" : "bg-card"
                }`}
                onClick={() => setStatusFilter(statusFilter === status ? "all" : status)}
              >
                <Icon className={`h-5 w-5 mx-auto mb-1 ${
                  status === "delivered" ? "text-success" :
                  status === "cancelled" ? "text-destructive" :
                  "text-muted-foreground"
                }`} />
                <p className="text-lg font-bold kpi-number">{count}</p>
                <p className="text-xs text-muted-foreground">{ORDER_STATUS_LABELS[status]}</p>
              </div>
            );
          })}
        </div>

        {/* Filters Row 1: Search + Status + Type */}
        <div className="flex flex-col gap-3">
          <div className="flex flex-col md:flex-row gap-3">
            <div className="flex-1 max-w-md">
              <CarboSearchInput
                placeholder="Buscar por número, cliente ou licenciado..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as OrderStatus | "all")}>
              <SelectTrigger className="w-40 h-11 rounded-xl">
                <Filter className="h-4 w-4 mr-2" />
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {Object.entries(ORDER_STATUS_LABELS).map(([key, label]) => (
                  <SelectItem key={key} value={key}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as "all" | "spot" | "recorrente")}>
              <SelectTrigger className="w-40 h-11 rounded-xl">
                {typeFilter === "recorrente" ? <Repeat className="h-4 w-4 mr-2" /> : <Zap className="h-4 w-4 mr-2" />}
                <SelectValue placeholder="Tipo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos Tipos</SelectItem>
                <SelectItem value="spot">
                  <span className="flex items-center gap-2">
                    <Zap className="h-3 w-3" /> Spot
                  </span>
                </SelectItem>
                <SelectItem value="recorrente">
                  <span className="flex items-center gap-2">
                    <Repeat className="h-3 w-3" /> Recorrente
                  </span>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Filters Row 2: Date + Product + Vendedor + Cliente */}
          <div className="flex flex-wrap items-center gap-3">
            {/* Date filter */}
            <div className="flex items-center gap-1">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => { setShowAllMonths(false); setMonthOffset((p) => p - 1); }}>
                <ChevronLeft className="h-3 w-3" />
              </Button>
              <Button
                variant={showAllMonths ? "default" : "outline"}
                size="sm"
                className="h-8 min-w-[130px] text-xs"
                onClick={() => setShowAllMonths(!showAllMonths)}
              >
                {monthLabel}
              </Button>
              <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => { setShowAllMonths(false); setMonthOffset((p) => Math.min(0, p + 1)); }} disabled={monthOffset >= 0 && !showAllMonths}>
                <ChevronRight className="h-3 w-3" />
              </Button>
            </div>

            <div className="w-px h-6 bg-border" />

            {/* Product filter */}
            <Select value={productFilter} onValueChange={(v) => setProductFilter(v)}>
              <SelectTrigger className="w-44 h-8 rounded-lg text-xs">
                <Package className="h-3 w-3 mr-1" />
                <SelectValue placeholder="Produto" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos Produtos</SelectItem>
                <SelectItem value="carboze_100ml">CarboZé 100ml</SelectItem>
                <SelectItem value="carboze_1l">CarboZé 1L</SelectItem>
                <SelectItem value="carbopro">CarboPRO</SelectItem>
                <SelectItem value="carbovapt">CarboVapt</SelectItem>
              </SelectContent>
            </Select>

            {/* Vendedor filter */}
            <Select value={vendedorFilter} onValueChange={setVendedorFilter}>
              <SelectTrigger className="w-44 h-8 rounded-lg text-xs">
                <Users className="h-3 w-3 mr-1" />
                <SelectValue placeholder="Vendedor" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos Vendedores</SelectItem>
                {vendedores.map((v) => (<SelectItem key={v} value={v}>{v}</SelectItem>))}
              </SelectContent>
            </Select>

            {/* Cliente filter */}
            <Select value={clienteFilter} onValueChange={setClienteFilter}>
              <SelectTrigger className="w-52 h-8 rounded-lg text-xs">
                <Users className="h-3 w-3 mr-1" />
                <SelectValue placeholder="Cliente" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos Clientes</SelectItem>
                {clientes.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c.length > 30 ? c.slice(0, 27) + "..." : c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <span className="ml-auto text-xs text-muted-foreground">
              Mostrando <strong>{filteredOrders.length}</strong> pedidos
            </span>
          </div>
        </div>

        {/* Table */}
        {isLoading ? (
          <CarboCard padding="none">
            <div className="p-6 space-y-4">
              {[1, 2, 3, 4, 5].map((i) => (
                <CarboSkeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          </CarboCard>
        ) : filteredOrders.length === 0 ? (
          <CarboCard>
            <CarboEmptyState
              icon={ShoppingBag}
              title="Nenhum pedido encontrado"
              description={searchQuery ? "Tente ajustar os filtros de busca" : "Comece criando seu primeiro pedido"}
              action={
                isManager
                  ? {
                      label: "Novo Pedido",
                      onClick: () => navigate("/orders/new"),
                    }
                  : undefined
              }
            />
          </CarboCard>
        ) : (
          <CarboTable>
            <CarboTableHeader>
              <CarboTableRow>
                <CarboTableHead>Pedido</CarboTableHead>
                <CarboTableHead>Produto</CarboTableHead>
                <CarboTableHead>Tipo</CarboTableHead>
                <CarboTableHead>Vendedor</CarboTableHead>
                <CarboTableHead>Cliente</CarboTableHead>
                <CarboTableHead>Licenciado</CarboTableHead>
                <CarboTableHead>Data</CarboTableHead>
                <CarboTableHead className="text-center">Qtd</CarboTableHead>
                <CarboTableHead>Total</CarboTableHead>
                <CarboTableHead>Status</CarboTableHead>
                {isAdmin && <CarboTableHead className="w-10">Editar</CarboTableHead>}
                <CarboTableHead className="w-10"></CarboTableHead>
              </CarboTableRow>
            </CarboTableHeader>
            <CarboTableBody>
              {filteredOrders.map((order) => {
                const items = Array.isArray(order.items) ? (order.items as unknown as OrderItem[]) : [];
                const totalQuantity = items.reduce((sum, item) => sum + (item.quantity || 0), 0);
                const orderType = order.order_type || 'spot';
                return (
                  <CarboTableRow
                    key={order.id}
                    interactive
                    onClick={() => navigate(`/orders/${order.id}`)}
                  >
                    <CarboTableCell>
                      <span className="font-mono text-sm font-medium text-carbo-green">
                        {order.order_number}
                      </span>
                    </CarboTableCell>
                    <CarboTableCell>
                      <CarboBadge variant={order.sku?.code?.startsWith('SKU-VAPT') ? 'warning' : 'success'} className="text-[10px]">
                        {order.sku?.name || order.linha?.replace(/_/g, ' ') || '—'}
                      </CarboBadge>
                    </CarboTableCell>
                    <CarboTableCell>
                      <CarboBadge
                        variant={orderType === 'recorrente' ? 'info' : 'secondary'}
                        className="gap-1"
                      >
                        {orderType === 'recorrente' ? (
                          <Repeat className="h-3 w-3" />
                        ) : (
                          <Zap className="h-3 w-3" />
                        )}
                        {ORDER_TYPE_LABELS[orderType]}
                      </CarboBadge>
                    </CarboTableCell>
                    <CarboTableCell>
                      <span className="text-sm">
                        {order.vendedor_name || <span className="text-muted-foreground">—</span>}
                      </span>
                    </CarboTableCell>
                    <CarboTableCell>
                      <div>
                        <p className="font-medium">{order.customer_name}</p>
                        {order.customer_email && (
                          <p className="text-xs text-muted-foreground">{order.customer_email}</p>
                        )}
                      </div>
                    </CarboTableCell>
                    <CarboTableCell>
                      {order.licensee ? (
                        <div>
                          <p className="text-sm">{order.licensee.name}</p>
                          <p className="text-xs text-muted-foreground">{order.licensee.code}</p>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </CarboTableCell>
                    <CarboTableCell>
                      <p className="text-sm">
                        {format(new Date(order.created_at), "dd/MM/yyyy", { locale: ptBR })}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {format(new Date(order.created_at), "HH:mm", { locale: ptBR })}
                      </p>
                    </CarboTableCell>
                    <CarboTableCell className="text-center">
                      <div className="flex flex-col items-center">
                        <span className="font-bold text-lg kpi-number">{totalQuantity}</span>
                        <span className="text-xs text-muted-foreground">{items.length} {items.length === 1 ? 'item' : 'itens'}</span>
                      </div>
                    </CarboTableCell>
                    <CarboTableCell>
                      <span className="font-medium kpi-number">
                        {formatCurrency(Number(order.total))}
                      </span>
                    </CarboTableCell>
                    <CarboTableCell>
                      <CarboBadge variant={STATUS_VARIANTS[order.status]} dot>
                        {ORDER_STATUS_LABELS[order.status]}
                      </CarboBadge>
                    </CarboTableCell>
                    {isAdmin && (
                      <CarboTableCell>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedOrder(order);
                            setIsEditDialogOpen(true);
                          }}
                          className="p-2 hover:bg-muted rounded-md transition-colors"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                      </CarboTableCell>
                    )}
                    <CarboTableCell>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </CarboTableCell>
                  </CarboTableRow>
                );
              })}
            </CarboTableBody>
          </CarboTable>
        )}
          </TabsContent>
        </Tabs>
      </div>

      <EditOrderDialog
        open={isEditDialogOpen}
        onOpenChange={setIsEditDialogOpen}
        order={selectedOrder}
      />
    </BoardLayout>
  );
}

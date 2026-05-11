import React, { useState, useMemo, useRef } from "react";
import * as XLSX from "xlsx";
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
  Download,
  FileSpreadsheet,
  FileText,
  Printer,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
} from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DatePickerInput } from "@/components/ui/date-picker-input";
import { useOrders, useOrderStats, OrderStatus, ORDER_STATUS_LABELS, ORDER_TYPE_LABELS, CarbozeOrder, OrderItem } from "@/hooks/useCarbozeOrders";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { OrdersAnalytics } from "@/components/orders/OrdersAnalytics";
import { EditOrderDialog } from "@/components/orders/EditOrderDialog";
import { Pencil } from "lucide-react";

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
  const { isManager, isAdmin, isCeo, isMasterAdmin, isAnyGestor } = useAuth();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<OrderStatus | "all">("all");
  const [typeFilter, setTypeFilter] = useState<"all" | "spot" | "recorrente">("all");
  const [productFilter, setProductFilter] = useState<string>("all");
  const [vendedorFilter, setVendedorFilter] = useState<string>("all");
  const [clienteFilter, setClienteFilter] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo]     = useState<string>("");
  const [activeTab, setActiveTab] = useState<"list" | "analytics">("list");
  const tableRef = useRef<HTMLDivElement>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<CarbozeOrder | null>(null);

  // Sorting
  type SortCol = "order_number" | "created_at" | "customer_name" | "vendedor_name" | "total" | "status";
  const [sortCol, setSortCol] = useState<SortCol>("created_at");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const handleSort = (col: SortCol) => {
    if (sortCol === col) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortCol(col);
      setSortDir("asc");
    }
  };

  const SortIcon = ({ col }: { col: SortCol }) => {
    if (sortCol !== col) return <ArrowUpDown className="h-3.5 w-3.5 ml-1 text-muted-foreground/50" />;
    return sortDir === "asc"
      ? <ArrowUp className="h-3.5 w-3.5 ml-1 text-primary" />
      : <ArrowDown className="h-3.5 w-3.5 ml-1 text-primary" />;
  };

  const queryClient = useQueryClient();
  const { data: orders = [], isLoading, isRefetching } = useOrders(statusFilter);
  const { data: allOrders = [] } = useOrders("all");
  const { data: stats, isLoading: statsLoading } = useOrderStats();

  const handleRefreshAll = () => {
    queryClient.invalidateQueries({ queryKey: ["carboze-orders"] });
    queryClient.invalidateQueries({ queryKey: ["carboze-order-stats"] });
  };

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

  // ── Helpers de classificação de produto por item ────────────────────────
  function classifyItemName(name: string): string {
    if (!name) return "outros";
    const n = name.toUpperCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
    if (n.includes("CARBOPRO") || n.includes("CARBO PRO")) return "carbopro";
    if (n.includes("CARBOVAPT") || n.includes("CARBO VAPT") || n.includes("VAPT")) return "carbovapt";
    if (n.includes("CARBONZ") || n.includes("CARBON Z")) return "carbonz";
    if (n.includes("SACHE") || (n.includes("10ML") && !n.includes("100ML"))) return "carboze_sache";
    if (/\b1\s*L\b/.test(n) || n.includes("1000ML") || n.includes("1 LITRO")) return "carboze_1l";
    if (n.includes("100ML") || n.includes("100 ML")) return "carboze_100ml";
    if (n.includes("CARBOZE") || n.includes("CARBO ZE") || n.includes("ESTABILIZADOR")) return "carboze_100ml";
    return "outros";
  }

  function getOrderLinhas(order: CarbozeOrder): string[] {
    const items = Array.isArray(order.items) ? (order.items as unknown as OrderItem[]) : [];
    if (items.length > 0) return [...new Set(items.map((i) => classifyItemName(i.name)))];
    if (order.linha) return [order.linha];
    return ["carboze_100ml"];
  }

  const LINHA_LABELS: Record<string, string> = {
    carboze_100ml: "CarboZé 100ml", carboze_1l: "CarboZé 1L", carboze_sache: "CarboZé Sachê",
    carbopro: "CarboPRO", carbovapt: "CarboVapt", carbonz: "CarbonZ", outros: "Outros",
  };

  // Produtos disponíveis dinamicamente a partir dos pedidos carregados
  const availableLinhas = useMemo(() => {
    const set = new Set<string>();
    for (const o of orders) for (const l of getOrderLinhas(o)) if (l !== "outros") set.add(l);
    const known = ["carboze_100ml", "carboze_1l", "carboze_sache", "carbopro", "carbovapt", "carbonz"];
    return [...known.filter((k) => set.has(k)), ...Array.from(set).filter((k) => !known.includes(k))];
  }, [orders]);

  // Filter by all criteria
  const filteredOrders = useMemo(() => {
    return orders.filter((order) => {
      // Date range filter
      if (dateFrom) {
        if (new Date(order.created_at) < new Date(dateFrom)) return false;
      }
      if (dateTo) {
        const end = new Date(dateTo);
        end.setDate(end.getDate() + 1);
        if (new Date(order.created_at) >= end) return false;
      }
      // Type filter
      if (typeFilter !== "all" && order.order_type !== typeFilter) return false;
      // Product filter — item-level classification
      if (productFilter !== "all" && !getOrderLinhas(order).includes(productFilter)) return false;
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
        (order.invoice_number ?? "").toLowerCase().includes(search)
      );
    });
  }, [orders, searchQuery, statusFilter, typeFilter, productFilter, vendedorFilter, clienteFilter, dateFrom, dateTo]);

  // ── Sorted orders ────────────────────────────────────────────────────────
  const sortedOrders = useMemo(() => {
    return [...filteredOrders].sort((a, b) => {
      let va: string | number = "";
      let vb: string | number = "";
      switch (sortCol) {
        case "order_number":  va = a.order_number;      vb = b.order_number;      break;
        case "created_at":    va = a.created_at;        vb = b.created_at;        break;
        case "customer_name": va = a.customer_name;     vb = b.customer_name;     break;
        case "vendedor_name": va = a.vendedor_name ?? ""; vb = b.vendedor_name ?? ""; break;
        case "total":         va = Number(a.total);     vb = Number(b.total);     break;
        case "status":        va = a.status;            vb = b.status;            break;
      }
      if (va < vb) return sortDir === "asc" ? -1 : 1;
      if (va > vb) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
  }, [filteredOrders, sortCol, sortDir]);

  // ── Export helpers ────────────────────────────────────────────────────────
  const buildExportRows = () =>
    filteredOrders.map((o) => {
      const items = Array.isArray(o.items) ? (o.items as unknown as OrderItem[]) : [];
      const qty = items.reduce((s, i) => s + (i.quantity || 0), 0);
      return {
        Pedido:       o.order_number,
        "NF":         o.invoice_number ?? "",
        Produto:      o.sku?.name ?? o.linha?.replace(/_/g, " ") ?? "",
        Tipo:         ORDER_TYPE_LABELS[o.order_type] ?? o.order_type,
        Vendedor:     o.vendedor_name ?? "",
        Cliente:      o.customer_name,
        Data:         format(new Date(o.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR }),
        Quantidade:   qty,
        "Total (R$)": Number(o.total),
        Status:       ORDER_STATUS_LABELS[o.status],
      };
    });

  const handleExportExcel = () => {
    const ws = XLSX.utils.json_to_sheet(buildExportRows());
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Pedidos");
    XLSX.writeFile(wb, `pedidos_carbo_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const handleExportCsv = () => {
    const rows = buildExportRows();
    if (!rows.length) return;
    const header = Object.keys(rows[0]).join(";");
    const body = rows.map((r) => Object.values(r).map((v) => `"${String(v).replace(/"/g, '""')}"`).join(";")).join("\n");
    const blob = new Blob(["\uFEFF" + header + "\n" + body], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `pedidos_carbo_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportPdf = () => {
    window.print();
  };

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
              <CarboButton variant="outline" size="sm" onClick={handleRefreshAll} disabled={isRefetching}>
                <RefreshCw className={`h-4 w-4 mr-1 ${isRefetching ? "animate-spin" : ""}`} />
                {isRefetching ? "Atualizando..." : "Atualizar"}
              </CarboButton>

              {/* Export dropdown */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-1.5">
                    <Download className="h-4 w-4" />
                    Exportar
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={handleExportExcel} className="gap-2">
                    <FileSpreadsheet className="h-4 w-4 text-green-600" />
                    Excel (.xlsx)
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleExportCsv} className="gap-2">
                    <FileText className="h-4 w-4 text-blue-600" />
                    CSV (.csv)
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleExportPdf} className="gap-2">
                    <Printer className="h-4 w-4 text-red-600" />
                    Imprimir / PDF
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              {(isManager || isAdmin || isCeo || isMasterAdmin || isAnyGestor) && (
                <CarboButton onClick={() => navigate("/meu-painel")}>
                  <Plus className="h-4 w-4 mr-1" />
                  Nova Venda
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
            {/* Date range filter */}
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-muted-foreground shrink-0" />
              <DatePickerInput
                value={dateFrom}
                onChange={setDateFrom}
                placeholder="De"
                className="w-36"
              />
              <span className="text-xs text-muted-foreground">até</span>
              <DatePickerInput
                value={dateTo}
                onChange={setDateTo}
                placeholder="Até"
                className="w-36"
              />
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
                {availableLinhas.map((k) => (
                  <SelectItem key={k} value={k}>{LINHA_LABELS[k] ?? k}</SelectItem>
                ))}
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
                (isManager || isAdmin || isCeo || isMasterAdmin || isAnyGestor)
                  ? {
                      label: "Nova Venda",
                      onClick: () => navigate("/meu-painel"),
                    }
                  : undefined
              }
            />
          </CarboCard>
        ) : (
          <CarboTable>
            <CarboTableHeader>
              <CarboTableRow>
                <CarboTableHead>
                  <button onClick={() => handleSort("order_number")} className="flex items-center hover:text-foreground transition-colors">
                    Pedido <SortIcon col="order_number" />
                  </button>
                </CarboTableHead>
                <CarboTableHead>NF</CarboTableHead>
                <CarboTableHead>Produto</CarboTableHead>
                <CarboTableHead>Tipo</CarboTableHead>
                <CarboTableHead>
                  <button onClick={() => handleSort("vendedor_name")} className="flex items-center hover:text-foreground transition-colors">
                    Vendedor <SortIcon col="vendedor_name" />
                  </button>
                </CarboTableHead>
                <CarboTableHead>
                  <button onClick={() => handleSort("customer_name")} className="flex items-center hover:text-foreground transition-colors">
                    Cliente <SortIcon col="customer_name" />
                  </button>
                </CarboTableHead>
                <CarboTableHead>
                  <button onClick={() => handleSort("created_at")} className="flex items-center hover:text-foreground transition-colors">
                    Data <SortIcon col="created_at" />
                  </button>
                </CarboTableHead>
                <CarboTableHead className="text-center">Qtd</CarboTableHead>
                <CarboTableHead>
                  <button onClick={() => handleSort("total")} className="flex items-center hover:text-foreground transition-colors">
                    Total <SortIcon col="total" />
                  </button>
                </CarboTableHead>
                <CarboTableHead>
                  <button onClick={() => handleSort("status")} className="flex items-center hover:text-foreground transition-colors">
                    Status <SortIcon col="status" />
                  </button>
                </CarboTableHead>
                {isAdmin && <CarboTableHead className="w-10">Editar</CarboTableHead>}
                <CarboTableHead className="w-10"></CarboTableHead>
              </CarboTableRow>
            </CarboTableHeader>
            <CarboTableBody>
              {sortedOrders.map((order) => {
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
                      {order.invoice_number ? (
                        <span className="font-mono text-xs text-muted-foreground">
                          {order.invoice_number}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
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

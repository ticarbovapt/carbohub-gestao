import React, { useState, useMemo } from "react";
import { CarboPageHeader } from "@/components/ui/carbo-page-header";
import { CarboButton } from "@/components/ui/carbo-button";
import { CarboKPI } from "@/components/ui/carbo-kpi";
import { CarboBadge } from "@/components/ui/carbo-badge";
import { CarboSearchInput } from "@/components/ui/carbo-input";
import { CarboTable, CarboTableHeader, CarboTableBody, CarboTableRow, CarboTableHead, CarboTableCell } from "@/components/ui/carbo-table";
import { CarboCard } from "@/components/ui/carbo-card";
import { CarboEmptyState } from "@/components/ui/carbo-empty-state";
import {
  ShoppingBag, Plus, RefreshCw, Filter, ChevronRight, Clock, CheckCircle, Truck,
  Package, XCircle, DollarSign, BarChart3, Calendar, Users, Download,
  FileText, Printer, ArrowUpDown, ArrowUp, ArrowDown, Pencil,
} from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useVendas, useVendedorNomes } from "@/hooks/useVendas";

// Controle de pedidos — lê as vendas salvas (crm_vendas, status "pedido").

type OrderStatus = "quote" | "pending" | "confirmed" | "invoiced" | "shipped" | "delivered" | "cancelled";
const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  quote: "Orçamento", pending: "Pendente", confirmed: "Confirmado", invoiced: "Faturado",
  shipped: "Enviado", delivered: "Entregue", cancelled: "Cancelado",
};
const STATUS_VARIANTS: Record<OrderStatus, "secondary" | "info" | "warning" | "success" | "destructive"> = {
  quote: "secondary", pending: "warning", confirmed: "info", invoiced: "info",
  shipped: "info", delivered: "success", cancelled: "destructive",
};
const STATUS_ICONS: Record<OrderStatus, React.ComponentType<{ className?: string }>> = {
  quote: FileText, pending: Clock, confirmed: CheckCircle, invoiced: Package,
  shipped: Truck, delivered: CheckCircle, cancelled: XCircle,
};

interface MockOrder {
  id: string; order_number: string; invoice_number: string | null; linha: string;
  vendedor_name: string; customer_name: string; customer_email: string | null;
  created_at: string; qty: number; items: number; total: number; status: OrderStatus;
}

const LINHA_LABELS: Record<string, string> = {
  carboze_100ml: "CarboZé 100ml", carboze_1l: "CarboZé 1L", carboze_sache: "CarboZé Sachê",
  carbopro: "CarboPRO", carbovapt: "CarboVapt", carbonz: "CarbonZ", outros: "Outros",
};

const fmtBRL = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

export default function Pedidos() {
  const navigate = useNavigate();
  const canManageOrders = true; // gestor (camada de acesso fina entra depois)

  // ── Dados reais: vendas salvas (status "pedido") ──
  const { data: vendas = [], refetch, isFetching } = useVendas("all");
  const { data: nomes = {} } = useVendedorNomes();

  const allOrders: MockOrder[] = useMemo(() => vendas
    .filter((v) => v.status !== "orcamento")
    .map((v) => {
      const itens = v.itens ?? [];
      const qty = itens.reduce((s, i) => s + (i.quantidade || 0), 0);
      const firstProd = itens[0]?.produto ?? "—";
      return {
        id: v.id,
        order_number: `PED-${v.id.slice(0, 8).toUpperCase()}`,
        invoice_number: null,
        linha: firstProd,
        vendedor_name: nomes[v.vendedor_id] ?? "—",
        customer_name: v.customer_name ?? "—",
        customer_email: v.customer_email,
        created_at: v.created_at,
        qty,
        items: itens.length,
        total: Number(v.total) || 0,
        status: (v.status === "cancelado" ? "cancelled" : "pending") as OrderStatus,
      };
    }), [vendas, nomes]);

  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<OrderStatus | "all">("all");
  const [productFilter, setProductFilter] = useState("all");
  const [vendedorFilter, setVendedorFilter] = useState("all");
  const [clienteFilter, setClienteFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [activeTab, setActiveTab] = useState<"list" | "analytics">("list");

  type SortCol = "order_number" | "created_at" | "customer_name" | "vendedor_name" | "total" | "status";
  const [sortCol, setSortCol] = useState<SortCol>("created_at");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const handleSort = (col: SortCol) => {
    if (sortCol === col) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortCol(col); setSortDir("asc"); }
  };
  const SortIcon = ({ col }: { col: SortCol }) => {
    if (sortCol !== col) return <ArrowUpDown className="h-3.5 w-3.5 ml-1 text-muted-foreground/50" />;
    return sortDir === "asc" ? <ArrowUp className="h-3.5 w-3.5 ml-1 text-primary" /> : <ArrowDown className="h-3.5 w-3.5 ml-1 text-primary" />;
  };

  const orders = statusFilter === "all" ? allOrders : allOrders.filter((o) => o.status === statusFilter);

  const vendedores = useMemo(() => Array.from(new Set(allOrders.map((o) => o.vendedor_name))).sort(), []);
  const clientes = useMemo(() => Array.from(new Set(orders.map((o) => o.customer_name))).sort(), [orders]);
  const availableLinhas = useMemo(() => Array.from(new Set(orders.map((o) => o.linha))), [orders]);

  const stats = useMemo(() => ({
    total: allOrders.length,
    pending: allOrders.filter((o) => o.status === "pending").length,
    shipped: allOrders.filter((o) => o.status === "shipped").length,
    delivered: allOrders.filter((o) => o.status === "delivered").length,
    totalRevenue: allOrders.filter((o) => o.status !== "cancelled").reduce((s, o) => s + o.total, 0),
  }), []);

  const filteredOrders = useMemo(() => orders.filter((order) => {
    if (dateFrom && new Date(order.created_at) < new Date(dateFrom)) return false;
    if (dateTo) { const end = new Date(dateTo); end.setDate(end.getDate() + 1); if (new Date(order.created_at) >= end) return false; }
    if (productFilter !== "all" && order.linha !== productFilter) return false;
    if (vendedorFilter !== "all" && order.vendedor_name !== vendedorFilter) return false;
    if (clienteFilter !== "all" && order.customer_name !== clienteFilter) return false;
    if (!searchQuery) return true;
    const s = searchQuery.toLowerCase();
    return order.order_number.toLowerCase().includes(s) || order.customer_name.toLowerCase().includes(s) ||
      (order.customer_email ?? "").toLowerCase().includes(s) || (order.invoice_number ?? "").toLowerCase().includes(s);
  }), [orders, searchQuery, productFilter, vendedorFilter, clienteFilter, dateFrom, dateTo]);

  const sortedOrders = useMemo(() => [...filteredOrders].sort((a, b) => {
    let va: string | number = "", vb: string | number = "";
    switch (sortCol) {
      case "order_number": va = a.order_number; vb = b.order_number; break;
      case "created_at": va = a.created_at; vb = b.created_at; break;
      case "customer_name": va = a.customer_name; vb = b.customer_name; break;
      case "vendedor_name": va = a.vendedor_name; vb = b.vendedor_name; break;
      case "total": va = a.total; vb = b.total; break;
      case "status": va = a.status; vb = b.status; break;
    }
    if (va < vb) return sortDir === "asc" ? -1 : 1;
    if (va > vb) return sortDir === "asc" ? 1 : -1;
    return 0;
  }), [filteredOrders, sortCol, sortDir]);

  const handleExportCsv = () => {
    const rows = filteredOrders.map((o) => ({
      Pedido: o.order_number, NF: o.invoice_number ?? "", Produto: LINHA_LABELS[o.linha] ?? o.linha,
      Vendedor: o.vendedor_name, Cliente: o.customer_name,
      Data: format(new Date(o.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR }), Quantidade: o.qty,
      "Total (R$)": o.total, Status: ORDER_STATUS_LABELS[o.status],
    }));
    if (!rows.length) return;
    const header = Object.keys(rows[0]).join(";");
    const body = rows.map((r) => Object.values(r).map((v) => `"${String(v).replace(/"/g, '""')}"`).join(";")).join("\n");
    const blob = new Blob(["﻿" + header + "\n" + body], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `pedidos_carbo_${new Date().toISOString().slice(0, 10)}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="p-4 md:p-6">
      <div className="space-y-6">
        <CarboPageHeader
          title="Controle de pedidos"
          description="Gestão de pedidos, faturamento e entregas"
          icon={ShoppingBag}
          actions={
            <>
              <CarboButton variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
                <RefreshCw className={`h-4 w-4 mr-1 ${isFetching ? "animate-spin" : ""}`} /> Atualizar
              </CarboButton>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-1.5"><Download className="h-4 w-4" /> Exportar</Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={handleExportCsv} className="gap-2"><FileText className="h-4 w-4 text-blue-600" /> CSV (.csv)</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => window.print()} className="gap-2"><Printer className="h-4 w-4 text-red-600" /> Imprimir / PDF</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              {canManageOrders && (
                <CarboButton onClick={() => navigate("/vender")}><Plus className="h-4 w-4 mr-1" /> Nova Venda</CarboButton>
              )}
            </>
          }
        />

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "list" | "analytics")}>
          <TabsList className="grid w-fit grid-cols-2">
            <TabsTrigger value="list" className="gap-2"><ShoppingBag className="h-4 w-4" /> Pedidos</TabsTrigger>
            <TabsTrigger value="analytics" className="gap-2"><BarChart3 className="h-4 w-4" /> Relatórios</TabsTrigger>
          </TabsList>

          <TabsContent value="analytics" className="mt-6">
            <CarboCard>
              <CarboEmptyState icon={BarChart3} title="Relatórios" description="Os gráficos e relatórios analíticos de pedidos entram na fase de lógica." />
            </CarboCard>
          </TabsContent>

          <TabsContent value="list" className="mt-6 space-y-6">
            {/* KPIs */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <CarboKPI title="Total Pedidos" value={stats.total} icon={ShoppingBag} iconColor="blue" delay={50} />
              <CarboKPI title="Pendentes" value={stats.pending} icon={Clock} iconColor="warning" delay={100} />
              <CarboKPI title="Enviados" value={stats.shipped} icon={Truck} iconColor="blue" delay={150} />
              <CarboKPI title="Entregues" value={stats.delivered} icon={CheckCircle} iconColor="success" delay={200} />
              <CarboKPI title="Faturamento" value={fmtBRL(stats.totalRevenue)} icon={DollarSign} iconColor="green" delay={250} />
            </div>

            {/* Pipeline Visual */}
            <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
              {(["pending", "confirmed", "invoiced", "shipped", "delivered", "cancelled"] as OrderStatus[]).map((status) => {
                const count = allOrders.filter((o) => o.status === status).length;
                const Icon = STATUS_ICONS[status];
                return (
                  <div key={status}
                    className={`p-3 rounded-xl border text-center transition-all cursor-pointer hover:shadow-md ${statusFilter === status ? "border-carbo-green bg-carbo-green/5" : "bg-card"}`}
                    onClick={() => setStatusFilter(statusFilter === status ? "all" : status)}>
                    <Icon className={`h-5 w-5 mx-auto mb-1 ${status === "delivered" ? "text-success" : status === "cancelled" ? "text-destructive" : "text-muted-foreground"}`} />
                    <p className="text-lg font-bold">{count}</p>
                    <p className="text-xs text-muted-foreground">{ORDER_STATUS_LABELS[status]}</p>
                  </div>
                );
              })}
            </div>

            {/* Filtros */}
            <div className="flex flex-col gap-3">
              <div className="flex flex-col md:flex-row gap-3">
                <div className="flex-1 max-w-md">
                  <CarboSearchInput placeholder="Buscar por número, cliente ou NF..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
                </div>
                <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as OrderStatus | "all")}>
                  <SelectTrigger className="w-40 h-11 rounded-xl"><Filter className="h-4 w-4 mr-2" /><SelectValue placeholder="Status" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    {Object.entries(ORDER_STATUS_LABELS).map(([key, label]) => <SelectItem key={key} value={key}>{label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-muted-foreground shrink-0" />
                  <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-36 h-8 text-xs" />
                  <span className="text-xs text-muted-foreground">até</span>
                  <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-36 h-8 text-xs" />
                </div>
                <div className="w-px h-6 bg-border" />
                <Select value={productFilter} onValueChange={setProductFilter}>
                  <SelectTrigger className="w-44 h-8 rounded-lg text-xs"><Package className="h-3 w-3 mr-1" /><SelectValue placeholder="Produto" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos Produtos</SelectItem>
                    {availableLinhas.map((k) => <SelectItem key={k} value={k}>{LINHA_LABELS[k] ?? k}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={vendedorFilter} onValueChange={setVendedorFilter}>
                  <SelectTrigger className="w-44 h-8 rounded-lg text-xs"><Users className="h-3 w-3 mr-1" /><SelectValue placeholder="Vendedor" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos Vendedores</SelectItem>
                    {vendedores.map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={clienteFilter} onValueChange={setClienteFilter}>
                  <SelectTrigger className="w-52 h-8 rounded-lg text-xs"><Users className="h-3 w-3 mr-1" /><SelectValue placeholder="Cliente" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos Clientes</SelectItem>
                    {clientes.map((c) => <SelectItem key={c} value={c}>{c.length > 30 ? c.slice(0, 27) + "..." : c}</SelectItem>)}
                  </SelectContent>
                </Select>
                <span className="ml-auto text-xs text-muted-foreground">Mostrando <strong>{filteredOrders.length}</strong> pedidos</span>
              </div>
            </div>

            {/* Tabela */}
            {filteredOrders.length === 0 ? (
              <CarboCard>
                <CarboEmptyState icon={ShoppingBag} title="Nenhum pedido encontrado" description={searchQuery ? "Tente ajustar os filtros de busca" : "Comece criando seu primeiro pedido"} />
              </CarboCard>
            ) : (
              <div className="overflow-x-auto">
                <CarboTable>
                  <CarboTableHeader>
                    <CarboTableRow>
                      <CarboTableHead><button onClick={() => handleSort("order_number")} className="flex items-center hover:text-foreground transition-colors">Pedido <SortIcon col="order_number" /></button></CarboTableHead>
                      <CarboTableHead>NF</CarboTableHead>
                      <CarboTableHead>Produto</CarboTableHead>
                      <CarboTableHead><button onClick={() => handleSort("vendedor_name")} className="flex items-center hover:text-foreground transition-colors">Vendedor <SortIcon col="vendedor_name" /></button></CarboTableHead>
                      <CarboTableHead><button onClick={() => handleSort("customer_name")} className="flex items-center hover:text-foreground transition-colors">Cliente <SortIcon col="customer_name" /></button></CarboTableHead>
                      <CarboTableHead><button onClick={() => handleSort("created_at")} className="flex items-center hover:text-foreground transition-colors">Data <SortIcon col="created_at" /></button></CarboTableHead>
                      <CarboTableHead className="text-center">Qtd</CarboTableHead>
                      <CarboTableHead><button onClick={() => handleSort("total")} className="flex items-center hover:text-foreground transition-colors">Total <SortIcon col="total" /></button></CarboTableHead>
                      <CarboTableHead><button onClick={() => handleSort("status")} className="flex items-center hover:text-foreground transition-colors">Status <SortIcon col="status" /></button></CarboTableHead>
                      {canManageOrders && <CarboTableHead className="w-10">Editar</CarboTableHead>}
                      <CarboTableHead className="w-10"></CarboTableHead>
                    </CarboTableRow>
                  </CarboTableHeader>
                  <CarboTableBody>
                    {sortedOrders.map((order) => (
                      <CarboTableRow key={order.id} interactive>
                        <CarboTableCell><span className="font-mono text-sm font-medium text-carbo-green">{order.order_number}</span></CarboTableCell>
                        <CarboTableCell>{order.invoice_number ? <span className="font-mono text-xs text-muted-foreground">{order.invoice_number}</span> : <span className="text-muted-foreground">—</span>}</CarboTableCell>
                        <CarboTableCell><CarboBadge variant={order.linha === "carbovapt" ? "warning" : "success"} className="text-[10px]">{LINHA_LABELS[order.linha] ?? order.linha}</CarboBadge></CarboTableCell>
                        <CarboTableCell><span className="text-sm">{order.vendedor_name}</span></CarboTableCell>
                        <CarboTableCell><div><p className="font-medium">{order.customer_name}</p>{order.customer_email && <p className="text-xs text-muted-foreground">{order.customer_email}</p>}</div></CarboTableCell>
                        <CarboTableCell><p className="text-sm">{format(new Date(order.created_at), "dd/MM/yyyy", { locale: ptBR })}</p><p className="text-xs text-muted-foreground">{format(new Date(order.created_at), "HH:mm", { locale: ptBR })}</p></CarboTableCell>
                        <CarboTableCell className="text-center"><div className="flex flex-col items-center"><span className="font-bold text-lg">{order.qty}</span><span className="text-xs text-muted-foreground">{order.items} {order.items === 1 ? "item" : "itens"}</span></div></CarboTableCell>
                        <CarboTableCell><span className="font-medium">{fmtBRL(order.total)}</span></CarboTableCell>
                        <CarboTableCell><CarboBadge variant={STATUS_VARIANTS[order.status]} dot>{ORDER_STATUS_LABELS[order.status]}</CarboBadge></CarboTableCell>
                        {canManageOrders && <CarboTableCell><button className="p-2 hover:bg-muted rounded-md transition-colors"><Pencil className="h-4 w-4" /></button></CarboTableCell>}
                        <CarboTableCell><ChevronRight className="h-4 w-4 text-muted-foreground" /></CarboTableCell>
                      </CarboTableRow>
                    ))}
                  </CarboTableBody>
                </CarboTable>
              </div>
            )}
          </TabsContent>
        </Tabs>

        <p className="text-xs text-muted-foreground text-center">
          Pedidos reais (vendas salvas). Edição, NF e relatórios entram nas próximas etapas.
        </p>
      </div>
    </div>
  );
}

import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ShoppingBag, Plus, Clock, CheckCircle, Truck, Package, XCircle, DollarSign, FileText,
} from "lucide-react";
import { CarboPageHeader } from "@/components/ui/carbo-page-header";
import { CarboButton } from "@/components/ui/carbo-button";
import { CarboKPI } from "@/components/ui/carbo-kpi";
import { CarboBadge } from "@/components/ui/carbo-badge";
import { CarboCard, CarboCardContent } from "@/components/ui/carbo-card";
import { CarboSearchInput } from "@/components/ui/carbo-input";
import {
  CarboTable, CarboTableHeader, CarboTableBody, CarboTableRow, CarboTableHead, CarboTableCell,
} from "@/components/ui/carbo-table";
import { CarboEmptyState } from "@/components/ui/carbo-empty-state";
import { useAuth } from "@/contexts/AuthContext";

// ⚠️ PORT VISUAL — dados MOCK. TODO: ligar useOrders/useOrderStats (Supabase) depois.
type OrderStatus = "quote" | "pending" | "confirmed" | "invoiced" | "shipped" | "delivered" | "cancelled";

const STATUS_LABELS: Record<OrderStatus, string> = {
  quote: "Orçamento", pending: "Pendente", confirmed: "Confirmado", invoiced: "Faturado",
  shipped: "Enviado", delivered: "Entregue", cancelled: "Cancelado",
};
const STATUS_VARIANTS: Record<OrderStatus, "secondary" | "info" | "warning" | "success" | "destructive"> = {
  quote: "secondary", pending: "warning", confirmed: "info", invoiced: "info",
  shipped: "info", delivered: "success", cancelled: "destructive",
};
const PIPELINE: OrderStatus[] = ["pending", "confirmed", "invoiced", "shipped", "delivered", "cancelled"];
const STATUS_ICONS: Record<OrderStatus, React.ComponentType<{ className?: string }>> = {
  quote: FileText, pending: Clock, confirmed: CheckCircle, invoiced: Package,
  shipped: Truck, delivered: CheckCircle, cancelled: XCircle,
};

interface MockOrder {
  id: string; order_number: string; created_at: string; customer_name: string;
  vendedor_name: string; total: number; status: OrderStatus;
}

const MOCK_ORDERS: MockOrder[] = [
  { id: "1", order_number: "PED-1042", created_at: "2026-06-09", customer_name: "Posto Shell Centro", vendedor_name: "Lucas Padilha", total: 4850.0, status: "pending" },
  { id: "2", order_number: "PED-1041", created_at: "2026-06-08", customer_name: "Auto Posto Bandeirantes", vendedor_name: "Marcio Vannucci", total: 12300.5, status: "confirmed" },
  { id: "3", order_number: "PED-1040", created_at: "2026-06-08", customer_name: "Rede ABC Combustíveis", vendedor_name: "Lucas Padilha", total: 7600.0, status: "invoiced" },
  { id: "4", order_number: "PED-1039", created_at: "2026-06-07", customer_name: "Posto Ipiranga Sul", vendedor_name: "Marcius D'Ávila", total: 2200.0, status: "shipped" },
  { id: "5", order_number: "PED-1038", created_at: "2026-06-06", customer_name: "Oficina do Zé", vendedor_name: "Lucas Padilha", total: 980.0, status: "delivered" },
  { id: "6", order_number: "PED-1037", created_at: "2026-06-05", customer_name: "Frota Trans Log", vendedor_name: "Marcio Vannucci", total: 15800.0, status: "cancelled" },
];

const brl = (n: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);
const dt = (s: string) => new Date(s + "T00:00:00").toLocaleDateString("pt-BR");

export default function Pedidos() {
  const navigate = useNavigate();
  const { isGestor } = useAuth();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<OrderStatus | "all">("all");

  const orders = MOCK_ORDERS;
  const stats = useMemo(() => ({
    total: orders.length,
    pending: orders.filter((o) => o.status === "pending").length,
    shipped: orders.filter((o) => o.status === "shipped").length,
    delivered: orders.filter((o) => o.status === "delivered").length,
    revenue: orders.filter((o) => o.status !== "cancelled").reduce((s, o) => s + o.total, 0),
  }), [orders]);

  const filtered = useMemo(() => {
    return orders.filter((o) => {
      if (statusFilter !== "all" && o.status !== statusFilter) return false;
      if (!search) return true;
      const q = search.toLowerCase();
      return o.order_number.toLowerCase().includes(q) || o.customer_name.toLowerCase().includes(q);
    });
  }, [orders, search, statusFilter]);

  return (
    <div className="p-4 md:p-6 space-y-6">
      <CarboPageHeader
        title="Pedidos"
        description="Vendas do time comercial"
        icon={ShoppingBag}
        actions={isGestor || true ? (
          <CarboButton onClick={() => navigate("/vender")}>
            <Plus className="h-4 w-4 mr-1" /> Novo pedido
          </CarboButton>
        ) : undefined}
      />

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 md:gap-4">
        <CarboKPI title="Total Pedidos" value={stats.total} icon={ShoppingBag} iconColor="blue" delay={50} />
        <CarboKPI title="Pendentes" value={stats.pending} icon={Clock} iconColor="warning" delay={100} />
        <CarboKPI title="Enviados" value={stats.shipped} icon={Truck} iconColor="blue" delay={150} />
        <CarboKPI title="Entregues" value={stats.delivered} icon={CheckCircle} iconColor="success" delay={200} />
        <CarboKPI title="Faturamento" value={brl(stats.revenue)} icon={DollarSign} iconColor="green" delay={250} />
      </div>

      {/* Pipeline de status (clica pra filtrar) */}
      <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
        {PIPELINE.map((status) => {
          const count = orders.filter((o) => o.status === status).length;
          const Icon = STATUS_ICONS[status];
          const active = statusFilter === status;
          return (
            <button key={status} onClick={() => setStatusFilter(active ? "all" : status)}
              className={`p-3 rounded-xl border text-center transition-all hover:shadow-md ${
                active ? "border-carbo-green bg-carbo-green/5" : "bg-card"}`}>
              <Icon className={`h-5 w-5 mx-auto mb-1 ${
                status === "delivered" ? "text-success" : status === "cancelled" ? "text-destructive" : "text-muted-foreground"}`} />
              <p className="text-lg font-bold">{count}</p>
              <p className="text-xs text-muted-foreground">{STATUS_LABELS[status]}</p>
            </button>
          );
        })}
      </div>

      {/* Busca */}
      <div className="max-w-sm">
        <CarboSearchInput placeholder="Buscar por nº ou cliente..." value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {/* Tabela */}
      <CarboCard>
        <CarboCardContent className="p-0">
          {filtered.length === 0 ? (
            <CarboEmptyState icon={ShoppingBag} title="Nenhum pedido" description="Ajuste os filtros ou crie um novo pedido." />
          ) : (
            <div className="overflow-x-auto">
              <CarboTable>
                <CarboTableHeader>
                  <CarboTableRow>
                    <CarboTableHead>Pedido</CarboTableHead>
                    <CarboTableHead>Data</CarboTableHead>
                    <CarboTableHead>Cliente</CarboTableHead>
                    <CarboTableHead>Vendedor</CarboTableHead>
                    <CarboTableHead className="text-right">Total</CarboTableHead>
                    <CarboTableHead>Status</CarboTableHead>
                  </CarboTableRow>
                </CarboTableHeader>
                <CarboTableBody>
                  {filtered.map((o) => (
                    <CarboTableRow key={o.id} className="cursor-pointer">
                      <CarboTableCell className="font-mono text-xs font-medium">{o.order_number}</CarboTableCell>
                      <CarboTableCell className="text-sm text-muted-foreground">{dt(o.created_at)}</CarboTableCell>
                      <CarboTableCell className="font-medium">{o.customer_name}</CarboTableCell>
                      <CarboTableCell className="text-sm">{o.vendedor_name}</CarboTableCell>
                      <CarboTableCell className="text-right font-semibold">{brl(o.total)}</CarboTableCell>
                      <CarboTableCell>
                        <CarboBadge variant={STATUS_VARIANTS[o.status]}>{STATUS_LABELS[o.status]}</CarboBadge>
                      </CarboTableCell>
                    </CarboTableRow>
                  ))}
                </CarboTableBody>
              </CarboTable>
            </div>
          )}
        </CarboCardContent>
      </CarboCard>

      <p className="text-xs text-muted-foreground text-center">
        Tela em port visual — dados de exemplo. A lógica real (pedidos do banco, filtros, export) entra na próxima fase.
      </p>
    </div>
  );
}

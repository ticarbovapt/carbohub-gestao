import React from "react";
import { useParams, useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ArrowLeft, Package, Clock, Truck, CheckCircle, XCircle, RefreshCw, Calendar, User, MapPin, FileText, DollarSign, Repeat, Briefcase, Factory, Wrench, ExternalLink, Printer } from "lucide-react";
import { BoardLayout } from "@/components/layouts/BoardLayout";
import { CarboButton } from "@/components/ui/carbo-button";
import { CarboCard } from "@/components/ui/carbo-card";
import { CarboBadge } from "@/components/ui/carbo-badge";
import { Separator } from "@/components/ui/separator";
import { useOrder, useOrderHistory, ORDER_STATUS_LABELS, ORDER_TYPE_LABELS, OrderStatus, OrderItem } from "@/hooks/useCarbozeOrders";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { CarboSkeleton } from "@/components/ui/CarboSkeleton";
import type { Json } from "@/integrations/supabase/types";

function getStatusIcon(status: OrderStatus) {
  switch (status) {
    case "pending":   return <Clock      className="h-4 w-4" />;
    case "confirmed": return <CheckCircle className="h-4 w-4" />;
    case "invoiced":  return <FileText   className="h-4 w-4" />;
    case "shipped":   return <Truck      className="h-4 w-4" />;
    case "delivered": return <Package    className="h-4 w-4" />;
    case "cancelled": return <XCircle    className="h-4 w-4" />;
  }
}

const STATUS_COLORS: Record<OrderStatus, "default" | "success" | "warning" | "destructive"> = {
  pending: "warning",
  confirmed: "default",
  invoiced: "default",
  shipped: "default",
  delivered: "success",
  cancelled: "destructive",
};

function parseItems(items: Json): OrderItem[] {
  if (Array.isArray(items)) {
    return items as unknown as OrderItem[];
  }
  return [];
}

export default function OrderDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data: order, isLoading: orderLoading } = useOrder(id);
  const { data: history, isLoading: historyLoading } = useOrderHistory(id);

  // Get recurrence chain orders
  const { data: recurrenceOrders } = useQuery({
    queryKey: ["order-recurrence-chain", id, order?.parent_order_id],
    queryFn: async () => {
      if (!order) return [];
      
      const parentId = order.parent_order_id || order.id;
      
      const { data, error } = await supabase
        .from("carboze_orders_secure")
        .select("id, order_number, status, created_at, next_delivery_date")
        .or(`id.eq.${parentId},parent_order_id.eq.${parentId}`)
        .order("created_at", { ascending: true });

      if (error) throw error;
      return data;
    },
    enabled: !!order && order.is_recurring,
  });

  if (orderLoading) {
    return (
      <BoardLayout>
        <div className="space-y-6">
          <CarboSkeleton variant="text" className="h-8 w-64" />
          <div className="grid gap-6 md:grid-cols-2">
            <CarboSkeleton variant="card" />
            <CarboSkeleton variant="card" />
          </div>
        </div>
      </BoardLayout>
    );
  }

  if (!order) {
    return (
      <BoardLayout>
        <div className="flex flex-col items-center justify-center py-12">
          <Package className="h-12 w-12 text-muted-foreground mb-4" />
          <h2 className="text-xl font-semibold mb-2">Pedido não encontrado</h2>
          <CarboButton variant="outline" onClick={() => navigate("/orders")}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Voltar aos pedidos
          </CarboButton>
        </div>
      </BoardLayout>
    );
  }

  const items = parseItems(order.items);
  const totalQuantity = items.reduce((sum, item) => sum + (item.quantity || 0), 0);

  return (
    <BoardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <CarboButton variant="ghost" size="sm" onClick={() => navigate("/orders")}>
              <ArrowLeft className="h-4 w-4" />
            </CarboButton>
            <CarboButton
              variant="outline"
              size="sm"
              onClick={() => window.open(`/orders/${order.id}/print`, "_blank")}
              title="Visualizar Pedido de Compra (padrão SAP)"
            >
              <Printer className="h-4 w-4 mr-1.5" />
              Imprimir PO
            </CarboButton>
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold">{order.order_number}</h1>
                <CarboBadge variant={STATUS_COLORS[order.status]}>
                  {getStatusIcon(order.status)}
                  <span className="ml-1">{ORDER_STATUS_LABELS[order.status]}</span>
                </CarboBadge>
                <CarboBadge variant={order.order_type === "recorrente" ? "default" : "warning"}>
                  {order.order_type === "recorrente" ? <Repeat className="h-3 w-3 mr-1" /> : null}
                  {ORDER_TYPE_LABELS[order.order_type]}
                </CarboBadge>
              </div>
              <p className="text-sm text-muted-foreground">
                Criado em {format(new Date(order.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
              </p>
            </div>
          </div>
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          {/* Left column - Order details */}
          <div className="md:col-span-2 space-y-6">
            {/* Customer Info */}
            <CarboCard>
              <div className="p-6">
                <h3 className="font-semibold mb-4 flex items-center gap-2">
                  <User className="h-4 w-4" />
                  Informações do Cliente
                </h3>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <p className="text-sm text-muted-foreground">Nome</p>
                    <p className="font-medium">{order.customer_name}</p>
                  </div>
                  {order.customer_email && (
                    <div>
                      <p className="text-sm text-muted-foreground">Email</p>
                      <p className="font-medium">{order.customer_email}</p>
                    </div>
                  )}
                  {order.customer_phone && (
                    <div>
                      <p className="text-sm text-muted-foreground">Telefone</p>
                      <p className="font-medium">{order.customer_phone}</p>
                    </div>
                  )}
                  {order.licensee && (
                    <div>
                      <p className="text-sm text-muted-foreground">Licenciado</p>
                      <p className="font-medium">{order.licensee.name} ({order.licensee.code})</p>
                    </div>
                  )}
                </div>
              </div>
            </CarboCard>

            {/* Vendedor & RV Info */}
            {(order.vendedor_name || order.rv_flow_type !== "standard" || order.linha || order.sku) && (
              <CarboCard>
                <div className="p-6">
                  <h3 className="font-semibold mb-4 flex items-center gap-2">
                    <Briefcase className="h-4 w-4" />
                    Registro de Venda
                  </h3>
                  <div className="grid gap-4 sm:grid-cols-2">
                    {order.vendedor_name && (
                      <div>
                        <p className="text-sm text-muted-foreground">Vendedor</p>
                        <p className="font-medium">{order.vendedor_name}</p>
                      </div>
                    )}
                    {(order.sku || order.linha) && (
                      <div>
                        <p className="text-sm text-muted-foreground">Produto</p>
                        <p className="font-medium">{order.sku?.name || order.linha?.replace(/_/g, " ")}</p>
                        {order.sku?.code && <p className="text-xs text-muted-foreground">{order.sku.code}</p>}
                      </div>
                    )}
                    <div>
                      <p className="text-sm text-muted-foreground">Fluxo</p>
                      <CarboBadge variant={order.rv_flow_type === "service" ? "warning" : order.rv_flow_type === "bonus_only" ? "secondary" : "success"}>
                        {order.rv_flow_type === "standard" ? "Produto → OP" : order.rv_flow_type === "service" ? "Serviço → OS" : "Bonificação"}
                      </CarboBadge>
                    </div>
                    {order.modalidade && (
                      <div>
                        <p className="text-sm text-muted-foreground">Modalidade</p>
                        <p className="font-medium capitalize">{order.modalidade}</p>
                      </div>
                    )}
                  </div>
                </div>
              </CarboCard>
            )}

            {/* Linked OP/OS */}
            {(order.created_op_id || order.created_os_id) && (
              <CarboCard>
                <div className="p-6">
                  <h3 className="font-semibold mb-4 flex items-center gap-2">
                    {order.created_op_id ? <Factory className="h-4 w-4" /> : <Wrench className="h-4 w-4" />}
                    Ordens Geradas
                  </h3>
                  <div className="space-y-3">
                    {order.created_op_id && (
                      <div
                        className="flex items-center justify-between p-3 rounded-lg border bg-muted/30 cursor-pointer hover:bg-muted/50 transition-colors"
                        onClick={() => navigate(`/production-orders/${order.created_op_id}`)}
                      >
                        <div className="flex items-center gap-3">
                          <Factory className="h-4 w-4 text-blue-500" />
                          <div>
                            <p className="font-medium text-sm">Ordem de Produção</p>
                            <p className="text-xs text-muted-foreground">Gerada automaticamente ao confirmar</p>
                          </div>
                        </div>
                        <ExternalLink className="h-4 w-4 text-muted-foreground" />
                      </div>
                    )}
                    {order.created_os_id && (
                      <div
                        className="flex items-center justify-between p-3 rounded-lg border bg-muted/30 cursor-pointer hover:bg-muted/50 transition-colors"
                        onClick={() => navigate(`/os/${order.created_os_id}`)}
                      >
                        <div className="flex items-center gap-3">
                          <Wrench className="h-4 w-4 text-amber-500" />
                          <div>
                            <p className="font-medium text-sm">Ordem de Serviço</p>
                            <p className="text-xs text-muted-foreground">Gerada automaticamente ao confirmar</p>
                          </div>
                        </div>
                        <ExternalLink className="h-4 w-4 text-muted-foreground" />
                      </div>
                    )}
                  </div>
                </div>
              </CarboCard>
            )}

            {/* Delivery Address */}
            {order.delivery_address && (
              <CarboCard>
                <div className="p-6">
                  <h3 className="font-semibold mb-4 flex items-center gap-2">
                    <MapPin className="h-4 w-4" />
                    Endereço de Entrega
                  </h3>
                  <p className="text-foreground">{order.delivery_address}</p>
                  <p className="text-muted-foreground">
                    {[order.delivery_city, order.delivery_state, order.delivery_zip].filter(Boolean).join(" - ")}
                  </p>
                </div>
              </CarboCard>
            )}

            {/* Items */}
            <CarboCard>
              <div className="p-6">
                <h3 className="font-semibold mb-4 flex items-center gap-2">
                  <Package className="h-4 w-4" />
                  Itens do Pedido ({totalQuantity} unidades)
                </h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                        <th className="pb-2 pr-3">Produto</th>
                        <th className="pb-2 px-3 text-center w-16">Qtd</th>
                        <th className="pb-2 px-3 text-right w-32">Preço Unit.</th>
                        <th className="pb-2 pl-3 text-right w-28">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((item, index) => {
                        // suporte a ambos os formatos: name (novo) e product_name (legado)
                        const rawName = item.name || (item as any).product_name || "—";
                        // Trunca nomes longos do Bling: remove sufixo " - PRODUTO NAO ENQUADRADO..." etc.
                        const displayName = rawName.includes(" - ")
                          ? rawName.split(" - ")[0].trim()
                          : rawName.length > 60
                          ? rawName.substring(0, 60) + "…"
                          : rawName;
                        const productCode = (item as any).product_code || (item as any).sku_code;
                        return (
                          <tr key={index} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                            <td className="py-2.5 pr-3">
                              <p className="font-medium" title={rawName}>{displayName}</p>
                              {productCode && (
                                <p className="text-xs text-muted-foreground font-mono">{productCode}</p>
                              )}
                            </td>
                            <td className="py-2.5 px-3 text-center tabular-nums font-medium">{item.quantity}</td>
                            <td className="py-2.5 px-3 text-right tabular-nums text-muted-foreground">
                              R$ {Number(item.unit_price).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                            </td>
                            <td className="py-2.5 pl-3 text-right tabular-nums font-semibold">
                              R$ {Number(item.total).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <Separator className="my-4" />
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Subtotal</span>
                    <span>R$ {Number(order.subtotal).toFixed(2)}</span>
                  </div>
                  {order.shipping_cost > 0 && (
                    <div className="flex justify-between text-sm">
                      <span>Frete</span>
                      <span>R$ {Number(order.shipping_cost).toFixed(2)}</span>
                    </div>
                  )}
                  {order.discount > 0 && (
                    <div className="flex justify-between text-sm text-success">
                      <span>Desconto</span>
                      <span>-R$ {Number(order.discount).toFixed(2)}</span>
                    </div>
                  )}
                  <Separator />
                  <div className="flex justify-between font-bold text-lg">
                    <span>Total</span>
                    <span>R$ {Number(order.total).toFixed(2)}</span>
                  </div>
                </div>
              </div>
            </CarboCard>

            {/* Recurrence Info */}
            {order.is_recurring && (
              <CarboCard>
                <div className="p-6">
                  <h3 className="font-semibold mb-4 flex items-center gap-2">
                    <RefreshCw className="h-4 w-4" />
                    Configuração de Recorrência
                  </h3>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <p className="text-sm text-muted-foreground">Intervalo</p>
                      <p className="font-medium">{order.recurrence_interval_days} dias</p>
                    </div>
                    {order.next_delivery_date && (
                      <div>
                        <p className="text-sm text-muted-foreground">Próxima Entrega</p>
                        <p className="font-medium">
                          {format(new Date(order.next_delivery_date), "dd/MM/yyyy", { locale: ptBR })}
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Recurrence Chain */}
                  {recurrenceOrders && recurrenceOrders.length > 1 && (
                    <div className="mt-6">
                      <p className="text-sm font-medium mb-3">Histórico de Recorrências</p>
                      <div className="space-y-2">
                        {recurrenceOrders.map((recOrder) => (
                          <div
                            key={recOrder.id}
                            className={`flex items-center justify-between p-3 rounded-lg border ${
                              recOrder.id === order.id ? "bg-primary/5 border-primary" : "bg-muted/30"
                            }`}
                          >
                            <div className="flex items-center gap-3">
                              <span className="font-mono text-sm">{recOrder.order_number}</span>
                              <CarboBadge variant={STATUS_COLORS[recOrder.status as OrderStatus]} size="sm">
                                {ORDER_STATUS_LABELS[recOrder.status as OrderStatus]}
                              </CarboBadge>
                            </div>
                            <span className="text-sm text-muted-foreground">
                              {format(new Date(recOrder.created_at), "dd/MM/yyyy", { locale: ptBR })}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </CarboCard>
            )}

            {/* Commission Info */}
            {order.has_commission && (
              <CarboCard>
                <div className="p-6">
                  <h3 className="font-semibold mb-4 flex items-center gap-2">
                    <DollarSign className="h-4 w-4" />
                    Comissão
                  </h3>
                  <div className="grid gap-4 sm:grid-cols-3">
                    <div>
                      <p className="text-sm text-muted-foreground">Taxa</p>
                      <p className="font-medium">{order.commission_rate}%</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Valor</p>
                      <p className="font-medium">R$ {Number(order.commission_amount).toFixed(2)}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Status</p>
                      <CarboBadge variant={order.commission_paid_at ? "success" : "warning"}>
                        {order.commission_paid_at ? "Pago" : "Pendente"}
                      </CarboBadge>
                    </div>
                  </div>
                </div>
              </CarboCard>
            )}
          </div>

          {/* Right column - Timeline */}
          <div className="space-y-6">
            <CarboCard>
              <div className="p-6">
                <h3 className="font-semibold mb-4 flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  Timeline de Status
                </h3>
                {historyLoading ? (
                  <div className="space-y-3">
                    <CarboSkeleton variant="text" />
                    <CarboSkeleton variant="text" />
                    <CarboSkeleton variant="text" />
                  </div>
                ) : history && history.length > 0 ? (
                  <div className="relative">
                    <div className="absolute left-2 top-0 bottom-0 w-0.5 bg-border" />
                    <div className="space-y-4">
                      {history.map((entry, index) => (
                        <div key={entry.id} className="relative pl-8">
                          <div
                            className={`absolute left-0 w-4 h-4 rounded-full border-2 ${
                              index === 0
                                ? "bg-primary border-primary"
                                : "bg-background border-muted-foreground"
                            }`}
                          />
                          <div>
                            <div className="flex items-center gap-2">
                              <CarboBadge variant={STATUS_COLORS[entry.status as OrderStatus]} size="sm">
                                {ORDER_STATUS_LABELS[entry.status as OrderStatus]}
                              </CarboBadge>
                            </div>
                            <p className="text-xs text-muted-foreground mt-1">
                              {format(new Date(entry.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                            </p>
                            {entry.notes && (
                              <p className="text-sm text-muted-foreground mt-1">{entry.notes}</p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">Nenhum histórico disponível</p>
                )}
              </div>
            </CarboCard>

            {/* Tracking Info */}
            {(order.tracking_code || order.invoice_number) && (
              <CarboCard>
                <div className="p-6">
                  <h3 className="font-semibold mb-4 flex items-center gap-2">
                    <Truck className="h-4 w-4" />
                    Rastreamento
                  </h3>
                  <div className="space-y-3">
                    {order.invoice_number && (
                      <div>
                        <p className="text-sm text-muted-foreground">Nota Fiscal</p>
                        <p className="font-medium">{order.invoice_number}</p>
                      </div>
                    )}
                    {order.tracking_code && (
                      <div>
                        <p className="text-sm text-muted-foreground">Código de Rastreio</p>
                        <p className="font-medium font-mono">{order.tracking_code}</p>
                      </div>
                    )}
                    {order.tracking_url && (
                      <CarboButton variant="outline" size="sm" className="w-full" asChild>
                        <a href={order.tracking_url} target="_blank" rel="noopener noreferrer">
                          Rastrear Entrega
                        </a>
                      </CarboButton>
                    )}
                  </div>
                </div>
              </CarboCard>
            )}

            {/* Notes */}
            {(order.notes || order.internal_notes) && (
              <CarboCard>
                <div className="p-6">
                  <h3 className="font-semibold mb-4 flex items-center gap-2">
                    <FileText className="h-4 w-4" />
                    Observações
                  </h3>
                  <div className="space-y-3">
                    {order.notes && (
                      <div>
                        <p className="text-sm text-muted-foreground">Públicas</p>
                        <p className="text-sm">{order.notes}</p>
                      </div>
                    )}
                    {order.internal_notes && (
                      <div>
                        <p className="text-sm text-muted-foreground">Internas</p>
                        <p className="text-sm">{order.internal_notes}</p>
                      </div>
                    )}
                  </div>
                </div>
              </CarboCard>
            )}
          </div>
        </div>
      </div>
    </BoardLayout>
  );
}

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { Json } from "@/integrations/supabase/types";

export type OrderStatus = "pending" | "confirmed" | "invoiced" | "shipped" | "delivered" | "cancelled";
export type OrderType = "spot" | "recorrente";

export interface OrderItem {
  product_id?: string;
  name: string;
  quantity: number;
  unit_price: number;
  total: number;
  // Campos SAP / PO (opcionais — retrocompatíveis)
  unit_code?: string;         // ex: CDA, PEÇ, UN, KG, L
  client_code?: string;       // código do produto no sistema do cliente
  ncm?: string;               // ex: "2905.31.00" — Nomenclatura Comum do Mercosul
  delivery_date?: string;     // ISO date — data de entrega por item
  cost_center?: string;       // ex: "K - Centro de custo"
  freight_value?: number;     // valor do frete por item
  ipi_pct?: number;           // alíquota IPI em %
  icms_pct?: number;          // alíquota ICMS em %
  icms_desone_pct?: number;   // desoneração de ICMS em %
  st_pct?: number;            // alíquota ST em %
  st_base_ret_pct?: number;   // base de ST retido em %
  gross_value?: number;       // valor bruto antes do desconto
}

export interface CarbozeOrder {
  id: string;
  order_number: string;
  licensee_id: string | null;
  customer_name: string;
  customer_email: string | null;
  customer_phone: string | null;
  delivery_address: string | null;
  delivery_city: string | null;
  delivery_state: string | null;
  delivery_zip: string | null;
  items: Json;
  subtotal: number;
  shipping_cost: number;
  discount: number;
  total: number;
  status: OrderStatus;
  confirmed_at: string | null;
  invoiced_at: string | null;
  invoice_number: string | null;
  shipped_at: string | null;
  tracking_code: string | null;
  tracking_url: string | null;
  delivered_at: string | null;
  cancelled_at: string | null;
  cancellation_reason: string | null;
  has_commission: boolean;
  commission_rate: number;
  commission_amount: number;
  commission_paid_at: string | null;
  notes: string | null;
  internal_notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  // Recurrence fields
  order_type: OrderType;
  is_recurring: boolean;
  recurrence_interval_days: number | null;
  next_delivery_date: string | null;
  parent_order_id: string | null;
  last_recurrence_order_id: string | null;
  // Vendedor / RV fields
  vendedor_id: string | null;
  vendedor_name: string | null;
  rv_flow_type: "standard" | "service" | "bonus_only";
  linha: string | null;
  modalidade: string | null;
  created_op_id: string | null;
  created_os_id: string | null;
  // Product catalog reference
  sku_id: string | null;
  // Import/governance fields
  is_test: boolean;
  source_file: string | null;
  external_ref: string | null;
  // Campos PO padrão SAP
  po_number: string | null;             // Número do PO do cliente (ex: 4500787362)
  po_date: string | null;               // Data do PO
  ie: string | null;                    // Inscrição Estadual do cliente
  billing_address: string | null;
  billing_city: string | null;
  billing_state: string | null;
  billing_zip: string | null;
  billing_contact_name: string | null;  // Responsável pelo comprador
  billing_contact_email: string | null;
  payment_terms: string | null;         // ex: "30/60/90/120/150 DIAS - BOLETO"
  freight_type: "CIF" | "FOB" | null;
  buyer_notes: string | null;           // Observações do comprador
  general_notes: string | null;         // Observações gerais
  // Joined data
  licensee?: {
    id: string;
    name: string;
    code: string;
  } | null;
  sku?: {
    id: string;
    code: string;
    name: string;
  } | null;
}

export interface OrderInsert {
  customer_name: string;
  customer_email?: string;
  customer_phone?: string;
  licensee_id?: string;
  delivery_address?: string;
  delivery_city?: string;
  delivery_state?: string;
  delivery_zip?: string;
  items: Json;
  subtotal: number;
  shipping_cost?: number;
  discount?: number;
  total: number;
  has_commission?: boolean;
  commission_rate?: number;
  notes?: string;
  // Recurrence fields
  order_type?: OrderType;
  is_recurring?: boolean;
  recurrence_interval_days?: number;
  next_delivery_date?: string;
  // Vendedor / RV fields
  vendedor_id?: string;
  vendedor_name?: string;
  rv_flow_type?: "standard" | "service" | "bonus_only";
  linha?: string;
  modalidade?: string;
  // Product catalog reference
  sku_id?: string;
  // Strategic V2.1 fields
  cnpj?: string;
  legal_name?: string;
  trade_name?: string;
  cnae?: string;
  situacao_cadastral?: string;
  point_type?: string;
  avg_monthly_vehicles?: number;
  works_with_diesel?: boolean;
  works_with_fleets?: boolean;
  internal_classification?: string;
  latitude?: number;
  longitude?: number;
}

export const ORDER_TYPE_LABELS: Record<OrderType, string> = {
  spot: "Spot",
  recorrente: "Recorrente",
};

const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  pending: "Pendente",
  confirmed: "Confirmado",
  invoiced: "Faturado",
  shipped: "Enviado",
  delivered: "Entregue",
  cancelled: "Cancelado",
};

export function useOrders(statusFilter?: OrderStatus | "all") {
  return useQuery({
    queryKey: ["carboze-orders", statusFilter],
    queryFn: async () => {
      let query = supabase
        .from("carboze_orders_secure")
        .select(`
          *,
          licensee:licensees(id, name, code)
        `)
        .order("created_at", { ascending: false });

      if (statusFilter && statusFilter !== "all") {
        query = query.eq("status", statusFilter);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as CarbozeOrder[];
    },
  });
}

export function useOrder(id: string | undefined) {
  return useQuery({
    queryKey: ["carboze-order", id],
    queryFn: async () => {
      if (!id) return null;
      const { data, error } = await supabase
        .from("carboze_orders_secure")
        .select(`
          *,
          licensee:licensees(id, name, code)
        `)
        .eq("id", id)
        .single();
      if (error) throw error;
      return data as CarbozeOrder;
    },
    enabled: !!id,
  });
}

export function useCreateOrder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: OrderInsert) => {
      const { data: user } = await supabase.auth.getUser();
      
      // Calculate commission if applicable
      let commissionAmount = 0;
      if (data.has_commission && data.commission_rate) {
        commissionAmount = data.total * (data.commission_rate / 100);
      }

      const { data: result, error } = await supabase
        .from("carboze_orders")
        .insert({
          ...data,
          order_number: "", // Auto-generated by trigger
          commission_amount: commissionAmount,
          created_by: user.user?.id,
        })
        .select()
        .single();

      if (error) throw error;

      // Add to status history
      await supabase.from("order_status_history").insert({
        order_id: result.id,
        status: "pending",
        notes: "Pedido criado",
        changed_by: user.user?.id,
      });

      // ── Auto-generate Production Order(s) ────────────────────────────────
      // For each line item that has a product_id (SKU), create one OP
      type RawItem = { product_id?: string; name?: string; quantity?: number };
      const lineItems = (Array.isArray(data.items) ? data.items : []) as RawItem[];
      const opRows = lineItems
        .filter((item) => item.product_id && item.quantity && item.quantity > 0)
        .map((item) => ({
          sku_id:           item.product_id!,
          planned_quantity: item.quantity!,
          demand_source:    "venda" as const,
          op_status:        "planejada" as const,
          linked_order_ids: [result.id],
          title:            `OP-${result.order_number || "Venda"}: ${item.name || item.product_id} × ${item.quantity}`,
          priority:         3,
        }));

      // Fallback: if no items have sku but top-level sku_id is set
      if (opRows.length === 0 && data.sku_id) {
        const totalQty = lineItems.reduce((s, i) => s + (i.quantity || 0), 0) || 1;
        opRows.push({
          sku_id:           data.sku_id,
          planned_quantity: totalQty,
          demand_source:    "venda" as const,
          op_status:        "planejada" as const,
          linked_order_ids: [result.id],
          title:            `OP-${result.order_number || "Venda"}`,
          priority:         3,
        });
      }

      if (opRows.length > 0) {
        await supabase.from("production_orders").insert(opRows);
      }

      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["carboze-orders"] });
      queryClient.invalidateQueries({ queryKey: ["production-orders"] });
      toast.success("Pedido criado e OP gerada automaticamente!");
    },
    onError: (error: Error) => {
      toast.error("Erro ao criar pedido: " + error.message);
    },
  });
}

export function useUpdateOrder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...data }: { id: string } & Partial<Omit<CarbozeOrder, 'id' | 'order_number' | 'created_at' | 'updated_at' | 'licensee'>>) => {
      const { data: result, error } = await supabase
        .from("carboze_orders")
        .update(data)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return result;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["carboze-orders"] });
      queryClient.invalidateQueries({ queryKey: ["carboze-order", variables.id] });
      toast.success("Pedido atualizado com sucesso!");
    },
    onError: (error: Error) => {
      toast.error("Erro ao atualizar pedido: " + error.message);
    },
  });
}

export function useOrderStats() {
  return useQuery({
    queryKey: ["order-stats"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("carboze_orders_secure")
        .select("status, total, has_commission, commission_amount");

      if (error) throw error;

      const stats = {
        total: data.length,
        pending: data.filter((o) => o.status === "pending").length,
        confirmed: data.filter((o) => o.status === "confirmed").length,
        shipped: data.filter((o) => o.status === "shipped").length,
        delivered: data.filter((o) => o.status === "delivered").length,
        cancelled: data.filter((o) => o.status === "cancelled").length,
        totalRevenue: data
          .filter((o) => o.status === "delivered")
          .reduce((sum, o) => sum + Number(o.total || 0), 0),
        totalCommissions: data
          .filter((o) => o.has_commission && o.status === "delivered")
          .reduce((sum, o) => sum + Number(o.commission_amount || 0), 0),
      };

      return stats;
    },
  });
}

export function useOrderHistory(orderId: string | undefined) {
  return useQuery({
    queryKey: ["order-history", orderId],
    queryFn: async () => {
      if (!orderId) return [];
      const { data, error } = await supabase
        .from("order_status_history")
        .select("*")
        .eq("order_id", orderId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data;
    },
    enabled: !!orderId,
  });
}

export { ORDER_STATUS_LABELS };

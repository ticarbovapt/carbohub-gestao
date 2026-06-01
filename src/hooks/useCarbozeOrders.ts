import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { Json } from "@/integrations/supabase/types";
import { useAuth } from "@/contexts/AuthContext";
import { useFunctionAccess, ENFORCEMENT_ACTIVE } from "@/hooks/useFunctionAccess";

export type OrderStatus = "quote" | "pending" | "confirmed" | "invoiced" | "shipped" | "delivered" | "cancelled";
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
  // Data corrigida da venda (head/command podem alterar para ajuste de mês/semana)
  sale_date: string | null;             // YYYY-MM-DD; NULL = usar created_at
  // Nota Fiscal (vinculada via order_number na observação do Bling)
  nf_access_key: string | null;         // chave de acesso 44 dígitos NF-e
  bling_nf_id: number | null;           // ID interno da NF no Bling
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
  quote: "Orçamento",
  pending: "Pendente",
  confirmed: "Confirmado",
  invoiced: "Faturado",
  shipped: "Enviado",
  delivered: "Entregue",
  cancelled: "Cancelado",
};

export function useOrders(statusFilter?: OrderStatus | "all") {
  const { user } = useAuth();
  const { dataScope } = useFunctionAccess();
  const ownOnly = ENFORCEMENT_ACTIVE && dataScope === "proprio" && !!user?.id;

  return useQuery({
    queryKey: ["carboze-orders", statusFilter, ownOnly ? user?.id : "all"],
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

      // Escopo "próprio" → vendedor vê apenas seus próprios pedidos
      if (ownOnly) {
        query = query.eq("vendedor_id", user!.id);
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

// ── Efeitos colaterais de fulfillment de uma VENDA ───────────────────────────
// Gera Ordem(ns) de Produção e dá baixa no estoque do Hub Natal.
// É chamado ao criar uma venda direta E ao converter um orçamento em venda.
// NUNCA é chamado para orçamentos (status 'quote').
async function applyOrderFulfillment(
  result: { id: string; order_number?: string | null },
  items: Json,
  skuId: string | null | undefined,
  userId: string | undefined,
) {
  type RawItem = { product_id?: string; name?: string; quantity?: number; product_code?: string };
  const lineItems = (Array.isArray(items) ? items : []) as RawItem[];

  // Ordens de Produção (uma por item com SKU)
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

  if (opRows.length === 0 && skuId) {
    const totalQty = lineItems.reduce((s, i) => s + (i.quantity || 0), 0) || 1;
    opRows.push({
      sku_id:           skuId,
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

  // Baixa de estoque no Hub Natal
  const { data: natWh } = await supabase.from("warehouses").select("id").ilike("name", "%natal%").limit(1);
  const natId = (natWh as any)?.[0]?.id as string | undefined;

  if (natId && lineItems.length > 0) {
    const productCodes = [...new Set(lineItems.map((i) => i.product_code).filter(Boolean))];
    if (productCodes.length > 0) {
      const { data: mrpProds } = await (supabase as any)
        .from("mrp_products")
        .select("id, product_code, current_stock_qty")
        .in("product_code", productCodes);
      const prodMap = new Map<string, any>((mrpProds || []).map((p: any) => [p.product_code, p]));

      for (const item of lineItems as any[]) {
        const mrpProd = prodMap.get(item.product_code);
        if (!mrpProd || !item.quantity || item.quantity <= 0) continue;

        const { data: ws } = await (supabase as any)
          .from("warehouse_stock")
          .select("id, quantity")
          .eq("product_id", mrpProd.id)
          .eq("warehouse_id", natId)
          .maybeSingle();

        if (ws) {
          await (supabase as any)
            .from("warehouse_stock")
            .update({ quantity: Math.max(0, (ws.quantity || 0) - item.quantity), updated_at: new Date().toISOString() })
            .eq("id", ws.id);
        }

        const newQty = Math.max(0, ((mrpProd.current_stock_qty as number) || 0) - item.quantity);
        await (supabase as any)
          .from("mrp_products")
          .update({ current_stock_qty: newQty, stock_updated_at: new Date().toISOString().split("T")[0] })
          .eq("id", mrpProd.id);

        await (supabase as any).from("stock_movements").insert({
          product_id:  mrpProd.id,
          tipo:        "saida",
          quantidade:  item.quantity,
          origem:      "pedido",
          origem_id:   result.id,
          warehouse_id: natId,
          observacoes: `Venda — pedido ${result.order_number || result.id.slice(0, 8)}`,
          created_by:  userId ?? null,
        });
      }
    }
  }
}

function calcCommission(data: OrderInsert): number {
  return data.has_commission && data.commission_rate
    ? data.total * (data.commission_rate / 100)
    : 0;
}

export function useCreateOrder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: OrderInsert) => {
      const { data: user } = await supabase.auth.getUser();

      const { data: result, error } = await supabase
        .from("carboze_orders")
        .insert({
          ...data,
          order_number: "", // Auto-generated by trigger
          commission_amount: calcCommission(data),
          created_by: user.user?.id,
        })
        .select()
        .single();

      if (error) throw error;

      await supabase.from("order_status_history").insert({
        order_id: result.id,
        status: "pending",
        notes: "Pedido criado",
        changed_by: user.user?.id,
      });

      // Venda direta → gera OP + baixa estoque
      await applyOrderFulfillment(result, data.items, data.sku_id, user.user?.id);

      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["carboze-orders"] });
      queryClient.invalidateQueries({ queryKey: ["production-orders"] });
      queryClient.invalidateQueries({ queryKey: ["warehouse-stock-all"] });
      queryClient.invalidateQueries({ queryKey: ["mrp-products-stock"] });
      queryClient.invalidateQueries({ queryKey: ["suprimentos-kpis"] });
      toast.success("Pedido criado e OP gerada automaticamente!");
    },
    onError: (error: Error) => {
      toast.error("Erro ao criar pedido: " + error.message);
    },
  });
}

// ── Orçamento: salva como rascunho (status 'quote') SEM gerar OP/estoque ──────
export function useCreateQuote() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: OrderInsert) => {
      const { data: user } = await supabase.auth.getUser();

      const { data: result, error } = await supabase
        .from("carboze_orders")
        .insert({
          ...data,
          status: "quote",
          order_number: "", // Auto-generated by trigger
          commission_amount: calcCommission(data),
          created_by: user.user?.id,
        })
        .select()
        .single();

      if (error) throw error;

      await supabase.from("order_status_history").insert({
        order_id: result.id,
        status: "quote",
        notes: "Orçamento criado",
        changed_by: user.user?.id,
      });

      // Orçamento NÃO gera OP nem movimenta estoque.
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["carboze-orders"] });
      toast.success("Orçamento salvo!");
    },
    onError: (error: Error) => {
      toast.error("Erro ao salvar orçamento: " + error.message);
    },
  });
}

// ── Converter orçamento aprovado em venda (aí sim dispara OP + estoque) ───────
export function useConvertQuoteToOrder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (quoteId: string) => {
      const { data: user } = await supabase.auth.getUser();

      const { data: order, error } = await supabase
        .from("carboze_orders")
        .update({ status: "pending", confirmed_at: new Date().toISOString() })
        .eq("id", quoteId)
        .eq("status", "quote") // só converte se ainda for orçamento (idempotente)
        .select()
        .single();

      if (error) throw error;
      if (!order) throw new Error("Orçamento não encontrado ou já convertido.");

      await supabase.from("order_status_history").insert({
        order_id: order.id,
        status: "pending",
        notes: "Orçamento aprovado e convertido em venda",
        changed_by: user.user?.id,
      });

      // Agora sim: gera OP + baixa estoque
      await applyOrderFulfillment(order, order.items, order.sku_id, user.user?.id);

      return order;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["carboze-orders"] });
      queryClient.invalidateQueries({ queryKey: ["production-orders"] });
      queryClient.invalidateQueries({ queryKey: ["warehouse-stock-all"] });
      queryClient.invalidateQueries({ queryKey: ["mrp-products-stock"] });
      queryClient.invalidateQueries({ queryKey: ["suprimentos-kpis"] });
      toast.success("Orçamento convertido em venda! OP gerada.");
    },
    onError: (error: Error) => {
      toast.error("Erro ao converter orçamento: " + error.message);
    },
  });
}

// ── Atualiza um orçamento existente (mantém status 'quote'; sem OP/estoque) ────
export function useUpdateQuote() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...data }: { id: string } & OrderInsert) => {
      const { data: result, error } = await supabase
        .from("carboze_orders")
        .update({ ...data, commission_amount: calcCommission(data) })
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["carboze-orders"] });
      toast.success("Orçamento atualizado!");
    },
    onError: (error: Error) => {
      toast.error("Erro ao atualizar orçamento: " + error.message);
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

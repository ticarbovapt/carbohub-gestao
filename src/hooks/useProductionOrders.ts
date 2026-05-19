import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

// ============================================================
// Types
// ============================================================

export type OpStatus =
  | "rascunho"
  | "planejada"
  | "aguardando_separacao"
  | "separada"
  | "aguardando_liberacao"
  | "liberada_producao"
  | "em_producao"
  | "aguardando_confirmacao"
  | "confirmada"
  | "aguardando_qualidade"
  | "liberada"
  | "concluida"
  | "bloqueada"
  | "cancelada";

export type DemandSource = "venda" | "recorrencia" | "safety_stock" | "pcp_manual";

export type QualityResult = "aprovada" | "bloqueada" | "reprovada" | "pendente";

export interface ProductionOrder {
  id: string;
  op_number: string | null;
  sku_id: string;
  planned_quantity: number;
  good_quantity: number | null;
  rejected_quantity: number | null;
  linked_order_ids: string[] | null;
  demand_source: DemandSource;
  need_date: string | null;
  priority: number;
  suggested_lot_id: string | null;
  confirmed_lot_id: string | null;
  pcp_responsible_id: string | null;
  operator_id: string | null;
  started_at: string | null;
  finished_at: string | null;
  quality_result: QualityResult;
  destination_warehouse_id: string | null;
  deviation_notes: string | null;
  op_status: OpStatus;
  created_at: string;
  updated_at: string;
  // Legacy fields (may not exist in all DB versions)
  title?: string | null;
  description?: string | null;
  quantity: number | null;
  status: string | null;
  source: string | null;
  // Denormalized (joined)
  sku_name?: string;
  sku_code?: string;
}

export interface ProductionOrderInsert {
  title?: string;
  sku_id: string;
  planned_quantity: number;
  demand_source: DemandSource;
  need_date?: string | null;
  priority?: number;
  suggested_lot_id?: string | null;
  pcp_responsible_id?: string | null;
  destination_warehouse_id?: string | null;
  deviation_notes?: string | null;
  op_status?: OpStatus;
  linked_order_ids?: string[] | null;
}

export interface ProductionOrderUpdate {
  sku_id?: string;
  planned_quantity?: number;
  good_quantity?: number | null;
  rejected_quantity?: number | null;
  linked_order_ids?: string[] | null;
  demand_source?: DemandSource;
  need_date?: string | null;
  priority?: number;
  suggested_lot_id?: string | null;
  confirmed_lot_id?: string | null;
  pcp_responsible_id?: string | null;
  operator_id?: string | null;
  started_at?: string | null;
  finished_at?: string | null;
  quality_result?: QualityResult;
  destination_warehouse_id?: string | null;
  deviation_notes?: string | null;
  op_status?: OpStatus;
}

export interface ProductionOrderMaterial {
  id: string;
  production_order_id: string;
  product_id: string;
  theoretical_quantity: number;
  separated_quantity: number;
  is_separated: boolean;
  separated_at: string | null;
  separated_by: string | null;
  is_critical: boolean;
  warehouse_id: string | null;
  // Denormalized (joined)
  product_name?: string;
}

// ============================================================
// Constants
// ============================================================

export const OP_STATUS_LABELS: Record<OpStatus, string> = {
  rascunho: "Rascunho",
  planejada: "Planejada",
  aguardando_separacao: "Aguard. Separação",
  separada: "Separada",
  aguardando_liberacao: "Aguard. Liberação",
  liberada_producao: "Liberada p/ Produção",
  em_producao: "Em Produção",
  aguardando_confirmacao: "Aguard. Confirmação",
  confirmada: "Confirmada",
  aguardando_qualidade: "Aguard. Qualidade",
  liberada: "Liberada",
  concluida: "Concluída",
  bloqueada: "Bloqueada",
  cancelada: "Cancelada",
};

export const OP_STATUS_COLORS: Record<OpStatus, string> = {
  rascunho: "bg-gray-500",
  planejada: "bg-blue-500",
  aguardando_separacao: "bg-amber-500",
  separada: "bg-cyan-500",
  aguardando_liberacao: "bg-indigo-500",
  liberada_producao: "bg-teal-500",
  em_producao: "bg-orange-500",
  aguardando_confirmacao: "bg-purple-500",
  confirmada: "bg-violet-500",
  aguardando_qualidade: "bg-yellow-500",
  liberada: "bg-emerald-500",
  concluida: "bg-green-600",
  bloqueada: "bg-red-500",
  cancelada: "bg-gray-400",
};

export const OP_STATUS_TRANSITIONS: Record<OpStatus, OpStatus[]> = {
  rascunho: ["planejada", "cancelada"],
  planejada: ["aguardando_separacao", "cancelada"],
  aguardando_separacao: ["separada", "bloqueada"],
  separada: ["aguardando_liberacao"],
  aguardando_liberacao: ["liberada_producao", "bloqueada"],
  liberada_producao: ["em_producao"],
  em_producao: ["aguardando_confirmacao", "bloqueada"],
  aguardando_confirmacao: ["confirmada"],
  confirmada: ["aguardando_qualidade", "liberada"],
  aguardando_qualidade: ["liberada", "bloqueada"],
  liberada: ["concluida"],
  concluida: [],
  bloqueada: ["planejada", "cancelada"],
  cancelada: [],
};

export const DEMAND_SOURCE_LABELS: Record<DemandSource, string> = {
  venda: "Venda",
  recorrencia: "Recorrência",
  safety_stock: "Safety Stock",
  pcp_manual: "PCP Manual",
};

export const PRIORITY_LABELS: Record<number, string> = {
  1: "Urgente",
  2: "Alta",
  3: "Normal",
  4: "Baixa",
  5: "Planejado",
};

// ============================================================
// Queries
// ============================================================

export function useProductionOrdersOP() {
  return useQuery({
    queryKey: ["production_orders_op"],
    queryFn: async (): Promise<ProductionOrder[]> => {
      const { data, error } = await (supabase as any)
        .from("production_orders")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;

      // Fetch SKU names and codes
      const skuIds = [...new Set((data || []).map((o: any) => o.sku_id).filter(Boolean))];

      const skuRes = skuIds.length > 0
        ? await (supabase as any).from("sku").select("id, name, code").in("id", skuIds)
        : { data: [] };

      const skuMap = new Map(
        (skuRes.data || []).map((s: any) => [s.id, { name: s.name, code: s.code }])
      );

      return (data || []).map((order: any) => {
        const sku = skuMap.get(order.sku_id);
        return {
          ...order,
          sku_name: sku?.name || "—",
          sku_code: sku?.code || "—",
        };
      });
    },
  });
}

export function useProductionOrderOP(id: string | undefined) {
  return useQuery({
    queryKey: ["production_order_op", id],
    enabled: !!id,
    queryFn: async (): Promise<(ProductionOrder & { materials: ProductionOrderMaterial[] }) | null> => {
      if (!id) return null;

      const { data, error } = await (supabase as any)
        .from("production_orders")
        .select("*")
        .eq("id", id)
        .single();

      if (error) throw error;

      // Fetch materials
      const { data: materials, error: matError } = await (supabase as any)
        .from("production_order_material")
        .select("*")
        .eq("production_order_id", id)
        .order("is_critical", { ascending: false });

      if (matError) throw matError;

      // Fetch product names for materials
      const productIds = [...new Set((materials || []).map((m: any) => m.product_id).filter(Boolean))];
      const prodRes = productIds.length > 0
        ? await (supabase as any).from("mrp_products").select("id, name").in("id", productIds)
        : { data: [] };

      const prodMap = new Map((prodRes.data || []).map((p: any) => [p.id, p.name]));

      const enrichedMaterials: ProductionOrderMaterial[] = (materials || []).map((m: any) => ({
        ...m,
        product_name: prodMap.get(m.product_id) || "—",
      }));

      // Fetch SKU info
      let skuName = "—";
      let skuCode = "—";
      if (data.sku_id) {
        const { data: skuData } = await (supabase as any)
          .from("sku")
          .select("name, code")
          .eq("id", data.sku_id)
          .single();
        if (skuData) {
          skuName = skuData.name;
          skuCode = skuData.code;
        }
      }

      return {
        ...data,
        sku_name: skuName,
        sku_code: skuCode,
        materials: enrichedMaterials,
      };
    },
  });
}

export function useProductionOrderMaterials(orderId: string | undefined) {
  return useQuery({
    queryKey: ["production_order_materials", orderId],
    enabled: !!orderId,
    queryFn: async (): Promise<ProductionOrderMaterial[]> => {
      if (!orderId) return [];

      const { data, error } = await (supabase as any)
        .from("production_order_material")
        .select("*")
        .eq("production_order_id", orderId)
        .order("is_critical", { ascending: false });

      if (error) throw error;

      // Fetch product names
      const productIds = [...new Set((data || []).map((m: any) => m.product_id).filter(Boolean))];
      const prodRes = productIds.length > 0
        ? await (supabase as any).from("mrp_products").select("id, name").in("id", productIds)
        : { data: [] };

      const prodMap = new Map((prodRes.data || []).map((p: any) => [p.id, p.name]));

      return (data || []).map((m: any) => ({
        ...m,
        product_name: prodMap.get(m.product_id) || "—",
      }));
    },
  });
}

// ============================================================
// Mutations
// ============================================================

export function useCreateProductionOrderOP() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (order: ProductionOrderInsert) => {
      const { data, error } = await (supabase as any)
        .from("production_orders")
        .insert({
          ...order,
          op_status: order.op_status || "rascunho",
          priority: order.priority ?? 3,
          quality_result: "pendente",
        })
        .select()
        .single();
      if (error) throw error;
      return data as ProductionOrder;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["production_orders_op"] });
      toast.success("Ordem de Produção criada com sucesso!");
    },
    onError: (e: Error) => toast.error("Erro ao criar OP: " + e.message),
  });
}

export function useUpdateProductionOrderOP() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: ProductionOrderUpdate & { id: string }) => {
      const { data, error } = await (supabase as any)
        .from("production_orders")
        .update(updates)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data as ProductionOrder;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["production_orders_op"] });
      qc.invalidateQueries({ queryKey: ["production_order_op", data.id] });
      toast.success("Ordem de Produção atualizada!");
    },
    onError: (e: Error) => toast.error("Erro ao atualizar OP: " + e.message),
  });
}

export function useDeleteProductionOrderOP() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      // 1. Fetch the OP to check if it was completed (stock was credited/debited)
      const { data: op } = await (supabase as any)
        .from("production_orders")
        .select("op_status, good_quantity")
        .eq("id", id)
        .single();

      const wasCompleted = op && ["confirmada", "concluida"].includes(op.op_status);

      if (wasCompleted) {
        // 2. Fetch all stock movements created by this OP
        const { data: movements } = await supabase
          .from("stock_movements")
          .select("id, product_id, tipo, quantidade, warehouse_id")
          .eq("origem", "OP")
          .eq("origem_id", id);

        const { data: userData } = await supabase.auth.getUser();
        const userId = userData.user?.id;

        // 3. Reverse each movement: entrada→saida and vice-versa
        for (const mov of (movements || []) as any[]) {
          const reverseTipo = mov.tipo === "entrada" ? "saida" : "entrada";

          // Create reversal movement
          await supabase.from("stock_movements").insert({
            product_id:  mov.product_id,
            tipo:        reverseTipo,
            quantidade:  mov.quantidade,
            origem:      "ajuste",
            observacoes: `Estorno automático — OP excluída (${id.slice(0, 8)})`,
            created_by:  userId ?? null,
            warehouse_id: mov.warehouse_id ?? null,
          } as any);

          // Update mrp_products.current_stock_qty
          const { data: product } = await supabase
            .from("mrp_products")
            .select("current_stock_qty")
            .eq("id", mov.product_id)
            .single();

          if (product) {
            const current = (product as any).current_stock_qty || 0;
            const newQty = reverseTipo === "entrada"
              ? current + mov.quantidade
              : Math.max(0, current - mov.quantidade);

            await supabase
              .from("mrp_products")
              .update({ current_stock_qty: newQty, stock_updated_at: new Date().toISOString().split("T")[0] })
              .eq("id", mov.product_id);
          }

          // Update warehouse_stock if movement had a warehouse
          if (mov.warehouse_id) {
            const { data: ws } = await (supabase as any)
              .from("warehouse_stock")
              .select("id, quantity")
              .eq("product_id", mov.product_id)
              .eq("warehouse_id", mov.warehouse_id)
              .maybeSingle();

            if (ws) {
              const newWsQty = reverseTipo === "entrada"
                ? ws.quantity + mov.quantidade
                : Math.max(0, ws.quantity - mov.quantidade);
              await (supabase as any)
                .from("warehouse_stock")
                .update({ quantity: newWsQty, updated_at: new Date().toISOString() })
                .eq("id", ws.id);
            }
          }
        }
      }

      // 4. Delete the OP record
      const { error } = await (supabase as any)
        .from("production_orders")
        .delete()
        .eq("id", id);
      if (error) throw error;

      return { wasCompleted };
    },
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ["production_orders_op"] });
      qc.invalidateQueries({ queryKey: ["mrp-products"] });
      qc.invalidateQueries({ queryKey: ["mrp-products-stock"] });
      qc.invalidateQueries({ queryKey: ["warehouse-stock"] });
      qc.invalidateQueries({ queryKey: ["warehouse-stock-all"] });
      qc.invalidateQueries({ queryKey: ["suprimentos-kpis"] });
      qc.invalidateQueries({ queryKey: ["stock-movements"] });
      if (result?.wasCompleted) {
        toast.success("OP excluída e estoque revertido automaticamente.");
      } else {
        toast.success("Ordem de Produção removida!");
      }
    },
    onError: (e: Error) => toast.error("Erro ao remover OP: " + e.message),
  });
}

export function useExplodeBOM() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      orderId,
      skuId,
      plannedQuantity,
    }: {
      orderId: string;
      skuId: string;
      plannedQuantity: number;
    }) => {
      // Fetch the active BOM for the SKU
      const { data: bomData, error: bomError } = await (supabase as any)
        .from("sku_bom")
        .select("*")
        .eq("sku_id", skuId)
        .eq("is_active", true)
        .single();

      if (bomError) throw new Error("BOM ativa não encontrada para este SKU.");
      if (!bomData || !bomData.items || bomData.items.length === 0) {
        throw new Error("BOM ativa não possui itens.");
      }

      // Build material rows from BOM items
      const materials = (bomData.items as Array<{ product_id: string; quantity_per_unit: number; is_critical: boolean }>).map(
        (item) => ({
          production_order_id: orderId,
          product_id: item.product_id,
          theoretical_quantity: item.quantity_per_unit * plannedQuantity,
          separated_quantity: 0,
          is_separated: false,
          is_critical: item.is_critical,
        })
      );

      // Insert all materials
      const { error: insertError } = await (supabase as any)
        .from("production_order_material")
        .insert(materials);

      if (insertError) throw insertError;

      return materials;
    },
    onSuccess: (_, variables) => {
      qc.invalidateQueries({ queryKey: ["production_order_materials", variables.orderId] });
      qc.invalidateQueries({ queryKey: ["production_order_op", variables.orderId] });
      toast.success("BOM explodida — materiais criados!");
    },
    onError: (e: Error) => toast.error("Erro ao explodir BOM: " + e.message),
  });
}

export function useUpdateMaterialSeparation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      separated_quantity,
      is_separated,
      orderId,
    }: {
      id: string;
      separated_quantity: number;
      is_separated: boolean;
      orderId: string;
    }) => {
      const updatePayload: Record<string, any> = {
        separated_quantity,
        is_separated,
      };

      if (is_separated) {
        const { data: userData } = await supabase.auth.getUser();
        updatePayload.separated_at = new Date().toISOString();
        updatePayload.separated_by = userData.user?.id || null;
      }

      const { data, error } = await (supabase as any)
        .from("production_order_material")
        .update(updatePayload)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return { ...data, orderId };
    },
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ["production_order_materials", result.orderId] });
      qc.invalidateQueries({ queryKey: ["production_order_op", result.orderId] });
      toast.success("Separação atualizada!");
    },
    onError: (e: Error) => toast.error("Erro ao atualizar separação: " + e.message),
  });
}

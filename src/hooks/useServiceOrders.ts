import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { OsStage, OsServiceType, ServiceOrderCarboVAPT } from "@/types/os";
import { getNextOsStage } from "@/types/os";

// ── Stock deduction helper: 1 VAPT reagent from Hub Natal on OS completion ──
async function deductVaptReagent(osId: string) {
  const { data: wh } = await supabase.from("warehouses").select("id").ilike("name", "%natal%").limit(1);
  const warehouseId = (wh as any)?.[0]?.id as string | undefined;
  if (!warehouseId) return;

  const { data: products } = await (supabase as any)
    .from("mrp_products")
    .select("id, current_stock_qty")
    .or("product_code.ilike.%VAPT70%,name.ilike.%Reagente CarboVapt%")
    .limit(1);
  const product = (products as any)?.[0];
  if (!product) return;

  const { data: ws } = await (supabase as any)
    .from("warehouse_stock")
    .select("id, quantity")
    .eq("product_id", product.id)
    .eq("warehouse_id", warehouseId)
    .maybeSingle();

  if (ws) {
    await (supabase as any)
      .from("warehouse_stock")
      .update({ quantity: Math.max(0, (ws.quantity || 0) - 1), updated_at: new Date().toISOString() })
      .eq("id", ws.id);
  }

  const newQty = Math.max(0, ((product.current_stock_qty as number) || 0) - 1);
  await (supabase as any)
    .from("mrp_products")
    .update({ current_stock_qty: newQty, stock_updated_at: new Date().toISOString().split("T")[0] })
    .eq("id", product.id);

  const { data: authData } = await supabase.auth.getUser();
  await (supabase as any).from("stock_movements").insert({
    product_id:  product.id,
    tipo:        "saida",
    quantidade:  1,
    origem:      "OS",
    origem_id:   osId,
    warehouse_id: warehouseId,
    observacoes: "Reagente consumido na descarbonização",
    created_by:  authData.user?.id ?? null,
  });
}

// ── Stock check helper: verify Hub Natal has >= 1 VAPT reagent ──
export async function checkVaptStockNatal(): Promise<{ ok: boolean; available: number }> {
  const { data: wh } = await supabase.from("warehouses").select("id").ilike("name", "%natal%").limit(1);
  const warehouseId = (wh as any)?.[0]?.id as string | undefined;
  if (!warehouseId) return { ok: true, available: 0 }; // warehouse not found — let through

  const { data: products } = await (supabase as any)
    .from("mrp_products")
    .select("id, current_stock_qty")
    .or("product_code.ilike.%VAPT70%,name.ilike.%Reagente CarboVapt%")
    .limit(1);
  const product = (products as any)?.[0];
  if (!product) return { ok: true, available: 0 };

  const { data: ws } = await (supabase as any)
    .from("warehouse_stock")
    .select("quantity")
    .eq("product_id", product.id)
    .eq("warehouse_id", warehouseId)
    .maybeSingle();

  const available = (ws as any)?.quantity ?? (product.current_stock_qty as number) ?? 0;
  return { ok: available >= 1, available };
}

// ============================================================
// Queries
// ============================================================

export function useServiceOrders(stage?: OsStage) {
  return useQuery({
    queryKey: ["service-orders-carbovapt", stage],
    queryFn: async () => {
      let q = supabase
        .from("service_orders")
        .select("*, customer:customers(*)")
        .order("created_at", { ascending: false });

      if (stage) {
        q = q.eq("os_stage", stage);
      }

      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as ServiceOrderCarboVAPT[];
    },
  });
}

export function useServiceOrderDetail(id: string) {
  return useQuery({
    queryKey: ["service-order-detail", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("service_orders")
        .select("*, customer:customers(*)")
        .eq("id", id)
        .single();
      if (error) throw error;
      return data as ServiceOrderCarboVAPT;
    },
    enabled: !!id,
  });
}

export function useOSStats() {
  return useQuery({
    queryKey: ["os-stats-carbovapt"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("service_orders")
        .select("os_stage, scheduled_at, created_at");
      if (error) throw error;

      const rows = (data ?? []) as Array<{
        os_stage: OsStage | null;
        scheduled_at: string | null;
        created_at: string;
      }>;

      const today = new Date().toISOString().split("T")[0];
      const monthStart = new Date();
      monthStart.setDate(1);

      const activeStages: OsStage[] = [
        "nova", "qualificacao", "agendamento", "confirmada", "em_execucao", "pos_servico",
      ];

      const total = rows.filter((r) => r.os_stage && activeStages.includes(r.os_stage)).length;
      const agendadasHoje = rows.filter(
        (r) => r.scheduled_at && r.scheduled_at.startsWith(today)
      ).length;
      const emExecucao = rows.filter((r) => r.os_stage === "em_execucao").length;
      const concluidasMes = rows.filter(
        (r) =>
          r.os_stage === "concluida" &&
          new Date(r.created_at) >= monthStart
      ).length;

      return { total, agendadasHoje, emExecucao, concluidasMes };
    },
  });
}

// ============================================================
// Mutations
// ============================================================

interface CreateOSPayload {
  title: string;
  service_type: OsServiceType;
  customer_name?: string;
  vehicle_plate?: string;
  vehicle_model?: string;
  priority?: number;
  scheduled_at?: string | null;
  description?: string;
  assigned_to?: string | null;
  metadata?: Record<string, unknown>;
}

export function useCreateServiceOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: CreateOSPayload) => {
      // 1. Require authenticated user — this was the cause of the NOT NULL error
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado. Faça login novamente.");

      // 2. Generate sequential OS number via DB function
      const { data: osNumber } = await supabase.rpc("generate_os_number", {
        p_service_type: payload.service_type,
      });
      const finalOsNumber = (osNumber as string) || `OS-${Date.now()}`;

      // 3. Use provided title or fall back to the generated OS number
      const finalTitle = (payload.title && payload.title.trim())
        ? payload.title.trim()
        : finalOsNumber;

      const { data, error } = await supabase
        .from("service_orders")
        .insert({
          title: finalTitle,
          os_number: finalOsNumber,
          service_type: payload.service_type,
          customer_name: payload.customer_name ?? null,
          vehicle_plate: payload.vehicle_plate ?? null,
          vehicle_model: payload.vehicle_model ?? null,
          priority: payload.priority ?? 3,
          scheduled_at: payload.scheduled_at ?? null,
          description: payload.description ?? null,
          assigned_to: payload.assigned_to ?? null,
          os_stage: "nova",
          status: "active",
          current_department: "venda",
          metadata: payload.metadata ?? {},
          created_by: user.id,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["service-orders-carbovapt"] });
      qc.invalidateQueries({ queryKey: ["os-stats-carbovapt"] });
      toast.success("Ordem de Serviço criada com sucesso!");
    },
    onError: (err: Error) => {
      toast.error(`Erro ao criar OS: ${err.message}`);
    },
  });
}

export function useUpdateServiceOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      updates,
    }: {
      id: string;
      updates: Partial<ServiceOrderCarboVAPT>;
    }) => {
      const { data, error } = await supabase
        .from("service_orders")
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["service-orders-carbovapt"] });
      qc.invalidateQueries({ queryKey: ["os-stats-carbovapt"] });
      toast.success("OS atualizada!");
    },
    onError: (err: Error) => {
      toast.error(`Erro ao atualizar OS: ${err.message}`);
    },
  });
}

export function useAdvanceOSStage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (order: ServiceOrderCarboVAPT) => {
      const next = getNextOsStage(order.os_stage);
      if (!next) throw new Error("OS já está na etapa final.");

      const updates: Record<string, unknown> = {
        os_stage: next,
        updated_at: new Date().toISOString(),
      };

      if (next === "em_execucao") {
        updates.executed_at = new Date().toISOString();
        updates.status = "active";
      }
      if (next === "concluida") {
        updates.completed_at = new Date().toISOString();
        updates.status = "completed";
      }

      const { error } = await supabase
        .from("service_orders")
        .update(updates)
        .eq("id", order.id);
      if (error) throw error;

      if (next === "concluida" && order.service_type && ["b2c", "b2b"].includes(order.service_type)) {
        await deductVaptReagent(order.id);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["service-orders-carbovapt"] });
      qc.invalidateQueries({ queryKey: ["os-stats-carbovapt"] });
      qc.invalidateQueries({ queryKey: ["warehouse-stock-all"] });
      qc.invalidateQueries({ queryKey: ["mrp-products-stock"] });
      qc.invalidateQueries({ queryKey: ["suprimentos-kpis"] });
      toast.success("Etapa avançada!");
    },
    onError: (err: Error) => {
      toast.error(`Erro: ${err.message}`);
    },
  });
}

export function useSetOSStage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, stage }: { id: string; stage: OsStage }) => {
      const updates: Record<string, unknown> = {
        os_stage: stage,
        updated_at: new Date().toISOString(),
      };
      if (stage === "em_execucao") {
        updates.executed_at = new Date().toISOString();
        updates.status = "active";
      }
      if (stage === "concluida") {
        updates.completed_at = new Date().toISOString();
        updates.status = "completed";
      }
      const { error } = await supabase
        .from("service_orders")
        .update(updates)
        .eq("id", id);
      if (error) throw error;

      if (stage === "concluida") {
        const { data: osData } = await (supabase as any)
          .from("service_orders").select("service_type").eq("id", id).single();
        if (osData && ["b2c", "b2b"].includes(osData.service_type || "")) {
          await deductVaptReagent(id);
        }
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["service-orders-carbovapt"] });
      qc.invalidateQueries({ queryKey: ["os-stats-carbovapt"] });
      qc.invalidateQueries({ queryKey: ["warehouse-stock-all"] });
      qc.invalidateQueries({ queryKey: ["mrp-products-stock"] });
      qc.invalidateQueries({ queryKey: ["suprimentos-kpis"] });
      toast.success("Etapa atualizada!");
    },
    onError: (err: Error) => toast.error(`Erro: ${err.message}`),
  });
}

export function useMarkOSCancelled() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason?: string }) => {
      const { error } = await supabase
        .from("service_orders")
        .update({
          os_stage: "cancelada",
          cancelled_reason: reason ?? null,
          status: "cancelled",
          updated_at: new Date().toISOString(),
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["service-orders-carbovapt"] });
      qc.invalidateQueries({ queryKey: ["os-stats-carbovapt"] });
      toast.success("OS cancelada.");
    },
    onError: (err: Error) => {
      toast.error(`Erro ao cancelar OS: ${err.message}`);
    },
  });
}

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { OsStage, OsServiceType, ServiceOrderCarboVAPT } from "@/types/os";
import { getNextOsStage } from "@/types/os";

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
      const { data, error } = await supabase
        .from("service_orders")
        .insert({
          title: payload.title,
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
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["service-orders-carbovapt"] });
      qc.invalidateQueries({ queryKey: ["os-stats-carbovapt"] });
      toast.success("Etapa avançada!");
    },
    onError: (err: Error) => {
      toast.error(`Erro: ${err.message}`);
    },
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

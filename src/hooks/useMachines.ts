import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { Json } from "@/integrations/supabase/types";

export type MachineStatus = "operational" | "maintenance" | "offline" | "retired";

export interface Machine {
  id: string;
  machine_id: string;
  model: string;
  serial_number: string | null;
  licensee_id: string | null;
  location_address: string | null;
  location_city: string | null;
  location_state: string | null;
  latitude: number | null;
  longitude: number | null;
  status: MachineStatus;
  last_maintenance_date: string | null;
  next_maintenance_date: string | null;
  installation_date: string | null;
  total_units_dispensed: number;
  units_since_last_refill: number;
  capacity: number;
  low_stock_threshold: number;
  total_credits_generated: number;
  current_price_per_unit: number;
  has_active_alert: boolean;
  last_alert_message: string | null;
  last_alert_at: string | null;
  notes: string | null;
  metadata: Json;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  // Joined data
  licensee?: {
    id: string;
    name: string;
    code: string;
  } | null;
}

export interface MachineInsert {
  machine_id?: string;
  model: string;
  serial_number?: string;
  licensee_id?: string;
  location_address?: string;
  location_city?: string;
  location_state?: string;
  latitude?: number;
  longitude?: number;
  status?: MachineStatus;
  installation_date?: string;
  capacity?: number;
  low_stock_threshold?: number;
  current_price_per_unit?: number;
  notes?: string;
}

export function useMachines(statusFilter?: MachineStatus | "all", licenseeId?: string) {
  return useQuery({
    queryKey: ["machines", statusFilter, licenseeId],
    queryFn: async () => {
      let query = supabase
        .from("machines")
        .select(`
          *,
          licensee:licensees(id, name, code)
        `)
        .order("created_at", { ascending: false });

      if (statusFilter && statusFilter !== "all") {
        query = query.eq("status", statusFilter);
      }

      if (licenseeId) {
        query = query.eq("licensee_id", licenseeId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as Machine[];
    },
  });
}

export function useMachine(id: string | undefined) {
  return useQuery({
    queryKey: ["machine", id],
    queryFn: async () => {
      if (!id) return null;
      const { data, error } = await supabase
        .from("machines")
        .select(`
          *,
          licensee:licensees(id, name, code)
        `)
        .eq("id", id)
        .single();
      if (error) throw error;
      return data as Machine;
    },
    enabled: !!id,
  });
}

export function useCreateMachine() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: MachineInsert) => {
      const { data: user } = await supabase.auth.getUser();
      const { data: result, error } = await supabase
        .from("machines")
        .insert({
          ...data,
          machine_id: data.machine_id || "", // trigger gera YY-NNN se vazio
          created_by: user.user?.id,
        })
        .select()
        .single();

      if (error) throw error;
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["machines"] });
      toast.success("Máquina criada com sucesso!");
    },
    onError: (error: Error) => {
      toast.error("Erro ao criar máquina: " + error.message);
    },
  });
}

export function useUpdateMachine() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...data }: { id: string } & Partial<MachineInsert>) => {
      const { data: result, error } = await supabase
        .from("machines")
        .update(data)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return result;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["machines"] });
      queryClient.invalidateQueries({ queryKey: ["machine", variables.id] });
      toast.success("Máquina atualizada com sucesso!");
    },
    onError: (error: Error) => {
      toast.error("Erro ao atualizar máquina: " + error.message);
    },
  });
}

export function useMachineStats() {
  return useQuery({
    queryKey: ["machine-stats"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("machines")
        .select("status, has_active_alert, total_units_dispensed, total_credits_generated, units_since_last_refill, low_stock_threshold");

      if (error) throw error;

      const stats = {
        total: data.length,
        operational: data.filter((m) => m.status === "operational").length,
        maintenance: data.filter((m) => m.status === "maintenance").length,
        offline: data.filter((m) => m.status === "offline").length,
        withAlerts: data.filter((m) => m.has_active_alert).length,
        lowStock: data.filter((m) => m.units_since_last_refill <= m.low_stock_threshold).length,
        totalDispensed: data.reduce((sum, m) => sum + (m.total_units_dispensed || 0), 0),
        totalCredits: data.reduce((sum, m) => sum + Number(m.total_credits_generated || 0), 0),
      };

      return stats;
    },
  });
}

export function useMachineAlerts() {
  return useQuery({
    queryKey: ["machine-alerts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("machines")
        .select(`
          id,
          machine_id,
          model,
          has_active_alert,
          last_alert_message,
          last_alert_at,
          units_since_last_refill,
          low_stock_threshold,
          capacity,
          status,
          licensee:licensees(name, code)
        `)
        .or("has_active_alert.eq.true,status.neq.operational")
        .order("last_alert_at", { ascending: false });

      if (error) throw error;

      // Also get low stock machines
      const lowStockMachines = (data || []).filter(
        (m) => m.units_since_last_refill <= m.low_stock_threshold
      );

      return {
        alerts: data || [],
        lowStock: lowStockMachines,
      };
    },
  });
}

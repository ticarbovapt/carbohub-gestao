import { useEffect, useCallback } from "react";
import { useQueryClient, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useMachines, useMachineAlerts } from "./useMachines";
import { useAuth } from "@/contexts/AuthContext";

interface LowStockMachine {
  id: string;
  machine_id: string;
  model: string;
  units_since_last_refill: number;
  low_stock_threshold: number;
  capacity: number;
  has_active_alert: boolean;
  licensee?: {
    name: string;
    code: string;
  } | null;
}

export function useMachineAlertNotifications() {
  const queryClient = useQueryClient();
  const { user, isManager } = useAuth();
  const { data: machines = [] } = useMachines("all");
  const { data: alertData } = useMachineAlerts();

  // Create notification for low stock
  const createLowStockNotification = useMutation({
    mutationFn: async (machine: LowStockMachine) => {
      if (!user?.id) return;

      // Check if notification already exists for this machine
      const { data: existingNotifications } = await supabase
        .from("notifications")
        .select("id")
        .eq("user_id", user.id)
        .eq("reference_type", "machine_low_stock")
        .eq("reference_id", machine.id)
        .eq("is_read", false);

      if (existingNotifications && existingNotifications.length > 0) {
        return; // Notification already exists
      }

      const stockPercentage = Math.round(
        ((machine.capacity - machine.units_since_last_refill) / machine.capacity) * 100
      );

      const { error } = await supabase.from("notifications").insert({
        user_id: user.id,
        type: "low_stock_alert",
        title: `⚠️ Estoque baixo: ${machine.machine_id}`,
        body: `A máquina ${machine.model} (${machine.machine_id}) está com ${stockPercentage}% de estoque. ${
          machine.licensee ? `Licenciado: ${machine.licensee.name}` : ""
        }`,
        reference_type: "machine_low_stock",
        reference_id: machine.id,
      });

      if (error) throw error;

      // Update machine to mark as having active alert
      if (!machine.has_active_alert) {
        await supabase
          .from("machines")
          .update({
            has_active_alert: true,
            last_alert_at: new Date().toISOString(),
            last_alert_message: `Estoque baixo (${stockPercentage}%)`,
          })
          .eq("id", machine.id);
      }
    },
  });

  // Check for low stock machines and create notifications
  const checkAndNotify = useCallback(() => {
    if (!isManager || !user?.id) return;

    const lowStockMachines = machines.filter((machine) => {
      const currentStock = machine.capacity - machine.units_since_last_refill;
      return currentStock <= machine.low_stock_threshold && machine.status === "operational";
    });

    lowStockMachines.forEach((machine) => {
      createLowStockNotification.mutate(machine as unknown as LowStockMachine);
    });
  }, [machines, isManager, user?.id, createLowStockNotification]);

  // Check for alerts on mount and when machines change
  useEffect(() => {
    if (machines.length > 0 && isManager) {
      checkAndNotify();
    }
  }, [machines, isManager, checkAndNotify]);

  // Show toast for critical alerts
  useEffect(() => {
    if (alertData && alertData.lowStock.length > 0 && isManager) {
      const criticalMachines = alertData.lowStock.filter((m) => {
        const capacity = (m as unknown as { capacity: number }).capacity || 100;
        const stockPercentage = ((capacity - m.units_since_last_refill) / capacity) * 100;
        return stockPercentage < 10;
      });

      if (criticalMachines.length > 0) {
        toast.warning(
          `${criticalMachines.length} máquina(s) com estoque crítico (<10%)!`,
          {
            description: "Verifique o painel de alertas para mais detalhes.",
            duration: 8000,
          }
        );
      }
    }
  }, [alertData, isManager]);

  return {
    lowStockCount: alertData?.lowStock.length || 0,
    alertsCount: alertData?.alerts.length || 0,
    checkAndNotify,
  };
}

// Hook to resolve low stock alerts when machine is refilled
export function useResolveLowStockAlert() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ machineId, refillUnits }: { machineId: string; refillUnits: number }) => {
      const { data: user } = await supabase.auth.getUser();
      
      // Get current machine data
      const { data: machine, error: fetchError } = await supabase
        .from("machines")
        .select("units_since_last_refill, capacity")
        .eq("id", machineId)
        .single();

      if (fetchError) throw fetchError;

      const newStock = machine.capacity - machine.units_since_last_refill + refillUnits;
      const newUnits = Math.max(0, machine.units_since_last_refill - refillUnits);

      // Update machine
      const { error: updateError } = await supabase
        .from("machines")
        .update({
          units_since_last_refill: newUnits,
          has_active_alert: false,
          last_alert_at: null,
          last_alert_message: null,
        })
        .eq("id", machineId);

      if (updateError) throw updateError;

      // Add consumption history record
      await supabase.from("machine_consumption_history").insert({
        machine_id: machineId,
        date: new Date().toISOString().split("T")[0],
        refill_units: refillUnits,
      });

      // Mark related notifications as read
      if (user.user?.id) {
        await supabase
          .from("notifications")
          .update({ is_read: true })
          .eq("reference_type", "machine_low_stock")
          .eq("reference_id", machineId)
          .eq("user_id", user.user.id);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["machines"] });
      queryClient.invalidateQueries({ queryKey: ["machine-alerts"] });
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      toast.success("Reabastecimento registrado e alerta resolvido!");
    },
    onError: (error: Error) => {
      toast.error("Erro ao registrar reabastecimento: " + error.message);
    },
  });
}

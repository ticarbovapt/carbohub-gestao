import { useEffect, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";

interface MachineAlert {
  id: string;
  machine_id: string;
  model: string;
  capacity: number;
  units_since_last_refill: number;
  low_stock_threshold: number;
  has_active_alert: boolean;
  status: string;
}

export function useRealtimeMachineAlerts() {
  const queryClient = useQueryClient();
  const { user, isManager } = useAuth();

  const checkStockLevel = useCallback((machine: MachineAlert) => {
    const currentStock = machine.capacity - machine.units_since_last_refill;
    const stockPercentage = (currentStock / machine.capacity) * 100;
    return {
      isLow: currentStock <= machine.low_stock_threshold,
      isCritical: stockPercentage < 10,
      percentage: Math.round(stockPercentage),
    };
  }, []);

  const createNotification = useCallback(async (machine: MachineAlert, stockInfo: { percentage: number }) => {
    if (!user?.id) return;

    try {
      // Check if notification already exists
      const { data: existing } = await supabase
        .from("notifications")
        .select("id")
        .eq("user_id", user.id)
        .eq("reference_type", "machine_low_stock")
        .eq("reference_id", machine.id)
        .eq("is_read", false)
        .limit(1);

      if (existing && existing.length > 0) return;

      await supabase.from("notifications").insert({
        user_id: user.id,
        type: "low_stock_alert",
        title: `⚠️ Estoque baixo: ${machine.machine_id}`,
        body: `A máquina ${machine.model} (${machine.machine_id}) está com ${stockInfo.percentage}% de estoque.`,
        reference_type: "machine_low_stock",
        reference_id: machine.id,
      });
    } catch (error) {
      console.error("Error creating notification:", error);
    }
  }, [user?.id]);

  useEffect(() => {
    if (!isManager || !user?.id) return;

    // Subscribe to machine changes
    const channel = supabase
      .channel("machine-stock-alerts")
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "machines",
        },
        (payload) => {
          const machine = payload.new as MachineAlert;
          const stockInfo = checkStockLevel(machine);

          if (stockInfo.isLow) {
            // Show toast notification
            toast.warning(`Estoque baixo: ${machine.machine_id}`, {
              description: `${machine.model} está com ${stockInfo.percentage}% de estoque`,
              duration: 8000,
            });

            // Create persistent notification
            createNotification(machine, stockInfo);

            // Invalidate queries to refresh UI
            queryClient.invalidateQueries({ queryKey: ["machines"] });
            queryClient.invalidateQueries({ queryKey: ["machine-alerts"] });
            queryClient.invalidateQueries({ queryKey: ["notifications"] });
          }

          if (stockInfo.isCritical) {
            // Critical alert - more prominent
            toast.error(`🚨 Estoque crítico: ${machine.machine_id}`, {
              description: `Apenas ${stockInfo.percentage}% restante! Ação imediata necessária.`,
              duration: 15000,
            });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [isManager, user?.id, queryClient, checkStockLevel, createNotification]);

  return null;
}

// Provider component to use at app level
import React from "react";

export function RealtimeMachineAlertsProvider({ children }: { children: React.ReactNode }) {
  useRealtimeMachineAlerts();
  return React.createElement(React.Fragment, null, children);
}

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface SalesTarget {
  id: string;
  vendedor_id: string;
  month: string; // ISO date: 2026-04-01
  target_amount: number;
  target_qty: number;
  linha: string | null;
  created_at: string;
  updated_at: string;
  // Joined
  vendedor?: { id: string; full_name: string | null };
}

export interface SalesTargetWithProgress extends SalesTarget {
  actual_amount: number;
  actual_qty: number;
  pct_amount: number;
  pct_qty: number;
}

export function useSalesTargets(month?: string) {
  return useQuery({
    queryKey: ["sales-targets", month],
    queryFn: async () => {
      let query = supabase
        .from("sales_targets")
        .select(`
          *,
          vendedor:profiles(id, full_name)
        `)
        .order("month", { ascending: false });

      if (month) {
        query = query.eq("month", month);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as SalesTarget[];
    },
  });
}

export function useSalesTargetsWithProgress(month: string) {
  return useQuery({
    queryKey: ["sales-targets-progress", month],
    queryFn: async () => {
      // Fetch targets
      const { data: targets, error: targetsError } = await supabase
        .from("sales_targets")
        .select(`*, vendedor:profiles(id, full_name)`)
        .eq("month", month);

      if (targetsError) throw targetsError;

      // Fetch actual orders for the month
      const monthStart = month;
      const monthEnd = new Date(new Date(month).getFullYear(), new Date(month).getMonth() + 1, 0)
        .toISOString()
        .split("T")[0];

      const { data: orders, error: ordersError } = await supabase
        .from("carboze_orders_secure")
        .select("vendedor_id, vendedor_name, total, items, linha, status")
        .gte("created_at", monthStart)
        .lte("created_at", monthEnd + "T23:59:59Z")
        .eq("status", "delivered");

      if (ordersError) throw ordersError;

      // Calculate progress per vendedor
      const progressMap: Record<string, { amount: number; qty: number }> = {};
      for (const order of orders || []) {
        if (!order.vendedor_id) continue;
        if (!progressMap[order.vendedor_id]) {
          progressMap[order.vendedor_id] = { amount: 0, qty: 0 };
        }
        progressMap[order.vendedor_id].amount += Number(order.total || 0);
        const items = Array.isArray(order.items) ? order.items : [];
        progressMap[order.vendedor_id].qty += items.reduce(
          (sum: number, item: any) => sum + (item.quantity || 0),
          0
        );
      }

      return (targets || []).map((t): SalesTargetWithProgress => {
        const progress = progressMap[t.vendedor_id] || { amount: 0, qty: 0 };
        return {
          ...t,
          actual_amount: progress.amount,
          actual_qty: progress.qty,
          pct_amount: t.target_amount > 0 ? Math.round((progress.amount / t.target_amount) * 100) : 0,
          pct_qty: t.target_qty > 0 ? Math.round((progress.qty / t.target_qty) * 100) : 0,
        };
      });
    },
  });
}

export function useUpsertSalesTarget() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      vendedor_id: string;
      month: string;
      target_amount: number;
      target_qty: number;
      linha?: string | null;
    }) => {
      const { data: result, error } = await supabase
        .from("sales_targets")
        .upsert(
          { ...data, updated_at: new Date().toISOString() },
          { onConflict: "vendedor_id,month,linha" }
        )
        .select()
        .single();

      if (error) throw error;
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sales-targets"] });
      queryClient.invalidateQueries({ queryKey: ["sales-targets-progress"] });
      toast.success("Meta salva!");
    },
    onError: (error: Error) => {
      toast.error("Erro ao salvar meta: " + error.message);
    },
  });
}

export function useDeleteSalesTarget() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("sales_targets").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sales-targets"] });
      queryClient.invalidateQueries({ queryKey: ["sales-targets-progress"] });
      toast.success("Meta removida.");
    },
  });
}

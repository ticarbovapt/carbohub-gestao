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
  vendedor?: {
    id: string;
    full_name: string | null;
    avatar_url: string | null;
    department: string | null;
    secondary_department: string | null;
  };
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
          vendedor:profiles(id, full_name, avatar_url, department, secondary_department)
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

const POLL_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes

export function useSalesTargetsWithProgress(month: string) {
  return useQuery({
    queryKey: ["sales-targets-progress", month],
    refetchInterval: POLL_INTERVAL_MS,
    refetchIntervalInBackground: false,
    queryFn: async () => {
      // Fetch targets
      const { data: targets, error: targetsError } = await supabase
        .from("sales_targets")
        .select(`*, vendedor:profiles(id, full_name, avatar_url, department, secondary_department)`)
        .eq("month", month);

      if (targetsError) throw targetsError;

      // Fetch actual orders for the month
      // Parse month string directly to avoid UTC-vs-local timezone bug
      const [yearNum, monNum] = month.split("-").map(Number);
      const lastDay = new Date(yearNum, monNum, 0).getDate();
      const monthStart = `${month}T00:00:00Z`;
      const monthEnd = `${yearNum}-${String(monNum).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

      const { data: ordersRaw } = await supabase
        .from("carboze_orders")
        .select("vendedor_id, total, items, status")
        .gte("created_at", monthStart)
        .lte("created_at", monthEnd + "T23:59:59Z");

      const orders = (ordersRaw || []).filter(o => o.status !== "cancelled");

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
      // Manual upsert: functional unique index on COALESCE(linha,'') is not
      // resolvable via PostgREST onConflict column names.
      let existingQuery = supabase
        .from("sales_targets")
        .select("id")
        .eq("vendedor_id", data.vendedor_id)
        .eq("month", data.month);

      existingQuery = data.linha
        ? existingQuery.eq("linha", data.linha)
        : existingQuery.is("linha", null);

      const { data: existing } = await existingQuery.maybeSingle();

      const payload = { ...data, updated_at: new Date().toISOString() };

      if (existing?.id) {
        const { data: result, error } = await supabase
          .from("sales_targets")
          .update(payload)
          .eq("id", existing.id)
          .select()
          .single();
        if (error) throw error;
        return result;
      }

      const { data: result, error } = await supabase
        .from("sales_targets")
        .insert(payload)
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

export interface WeeklyTopEntry {
  rank: number;
  vendedor_id: string;
  total: number;
  profile: { id: string; full_name: string | null; avatar_url: string | null; department: string | null; secondary_department: string | null } | null;
}

// Commercial week: starts Friday, ends Thursday.
// Capped to the 1st of the current month — if the Friday that started
// this week belongs to the previous month, sales from the new month
// already count toward the new month's targets.
function commercialWeekStart(): Date {
  const now = new Date();
  const dow = now.getDay(); // 0=Sun … 6=Sat
  const daysSinceFriday = dow >= 5 ? dow - 5 : dow + 2;
  const friday = new Date(now);
  friday.setDate(now.getDate() - daysSinceFriday);
  friday.setHours(0, 0, 0, 0);

  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  return friday >= monthStart ? friday : monthStart;
}

export function useWeeklyTopVendedores() {
  return useQuery({
    queryKey: ["weekly-top-vendedores"],
    refetchInterval: POLL_INTERVAL_MS,
    refetchIntervalInBackground: false,
    queryFn: async () => {
      const weekStart = commercialWeekStart();

      const { data: ordersRaw } = await supabase
        .from("carboze_orders")
        .select("vendedor_id, total, status")
        .gte("created_at", weekStart.toISOString());

      const orders = (ordersRaw || []).filter(o => o.status !== "cancelled" && o.vendedor_id);
      const totals: Record<string, number> = {};
      for (const order of orders || []) {
        if (!order.vendedor_id) continue;
        totals[order.vendedor_id] = (totals[order.vendedor_id] || 0) + Number(order.total || 0);
      }

      const topIds = Object.entries(totals)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 3)
        .map(([id]) => id);

      if (topIds.length === 0) return [];

      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name, avatar_url, department, secondary_department")
        .in("id", topIds);

      return topIds.map((id, idx): WeeklyTopEntry => ({
        rank: idx + 1,
        vendedor_id: id,
        total: totals[id],
        profile: profiles?.find(p => p.id === id) ?? null,
      }));
    },
  });
}

export interface WeeklyVendedorEntry {
  rank: number;
  vendedor_id: string;
  total: number;
  count: number;
  profile: {
    id: string;
    full_name: string | null;
    avatar_url: string | null;
    department: string | null;
    secondary_department: string | null;
  } | null;
}

export function useWeeklyVendedoresData(teamFilter?: "todos" | "cgc" | "expansao") {
  return useQuery({
    refetchInterval: POLL_INTERVAL_MS,
    refetchIntervalInBackground: false,
    queryKey: ["weekly-vendedores-data", teamFilter],
    queryFn: async () => {
      const weekStart = commercialWeekStart();

      const { data: ordersRaw } = await supabase
        .from("carboze_orders")
        .select("vendedor_id, total, status")
        .gte("created_at", weekStart.toISOString());

      const orders = (ordersRaw || []).filter(o => o.status !== "cancelled" && o.vendedor_id);
      const totals: Record<string, { total: number; count: number }> = {};
      for (const order of orders || []) {
        if (!order.vendedor_id) continue;
        if (!totals[order.vendedor_id]) totals[order.vendedor_id] = { total: 0, count: 0 };
        totals[order.vendedor_id].total += Number(order.total || 0);
        totals[order.vendedor_id].count += 1;
      }

      const vendedorIds = Object.keys(totals);
      let profiles: Array<{id:string;full_name:string|null;avatar_url:string|null;department:string|null;secondary_department:string|null}> = [];
      if (vendedorIds.length > 0) {
        const { data } = await supabase
          .from("profiles")
          .select("id, full_name, avatar_url, department, secondary_department")
          .in("id", vendedorIds);
        profiles = data || [];
      }

      let entries: WeeklyVendedorEntry[] = Object.entries(totals)
        .sort(([, a], [, b]) => b.total - a.total)
        .map(([id, d], idx) => ({
          rank: idx + 1,
          vendedor_id: id,
          total: d.total,
          count: d.count,
          profile: profiles.find(p => p.id === id) ?? null,
        }));

      if (teamFilter && teamFilter !== "todos") {
        entries = entries
          .filter(e => e.profile?.department === teamFilter || e.profile?.secondary_department === teamFilter)
          .map((e, idx) => ({ ...e, rank: idx + 1 }));
      }

      return entries;
    },
  });
}

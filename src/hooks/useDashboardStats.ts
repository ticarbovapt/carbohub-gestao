import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { startOfDay, endOfDay, startOfWeek, endOfWeek } from "date-fns";

export interface DashboardStats {
  totalOS: number;
  completedOS: number;
  activeOS: number;
  completionRate: number;
  pendingChecklists: number;
  completedChecklists: number;
  avgCompletionTime: number | null;
  weeklyEfficiency: number;
}

export interface RecentChecklist {
  id: string;
  department: string;
  service_order_id: string;
  os_number: string;
  os_title: string;
  completed_by_name: string | null;
  completed_at: string | null;
  is_completed: boolean;
  created_at: string;
}

export function useDashboardStats(period: "today" | "week" | "month" = "today") {
  return useQuery({
    queryKey: ["dashboard-stats", period],
    queryFn: async (): Promise<DashboardStats> => {
      const now = new Date();
      let startDate: Date;
      let endDate: Date;

      switch (period) {
        case "today":
          startDate = startOfDay(now);
          endDate = endOfDay(now);
          break;
        case "week":
          startDate = startOfWeek(now, { weekStartsOn: 1 });
          endDate = endOfWeek(now, { weekStartsOn: 1 });
          break;
        case "month":
          startDate = new Date(now.getFullYear(), now.getMonth(), 1);
          endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
          break;
      }

      // Fetch service orders for the period
      const { data: serviceOrders, error: osError } = await supabase
        .from("service_orders")
        .select("id, status, created_at, completed_at, started_at")
        .gte("created_at", startDate.toISOString())
        .lte("created_at", endDate.toISOString());

      if (osError) throw osError;

      // Fetch checklists for the period
      const { data: checklists, error: checklistError } = await supabase
        .from("os_checklists")
        .select("id, is_completed, created_at, completed_at")
        .gte("created_at", startDate.toISOString())
        .lte("created_at", endDate.toISOString());

      if (checklistError) throw checklistError;

      const totalOS = serviceOrders?.length || 0;
      const completedOS = serviceOrders?.filter((os) => os.status === "completed").length || 0;
      const activeOS = serviceOrders?.filter((os) => os.status === "active").length || 0;

      const totalChecklists = checklists?.length || 0;
      const completedChecklists = checklists?.filter((c) => c.is_completed).length || 0;
      const pendingChecklists = totalChecklists - completedChecklists;

      const completionRate = totalChecklists > 0 
        ? Math.round((completedChecklists / totalChecklists) * 100 * 10) / 10 
        : 0;

      // Calculate average completion time (in minutes)
      const completedWithTime = checklists?.filter(
        (c) => c.is_completed && c.completed_at && c.created_at
      ) || [];
      
      let avgCompletionTime: number | null = null;
      if (completedWithTime.length > 0) {
        const totalTime = completedWithTime.reduce((acc, c) => {
          const start = new Date(c.created_at).getTime();
          const end = new Date(c.completed_at!).getTime();
          return acc + (end - start);
        }, 0);
        avgCompletionTime = Math.round(totalTime / completedWithTime.length / 1000 / 60); // in minutes
      }

      // Weekly efficiency (completed vs total OS this week)
      const weeklyEfficiency = totalOS > 0 
        ? Math.round((completedOS / totalOS) * 100 * 10) / 10 
        : 0;

      return {
        totalOS,
        completedOS,
        activeOS,
        completionRate,
        pendingChecklists,
        completedChecklists,
        avgCompletionTime,
        weeklyEfficiency,
      };
    },
  });
}

export function useRecentChecklists(limit: number = 10) {
  return useQuery({
    queryKey: ["recent-checklists", limit],
    queryFn: async (): Promise<RecentChecklist[]> => {
      // Fetch recent checklists with service order info
      const { data: checklists, error } = await supabase
        .from("os_checklists")
        .select(`
          id,
          department,
          service_order_id,
          completed_by,
          completed_at,
          is_completed,
          created_at,
          service_orders (
            os_number,
            title
          )
        `)
        .order("created_at", { ascending: false })
        .limit(limit);

      if (error) throw error;

      // Get completed_by names
      const completedByIds = checklists
        ?.map((c) => c.completed_by)
        .filter(Boolean) as string[];

      let profilesMap: Record<string, string> = {};
      if (completedByIds.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, full_name")
          .in("id", completedByIds);

        profilesMap = (profiles || []).reduce((acc, p) => {
          acc[p.id] = p.full_name || "Sem nome";
          return acc;
        }, {} as Record<string, string>);
      }

      return (checklists || []).map((c) => ({
        id: c.id,
        department: c.department,
        service_order_id: c.service_order_id,
        os_number: (c.service_orders as any)?.os_number || "-",
        os_title: (c.service_orders as any)?.title || "-",
        completed_by_name: c.completed_by ? profilesMap[c.completed_by] || null : null,
        completed_at: c.completed_at,
        is_completed: c.is_completed || false,
        created_at: c.created_at,
      }));
    },
  });
}

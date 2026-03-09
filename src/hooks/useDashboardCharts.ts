import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { subDays, format, startOfDay, endOfDay } from "date-fns";

export interface DailyTrendData {
  date: string;
  label: string;
  completed: number;
  pending: number;
  total: number;
}

export interface DepartmentDistribution {
  department: string;
  label: string;
  count: number;
  color: string;
}

import { DEPARTMENT_LABELS } from "@/constants/departments";

const DEPARTMENT_COLORS: Record<string, string> = {
  venda: "hsl(217, 91%, 40%)",
  preparacao: "hsl(45, 93%, 47%)",
  expedicao: "hsl(142, 76%, 36%)",
  operacao: "hsl(262, 83%, 58%)",
  pos_venda: "hsl(200, 98%, 39%)",
};

export function useChecklistTrend(days: number = 7) {
  return useQuery({
    queryKey: ["checklist-trend", days],
    queryFn: async (): Promise<DailyTrendData[]> => {
      const result: DailyTrendData[] = [];
      
      for (let i = days - 1; i >= 0; i--) {
        const date = subDays(new Date(), i);
        const startDate = startOfDay(date);
        const endDate = endOfDay(date);

        const { data: checklists, error } = await supabase
          .from("os_checklists")
          .select("id, is_completed")
          .gte("created_at", startDate.toISOString())
          .lte("created_at", endDate.toISOString());

        if (error) throw error;

        const completed = checklists?.filter((c) => c.is_completed).length || 0;
        const pending = checklists?.filter((c) => !c.is_completed).length || 0;

        result.push({
          date: format(date, "yyyy-MM-dd"),
          label: format(date, "dd/MM"),
          completed,
          pending,
          total: completed + pending,
        });
      }

      return result;
    },
  });
}

export function useOSTrend(days: number = 7) {
  return useQuery({
    queryKey: ["os-trend", days],
    queryFn: async (): Promise<DailyTrendData[]> => {
      const result: DailyTrendData[] = [];
      
      for (let i = days - 1; i >= 0; i--) {
        const date = subDays(new Date(), i);
        const startDate = startOfDay(date);
        const endDate = endOfDay(date);

        const { data: orders, error } = await supabase
          .from("service_orders")
          .select("id, status")
          .gte("created_at", startDate.toISOString())
          .lte("created_at", endDate.toISOString());

        if (error) throw error;

        const completed = orders?.filter((o) => o.status === "completed").length || 0;
        const pending = orders?.filter((o) => o.status !== "completed").length || 0;

        result.push({
          date: format(date, "yyyy-MM-dd"),
          label: format(date, "dd/MM"),
          completed,
          pending,
          total: completed + pending,
        });
      }

      return result;
    },
  });
}

export function useDepartmentDistribution() {
  return useQuery({
    queryKey: ["department-distribution"],
    queryFn: async (): Promise<DepartmentDistribution[]> => {
      const { data: orders, error } = await supabase
        .from("service_orders")
        .select("current_department");

      if (error) throw error;

      const counts: Record<string, number> = {};
      orders?.forEach((o) => {
        counts[o.current_department] = (counts[o.current_department] || 0) + 1;
      });

      return Object.entries(counts).map(([dept, count]) => ({
        department: dept,
        label: DEPARTMENT_LABELS[dept] || dept,
        count,
        color: DEPARTMENT_COLORS[dept] || "hsl(0, 0%, 50%)",
      }));
    },
  });
}

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type InsightSeverity = "critical" | "warning" | "stable";

export interface AIInsight {
  id: string;
  type: string;
  entity_id: string | null;
  entity_type: string | null;
  severity: InsightSeverity;
  message: string;
  recommendation: string | null;
  is_dismissed: boolean;
  created_at: string;
  metadata: Record<string, any> | null;
}

export interface ForecastSnapshot {
  id: string;
  entity: string;
  product_code: string | null;
  period_days: number;
  projected_volume: number | null;
  projected_revenue: number | null;
  risk_level: InsightSeverity;
  confidence: number | null;
  generated_at: string;
}

export function useAIInsights() {
  return useQuery({
    queryKey: ["ai-insights"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ai_insights")
        .select("*")
        .eq("is_dismissed", false)
        .order("created_at", { ascending: false })
        .limit(20);

      if (error) throw error;
      return (data || []) as AIInsight[];
    },
    staleTime: 60_000,
  });
}

export function useForecastSnapshots() {
  return useQuery({
    queryKey: ["forecast-snapshots"],
    queryFn: async () => {
      // Get latest forecasts (most recent generation)
      const { data, error } = await supabase
        .from("forecast_snapshots")
        .select("*")
        .order("generated_at", { ascending: false })
        .limit(30);

      if (error) throw error;
      return (data || []) as ForecastSnapshot[];
    },
    staleTime: 60_000,
  });
}

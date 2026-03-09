import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface AIRecommendation {
  type: "vapt" | "ze" | "credits" | "general";
  priority: "high" | "medium" | "low";
  title: string;
  description: string;
  actionLabel?: string;
}

interface RecommendationsResponse {
  recommendations: AIRecommendation[];
  source: "ai" | "rules";
  rateLimited?: boolean;
}

export function useAIRecommendations(licenseeId: string | undefined) {
  return useQuery({
    queryKey: ["ai-recommendations", licenseeId],
    queryFn: async (): Promise<RecommendationsResponse> => {
      if (!licenseeId) return { recommendations: [], source: "rules" };

      const { data, error } = await supabase.functions.invoke<RecommendationsResponse>(
        "licensee-ai-recommendations",
        {
          body: { licenseeId },
        }
      );

      if (error) {
        console.error("AI Recommendations error:", error);
        throw error;
      }

      return data || { recommendations: [], source: "rules" };
    },
    enabled: !!licenseeId,
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchInterval: 15 * 60 * 1000, // Refresh every 15 minutes
  });
}

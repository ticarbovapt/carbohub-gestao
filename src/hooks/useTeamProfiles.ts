import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface TeamProfile {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  department: string | null;
  status: string;
}

export function useTeamProfiles() {
  return useQuery({
    queryKey: ["team-profiles"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, avatar_url, department, status")
        .eq("status", "approved")
        .order("full_name", { ascending: true });

      if (error) throw error;
      return (data || []) as TeamProfile[];
    },
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });
}

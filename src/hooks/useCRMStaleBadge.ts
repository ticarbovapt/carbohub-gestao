/**
 * Returns count of CRM leads assigned to the current user with no activity in >7 days.
 * Used to display alert badge on the CRM nav item.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useCRMStaleBadge() {
  return useQuery({
    queryKey: ["crm-stale-badge"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return 0;

      const threshold = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

      // Count active leads (not terminal) with updated_at older than 7 days
      const { count } = await supabase
        .from("crm_leads")
        .select("id", { count: "exact", head: true })
        .eq("assigned_to", user.id)
        .lt("updated_at", threshold)
        .not("stage", "in", '("convertido","sem_interesse","parceiro","descartado","fechamento","ativo")');

      return count ?? 0;
    },
    refetchInterval: 5 * 60 * 1000, // refresh every 5 minutes
    staleTime: 3 * 60 * 1000,
  });
}

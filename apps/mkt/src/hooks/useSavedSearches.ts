import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { SearchCriteria } from "@/lib/mktFilter";

// Buscas salvas por usuário (RLS por dono). scope 'board' = dentro de um quadro;
// scope 'all' = entre quadros (usada na página Quadros).

const db = supabase as unknown as {
  from: (t: string) => any;
  auth: { getUser: () => Promise<{ data: { user: { id: string } | null } }> };
};

export interface SavedSearch {
  id: string; user_id: string; name: string; scope: "board" | "all";
  board_id: string | null; criteria: SearchCriteria; created_at: string;
}

export function useSavedSearches(scope: "board" | "all", boardId?: string | null) {
  return useQuery({
    queryKey: ["mkt", "saved-searches", scope, boardId ?? null],
    enabled: scope === "all" || !!boardId,
    queryFn: async (): Promise<SavedSearch[]> => {
      let q = db.from("mkt_saved_searches").select("*").eq("scope", scope).order("created_at");
      if (scope === "board" && boardId) q = q.eq("board_id", boardId);
      const res = await q;
      if (res.error) throw res.error;
      return (res.data ?? []) as SavedSearch[];
    },
  });
}

export function useSavedSearchMutations() {
  const qc = useQueryClient();
  const inval = () => qc.invalidateQueries({ queryKey: ["mkt", "saved-searches"] });

  const create = useMutation({
    mutationFn: async ({ name, scope, boardId, criteria }: { name: string; scope: "board" | "all"; boardId?: string | null; criteria: SearchCriteria }) => {
      const { data } = await db.auth.getUser();
      const res = await db.from("mkt_saved_searches").insert({
        user_id: data?.user?.id, name, scope, board_id: scope === "board" ? boardId : null, criteria,
      });
      if (res.error) throw res.error;
    },
    onSuccess: inval,
  });

  const remove = useMutation({
    mutationFn: async ({ id }: { id: string }) => {
      const res = await db.from("mkt_saved_searches").delete().eq("id", id);
      if (res.error) throw res.error;
    },
    onSuccess: inval,
  });

  return { create, remove };
}

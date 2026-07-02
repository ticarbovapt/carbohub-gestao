import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const db = supabase as unknown as { from: (t: string) => any; rpc: (fn: string, a?: any) => any };

export interface BlingVendedor {
  bling_id: string;
  nome: string;
  email: string | null;
  profile_id: string | null;
}

export function useBlingVendedores() {
  return useQuery({
    queryKey: ["bling_vendedores"],
    queryFn: async (): Promise<BlingVendedor[]> => {
      const { data, error } = await db
        .from("bling_vendedores")
        .select("bling_id, nome, email, profile_id")
        .order("nome");
      if (error) throw error;
      return (data ?? []).map((v: any) => ({ ...v, bling_id: String(v.bling_id) })) as BlingVendedor[];
    },
  });
}

export function useSetVendedorProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ blingId, profileId }: { blingId: string; profileId: string | null }) => {
      const { error } = await db.rpc("set_bling_vendedor_profile", {
        _bling_id: blingId,
        _profile_id: profileId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["bling_vendedores"] });
      toast.success("Vínculo salvo!");
    },
    onError: (e: Error) => toast.error("Erro ao salvar: " + e.message),
  });
}

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface DescarbClient {
  id: string;
  licensee_id: string;
  name: string;
  federal_code: string | null;
  phone: string | null;
  email: string | null;
  city: string | null;
  state: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export function useDescarbClients(licenseeId: string | undefined) {
  return useQuery({
    queryKey: ["descarb-clients", licenseeId],
    queryFn: async () => {
      if (!licenseeId) return [] as DescarbClient[];
      const { data, error } = await supabase
        .from("descarb_clients")
        .select("*")
        .eq("licensee_id", licenseeId)
        .order("name");
      if (error) throw error;
      return (data ?? []) as DescarbClient[];
    },
    enabled: !!licenseeId,
  });
}

export function useCreateDescarbClient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Omit<DescarbClient, "id" | "created_by" | "created_at" | "updated_at">) => {
      const { data: auth } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from("descarb_clients")
        .insert({ ...payload, created_by: auth.user?.id } as any)
        .select()
        .single();
      if (error) throw error;
      return data as DescarbClient;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["descarb-clients", vars.licensee_id] });
      toast.success("Cliente cadastrado!");
    },
    onError: (e: Error) => toast.error("Erro ao cadastrar cliente: " + e.message),
  });
}

export function useUpdateDescarbClient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, licensee_id, ...rest }: Partial<DescarbClient> & { id: string; licensee_id: string }) => {
      const { error } = await supabase
        .from("descarb_clients")
        .update(rest as any)
        .eq("id", id);
      if (error) throw error;
      return { id, licensee_id };
    },
    onSuccess: ({ licensee_id }) => {
      qc.invalidateQueries({ queryKey: ["descarb-clients", licensee_id] });
      toast.success("Cliente atualizado!");
    },
    onError: (e: Error) => toast.error("Erro: " + e.message),
  });
}

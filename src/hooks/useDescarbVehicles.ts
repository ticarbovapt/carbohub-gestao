import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface DescarbVehicle {
  id: string;
  client_id: string | null;
  licensee_id: string;
  license_plate: string;
  brand: string | null;
  model: string | null;
  year: number | null;
  fuel_type: string;
  kilometer: number | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export const FUEL_TYPE_LABELS: Record<string, string> = {
  flex:     "Flex (Gasolina/Etanol)",
  diesel:   "Diesel",
  gasolina: "Gasolina",
  gnv:      "GNV",
  eletrico: "Elétrico",
};

export function useDescarbVehicles(licenseeId: string | undefined, clientId?: string | null) {
  return useQuery({
    queryKey: ["descarb-vehicles", licenseeId, clientId ?? "all"],
    queryFn: async () => {
      if (!licenseeId) return [] as DescarbVehicle[];
      let q = supabase
        .from("descarb_vehicles")
        .select("*")
        .eq("licensee_id", licenseeId)
        .order("license_plate");
      if (clientId) q = q.eq("client_id", clientId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as DescarbVehicle[];
    },
    enabled: !!licenseeId,
  });
}

export function useCreateDescarbVehicle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Omit<DescarbVehicle, "id" | "created_by" | "created_at" | "updated_at">) => {
      const { data: auth } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from("descarb_vehicles")
        .insert({ ...payload, created_by: auth.user?.id } as any)
        .select()
        .single();
      if (error) throw error;
      return data as DescarbVehicle;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["descarb-vehicles", vars.licensee_id] });
      toast.success("Veículo cadastrado!");
    },
    onError: (e: Error) => toast.error("Erro ao cadastrar veículo: " + e.message),
  });
}

export function useUpdateDescarbVehicle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, licensee_id, ...rest }: Partial<DescarbVehicle> & { id: string; licensee_id: string }) => {
      const { error } = await supabase
        .from("descarb_vehicles")
        .update(rest as any)
        .eq("id", id);
      if (error) throw error;
      return { id, licensee_id };
    },
    onSuccess: ({ licensee_id }) => {
      qc.invalidateQueries({ queryKey: ["descarb-vehicles", licensee_id] });
      toast.success("Veículo atualizado!");
    },
    onError: (e: Error) => toast.error("Erro: " + e.message),
  });
}

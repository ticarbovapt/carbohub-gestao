import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface LicenseeReagentStock {
  id: string;
  licensee_id: string;
  qty_normal: number;
  qty_flex: number;
  qty_diesel: number;
  min_qty_alert: number;
  updated_at: string;
}

export interface ReagentMovement {
  id: string;
  licensee_id: string;
  descarb_sale_id: string | null;
  tipo: "consumo" | "reposicao" | "ajuste";
  reagent_type: "flex" | "diesel" | "normal";
  quantidade: number;
  saldo_apos: number | null;
  motivo: string | null;
  created_by: string | null;
  created_at: string;
}

export function useLicenseeReagentStock(licenseeId: string | undefined) {
  return useQuery({
    queryKey: ["licensee-reagent-stock", licenseeId],
    queryFn: async () => {
      if (!licenseeId) return null;
      const { data, error } = await supabase
        .from("licensee_reagent_stock")
        .select("*")
        .eq("licensee_id", licenseeId)
        .maybeSingle();
      if (error) throw error;
      return data as LicenseeReagentStock | null;
    },
    enabled: !!licenseeId,
  });
}

export function useReagentMovements(licenseeId: string | undefined) {
  return useQuery({
    queryKey: ["reagent-movements", licenseeId],
    queryFn: async () => {
      if (!licenseeId) return [] as ReagentMovement[];
      const { data, error } = await supabase
        .from("reagent_movements")
        .select("*")
        .eq("licensee_id", licenseeId)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as ReagentMovement[];
    },
    enabled: !!licenseeId,
  });
}

export function useUpsertReagentStock() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      payload: Partial<Omit<LicenseeReagentStock, "id" | "updated_at">> & { licensee_id: string }
    ) => {
      const { error } = await supabase
        .from("licensee_reagent_stock")
        .upsert(
          { ...payload, updated_at: new Date().toISOString() } as any,
          { onConflict: "licensee_id" }
        );
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["licensee-reagent-stock", vars.licensee_id] });
      toast.success("Estoque de reagentes atualizado!");
    },
    onError: (e: Error) => toast.error("Erro: " + e.message),
  });
}

export function useAddReagentMovement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Omit<ReagentMovement, "id" | "saldo_apos" | "created_at"> & { licensee_id: string }) => {
      const { data: auth } = await supabase.auth.getUser();

      // Insert movement
      const { error: movErr } = await supabase
        .from("reagent_movements")
        .insert({ ...payload, created_by: auth.user?.id } as any);
      if (movErr) throw movErr;

      // Update stock
      const { data: stock } = await supabase
        .from("licensee_reagent_stock")
        .select("*")
        .eq("licensee_id", payload.licensee_id)
        .maybeSingle();

      const field = `qty_${payload.reagent_type}` as "qty_flex" | "qty_diesel" | "qty_normal";
      const current = stock ? ((stock as any)[field] ?? 0) : 0;
      const updated = Math.max(0, current + payload.quantidade);

      await supabase
        .from("licensee_reagent_stock")
        .upsert(
          { licensee_id: payload.licensee_id, [field]: updated, updated_at: new Date().toISOString() } as any,
          { onConflict: "licensee_id" }
        );
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["licensee-reagent-stock", vars.licensee_id] });
      qc.invalidateQueries({ queryKey: ["reagent-movements", vars.licensee_id] });
      toast.success("Movimentação registrada!");
    },
    onError: (e: Error) => toast.error("Erro: " + e.message),
  });
}

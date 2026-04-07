import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export type Modality = "P" | "M" | "G" | "G+";
export type ReagentType = "flex" | "diesel" | "normal";
export type PaymentType = "credits" | "money" | "card" | "pix" | "invoice" | "indicator" | "carboflix";

export const MODALITY_INFO: Record<Modality, { label: string; desc: string; color: string; gradient: string }> = {
  P:    { label: "Veículos Leves",    desc: "Carros compactos e sedãs",           color: "#22c55e", gradient: "from-green-900/80 to-green-700/60" },
  M:    { label: "Veículos Médios",   desc: "Pickups, SUVs e utilitários",        color: "#3b82f6", gradient: "from-blue-900/80 to-blue-700/60" },
  G:    { label: "Veículos Grandes",  desc: "Caminhões e ônibus",                 color: "#f59e0b", gradient: "from-amber-900/80 to-amber-700/60" },
  "G+": { label: "Veículos Especiais",desc: "Embarcações e veículos especiais",   color: "#ef4444", gradient: "from-red-900/80 to-red-700/60" },
};

export const PAYMENT_LABELS: Record<PaymentType, string> = {
  credits:   "Créditos",
  money:     "Dinheiro",
  card:      "Cartão",
  pix:       "PIX",
  invoice:   "Fatura",
  indicator: "Indicação",
  carboflix: "CarboFlix",
};

export const REAGENT_TYPE_LABELS: Record<ReagentType, string> = {
  flex:   "Flex (Etanol/Gasolina)",
  diesel: "Diesel",
  normal: "Normal (Gasolina)",
};

export interface DescarbSale {
  id: string;
  licensee_id: string;
  machine_id: string | null;
  client_id: string | null;
  vehicle_id: string | null;
  modality: Modality;
  reagent_type: ReagentType;
  reagent_qty_used: number;
  payment_type: PaymentType;
  total_value: number;
  discount: number;
  is_pre_sale: boolean;
  pre_sale_status: string | null;
  preferred_date: string | null;
  executed_at: string | null;
  carboflix_cert_num: string | null;
  certificate_issued: boolean;
  notes: string | null;
  // Sprint E
  operador_name: string | null;
  indicador_name: string | null;
  machine_starts_used: number;
  had_restart: boolean;
  restart_reason: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  // joined
  descarb_clients?: { name: string; phone: string | null } | null;
  descarb_vehicles?: { license_plate: string; brand: string | null; model: string | null } | null;
}

export function useDescarbSales(licenseeId: string | undefined) {
  return useQuery({
    queryKey: ["descarb-sales", licenseeId],
    queryFn: async () => {
      if (!licenseeId) return [] as DescarbSale[];
      const { data, error } = await supabase
        .from("descarb_sales")
        .select("*, descarb_clients(name, phone), descarb_vehicles(license_plate, brand, model)")
        .eq("licensee_id", licenseeId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as DescarbSale[];
    },
    enabled: !!licenseeId,
  });
}

export interface CreateSalePayload {
  licensee_id: string;
  client_id: string | null;
  vehicle_id: string | null;
  modality: Modality;
  reagent_type?: ReagentType;
  reagent_qty_used: number;
  payment_type: PaymentType;
  total_value: number;
  discount: number;
  is_pre_sale: boolean;
  pre_sale_status?: string | null;
  preferred_date?: string | null;
  notes?: string | null;
  // Sprint E
  operador_name?: string | null;
  indicador_name?: string | null;
  machine_starts_used?: number;
  had_restart?: boolean;
  restart_reason?: string | null;
}

export function useCreateDescarbSale() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: CreateSalePayload) => {
      const { data: auth } = await supabase.auth.getUser();
      const licenseeId = payload.licensee_id;

      // 1. Insert sale
      const { data: sale, error: saleErr } = await supabase
        .from("descarb_sales")
        .insert({
          ...payload,
          reagent_type: payload.reagent_type ?? "flex",
          machine_starts_used: payload.machine_starts_used ?? 1,
          had_restart: payload.had_restart ?? false,
          restart_reason: payload.restart_reason ?? null,
          operador_name: payload.operador_name ?? null,
          indicador_name: payload.indicador_name ?? null,
          created_by: auth.user?.id,
          executed_at: payload.is_pre_sale ? null : new Date().toISOString(),
          pre_sale_status: payload.is_pre_sale ? "NOT" : null,
        } as any)
        .select()
        .single();
      if (saleErr) throw saleErr;

      // 2. Reagent consumption (only for real sales)
      if (!payload.is_pre_sale && payload.reagent_qty_used > 0) {
        // Insert movement record
        await supabase
          .from("reagent_movements")
          .insert({
            licensee_id: licenseeId,
            descarb_sale_id: (sale as any).id,
            tipo: "consumo",
            reagent_type: payload.reagent_type,
            quantidade: -Math.abs(payload.reagent_qty_used),
            motivo: `Atendimento ${payload.modality}`,
            created_by: auth.user?.id,
          } as any);

        // Read + update stock
        const { data: stock } = await supabase
          .from("licensee_reagent_stock")
          .select("*")
          .eq("licensee_id", licenseeId)
          .maybeSingle();

        const field = `qty_${payload.reagent_type}` as "qty_flex" | "qty_diesel" | "qty_normal";
        const current = stock ? ((stock as any)[field] ?? 0) : 0;
        const updated = Math.max(0, current - payload.reagent_qty_used);

        await supabase
          .from("licensee_reagent_stock")
          .upsert(
            { licensee_id: licenseeId, [field]: updated, updated_at: new Date().toISOString() } as any,
            { onConflict: "licensee_id" }
          );
      }

      return sale;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["descarb-sales", vars.licensee_id] });
      qc.invalidateQueries({ queryKey: ["licensee-reagent-stock", vars.licensee_id] });
      qc.invalidateQueries({ queryKey: ["reagent-movements", vars.licensee_id] });
      toast.success(vars.is_pre_sale ? "Pré-atendimento registrado!" : "Atendimento registrado com sucesso!");
    },
    onError: (e: Error) => toast.error("Erro ao registrar: " + e.message),
  });
}

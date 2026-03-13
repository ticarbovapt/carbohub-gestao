import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

// ---- Types ----

export type LotStatus =
  | "criado"
  | "recebido"
  | "em_quarentena"
  | "amostrado"
  | "aprovado"
  | "bloqueado"
  | "reprovado"
  | "encerrado";

export type QualityResult = "aprovada" | "bloqueada" | "reprovada" | "pendente";

export interface InventoryLot {
  id: string;
  lot_code: string;
  product_id: string;
  initial_volume_ml: number;
  available_volume_ml: number;
  status: LotStatus;
  supplier_id: string | null;
  received_at: string | null;
  released_at: string | null;
  expired_at: string | null;
  quality_responsible_id: string | null;
  expected_samples: number;
  collected_samples: number;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  // Joined fields
  product_name?: string;
  supplier_name?: string;
}

export interface LotInsert {
  product_id: string;
  initial_volume_ml: number;
  supplier_id?: string | null;
  received_at?: string | null;
  expired_at?: string | null;
  expected_samples?: number;
  notes?: string | null;
}

export interface LotUpdate {
  status?: LotStatus;
  available_volume_ml?: number;
  received_at?: string | null;
  released_at?: string | null;
  expired_at?: string | null;
  quality_responsible_id?: string | null;
  expected_samples?: number;
  collected_samples?: number;
  notes?: string | null;
}

export interface QualityCheck {
  id: string;
  entity_type: "lot" | "production_order";
  entity_id: string;
  checklist_items: Array<{ item: string; checked: boolean; notes: string }>;
  result: QualityResult;
  checked_by: string | null;
  checked_at: string | null;
  notes: string | null;
  created_at: string;
}

export interface LotConsumption {
  id: string;
  lot_id: string;
  production_order_id: string;
  volume_consumed_ml: number;
  consumed_at: string;
  consumed_by: string | null;
}

// ---- Hooks ----

export function useLots() {
  return useQuery({
    queryKey: ["inventory_lots"],
    queryFn: async (): Promise<InventoryLot[]> => {
      const { data, error } = await (supabase as any)
        .from("inventory_lot")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;

      // Fetch product names
      const productIds = [...new Set((data || []).map((l: any) => l.product_id))];
      const supplierIds = [...new Set((data || []).filter((l: any) => l.supplier_id).map((l: any) => l.supplier_id))];

      const [productsRes, suppliersRes] = await Promise.all([
        productIds.length > 0
          ? (supabase as any).from("mrp_products").select("id, name").in("id", productIds)
          : { data: [] },
        supplierIds.length > 0
          ? (supabase as any).from("suppliers").select("id, name").in("id", supplierIds)
          : { data: [] },
      ]);

      const productMap = new Map((productsRes.data || []).map((p: any) => [p.id, p.name]));
      const supplierMap = new Map((suppliersRes.data || []).map((s: any) => [s.id, s.name]));

      return (data || []).map((lot: any) => ({
        ...lot,
        product_name: productMap.get(lot.product_id) || "—",
        supplier_name: lot.supplier_id ? supplierMap.get(lot.supplier_id) || "—" : null,
      }));
    },
  });
}

export function useLot(lotId: string | undefined) {
  return useQuery({
    queryKey: ["inventory_lot", lotId],
    enabled: !!lotId,
    queryFn: async (): Promise<InventoryLot | null> => {
      if (!lotId) return null;
      const { data, error } = await (supabase as any)
        .from("inventory_lot")
        .select("*")
        .eq("id", lotId)
        .single();
      if (error) throw error;
      return data;
    },
  });
}

export function useCreateLot() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (lot: LotInsert) => {
      const { data, error } = await (supabase as any)
        .from("inventory_lot")
        .insert({
          ...lot,
          lot_code: "", // trigger will auto-generate
          available_volume_ml: lot.initial_volume_ml,
          status: "criado",
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["inventory_lots"] });
      toast.success("Lote criado com sucesso!");
    },
    onError: (error: any) => {
      toast.error(`Erro ao criar lote: ${error.message}`);
    },
  });
}

export function useUpdateLot() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: LotUpdate & { id: string }) => {
      const { data, error } = await (supabase as any)
        .from("inventory_lot")
        .update(updates)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["inventory_lots"] });
      toast.success("Lote atualizado!");
    },
    onError: (error: any) => {
      toast.error(`Erro ao atualizar lote: ${error.message}`);
    },
  });
}

export function useDeleteLot() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any)
        .from("inventory_lot")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["inventory_lots"] });
      toast.success("Lote removido!");
    },
    onError: (error: any) => {
      toast.error(`Erro ao remover lote: ${error.message}`);
    },
  });
}

// Quality checks for a lot
export function useQualityChecks(entityType: "lot" | "production_order", entityId: string | undefined) {
  return useQuery({
    queryKey: ["quality_checks", entityType, entityId],
    enabled: !!entityId,
    queryFn: async (): Promise<QualityCheck[]> => {
      if (!entityId) return [];
      const { data, error } = await (supabase as any)
        .from("quality_check")
        .select("*")
        .eq("entity_type", entityType)
        .eq("entity_id", entityId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });
}

export function useCreateQualityCheck() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (check: Omit<QualityCheck, "id" | "created_at">) => {
      const { data: userData } = await supabase.auth.getUser();
      const { data, error } = await (supabase as any)
        .from("quality_check")
        .insert({
          ...check,
          checked_by: userData.user?.id,
          checked_at: check.result !== "pendente" ? new Date().toISOString() : null,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["quality_checks", variables.entity_type, variables.entity_id] });
      queryClient.invalidateQueries({ queryKey: ["inventory_lots"] });
      toast.success("Verificação de qualidade registrada!");
    },
    onError: (error: any) => {
      toast.error(`Erro: ${error.message}`);
    },
  });
}

// Lot consumption history
export function useLotConsumptions(lotId: string | undefined) {
  return useQuery({
    queryKey: ["lot_consumptions", lotId],
    enabled: !!lotId,
    queryFn: async (): Promise<LotConsumption[]> => {
      if (!lotId) return [];
      const { data, error } = await (supabase as any)
        .from("inventory_lot_consumption")
        .select("*")
        .eq("lot_id", lotId)
        .order("consumed_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });
}

// Lot status flow helpers
export const LOT_STATUS_LABELS: Record<LotStatus, string> = {
  criado: "Criado",
  recebido: "Recebido",
  em_quarentena: "Em Quarentena",
  amostrado: "Amostrado",
  aprovado: "Aprovado",
  bloqueado: "Bloqueado",
  reprovado: "Reprovado",
  encerrado: "Encerrado",
};

export const LOT_STATUS_COLORS: Record<LotStatus, string> = {
  criado: "bg-gray-500",
  recebido: "bg-blue-500",
  em_quarentena: "bg-yellow-500",
  amostrado: "bg-purple-500",
  aprovado: "bg-green-500",
  bloqueado: "bg-orange-500",
  reprovado: "bg-red-500",
  encerrado: "bg-slate-400",
};

export const QUALITY_RESULT_LABELS: Record<QualityResult, string> = {
  aprovada: "Aprovada",
  bloqueada: "Bloqueada",
  reprovada: "Reprovada",
  pendente: "Pendente",
};

// Valid transitions for lot status
export const LOT_STATUS_TRANSITIONS: Record<LotStatus, LotStatus[]> = {
  criado: ["recebido", "cancelada" as any],
  recebido: ["em_quarentena"],
  em_quarentena: ["amostrado"],
  amostrado: ["aprovado", "bloqueado", "reprovado"],
  aprovado: ["encerrado"],
  bloqueado: ["amostrado", "reprovado", "encerrado"],
  reprovado: ["encerrado"],
  encerrado: [],
};

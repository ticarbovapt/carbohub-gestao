import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

// ── Types ──────────────────────────────────────────────────────────────
export interface PDVSeller {
  id: string;
  pdv_id: string;
  user_id: string | null;
  name: string;
  email: string | null;
  phone: string | null;
  is_active: boolean;
  is_manager: boolean;
  commission_rate: number;
  rv_vendedor_name: string | null;
  notes: string | null;
  created_at: string;
  created_by: string | null;
}

export interface PDVSellerRankingEntry {
  seller_id: string;
  seller_name: string;
  qty_sales: number;
  revenue: number;
  commission: number;
  avg_ticket: number;
}

// ── Hooks ──────────────────────────────────────────────────────────────

/** Lista vendedores de um PDV */
export function usePDVSellers(pdvId: string | undefined) {
  return useQuery({
    queryKey: ["pdv-sellers", pdvId],
    queryFn: async (): Promise<PDVSeller[]> => {
      if (!pdvId) return [];
      const { data, error } = await (supabase as any)
        .from("pdv_sellers")
        .select("*")
        .eq("pdv_id", pdvId)
        .order("is_manager", { ascending: false })
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!pdvId,
  });
}

/** Retorna o registro do vendedor do usuário logado (se for vendedor) */
export function useMyPDVSeller(pdvId: string | undefined) {
  return useQuery({
    queryKey: ["my-pdv-seller", pdvId],
    queryFn: async (): Promise<PDVSeller | null> => {
      if (!pdvId) return null;
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) return null;
      const { data } = await (supabase as any)
        .from("pdv_sellers")
        .select("*")
        .eq("pdv_id", pdvId)
        .eq("user_id", auth.user.id)
        .maybeSingle();
      return data ?? null;
    },
    enabled: !!pdvId,
  });
}

/** Ranking de vendedores de um PDV por receita */
export function usePDVSellerRanking(
  pdvId: string | undefined,
  period: "day" | "week" | "month" | "all" = "month"
) {
  return useQuery({
    queryKey: ["pdv-seller-ranking", pdvId, period],
    queryFn: async (): Promise<PDVSellerRankingEntry[]> => {
      if (!pdvId) return [];

      let fromDate: string | null = null;
      const now = new Date();
      if (period === "day") {
        fromDate = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
      } else if (period === "week") {
        const d = new Date(now);
        d.setDate(d.getDate() - 7);
        fromDate = d.toISOString();
      } else if (period === "month") {
        fromDate = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      }

      let query = (supabase as any)
        .from("pdv_sales")
        .select("seller_id, total, commission_amount, pdv_sellers(name)")
        .eq("pdv_id", pdvId)
        .eq("is_voided", false);

      if (fromDate) query = query.gte("created_at", fromDate);

      const { data, error } = await query;
      if (error) throw error;

      // Aggregate client-side
      const map: Record<string, PDVSellerRankingEntry> = {};
      (data ?? []).forEach((row: any) => {
        const sid = row.seller_id ?? "sem-vendedor";
        const sname = row.pdv_sellers?.name ?? "Sem vendedor";
        if (!map[sid]) {
          map[sid] = { seller_id: sid, seller_name: sname, qty_sales: 0, revenue: 0, commission: 0, avg_ticket: 0 };
        }
        map[sid].qty_sales++;
        map[sid].revenue += Number(row.total) || 0;
        map[sid].commission += Number(row.commission_amount) || 0;
      });

      return Object.values(map)
        .map(e => ({ ...e, avg_ticket: e.qty_sales > 0 ? e.revenue / e.qty_sales : 0 }))
        .sort((a, b) => b.revenue - a.revenue);
    },
    enabled: !!pdvId,
  });
}

/** Cria um vendedor interno */
export function useCreatePDVSeller() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      pdv_id: string;
      name: string;
      email?: string | null;
      phone?: string | null;
      is_manager?: boolean;
      commission_rate?: number;
      rv_vendedor_name?: string | null;
      notes?: string | null;
    }) => {
      const { data: auth } = await supabase.auth.getUser();
      const { data, error } = await (supabase as any)
        .from("pdv_sellers")
        .insert({ ...payload, created_by: auth.user?.id })
        .select()
        .single();
      if (error) throw error;
      return data as PDVSeller;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["pdv-sellers", vars.pdv_id] });
      toast.success("Vendedor criado com sucesso!");
    },
    onError: (e: Error) => toast.error("Erro ao criar vendedor: " + e.message),
  });
}

/** Atualiza um vendedor */
export function useUpdatePDVSeller() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      pdv_id,
      ...updates
    }: Partial<PDVSeller> & { id: string; pdv_id: string }) => {
      const { error } = await (supabase as any)
        .from("pdv_sellers")
        .update(updates)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["pdv-sellers", vars.pdv_id] });
      toast.success("Vendedor atualizado");
    },
    onError: (e: Error) => toast.error("Erro: " + e.message),
  });
}

/** Vincula user_id a um vendedor existente (após criar acesso no sistema) */
export function useLinkSellerUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ sellerId, userId, pdvId }: { sellerId: string; userId: string; pdvId: string }) => {
      const { error } = await (supabase as any)
        .from("pdv_sellers")
        .update({ user_id: userId })
        .eq("id", sellerId);
      if (error) throw error;
      return { pdvId };
    },
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["pdv-sellers", r.pdvId] });
    },
  });
}

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

// Preço fixo por produto final (mrp_products.sale_price). Grava via RPC
// gestor-gated que estampa quem/quando. Colunas novas → cliente sem tipo.
const db = supabase as unknown as {
  from: (t: string) => any;
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: any; error: any }>;
};

export interface FinalProduct {
  id: string;
  name: string;
  product_code: string | null;
  stock_unit: string | null;
  sale_price: number | null;
  sale_price_updated_at: string | null;
  sale_price_updated_by: string | null;
  updated_by_name: string | null; // resolvido de profiles
}

/** Todos os produtos finais ativos + preço fixo atual e quem definiu. */
export function useFinalProducts() {
  return useQuery({
    queryKey: ["final_products_prices"],
    queryFn: async (): Promise<FinalProduct[]> => {
      const { data, error } = await db
        .from("mrp_products")
        .select("id, name, product_code, stock_unit, sale_price, sale_price_updated_at, sale_price_updated_by")
        .eq("is_active", true)
        .eq("category", "Produto Final")
        .order("name", { ascending: true });
      if (error) throw error;
      const rows = (data ?? []) as FinalProduct[];
      const ids = [...new Set(rows.map((r) => r.sale_price_updated_by).filter(Boolean))] as string[];
      const names: Record<string, string> = {};
      if (ids.length) {
        const prof = await db.from("profiles").select("id, full_name").in("id", ids);
        for (const p of (prof.data ?? []) as { id: string; full_name: string | null }[]) names[p.id] = p.full_name ?? "—";
      }
      return rows.map((r) => ({ ...r, updated_by_name: r.sale_price_updated_by ? names[r.sale_price_updated_by] ?? "—" : null }));
    },
  });
}

/** Define o preço fixo de um produto (RPC gestor-gated). price null = limpar. */
export function useSetProductPrice() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (p: { productId: string; price: number | null }) => {
      const { error } = await db.rpc("carbo_set_product_price", { p_product_id: p.productId, p_price: p.price });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["final_products_prices"] });
      toast({ title: "Preço salvo" });
    },
    onError: (e: any) => toast({ title: "Erro ao salvar preço", description: e?.message ?? "Tente de novo", variant: "destructive" }),
  });
}

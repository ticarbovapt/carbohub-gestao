import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// Produtos reais do catálogo do CORE (mrp_products) — reaproveitados (somente leitura).
// O Sales não cadastra produto; apenas lê o catálogo já existente para a venda.
const db = supabase as unknown as { from: (t: string) => any };

export interface Produto {
  id: string;
  name: string;
  product_code: string | null;
  stock_unit: string | null;
}

export function useProdutos() {
  return useQuery({
    queryKey: ["crm_produtos_catalogo"],
    queryFn: async (): Promise<Produto[]> => {
      const { data, error } = await db
        .from("mrp_products")
        .select("id, name, product_code, stock_unit")
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return (data ?? []) as Produto[];
    },
  });
}

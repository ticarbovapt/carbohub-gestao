import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// Produtos reais do catálogo do CORE (mrp_products) — reaproveitados (somente leitura).
// O Sales não cadastra produto; apenas lê o catálogo já existente para a venda.
// O PREÇO também vem daqui: quem define é a gestão, em Admin › Tabela de preços.
const db = supabase as unknown as { from: (t: string) => any };

export interface Produto {
  id: string;
  name: string;
  product_code: string | null;
  stock_unit: string | null;
  /**
   * Preço de venda definido pela gestão em Admin › Tabela de preços
   * (mrp_products.sale_price, gravado pela RPC carbo_set_product_price).
   *
   * `null` significa NÃO PRECIFICADO — o produto não pode ser vendido até que
   * alguém defina o preço. É de propósito: o /vender deixou de aceitar preço
   * digitado à mão, então um produto sem preço é uma lacuna de configuração
   * que precisa aparecer, não algo para o vendedor preencher no olho.
   */
  sale_price: number | null;
}

export function useProdutos() {
  return useQuery({
    queryKey: ["crm_produtos_catalogo"],
    queryFn: async (): Promise<Produto[]> => {
      // Só PRODUTOS FINAIS entram no catálogo de venda — o mrp_products também
      // guarda insumos/embalagens/matéria-prima, que não podem ser vendidos.
      // Mesma regra que a OP usa (category === "Produto Final").
      const { data, error } = await db
        .from("mrp_products")
        .select("id, name, product_code, stock_unit, sale_price")
        .eq("is_active", true)
        .eq("category", "Produto Final")
        .order("name");
      if (error) throw error;
      return (data ?? []) as Produto[];
    },
  });
}

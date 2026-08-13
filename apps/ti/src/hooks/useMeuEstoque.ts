import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// ─────────────────────────────────────────────────────────────────────────────
// O estoque físico do vendedor — LEITURA.
//
// Cada vendedor tem uma caixa própria (`warehouses` com kind='vendedor'),
// abastecida por transferência a partir do Hub Natal. É dela que sai a venda a
// pronta entrega.
//
// ⚠️ Este hook NÃO escreve, e não é ele que autoriza a venda. Quem confere
// saldo de verdade é `carbo_pronta_entrega_deduzir` no banco, com trava por
// linha. Aqui o saldo serve para AVISAR antes do clique — o vendedor não
// deveria montar o pedido inteiro para descobrir no fim que não tem produto.
//
// Os dois números podem divergir por segundos (alguém confirmou uma chegada
// agora mesmo), e é por isso que a decisão final é do banco: se a tela fosse a
// autoridade, duas vendas simultâneas passariam com o mesmo saldo.
//
// ⚠️ Arquivo idêntico nos SEIS apps — o /vender existe em todos eles. Fonte da
// verdade = apps/crm.
// ─────────────────────────────────────────────────────────────────────────────

const db = supabase as unknown as { from: (t: string) => any };

export interface ItemMeuEstoque {
  product_id: string;
  product_code: string | null;
  product_name: string;
  stock_unit: string | null;
  quantidade: number;
}

export interface MeuEstoque {
  temCaixa: boolean;
  itens: ItemMeuEstoque[];
  /** product_id → saldo. É o formato que a tela de venda consulta por item. */
  saldo: Record<string, number>;
  totalUnidades: number;
}

const VAZIO: MeuEstoque = { temCaixa: false, itens: [], saldo: {}, totalUnidades: 0 };

export function useMeuEstoque(vendedorId?: string | null) {
  return useQuery({
    enabled: !!vendedorId,
    queryKey: ["meu_estoque", vendedorId],
    // Curto: o Ops pode confirmar uma chegada enquanto o vendedor monta o
    // pedido, e saldo velho aqui vira aviso errado na cara dele.
    staleTime: 30_000,
    queryFn: async (): Promise<MeuEstoque> => {
      const { data, error } = await db
        .from("vendedor_estoque")
        .select("product_id, product_code, product_name, stock_unit, quantidade")
        .eq("vendedor_id", vendedorId)
        .order("product_name");
      if (error) throw error;

      const linhas = (data ?? []) as ItemMeuEstoque[];
      // Sem linha nenhuma = o vendedor não tem caixa. É diferente de ter caixa
      // vazia: a view devolve o catálogo inteiro zerado quando a caixa existe.
      if (linhas.length === 0) return VAZIO;

      const saldo: Record<string, number> = {};
      let total = 0;
      for (const l of linhas) {
        const q = Number(l.quantidade) || 0;
        saldo[l.product_id] = q;
        total += q;
      }
      return { temCaixa: true, itens: linhas, saldo, totalUnidades: total };
    },
  });
}

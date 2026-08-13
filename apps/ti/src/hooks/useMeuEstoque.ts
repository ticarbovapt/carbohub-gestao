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

// ─────────────────────────────────────────────────────────────────────────────
// O que está a caminho.
//
// ⚠️ Existe porque a mercadoria em trânsito NÃO aparece em saldo nenhum: já
// saiu de Natal e ainda não foi creditada na caixa. Sem esta lista o vendedor
// vê o produto sumir do sistema entre o envio e a chegada, e a conclusão
// natural é que alguém errou.
// ─────────────────────────────────────────────────────────────────────────────

export interface ACaminho {
  id: string;
  product_code: string;
  quantidade: number;
  enviado_em: string;
  notes: string | null;
}

export function useACaminho(vendedorId?: string | null) {
  return useQuery({
    enabled: !!vendedorId,
    queryKey: ["meu_estoque_transito", vendedorId],
    staleTime: 30_000,
    queryFn: async (): Promise<ACaminho[]> => {
      const wh = await db.from("warehouses").select("id")
        .eq("owner_id", vendedorId).eq("kind", "vendedor").maybeSingle();
      if (wh.error) throw wh.error;
      if (!wh.data?.id) return [];

      // 'approved' = saiu de Natal, ainda não confirmado. É o vocabulário da
      // stock_transfers; 'executed' já foi creditado e não é mais trânsito.
      const { data, error } = await db.from("stock_transfers")
        .select("id, product_code, quantity, created_at, notes")
        .eq("to_hub", wh.data.id)
        .eq("status", "approved")
        .order("created_at", { ascending: false });
      if (error) throw error;

      return ((data ?? []) as Record<string, any>[]).map((t) => ({
        id: t.id as string,
        product_code: (t.product_code as string) ?? "",
        quantidade: Number(t.quantity) || 0,
        enviado_em: t.created_at as string,
        notes: (t.notes as string) ?? null,
      }));
    },
  });
}


/**
 * O que está SAINDO da minha caixa — devolução ou repasse ainda não confirmado
 * no destino.
 *
 * ⚠️ Espelho do `useACaminho`, e existe pela mesma razão, invertida: a
 * devolução debita a caixa NA HORA, mas o destino só credita na confirmação.
 * Sem esta lista o vendedor vê o produto sumir do saldo dele e não encontra em
 * lugar nenhum — a leitura natural é "o sistema comeu meu estoque".
 */
export function useSaindoDaMinhaCaixa(vendedorId?: string | null) {
  return useQuery({
    enabled: !!vendedorId,
    queryKey: ["meu_estoque_saindo", vendedorId],
    staleTime: 30_000,
    queryFn: async (): Promise<ACaminho[]> => {
      const wh = await db.from("warehouses").select("id")
        .eq("owner_id", vendedorId).eq("kind", "vendedor").maybeSingle();
      if (wh.error) throw wh.error;
      if (!wh.data?.id) return [];

      const { data, error } = await db.from("stock_transfers")
        .select("id, product_code, quantity, created_at, notes")
        .eq("from_hub", wh.data.id)
        .eq("status", "approved")
        .order("created_at", { ascending: false });
      if (error) throw error;

      return ((data ?? []) as Record<string, any>[]).map((t) => ({
        id: t.id as string,
        product_code: (t.product_code as string) ?? "",
        quantidade: Number(t.quantity) || 0,
        enviado_em: t.created_at as string,
        notes: (t.notes as string) ?? null,
      }));
    },
  });
}

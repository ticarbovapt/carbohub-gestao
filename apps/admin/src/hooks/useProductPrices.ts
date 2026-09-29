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
  /** Gêmeo de bonificação: entregue de graça, preço espelha o do pai. */
  bonificacao_de: string | null;
  /**
   * Linha de FAIXA DE PREÇO: mesmo produto físico do id apontado, vendido a
   * outro preço conforme o tipo de cliente (PDV, microdistribuidor).
   * ⚠️ Estoque e produção olham o PAI — ela não tem saldo próprio.
   */
  preco_de: string | null;
  faixa_preco: string | null;
}

export interface FaixaPreco {
  codigo: string;
  rotulo: string;
  sufixo: string;
  hint: string | null;
  ordem: number;
}

/** As faixas cadastradas. ⚠️ Vem do BANCO, nunca de uma lista no código:
 *  faixa nova é um INSERT, sem deploy — a lição de "plataforma nova entra em
 *  TRÊS CHECKs". */
export function useFaixasPreco() {
  return useQuery({
    queryKey: ["carbo_faixa_preco"],
    staleTime: 10 * 60 * 1000,
    queryFn: async (): Promise<FaixaPreco[]> => {
      const { data, error } = await db
        .from("carbo_faixa_preco")
        .select("codigo, rotulo, sufixo, hint, ordem")
        .eq("ativo", true)
        .order("ordem");
      if (error) throw error;
      return (data ?? []) as FaixaPreco[];
    },
  });
}

/** Todos os produtos finais ativos + preço fixo atual e quem definiu. */
export function useFinalProducts() {
  return useQuery({
    queryKey: ["final_products_prices"],
    queryFn: async (): Promise<FinalProduct[]> => {
      const { data, error } = await db
        .from("mrp_products")
        .select("id, name, product_code, stock_unit, sale_price, sale_price_updated_at, sale_price_updated_by, bonificacao_de, preco_de, faixa_preco")
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

/**
 * Cria a linha de uma faixa de preço para um produto (RPC idempotente).
 *
 * ⚠️ Ela nasce SEM PREÇO, de propósito, e a tela tem de deixar isso visível: o
 * /vender recusa vender produto sem preço, então a linha nova não vende nada
 * até alguém digitar o valor aqui. Nascer com zero faria o vendedor entregar
 * de graça sem que nada reclamasse — a lição do `('CZ100', 0)` da `20260969`.
 */
export function useCriarFaixaPreco() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (p: { productId: string; faixa: string }) => {
      const { error } = await db.rpc("carbo_preco_faixa_criar", { p_produto: p.productId, p_faixa: p.faixa });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["final_products_prices"] });
      toast({ title: "Faixa criada", description: "Defina o preço dela abaixo — sem preço ela não vende." });
    },
    onError: (e: any) => toast({ title: "Erro ao criar a faixa", description: e?.message ?? "Tente de novo", variant: "destructive" }),
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

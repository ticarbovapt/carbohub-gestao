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
  /**
   * Quando preenchido, este é o "gêmeo de bonificação" do produto apontado:
   * mesmo item físico, entregue de graça. A tela trava 100% de desconto na
   * linha, e o ESTOQUE baixa do pai — é a mesma garrafa da mesma prateleira.
   */
  bonificacao_de: string | null;
  /**
   * Quando preenchido, esta linha é o MESMO produto físico do id apontado,
   * vendido a outro preço conforme o tipo de cliente (PDV, microdistribuidor).
   *
   * ⚠️ Não é desconto: o valor sai CHEIO na NF. Vender a 15,60 com 4,10 de
   * desconto e vender a 11,50 dão o mesmo total e notas fiscais diferentes —
   * e o imposto é no momento da NF.
   *
   * ⚠️ O ESTOQUE baixa do pai (`carbo_itens_para_estoque` resolve `preco_de`):
   * é a mesma garrafa da mesma prateleira, e o SKU da faixa nunca é produzido.
   */
  preco_de: string | null;
  /** Qual faixa (carbo_faixa_preco.codigo). Anda sempre junto com `preco_de`. */
  faixa_preco: string | null;
  /**
   * Se este produto aparece no dropdown do /vender. Liga/desliga em
   * Admin › Comercial › Tabela de preços.
   *
   * ⚠️ NÃO é `is_active`: esconder da lista de venda não desativa o produto —
   * ele continua no estoque, na produção e no MRP.
   *
   * ⚠️ E a tela NÃO filtra por isto cegamente: produto já escolhido numa linha
   * continua aparecendo, senão reabrir um orçamento antigo cujo produto foi
   * escondido depois mostraria a linha VAZIA carregando um produto real — e
   * salvar assim perderia o item, calado.
   */
  aparece_no_vender: boolean;
}

export interface FaixaPreco {
  codigo: string;
  rotulo: string;
  hint: string | null;
  ordem: number;
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
        .select("id, name, product_code, stock_unit, sale_price, bonificacao_de, preco_de, faixa_preco, aparece_no_vender")
        .eq("is_active", true)
        .eq("category", "Produto Final")
        .order("name");
      if (error) throw error;
      return (data ?? []) as Produto[];
    },
  });
}

/**
 * As faixas de preço cadastradas — rótulo, dica e ORDEM.
 *
 * ⚠️ Consulta SEPARADA de propósito, e não um embed na de produtos. Embed do
 * PostgREST depende do cache de esquema; se ele falhar, a consulta INTEIRA
 * falha e o dropdown fica vazio — ausência que esvazia a tela é o pior modo de
 * errar aqui. Separada, o catálogo continua vindo e só o rótulo bonito falta.
 *
 * ⚠️ A ORDEM vem do cadastro, nunca do alfabeto. Ordenar por nome fazia a
 * bonificação cair embaixo do pai por SORTE (`- b` < `- M` < `- P`): uma faixa
 * chamada "- Atacado" entraria antes dela e ninguém saberia por quê.
 */
export function useFaixasPreco() {
  return useQuery({
    queryKey: ["crm_faixas_preco"],
    staleTime: 10 * 60 * 1000,
    queryFn: async (): Promise<FaixaPreco[]> => {
      const { data, error } = await db
        .from("carbo_faixa_preco")
        .select("codigo, rotulo, hint, ordem")
        .eq("ativo", true)
        .order("ordem");
      // ⚠️ Falha aqui NÃO propaga: sem as faixas o /vender cai no nome do
      // produto, que já carrega o rótulo (" - PDV"). Derivar do nome é reserva
      // de APRESENTAÇÃO, nunca de identidade — quem identifica continua sendo
      // `faixa_preco`.
      if (error) return [];
      return (data ?? []) as FaixaPreco[];
    },
  });
}

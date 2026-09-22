import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// ─────────────────────────────────────────────────────────────────────────────
// Faturamento da unidade de negócio ON-LINE, para o Dashboard Comercial.
//
// ⚠️ POR QUE ISTO NÃO SAI DE `carboze_orders` COMO OS OUTROS SEGMENTOS
//
// A ponte traz o marketplace para `carboze_orders`, mas a tela do Sales corta
// esses pedidos pelo `FILTRO_VENDA_DO_TIME` (`lib/vendaDoTime.ts`) — e com
// razão: misturar marketplace na lista do vendedor infla o mês dele e apaga a
// leitura de quem vendeu o quê.
//
// A consequência não intencional era o painel de unidades mostrar On-line
// ZERADO enquanto o Admin mostrava R$ 40 mil no mesmo mês. Número zerado numa
// linha que existe é pior que linha ausente: parece que o canal não vendeu.
//
// A saída é ler o on-line da SUA fonte, que é `ecommerce_orders`.
//
// ⚠️ E LÊ PELA VIEW, NÃO PELA TABELA. `ecommerce_raw_summary` já resolve as
// duas armadilhas do dado cru:
//
//   1. `ecommerce_orders` tem UMA LINHA POR ITEM. Contar linhas daria "vendas"
//      infladas; a view conta `distinct ecommerce_pedido_raiz(...)`, que ainda
//      junta pedido desmembrado pela plataforma.
//   2. "Venda que conta" é `ecommerce_status_e_venda(status)` — uma função no
//      BANCO (paid/shipped/delivered). O Admin tem a mesma regra copiada numa
//      constante local (`VENDA_STATUSES` em `useMetaEcommerce.ts`). Copiá-la
//      para cá seria a terceira cópia da mesma frase, e este repositório já
//      pagou caro por isso — o comentário da `carbo_vendas_metrica` abre
//      dizendo que havia 14 definições de "venda que conta" em 26 lugares.
//
// Conferido em 22/09/2026: a view devolve 303 vendas e R$ 40.284 no mês, os
// MESMOS números da tela Vendas Online do Carbo Admin.
// ─────────────────────────────────────────────────────────────────────────────

const db = supabase as unknown as { from: (t: string) => any };

export interface EcommerceUnidade {
  pedidos: number;
  faturado: number;
}

/**
 * Soma o on-line no mesmo recorte do Dashboard Comercial.
 *
 * ⚠️ Sem filtro de data de propósito: o dashboard hoje não filtra por período
 * (os dois campos "Período" da tela não têm `value` nem `onChange` — não
 * filtram nada). Somar um mês aqui contra o histórico inteiro do resto faria a
 * fatia do on-line parecer minúscula. Quando o filtro de data passar a
 * funcionar, esta query ganha o mesmo recorte — e só então.
 */
export function useEcommerceUnidade() {
  return useQuery({
    queryKey: ["ecommerce_unidade_negocio"],
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<EcommerceUnidade> => {
      const { data, error } = await db
        .from("ecommerce_raw_summary")
        .select("sale_orders, sale_revenue");
      if (error) throw error;

      const linhas = (data ?? []) as Array<{ sale_orders: number | null; sale_revenue: number | null }>;
      return {
        pedidos: linhas.reduce((s, l) => s + (Number(l.sale_orders) || 0), 0),
        faturado: linhas.reduce((s, l) => s + (Number(l.sale_revenue) || 0), 0),
      };
    },
  });
}

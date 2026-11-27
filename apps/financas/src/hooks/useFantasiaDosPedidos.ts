import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Nome fantasia dos pedidos da PÁGINA (20261206). O Faturamento lê
 * `carbo_vendas_metrica`, que expandiu as colunas do pedido na criação e não
 * traz coluna nova sem ser republicada — por isso o fantasia vem numa leitura
 * à parte, só dos ids que estão na tela (no máximo uma página).
 * ⚠️ Falha (coluna ainda não existe, rede) devolve mapa vazio: a tela mostra
 * a razão social sozinha, como antes.
 */
export function useFantasiaDosPedidos(ids: string[]) {
  const chave = [...ids].sort().join(",");
  return useQuery({
    queryKey: ["fantasia-dos-pedidos", chave],
    enabled: ids.length > 0,
    staleTime: 60_000,
    queryFn: async (): Promise<Record<string, string>> => {
      const out: Record<string, string> = {};
      try {
        for (let i = 0; i < ids.length; i += 100) {
          const lote = ids.slice(i, i + 100);
          const { data, error } = await (supabase as any)
            .from("carboze_orders").select("id, customer_trade_name")
            .in("id", lote).not("customer_trade_name", "is", null)
            .order("id").range(0, lote.length - 1);
          if (error) throw error;
          for (const r of (data ?? []) as { id: string; customer_trade_name: string | null }[]) {
            if (r.customer_trade_name) out[r.id] = r.customer_trade_name;
          }
        }
      } catch (e) {
        console.warn("[faturamento] nome fantasia não carregou:", e);
      }
      return out;
    },
  });
}

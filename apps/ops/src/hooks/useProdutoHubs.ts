import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { HUBS } from "@/components/estoque/stockData";

/**
 * Em quais hubs um produto existe.
 *
 * ── A regra, e por que ela é invertida ────────────────────────────────────
 *
 * `mrp_product_hubs` guarda EXCEÇÃO, não permissão: ausência de linha
 * significa que o produto EXISTE naquele hub. Uma lista de permissão exigiria
 * preencher tudo antes de ligar, e no instante do deploy — tabela vazia —
 * todos os hubs ficariam vazios ao mesmo tempo.
 *
 * O preço dessa escolha é que a tela precisa MONTAR o estado marcado a partir
 * da ausência, que é o que `useProdutoHubs` faz: começa com todos ligados e
 * desliga os que têm linha.
 *
 * ── Sem produto não há o que perguntar ────────────────────────────────────
 *
 * No modo criar não existe `product_id` ainda, então a consulta fica desligada
 * e a tela assume "todos". A gravação acontece depois que o produto nasce —
 * ver `salvarHubsDoProduto`.
 */

const db = supabase as unknown as { from: (t: string) => any };

/** código do warehouse (banco) → id do hub (UI). Espelho do de `useStock`. */
const CODE_TO_HUB: Record<string, string> = {
  "HUB-RN": "rn",
  "HUB-SP": "sp",
  "HUB-SP-VENDAS": "spv",
  "CD-BLING": "bling",
  "HUB-BLING": "bling",
  "HUB-ESCRITORIO": "esc",
};
const HUB_TO_CODE: Record<string, string> = Object.fromEntries(
  Object.entries(CODE_TO_HUB).map(([code, id]) => [id, code]),
);

/** Estado marcado de cada hub para um produto. Todos ligados por padrão. */
export function useProdutoHubs(productId?: string) {
  return useQuery({
    queryKey: ["produto-hubs", productId],
    enabled: Boolean(productId),
    queryFn: async (): Promise<Record<string, boolean>> => {
      const marcado: Record<string, boolean> = {};
      for (const h of HUBS) marcado[h.id] = true;

      const { data, error } = await db
        .from("mrp_product_hubs")
        .select("ativo, warehouse:warehouses(code)")
        .eq("product_id", productId);
      if (error) throw error;

      for (const row of data ?? []) {
        const code = row.warehouse?.code as string | undefined;
        const hubId = code ? CODE_TO_HUB[code] : undefined;
        if (hubId) marcado[hubId] = Boolean(row.ativo);
      }
      return marcado;
    },
  });
}

export function useSalvarProdutoHubs() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ productId, marcado }: { productId: string; marcado: Record<string, boolean> }) => {
      // Os ids dos warehouses vêm do banco, não de constante: o `code` é o que
      // a tela conhece, e traduzir aqui evita mais um mapa para desatualizar.
      const { data: whs, error: e1 } = await db.from("warehouses").select("id, code");
      if (e1) throw e1;
      const idPorCode = new Map<string, string>((whs ?? []).map((w: any) => [w.code, w.id]));

      const linhas = HUBS
        .map((h) => {
          const code = HUB_TO_CODE[h.id];
          const warehouse_id = code ? idPorCode.get(code) : undefined;
          // Hub sem linha em `warehouses` (o CD Bling é assim de propósito)
          // simplesmente não tem o que gravar.
          if (!warehouse_id) return null;
          return {
            product_id: productId,
            warehouse_id,
            ativo: marcado[h.id] !== false,
            atualizado_em: new Date().toISOString(),
          };
        })
        .filter(Boolean);

      if (!linhas.length) return;
      // Upsert de TODAS as linhas, inclusive as ligadas: guardar o `true`
      // explícito é o que permite distinguir "nunca foi decidido" de "foi
      // decidido que sim" quando alguém for auditar a curadoria depois.
      const { error } = await db
        .from("mrp_product_hubs")
        .upsert(linhas, { onConflict: "product_id,warehouse_id" });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["produto-hubs"] });
      // A tela de estoque lê as exceções — sem isto, o produto só sumiria do
      // hub no próximo recarregamento e pareceria que a marcação não pegou.
      qc.invalidateQueries({ queryKey: ["ops", "stock"] });
    },
  });
}

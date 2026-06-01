import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface BlingStockRow {
  bling_id: number;
  codigo: string | null;
  nome: string | null;
  estoque_atual: number;
  estoque_reservado: number;
  estoque_synced_at: string | null;
}

/** Lê o estoque espelhado do Bling (bling_products). Somente leitura. */
export function useBlingStock() {
  return useQuery({
    queryKey: ["bling-stock"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bling_products")
        .select("bling_id, codigo, nome, estoque_atual, estoque_reservado, estoque_synced_at");
      if (error) throw error;
      const rows = (data || []) as BlingStockRow[];

      // Mapa por código (case-insensitive) para casar com mrp_products.product_code
      const byCode = new Map<string, BlingStockRow>();
      let lastSynced: string | null = null;
      for (const r of rows) {
        if (r.codigo) byCode.set(r.codigo.toUpperCase().trim(), r);
        if (r.estoque_synced_at && (!lastSynced || r.estoque_synced_at > lastSynced)) {
          lastSynced = r.estoque_synced_at;
        }
      }
      return { rows, byCode, lastSynced };
    },
  });
}

/** Dispara o sync de estoque do Bling (edge function bling-sync, entity=stock). */
export function useSyncBlingStock() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error("Não autenticado");

      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/bling-sync`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ entity: "stock" }),
        },
      );
      if (!res.ok) throw new Error(await res.text());
    },
    onSuccess: () => {
      toast.success("Sincronização de estoque do Bling iniciada…");
      // Dá um tempo para o sync rodar e então recarrega
      setTimeout(() => queryClient.invalidateQueries({ queryKey: ["bling-stock"] }), 5000);
    },
    onError: (e: Error) => {
      toast.error("Erro ao sincronizar estoque do Bling: " + e.message);
    },
  });
}

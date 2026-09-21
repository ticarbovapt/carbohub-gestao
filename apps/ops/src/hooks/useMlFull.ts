import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

// ─────────────────────────────────────────────────────────────────────────────
// Estoque no Fulfillment do Mercado Livre — LEITURA do espelho + as remessas.
//
// ⚠️ Os três números da tela são de LUGARES diferentes e não se somam:
//
//   disponivel      o ML diz          espelho de `ml_estoque_full`
//   em_transito     nós dizemos       saiu do galpão, ainda não chegou lá
//   saldo_loghouse  nós dizemos       `warehouse_stock` do HUB-SP
//
// O `em_transito` é o que impede a tela de enganar: a remessa sai hoje e o
// número do ML só sobe dias depois. Sem essa coluna, quem abre a tela logo
// após um envio vê ruptura e manda outro lote.
//
// ⚠️ Nada aqui ESCREVE no estoque do ML. As mutações mexem só no NOSSO galpão
// (a saída) e no registro da remessa — quem credita o Full é o próprio ML, e
// isso chega pelo `ml-estoque-full` de hora em hora.
// ─────────────────────────────────────────────────────────────────────────────

const db = supabase as unknown as {
  from: (t: string) => any;
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: any; error: any }>;
};

export interface LinhaMlFull {
  item_id: string;
  variation_id: string | null;
  seller_sku: string | null;
  titulo_anuncio: string | null;
  status: string | null;
  disponivel: number | null;
  nao_disponivel: number | null;
  product_id: string | null;
  product_code: string | null;
  produto: string | null;
  saldo_loghouse: number | null;
  em_transito: number;
  sincronizado_em: string | null;
}

export interface RemessaMlFull {
  id: string;
  product_id: string;
  quantidade: number;
  status: "em_transito" | "recebida" | "cancelada";
  enviado_em: string;
  recebido_em: string | null;
  observacao: string | null;
  produto?: { product_code: string; name: string } | null;
  origem?: { code: string } | null;
}

export function useMlFullEstoque() {
  return useQuery({
    queryKey: ["ml-full-estoque"],
    queryFn: async (): Promise<LinhaMlFull[]> => {
      const { data, error } = await db
        .from("ml_estoque_full_tela")
        .select("*")
        // ⚠️ Ordem: o que tem MENOS disponível primeiro — a tela existe para
        // antecipar ruptura, e ruptura mora no topo da lista, não no fim.
        // `nullsFirst` porque disponível nulo é "não sei", e não saber o saldo
        // de um anúncio é mais urgente que saber que ele tem muito.
        .order("disponivel", { ascending: true, nullsFirst: true });
      if (error) throw new Error(error.message);
      return (data ?? []) as LinhaMlFull[];
    },
    // O espelho anda de hora em hora; refetch agressivo só gastaria requisição.
    staleTime: 5 * 60 * 1000,
  });
}

export function useMlFullRemessas(apenasEmTransito = false) {
  return useQuery({
    queryKey: ["ml-full-remessas", apenasEmTransito],
    queryFn: async (): Promise<RemessaMlFull[]> => {
      let q = db
        .from("ml_full_remessas")
        .select("id, product_id, quantidade, status, enviado_em, recebido_em, observacao, produto:mrp_products(product_code, name), origem:warehouses(code)")
        .order("enviado_em", { ascending: false })
        .limit(200);
      if (apenasEmTransito) q = q.eq("status", "em_transito");
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      return (data ?? []) as RemessaMlFull[];
    },
  });
}

/** Invalida as duas listas: uma remessa muda o trânsito E o saldo do galpão. */
function useRecarregar() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ["ml-full-estoque"] });
    qc.invalidateQueries({ queryKey: ["ml-full-remessas"] });
    // ⚠️ O saldo do galpão de origem caiu — as telas de estoque precisam saber.
    // Esquecer isto faria o número do Hub Natal continuar o antigo até um F5,
    // e a pessoa registraria a remessa duas vezes achando que não pegou.
    qc.invalidateQueries({ queryKey: ["stock"] });
    qc.invalidateQueries({ queryKey: ["stock-movements"] });
  };
}

export function useRegistrarRemessa() {
  const recarregar = useRecarregar();
  return useMutation({
    mutationFn: async (v: {
      productId: string; quantidade: number; origemCode?: string; observacao?: string;
    }) => {
      const { data, error } = await db.rpc("ml_full_remessa_registrar", {
        p_product_id: v.productId,
        p_quantidade: v.quantidade,
        // Padrão Hub Natal, mas EXPLÍCITO na chamada — a origem nunca fica
        // implícita, nem aqui nem na RPC.
        p_origem_code: v.origemCode ?? "HUB-RN",
        p_observacao: v.observacao ?? null,
      });
      if (error) throw new Error(error.message);
      return data as string;
    },
    onSuccess: () => {
      recarregar();
      toast.success("Remessa registrada", {
        // ⚠️ O texto diz o que NÃO aconteceu, de propósito: quem clicou espera
        // ver o número do ML subir, e ele não sobe hoje.
        description: "Saiu do galpão e entrou em trânsito. O saldo no ML só sobe quando eles receberem.",
      });
    },
    onError: (e: Error) => toast.error("Não deu para registrar", { description: e.message }),
  });
}

export function useReceberRemessa() {
  const recarregar = useRecarregar();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.rpc("ml_full_remessa_receber", { p_id: id });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      recarregar();
      toast.success("Remessa marcada como recebida", {
        description: "Nada foi somado aqui — o saldo do Full vem do próprio ML.",
      });
    },
    onError: (e: Error) => toast.error("Não deu para marcar", { description: e.message }),
  });
}

export function useCancelarRemessa() {
  const recarregar = useRecarregar();
  return useMutation({
    mutationFn: async (v: { id: string; motivo: string }) => {
      const { error } = await db.rpc("ml_full_remessa_cancelar", {
        p_id: v.id, p_motivo: v.motivo,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      recarregar();
      toast.success("Remessa cancelada", { description: "O estoque voltou para o galpão de origem." });
    },
    onError: (e: Error) => toast.error("Não deu para cancelar", { description: e.message }),
  });
}

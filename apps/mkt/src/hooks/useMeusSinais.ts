import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// Os sinais PESSOAIS na frente do cartão, como no Trello: o sininho com os
// avisos NÃO LIDOS daquele cartão e o olho de "você segue".
// ⚠️ A chave começa com ["notifications", meuId]: toda mutação do sininho
// (`useNotifications`) invalida esse prefixo, então marcar como lido lá apaga
// o selo aqui sem código a mais — duas leituras do mesmo dado concordando.
// ⚠️ Falha de leitura vira "sem sinal", nunca erro na tela: é enfeite do
// cartão, e o quadro não pode cair por ele.

/* eslint-disable @typescript-eslint/no-explicit-any */
const db = supabase as unknown as { from: (t: string) => any };

export interface MeusSinais { avisos: Map<string, number>; seguidos: Set<string> }

export function useMeusSinais(meuId: string | null) {
  return useQuery({
    queryKey: ["notifications", meuId, "cartoes-mkt"],
    enabled: !!meuId,
    refetchInterval: 15000, // o mesmo ritmo do sininho
    queryFn: async (): Promise<MeusSinais> => {
      const [n, s] = await Promise.all([
        db.from("notifications").select("reference_id").eq("user_id", meuId).eq("is_read", false)
          .eq("reference_type", "mkt_card").order("created_at", { ascending: false }).limit(1000),
        db.from("mkt_card_seguidores").select("card_id").eq("user_id", meuId),
      ]);
      const avisos = new Map<string, number>();
      for (const r of (n.error ? [] : n.data ?? []) as { reference_id: string | null }[]) {
        if (r.reference_id) avisos.set(r.reference_id, (avisos.get(r.reference_id) ?? 0) + 1);
      }
      const seguidos = new Set(((s.error ? [] : s.data ?? []) as { card_id: string }[]).map((x) => x.card_id));
      return { avisos, seguidos };
    },
  });
}

/** Abrir o cartão LÊ os avisos dele (no Trello também). */
export async function lerAvisosDoCartao(meuId: string, cardId: string) {
  const r = await db.from("notifications").update({ is_read: true })
    .eq("user_id", meuId).eq("reference_type", "mkt_card").eq("reference_id", cardId).eq("is_read", false)
    .select("id");
  return r.error ? 0 : (r.data?.length ?? 0);
}

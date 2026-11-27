import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/** A chave do cache — a tela de Conversas a atualiza com a contagem que ela já tem. */
export const CHAVE_PENDENTES_POR_NUMERO = ["wa-pendentes-por-numero"] as const;

/**
 * Quantas conversas estão em "Não respondidas" em cada número (a bolinha do
 * menu). Vem do BANCO (`carbo_wa_pendentes_por_numero`, 20261204), que espelha
 * a regra da aba — e não da lista da tela, porque o menu aparece em todas as
 * páginas do app e baixar a caixa inteira em cada uma não escala.
 *
 * ⚠️ Sem a função (front antes do SQL) ou com erro, devolve `undefined` e o
 * menu fica SEM bolinha — nunca "0", que diria "está tudo respondido".
 */
export function usePendentesPorNumero() {
  return useQuery({
    queryKey: CHAVE_PENDENTES_POR_NUMERO,
    queryFn: async (): Promise<Record<string, number>> => {
      const { data, error } = await (supabase as any).rpc("carbo_wa_pendentes_por_numero");
      if (error) throw error;
      return (data ?? {}) as Record<string, number>;
    },
    // Rede de segurança: na tela de Conversas a contagem é atualizada na hora.
    refetchInterval: 120_000,
    staleTime: 30_000,
    retry: 1,
  });
}

/**
 * Grava que a pessoa viu o aviso de conversas paradas (`carbo_wa_aviso_ciente`):
 * quem, quando, quantas havia e o que fez. Falha só vai ao console — o aviso
 * não pode travar a caixa.
 */
export async function registrarAvisoCiente(r: {
  numero_id: string;
  sem_resposta: number;
  sem_resolver: number;
  acao: "ciente" | "ver_sem_resposta" | "ver_sem_resolver";
}) {
  const { error } = await (supabase as any).from("carbo_wa_aviso_ciente").insert(r);
  if (error) console.warn("[conversas] não registrou o 'ciente':", error.message);
}

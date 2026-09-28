import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { StatusAviso, StatusSeveridade } from "@carbo/shell";

/**
 * Os avisos de status — leitura e escrita da tela do TI.
 *
 * ⚠️ O TI vê o HISTÓRICO (encerrados inclusive); os sete apps veem só
 * `ativo = true`. Isso não é filtro de tela: são duas policies de SELECT que
 * SOMAM (ver a `20261011000000`). Recortar aqui por `ativo` esvaziaria a
 * própria lista que existe para conferir o que já aconteceu.
 */
export interface StatusAvisoLinha extends StatusAviso {
  encerrado_em: string | null;
  created_at: string;
}

export interface NovoAviso {
  severidade: StatusSeveridade;
  titulo: string;
  mensagem: string | null;
  apps: string[];
  previsao_fim: string | null;
  /** Por quantos minutos a tarja VERDE fica no ar depois do "Encerrar". */
  normalizado_minutos: number;
  normalizado_texto: string | null;
}

const CHAVE = ["status-avisos"];

export function useStatusAvisos() {
  return useQuery<StatusAvisoLinha[]>({
    queryKey: CHAVE,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("carbo_status_aviso")
        .select(
          "id, ativo, severidade, titulo, mensagem, apps, inicio_em, previsao_fim, encerrado_em, normalizado_minutos, normalizado_texto, created_at",
        )
        .order("inicio_em", { ascending: false })
        .limit(200);
      // ⚠️ Erro SOBE. Devolver `[]` faria "não consigo ler" ficar igual a "não
      // há aviso nenhum" — a doença que custou três hipóteses no aceite do
      // licenciado. A tela mostra o erro do banco.
      if (error) throw error;
      return (data ?? []) as StatusAvisoLinha[];
    },
    staleTime: 15_000,
  });
}

export function useCriarAviso() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (novo: NovoAviso) => {
      const { data: sessao } = await supabase.auth.getUser();
      const { error } = await supabase.from("carbo_status_aviso").insert({
        severidade: novo.severidade,
        titulo: novo.titulo,
        mensagem: novo.mensagem,
        apps: novo.apps,
        previsao_fim: novo.previsao_fim,
        normalizado_minutos: novo.normalizado_minutos,
        normalizado_texto: novo.normalizado_texto,
        created_by: sessao?.user?.id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: CHAVE }),
  });
}

export function useAlternarAviso() {
  const qc = useQueryClient();
  return useMutation({
    // ⚠️ Encerrar é `ativo = false`, NUNCA delete: o aviso é a prova de que o
    // sistema esteve fora, e é ela que alguém vai querer conferir depois. Por
    // isso a tabela não tem policy de DELETE.
    mutationFn: async ({ id, ativo }: { id: string; ativo: boolean }) => {
      const { error } = await supabase.from("carbo_status_aviso").update({ ativo }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: CHAVE }),
  });
}

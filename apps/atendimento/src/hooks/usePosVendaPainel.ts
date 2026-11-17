import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// O painel do pós-venda (`carbo_posvenda_painel`, 20261174). O banco agrega tudo;
// a tela só formata. As reclamações vêm dos assuntos do painel do atendimento.

const db = supabase as unknown as { rpc: (fn: string, args?: any) => any };

export interface PainelPosVenda {
  gerado_em: string;
  de: string;
  ate: string;
  agora: { abertos: number; vencidos: number; mais_antigo: string | null; por_tipo: { tipo: string; n: number }[] };
  periodo: {
    abertos: number;
    encerrados: number;
    reembolsado: number;
    horas_mediana: number | null;
    horas_p90: number | null;
    no_prazo: number;
    base_prazo: number;
    por_tipo: {
      tipo: string; abertos: number; encerrados: number; reembolsado: number; horas_mediana: number | null;
      desfechos: { desfecho: string; n: number }[];
    }[];
    desfechos: { desfecho: string; n: number; valor: number }[];
    semanas: { semana: string; abertos: number; encerrados: number }[];
    pessoas: { nome: string; abriu: number; passos: number; encerrou: number }[];
  };
  reclamacoes: {
    mensagens: number;
    clientes: number;
    pedidos: number;
    com_caso: number;
    sem_pedido: number;
    ameacas: number;
    por_assunto: { codigo: string; rotulo: string; clientes: number; pedidos: number; com_caso: number }[];
    sem_caso: {
      bling_id: number; pedido_codigo: string | null; pedido_numero: string | null; cliente: string | null;
      canal: string | null; data_pedido: string; antes_do_corte: boolean; n: number; ultima_em: string; assuntos: string[];
    }[];
    sem_caso_total: number;
  };
}

export function usePosVendaPainel(de: string, ate: string) {
  return useQuery({
    queryKey: ["posvenda_painel", de, ate],
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
    placeholderData: (anterior) => anterior,
    queryFn: async (): Promise<PainelPosVenda> => {
      const { data, error } = await db.rpc("carbo_posvenda_painel", { p_de: de, p_ate: ate });
      if (error) throw error;
      return data as PainelPosVenda;
    },
  });
}

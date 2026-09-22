import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface PessoaInterna {
  id: string;
  full_name: string | null;
  username: string | null;
  department: string | null;
}

// Pessoas que podem ser escolhidas como SOLICITANTE de uma RC.
//
// ⚠️ A fonte é `carbo_time_interno_lista()` (20260992), não `carbo_all_profiles()`:
// o portal de lojas e o de licenciados usam a MESMA tabela `profiles`, e a segunda
// devolve a tabela inteira — lojista apareceria no dropdown.
//
// ⚠️ A reserva existe pela ORDEM de deploy: se o front subir antes da migração, a
// RPC não existe e um erro aqui esvaziaria o seletor sem dizer por quê. Cair no
// `carbo_all_profiles` mostra gente a mais por algumas horas, o que é visível —
// melhor que um dropdown vazio, que se lê como "não tem ninguém".
export function useTimeInterno() {
  return useQuery({
    queryKey: ["time_interno_lista"],
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<PessoaInterna[]> => {
      const rpc = (supabase as any).rpc.bind(supabase);
      const { data, error } = await rpc("carbo_time_interno_lista");
      if (!error) return (data ?? []) as PessoaInterna[];

      const { data: todos, error: erroReserva } = await rpc("carbo_all_profiles");
      if (erroReserva) throw erroReserva;
      console.warn(
        "[useTimeInterno] carbo_time_interno_lista indisponível — usando carbo_all_profiles. Rode a migração 20260992.",
        error,
      );
      return (todos ?? []) as PessoaInterna[];
    },
  });
}

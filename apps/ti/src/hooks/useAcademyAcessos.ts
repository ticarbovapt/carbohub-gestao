import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Pedidos de acesso aos cursos do Carbo Academy (08/10/2026).
 *
 * O Academy mora no `carbohub-produtos` (schema `produtos`, mesmo projeto
 * Supabase), e quem libera é o TI, aqui. As duas funções se GUARDAM no
 * próprio corpo: só quem tem a flag `carbo_ti` — a mesma régua que abre
 * este app — vê a fila e decide. A tela não é a trava.
 *
 * ⚠️ `schema("produtos")` sai do tipo do cliente, que só conhece o
 * `public`: o cast é o preço de chamar outro schema, não um atalho.
 */
const produtos = () =>
  (supabase as unknown as { schema: (s: string) => { rpc: typeof supabase.rpc } }).schema("produtos");

export type AcessoStatus = "pendente" | "aprovado" | "recusado";

export interface PedidoAcesso {
  user_id: string;
  nome: string;
  email: string | null;
  avatar_url: string | null;
  /** Papel no Portal de Vendas / md (`produtos.profiles`). */
  papel_portal: string | null;
  /** Loja ou depósito de quem é do Portal / md. */
  loja: string | null;
  /** Departamento de quem é do time interno (`public.profiles`). */
  departamento: string | null;
  e_licenciado: boolean;
  curso_id: string;
  curso_titulo: string;
  oficial: boolean;
  status: AcessoStatus;
  pedido_em: string;
  decidido_em: string | null;
  decidido_por: string | null;
  motivo: string | null;
}

export function useAcademyAcessos() {
  return useQuery({
    queryKey: ["academy-acessos"],
    queryFn: async () => {
      const { data, error } = await produtos().rpc("academy_acessos_fila");
      if (error) throw error;
      return (data ?? []) as PedidoAcesso[];
    },
    // Pedido novo chega sem ninguém clicar: a fila se relê de minuto em minuto.
    refetchInterval: 60_000,
  });
}

export function useDecidirAcesso() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { userId: string; cursoId: string; aprovar: boolean; motivo?: string | null }) => {
      const { error } = await produtos().rpc("academy_decidir_acesso", {
        p_user: v.userId,
        p_curso: v.cursoId,
        p_aprovar: v.aprovar,
        p_motivo: v.motivo ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["academy-acessos"] }),
  });
}

/** De onde a pessoa vem, em português — montado aqui a partir dos três cadastros. */
const PAPEL: Record<string, string> = {
  admin: "Administrador", dono: "Dono", gerente_geral: "Gerente geral",
  gestor: "Gestor", frentista: "Equipe", micro: "Microdistribuidor",
};

export function origemDoPedido(p: PedidoAcesso): string {
  if (p.papel_portal) {
    const papel = PAPEL[p.papel_portal] ?? p.papel_portal;
    return p.loja ? `${papel} · ${p.loja}` : `${papel} · Portal`;
  }
  if (p.departamento) return "Time do Grupo Carbo";
  if (p.e_licenciado) return "Licenciado";
  return "Sem cadastro conhecido";
}

// ─────────────────────────────────────────────────────────────────────────────
// Conta a pagar criada AQUI, no Bling (matriz = conta 1, filial = conta 2).
//
// Quem fala com o Bling é a edge function `fin-contas-pagar`; aqui só se chama
// ela e se traduz a resposta. ⚠️ O Bling PRIMEIRO: a conta só aparece na tela
// depois de nascer lá, já com o id do Bling — é isso que impede o espelho de
// criá-la de novo.
// ⚠️ Liga por CADASTRO (`fin_contas_pagar_config`, por empresa), que nasce
// DESLIGADO. Config ausente ou ilegível = desligado: o botão não aparece.
// ─────────────────────────────────────────────────────────────────────────────
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type ContaBling = 1 | 2;

export function useContaPagarConfig() {
  return useQuery({
    queryKey: ["fin_contas_pagar_config"],
    queryFn: async (): Promise<Record<ContaBling, boolean>> => {
      const { data, error } = await (supabase as any).from("fin_contas_pagar_config").select("conta, ativo");
      const ligado: Record<ContaBling, boolean> = { 1: false, 2: false };
      if (error || !data) return ligado;
      for (const r of data as { conta: number; ativo: boolean }[]) {
        if (r.conta === 1 || r.conta === 2) ligado[r.conta] = !!r.ativo;
      }
      return ligado;
    },
    staleTime: 60_000,
  });
}

export interface Fornecedor { bling_id: number; nome: string | null; fantasia: string | null; cpf_cnpj: string | null }
export interface Portador { id: number; nome: string; usos: number }

/** Nunca lança: devolve `ok: false` com a mensagem que a tela deve mostrar. */
export async function chamarContasPagar<T = Record<string, unknown>>(
  acao: "opcoes" | "fornecedores" | "criar" | "excluir", conta: ContaBling, corpo: Record<string, unknown> = {},
): Promise<{ ok: boolean; mensagem?: string; aviso?: string } & Partial<T>> {
  try {
    const { data, error } = await supabase.functions.invoke("fin-contas-pagar", { body: { acao, conta, ...corpo } });
    if (error) {
      // `functions.invoke` em não-2xx só diz "non-2xx status code": o motivo está no CORPO.
      let msg = error.message;
      try {
        const c = await (error as any).context?.json?.();
        if (c?.mensagem || c?.erro) msg = c.mensagem ?? c.erro;
      } catch { /* mantém a genérica */ }
      return { ok: false, mensagem: msg } as any;
    }
    return data as any;
  } catch (e) {
    return { ok: false, mensagem: e instanceof Error ? e.message : String(e) } as any;
  }
}

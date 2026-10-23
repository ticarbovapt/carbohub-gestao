// ─────────────────────────────────────────────────────────────────────────────
// Conta a pagar E a receber criadas AQUI, no Bling (matriz = conta 1, filial = conta 2).
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
/** Juros mensal e multa (%) são DA FORMA no Bling — a conta não os tem. */
export interface FormaPagamento { id: number; nome: string; usos: number; juros: number | null; multa: number | null; padrao: boolean }
export interface CategoriaBling { id: number; nome: string; usos: number; tipo: number | null }
export interface VendedorBling { id: number; nome: string; usos: number }
export interface CadastrosBling {
  formas: FormaPagamento[]; categorias: CategoriaBling[]; vendedores: VendedorBling[];
  erros: Partial<Record<"formas" | "categorias" | "vendedores", string>>;
}

/** Formas, categorias e vendedores do Bling daquela empresa — os mais usados primeiro. */
export function useCadastrosBling(conta: ContaBling, tipo: "pagar" | "receber", ligado: boolean) {
  return useQuery({
    queryKey: ["bling-cadastros", conta, tipo],
    enabled: ligado,
    staleTime: 30 * 60_000,
    queryFn: async (): Promise<CadastrosBling & { erro: string | null }> => {
      const r = await chamarContasPagar<CadastrosBling>("cadastros", conta, { tipo });
      if (!r.ok) return { formas: [], categorias: [], vendedores: [], erros: {}, erro: r.mensagem ?? "Não foi possível ler o Bling." };
      return { formas: r.formas ?? [], categorias: r.categorias ?? [], vendedores: r.vendedores ?? [], erros: r.erros ?? {}, erro: null };
    },
  });
}

/** Nunca lança: devolve `ok: false` com a mensagem que a tela deve mostrar. */
export async function chamarContasPagar<T = Record<string, unknown>>(
  acao: "opcoes" | "cadastros" | "fornecedores" | "criar" | "excluir", conta: ContaBling, corpo: Record<string, unknown> = {},
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

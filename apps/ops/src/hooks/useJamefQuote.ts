import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// ─────────────────────────────────────────────────────────────────────────────
// Cotação JAMEF — tabela de CONTRATO, não API.
//
// A Jamef não expõe cotação por API: o preço vem da tabela negociada
// (1500 Especial e Exclusiva, origem Natal/RN). O cálculo mora no banco
// (public.jamef_cotar) para que esta tela e o /vender cotem pelo MESMO código.
//
// Duas coisas que a tabela NÃO traz, e que por isso não são inventadas aqui:
//   • PRAZO de entrega — vem null e a tela mostra "consultar".
//   • ALÍQUOTA DE ICMS — cadastrada em jamef_icms_uf com o padrão legal de
//     saída do RN. Se faltar, o total sai SEM ICMS, sinalizado em `avisos`.
// ─────────────────────────────────────────────────────────────────────────────

export interface JamefDestino {
  municipio: string;
  uf: string;
  ibge: string | null;
  sigla: string;
  tarifario: string;
  tipo: string | null;
  /** S = atendimento direto · R = redespacho (prazo a confirmar). */
  atendimento: string | null;
}

export interface JamefComponentes {
  frete_peso: number;
  ad_valorem: number;
  gris: number;
  pedagio: number;
  tas: number;
  taxa_ctrc: number;
  icms: number | null;
}

export interface JamefQuoteOk {
  ok: true;
  transportadora: string;
  servico: string;
  tabela: string;
  vigencia: string;
  origem: string;
  destino: JamefDestino;
  peso: { real: number; cubado: number; taxavel: number; faixa: string };
  componentes: JamefComponentes;
  subtotal: number;
  icms_aliquota: number | null;
  total: number;
  prazo_dias: number | null;
  avisos: string[];
}

export interface JamefQuoteFail {
  ok: false;
  motivo: string;
}

export type JamefQuote = JamefQuoteOk | JamefQuoteFail;

export interface JamefQuoteInput {
  cep: string;
  peso_kg: number;
  altura_cm?: number;
  largura_cm?: number;
  comprimento_cm?: number;
  qtd_volumes?: number;
  valor_nf?: number;
  /** UF de origem — a tabela só vale para RN; outra origem é recusada. */
  origem_uf?: string;
}

export function useJamefQuote() {
  return useMutation({
    mutationFn: async (input: JamefQuoteInput): Promise<JamefQuote> => {
      const { data, error } = await (supabase as unknown as {
        rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
      }).rpc("jamef_cotar", {
        p_cep: input.cep,
        p_peso_kg: input.peso_kg,
        p_altura_cm: input.altura_cm ?? 0,
        p_largura_cm: input.largura_cm ?? 0,
        p_comprimento_cm: input.comprimento_cm ?? 0,
        p_qtd_volumes: input.qtd_volumes ?? 1,
        p_valor_nf: input.valor_nf ?? 0,
        p_origem_uf: input.origem_uf ?? "RN",
      });

      if (error) {
        // Erro do Supabase NÃO é instanceof Error — é objeto com message/hint.
        const e = error as { message?: string; hint?: string } | null;
        return {
          ok: false,
          motivo: e?.message
            ? `Tabela Jamef indisponível: ${e.message}`
            : "Tabela Jamef indisponível no momento.",
        };
      }
      return data as JamefQuote;
    },
  });
}

/** Rótulo curto da faixa de peso, para explicar de onde saiu o valor. */
export const JAMEF_FAIXA_LABEL: Record<string, string> = {
  ate_10kg: "até 10 kg",
  de_10_20kg: "10–20 kg",
  de_20_30kg: "20–30 kg",
  de_30_50kg: "30–50 kg",
  de_50_75kg: "50–75 kg",
  de_75_100kg: "75–100 kg",
  acima_100kg_por_kg: "acima de 100 kg (por kg)",
};

// ─────────────────────────────────────────────────────────────────────────────
// A baixa da FILIAL (Bling 2), pedida pela tela — e o estorno dela.
//
// Quem fala com o Bling 2 é a edge function `bling2-contas`; aqui só se chama
// ela e se TRADUZ a resposta. ⚠️ Ao contrário da matriz, a baixa vai PRIMEIRO
// ao Bling: a filial não tem título próprio no sistema, só o espelho. Se o
// Bling recusa, NADA mudou — e a tela diz o motivo.
//
// ⚠️ Liga e desliga por CADASTRO (`fin_bling2_baixa_config.ativo`), que nasce
// DESLIGADO; `teste_ids` libera títulos UM A UM. Config ausente ou ilegível =
// desligado: a tela nunca oferece um botão que não sabe se vale.
// ─────────────────────────────────────────────────────────────────────────────
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Bling2Tipo } from "@/hooks/useBling2Contas";

export interface BaixaBling2Config { ativo: boolean; teste_ids: string[] }
const DESLIGADO: BaixaBling2Config = { ativo: false, teste_ids: [] };

export function useBaixaBling2Config() {
  return useQuery({
    queryKey: ["fin_bling2_baixa_config"],
    queryFn: async (): Promise<BaixaBling2Config> => {
      const { data, error } = await (supabase as any)
        .from("fin_bling2_baixa_config").select("ativo, teste_ids").maybeSingle();
      if (error || !data) return DESLIGADO;
      return {
        ativo: !!data.ativo,
        teste_ids: Array.isArray(data.teste_ids) ? data.teste_ids.map(String) : [],
      };
    },
    staleTime: 60_000,
  });
}

/** Este título da filial pode ser baixado/estornado pela tela? */
export const baixaLiberada = (cfg: BaixaBling2Config | undefined, id: string) =>
  !!cfg && (cfg.ativo || cfg.teste_ids.includes(id));

export interface RespostaBling2 { ok: boolean; pulado?: string; mensagem: string; bordero?: number | null }

/** Nunca lança: devolve `ok: false` com a mensagem que a tela deve mostrar. */
export async function pedirAoBling2(
  acao: "baixar" | "estornar", tipo: Bling2Tipo, id: string, data?: string,
): Promise<RespostaBling2> {
  try {
    const { data: r, error } = await supabase.functions.invoke("bling2-contas", { body: { acao, tipo, id, data } });
    if (error) {
      // `functions.invoke` em não-2xx só diz "non-2xx status code": o motivo
      // está no CORPO, e é ele que a pessoa precisa ler.
      let msg = error.message;
      try {
        const corpo = await (error as any).context?.json?.();
        if (corpo?.mensagem || corpo?.erro) msg = corpo.mensagem ?? corpo.erro;
      } catch { /* mantém a genérica */ }
      return { ok: false, mensagem: msg };
    }
    return r as RespostaBling2;
  } catch (e) {
    return { ok: false, mensagem: e instanceof Error ? e.message : String(e) };
  }
}

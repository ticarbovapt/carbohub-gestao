// ─────────────────────────────────────────────────────────────────────────────
// A baixa feita no Finanças vai para o Bling 1 (matriz) — e o estorno também.
//
// Quem fala com o Bling é a edge function `bling-contas-baixar`; aqui só se
// chama ela e se TRADUZ a resposta para a tela. A baixa LOCAL acontece antes
// (o update que a tela já fazia); esta chamada é o passo seguinte, e a falha
// dela NÃO desfaz a baixa local — fica registrada no título
// (`bling_baixa_erro`) e a tela mostra.
//
// ⚠️ Liga e desliga por CADASTRO (`fin_bling_baixa_config.ativo`), que nasce
// DESLIGADO: escrever dado financeiro noutro sistema só depois de testado com
// UM título. Desligado, a função responde `pulado` e nada sai daqui.
// ─────────────────────────────────────────────────────────────────────────────
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import type { AjustesTela } from "@/lib/baixaDialogo";

export type TipoConta = "pagar" | "receber";

export interface RespostaBling {
  ok: boolean;
  /** Motivo de não ter ido ao Bling sem ser erro (desligado, já estava pago lá…). */
  pulado?: string;
  mensagem: string;
  bordero?: number | null;
  parcial?: boolean;
}

export interface BaixaBlingConfig {
  /** Ligado para TODOS os títulos do Bling 1. */
  ativo: boolean;
  /** Títulos liberados um a um enquanto `ativo` está desligado (o teste com UM título). */
  teste_ids: string[];
}

const DESLIGADO: BaixaBlingConfig = { ativo: false, teste_ids: [] };

/** O interruptor. Ausente/ilegível = desligado (nunca envia sem saber). */
export function useBaixaBlingConfig() {
  return useQuery({
    queryKey: ["fin_bling_baixa_config"],
    queryFn: async (): Promise<BaixaBlingConfig> => {
      const { data, error } = await (supabase as any)
        .from("fin_bling_baixa_config").select("ativo, teste_ids").maybeSingle();
      if (error) return DESLIGADO;
      return {
        ativo: !!data?.ativo,
        teste_ids: Array.isArray(data?.teste_ids) ? data.teste_ids.map(String) : [],
      };
    },
    staleTime: 60_000,
  });
}

/**
 * Este título vai (ou volta) do Bling ao dar baixa/estorno aqui?
 * Só título do Bling 1 com `bling_id` — o que nasceu no sistema não existe lá.
 * ⚠️ Config ainda carregando (`undefined`) = desligado: nunca envia sem saber.
 */
export function vaiAoBling(
  cfg: BaixaBlingConfig | undefined,
  row: { id: string; source?: string | null; bling_id?: number | string | null },
): boolean {
  if (!cfg) return false;
  return row.source === "bling" && !!row.bling_id && (cfg.ativo || cfg.teste_ids.includes(row.id));
}

/** As colunas que a baixa no Bling grava no título (as duas tabelas). */
export const COLUNAS_BAIXA_BLING = "bling_baixa_em, bling_baixa_bordero, bling_baixa_erro";

/**
 * Coluna da baixa no Bling que ainda não existe (front no ar antes do SQL).
 * ⚠️ O `lerSemTeto` relança só a MENSAGEM (perde o `code`), então além do
 * código olha o texto do Postgres/PostgREST. Qualquer outro erro sobe.
 */
export const faltaColunaDaBaixa = (e: any): boolean => {
  if (!e) return false;
  if (e.code === "42703" || e.code === "PGRST204") return true;
  const msg = String(e.message ?? "");
  return /bling_baixa_|bling_id|paid_by|received_by/.test(msg) && /does not exist|schema cache|Could not find/i.test(msg);
};

/** O aviso da tela depois da baixa enviada — um lugar só para as duas telas. */
export function avisarBaixaNoBling(r: RespostaBling) {
  if (r.ok && r.pulado) toast({ title: "Bling", description: r.mensagem });
  else if (r.ok) toast({ title: r.parcial ? "Baixa parcial no Bling" : "Baixa enviada ao Bling", description: r.parcial ? r.mensagem : r.bordero ? `Borderô ${r.bordero}` : undefined });
  else toast({ title: "Baixado aqui, mas o Bling recusou", description: r.mensagem, variant: "destructive" });
}

/**
 * Pede à função que dê a baixa (ou a desfaça) no Bling.
 * Nunca lança: devolve `ok: false` com a mensagem que a tela deve mostrar.
 */
export async function enviarAoBling(
  acao: "baixar" | "estornar", tipo: TipoConta, id: string,
  /** A conta e os ajustes do diálogo; `data` só importa na PARCIAL (que não tem baixa local). */
  extra: { ajustes?: AjustesTela; data?: string } = {},
): Promise<RespostaBling> {
  try {
    const { data, error } = await supabase.functions.invoke("bling-contas-baixar", { body: { acao, tipo, id, ...extra } });
    if (error) {
      // `functions.invoke` em não-2xx só diz "non-2xx status code": o motivo
      // está no CORPO, e é ele que a pessoa precisa ler.
      let msg = error.message;
      try {
        const corpo = await (error as any).context?.json?.();
        if (corpo?.mensagem || corpo?.erro) msg = corpo.mensagem ?? corpo.erro;
      } catch { /* mantém a mensagem genérica */ }
      return { ok: false, mensagem: msg };
    }
    return data as RespostaBling;
  } catch (e) {
    return { ok: false, mensagem: e instanceof Error ? e.message : String(e) };
  }
}

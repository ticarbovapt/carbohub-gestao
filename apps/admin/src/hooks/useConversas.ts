import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  JANELA_MS, agruparConversas,
  type Conversa, type MensagemConversa,
} from "@/lib/conversas";

/**
 * As conversas do WhatsApp oficial — o IO.
 *
 * ⚠️ Este é o ÚNICO lugar onde elas existem. Número da Cloud API não aparece na
 * Caixa de Entrada do Meta Business Suite (aquela tela só aceita número do
 * aplicativo WhatsApp Business), e a Cloud API não tem endpoint de histórico.
 * O que o webhook não gravou existe só no celular do cliente.
 *
 * As REGRAS (janela, agrupamento, quem espera resposta) moram em
 * `lib/conversas.ts`, onde os testes alcançam. Aqui só há leitura e escrita.
 */

// Reexporta para a tela continuar importando de um lugar só.
export {
  JANELA_MS, janelaAberta, faltaDaJanela, agruparConversas,
  msDaJanela, nivelDaJanela, fracaoDaJanela,
} from "@/lib/conversas";
export type { Conversa, MensagemConversa, NivelJanela } from "@/lib/conversas";

export function useConversas(dias = 30) {
  return useQuery({
    queryKey: ["wa-conversas", dias],
    queryFn: async (): Promise<Conversa[]> => {
      const desde = new Date(Date.now() - dias * 86_400_000).toISOString();

      const [{ data: msgs, error }, { data: contatos }] = await Promise.all([
        (supabase as any).from("carbo_wa_conversas")
          .select("*").gte("ocorrido_em", desde).order("ocorrido_em", { ascending: false })
          .limit(1000),
        (supabase as any).from("carbo_wa_contatos").select("wa_id,last_inbound_at"),
      ]);
      if (error) throw error;

      const janelas: Record<string, string | null> = {};
      for (const c of contatos ?? []) {
        janelas[c.wa_id] = c.last_inbound_at
          ? new Date(new Date(c.last_inbound_at).getTime() + JANELA_MS).toISOString()
          : null;
      }
      return agruparConversas((msgs ?? []) as MensagemConversa[], janelas);
    },
    // A janela anda sozinha, então a tela precisa reavaliar mesmo sem mensagem
    // nova: uma conversa respondível vira não-respondível pela passagem do
    // tempo, e o botão tem de sumir antes de alguém escrever para o vazio.
    refetchInterval: 30_000,
  });
}

export function useResponder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ wa_id, texto }: { wa_id: string; texto: string }) => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Sessão expirada. Faça login novamente.");

      const res = await supabase.functions.invoke("whatsapp-responder", {
        body: { wa_id, texto },
      });

      if (res.error) {
        // ⚠️ Em resposta não-2xx o supabase-js põe o erro em `res.error` e
        // deixa `res.data` nulo — a mensagem que a função escreveu fica no
        // `context`, que é a Response crua. Sem ler daí, "janela fechada" vira
        // "Edge Function returned a non-2xx status code", e quem atende
        // reescreve a resposta várias vezes achando que é falha do sistema.
        const ctx = (res.error as { context?: Response }).context;
        const corpo = ctx ? await ctx.json().catch(() => null) : null;
        throw new Error(corpo?.detalhe || corpo?.error || res.error.message || "Falhou");
      }
      return res.data;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["wa-conversas"] }); },
  });
}

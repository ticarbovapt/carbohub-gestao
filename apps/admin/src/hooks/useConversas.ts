import { useEffect, useRef } from "react";
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
    // ⚠️ CONTINUA existindo mesmo com o Realtime abaixo, e não é redundância:
    // são duas coisas diferentes. O Realtime traz mensagem NOVA; este intervalo
    // reavalia a passagem do TEMPO — uma conversa respondível vira
    // não-respondível sozinha, sem evento nenhum, e o botão tem de sumir antes
    // de alguém escrever para o vazio.
    //
    // E é a rede de segurança do Realtime: WebSocket que cai reconecta em
    // silêncio, e sem o intervalo a tela ficaria parada parecendo vazia.
    refetchInterval: 30_000,
  });
}

/**
 * A conversa ao vivo.
 *
 * ⚠️ Duas tabelas, porque a linha do tempo tem duas origens: `carbo_wa_mensagens`
 * (o que o cliente escreveu e o que o atendimento digitou) e `carbo_msg_envios`
 * (os avisos da esteira, escritos por OUTRA função). Ouvir só a primeira faria
 * o balão do "saiu para entrega" aparecer 30 s atrasado — e quem estivesse
 * conversando responderia sem saber que o sistema acabou de avisar a mesma
 * coisa.
 *
 * Não traz o dado do evento: só invalida. O payload do Realtime é a linha CRUA
 * da tabela, e a tela lê uma view que junta as duas origens e resolve o pedido.
 * Montar o objeto a partir do evento seria uma segunda versão da mesma regra —
 * exatamente o erro que fez a notificação de venda online julgar sozinha e dar
 * três toasts por pedido antigo depois de um F5.
 */
export function useConversasAoVivo() {
  const qc = useQueryClient();
  const canal = useRef<ReturnType<typeof supabase.channel> | null>(null);

  useEffect(() => {
    if (canal.current) {
      supabase.removeChannel(canal.current);
      canal.current = null;
    }
    const invalidar = () => qc.invalidateQueries({ queryKey: ["wa-conversas"] });

    canal.current = supabase
      .channel("wa-conversas")
      .on("postgres_changes" as never,
          { event: "*", schema: "public", table: "carbo_wa_mensagens" }, invalidar)
      // UPDATE também: o status do envio (enviado → entregue → lido) muda a
      // linha sem inserir nada.
      .on("postgres_changes" as never,
          { event: "*", schema: "public", table: "carbo_msg_envios" }, invalidar)
      .subscribe();

    return () => {
      if (canal.current) supabase.removeChannel(canal.current);
      canal.current = null;
    };
  }, [qc]);
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

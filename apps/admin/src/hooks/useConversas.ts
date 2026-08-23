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
export { pareceEncerramento } from "@/lib/conversas";
export type { Conversa, MensagemConversa, NivelJanela, EstadoConversa } from "@/lib/conversas";

export function useConversas(dias = 30) {
  return useQuery({
    queryKey: ["wa-conversas", dias],
    queryFn: async (): Promise<Conversa[]> => {
      const desde = new Date(Date.now() - dias * 86_400_000).toISOString();

      const [{ data: msgs, error }, { data: contatos }, { data: resolvidas }] =
        await Promise.all([
          (supabase as any).from("carbo_wa_conversas")
            .select("*").gte("ocorrido_em", desde).order("ocorrido_em", { ascending: false })
            .limit(1000),
          (supabase as any).from("carbo_wa_contatos").select("wa_id,last_inbound_at"),
          (supabase as any).from("carbo_wa_resolvidas").select("wa_id,resolvido_ate"),
        ]);
      if (error) throw error;

      const janelas: Record<string, string | null> = {};
      for (const c of contatos ?? []) {
        janelas[c.wa_id] = c.last_inbound_at
          ? new Date(new Date(c.last_inbound_at).getTime() + JANELA_MS).toISOString()
          : null;
      }
      const resolvidos: Record<string, string> = {};
      for (const r of resolvidas ?? []) resolvidos[r.wa_id] = r.resolvido_ate;

      return agruparConversas((msgs ?? []) as MensagemConversa[], janelas, resolvidos);
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
      // ⚠️ E a marca de resolvida: sem ela, duas pessoas atendendo veriam filas
      // diferentes, e a segunda responderia o que a primeira já respondeu.
      .on("postgres_changes" as never,
          { event: "*", schema: "public", table: "carbo_wa_resolvidas" }, invalidar)
      // O agendamento que dispara vira mensagem, mas o que FALHA não vira nada
      // — sem ouvir a tabela, a falha só apareceria no próximo minuto do
      // refetch da lista de agendadas.
      .on("postgres_changes" as never,
          { event: "*", schema: "public", table: "carbo_wa_agendadas" },
          () => { qc.invalidateQueries({ queryKey: ["wa-agendadas"] }); invalidar(); })
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

/**
 * Marca a conversa como tratada ATÉ AGORA.
 *
 * ⚠️ Grava a hora, não um "true". Mensagem que o cliente mandar depois reabre a
 * conversa sozinha — com booleano, alguém marcaria hoje e a pergunta de amanhã
 * ficaria escondida atrás da marca.
 */
export function useResolverConversa() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ wa_id, resolver }: { wa_id: string; resolver: boolean }) => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Sessão expirada. Faça login novamente.");

      if (!resolver) {
        // Reabrir é apagar a marca: sem ela, o corte volta a ser só a nossa
        // última resposta, que é o comportamento original.
        const { error } = await (supabase as any)
          .from("carbo_wa_resolvidas").delete().eq("wa_id", wa_id);
        if (error) throw error;
        return;
      }
      const { error } = await (supabase as any)
        .from("carbo_wa_resolvidas")
        .upsert({ wa_id, resolvido_ate: new Date().toISOString(),
                  por: session.user.id, em: new Date().toISOString() },
                { onConflict: "wa_id" });
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["wa-conversas"] }); },
  });
}

// ─── Quem recebe o aviso de mensagem nova ────────────────────────────────────

export interface Notificavel {
  user_id: string;
  full_name: string | null;
  allowed_interfaces: string[] | null;
  recebe: boolean;
  marcado_em: string | null;
}

/**
 * Quem PODE receber o aviso, e quem de fato recebe.
 *
 * ⚠️ A view só devolve time interno. Lojista e licenciado não aparecem aqui nem
 * podem ser marcados — eles compartilham a tabela `profiles`, e a conversa dos
 * clientes da Carbo não é deles.
 */
export function useNotificaveis() {
  return useQuery({
    queryKey: ["wa-notificaveis"],
    queryFn: async (): Promise<Notificavel[]> => {
      const { data, error } = await (supabase as any)
        .from("carbo_wa_notificaveis").select("*");
      if (error) throw error;
      return [...((data ?? []) as Notificavel[])].sort((a, b) => {
        // Quem recebe primeiro: a pergunta que a tela responde é "quem está
        // sendo avisado?", não "quem existe?".
        if (a.recebe !== b.recebe) return a.recebe ? -1 : 1;
        return (a.full_name ?? "").localeCompare(b.full_name ?? "", "pt-BR");
      });
    },
  });
}

export function useMarcarNotificado() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ user_id, recebe }: { user_id: string; recebe: boolean }) => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Sessão expirada. Faça login novamente.");

      // ⚠️ Upsert, e o registro FICA quando se desliga. Apagar a linha perderia
      // quem já esteve marcado, e religar exigiria redescobrir a lista.
      const { error } = await (supabase as any)
        .from("carbo_wa_notificados")
        .upsert({ user_id, ativo: recebe, criado_por: session.user.id },
                { onConflict: "user_id" });
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["wa-notificaveis"] }); },
  });
}

// ─── Mensagens agendadas ─────────────────────────────────────────────────────

export interface Agendada {
  id: string;
  wa_id: string;
  texto: string;
  enviar_em: string;
  status: "pendente" | "enviado" | "cancelado" | "falhou";
  motivo: string | null;
  erro_codigo: number | null;
  criado_em: string;
}

/**
 * O que está marcado para sair, e o que falhou.
 *
 * ⚠️ Traz `falhou` junto com `pendente` de propósito. Quem agendou foi embora
 * achando que estava resolvido — a falha não aparece na cara de ninguém como
 * num envio manual. Se ela não estiver na tela, não está em lugar nenhum.
 */
export function useAgendadas(wa_id: string | null) {
  return useQuery({
    queryKey: ["wa-agendadas", wa_id],
    enabled: !!wa_id,
    queryFn: async (): Promise<Agendada[]> => {
      const { data, error } = await (supabase as any)
        .from("carbo_wa_agendadas").select("*")
        .eq("wa_id", wa_id)
        .in("status", ["pendente", "falhou"])
        .order("enviar_em", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Agendada[];
    },
    refetchInterval: 60_000,
  });
}

export function useAgendar() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ wa_id, texto, enviar_em }:
                       { wa_id: string; texto: string; enviar_em: string }) => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Sessão expirada. Faça login novamente.");

      const { error } = await (supabase as any).from("carbo_wa_agendadas")
        .insert({ wa_id, texto, enviar_em, criado_por: session.user.id });
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ["wa-agendadas", v.wa_id] });
    },
  });
}

export function useCancelarAgendada() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id }: { id: string; wa_id: string }) => {
      // ⚠️ `cancelado`, não DELETE: a linha é o registro de que alguém pensou
      // em dizer aquilo e desistiu. Apagar some com a intenção junto.
      const { error } = await (supabase as any).from("carbo_wa_agendadas")
        .update({ status: "cancelado" }).eq("id", id).eq("status", "pendente");
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ["wa-agendadas", v.wa_id] });
    },
  });
}

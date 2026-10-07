import { useEffect, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase, FUNCTIONS_URL } from "@/integrations/supabase/client";
import { chaveDoFone } from "@/hooks/useEsteiraOnline";
import {
  JANELA_MS, agruparConversas,
  type Conversa, type MensagemConversa, type Atendimento,
  type TagConversa, type StatusAtendimento, type RespostaRapida,
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
export { pareceEncerramento, statusEfetivo } from "@/lib/conversas";
export type { StatusAtendimento, Atendimento, TagConversa } from "@/lib/conversas";
export type { Conversa, MensagemConversa, NivelJanela, EstadoConversa } from "@/lib/conversas";
// As funções de filtro são PURAS e moram na `lib`; o hook só as repassa, para
// a tela ter um import só — o mesmo caminho de `janelaAberta` e `faltaDaJanela`.
export {
  aplicarFiltrosDaCaixa, quantosFiltrosAtivos, FILTROS_VAZIOS,
} from "@/lib/conversas";
export type { FiltrosDaCaixa, OrdemDaCaixa } from "@/lib/conversas";
// A barra `/atalho`: o que decide quando o painel abre e o que casa com o termo
// é PURO e mora na `lib` — dá para conferir sem montar tela.
export {
  termoDaBarra, filtrarRespostas, normalizarAtalho, atalhoValido,
} from "@/lib/conversas";
export type { RespostaRapida } from "@/lib/conversas";

/**
 * Os números da Cloud API que a Carbo opera.
 *
 * ⚠️ Só os ATIVOS. O cadastro guarda também o que ainda não foi registrado na
 * Meta (o de carrinho, hoje), e oferecer na tela um número que não envia é
 * prometer o que a Graph API recusa com erro genérico — que manda procurar no
 * lugar errado.
 */
export interface NumeroWa {
  phone_number_id: string;
  rotulo: string;
  numero_exibicao: string | null;
  funcao: string;
  cor: string | null;
  ordem: number;
}

export function useNumeros() {
  return useQuery({
    queryKey: ["wa-numeros"],
    queryFn: async (): Promise<NumeroWa[]> => {
      const { data, error } = await (supabase as any)
        .from("carbo_wa_numeros")
        .select("phone_number_id, rotulo, numero_exibicao, funcao, cor, ordem")
        .eq("ativo", true)
        .order("ordem");
      if (error) throw error;
      return (data ?? []) as NumeroWa[];
    },
    // Cadastro muda uma vez por semestre; relê-lo a cada 30 s seria ruído.
    staleTime: 5 * 60_000,
  });
}

export function useConversas(dias = 30, numeroId?: string | null) {
  return useQuery({
    queryKey: ["wa-conversas", dias, numeroId ?? null],
    queryFn: async (): Promise<Conversa[]> => {
      const desde = new Date(Date.now() - dias * 86_400_000).toISOString();

      const [{ data: msgs, error }, { data: contatos }, { data: atend }, { data: vinculos }] =
        await Promise.all([
          // ⚠️ AS QUATRO consultas filtram pelo mesmo número. Filtrar só a
          // primeira traria a janela, o status e as etiquetas do OUTRO número
          // para dentro desta caixa — o "balde de sobra" do repo irmão, em que
          // a tela monta o mapa a partir de uma lista JÁ filtrada e recebe as
          // linhas de uma consulta que não foi.
          //
          // ⚠️ E `numeroId` nulo NÃO significa "todos": significa que a tela
          // ainda não escolheu. Devolver tudo misturaria as caixas, que é o
          // defeito inteiro. Quem decide é o `enabled` lá embaixo.
          (supabase as any).from("carbo_wa_conversas")
            .select("*").gte("ocorrido_em", desde).eq("numero_id", numeroId)
            .order("ocorrido_em", { ascending: false })
            .limit(1000),
          (supabase as any).from("carbo_wa_contatos")
            .select("wa_id,last_inbound_at").eq("numero_id", numeroId),
          (supabase as any).from("carbo_wa_atendimento").select("*").eq("numero_id", numeroId),
          // A tag vem junto do vínculo: a lista da esquerda precisa das etiquetas
          // para filtrar, e uma consulta por conversa seriam 36 idas ao banco.
          (supabase as any).from("carbo_wa_conversa_tag")
            .select("wa_id, carbo_wa_tags(id, nome, cor, ativo)")
            .eq("numero_id", numeroId),
        ]);
      if (error) throw error;

      const janelas: Record<string, string | null> = {};
      for (const c of contatos ?? []) {
        janelas[c.wa_id] = c.last_inbound_at
          ? new Date(new Date(c.last_inbound_at).getTime() + JANELA_MS).toISOString()
          : null;
      }
      // ⚠️ `resolvido_ate` continua alimentando o corte de "pendente" do
      // `agruparConversas` — mas agora ele sai do ATENDIMENTO, não da tabela
      // antiga. Duas fontes para a mesma marca seria a divergência de sempre.
      const resolvidos: Record<string, string> = {};
      const atendimentos: Record<string, Atendimento> = {};
      for (const a of atend ?? []) {
        atendimentos[a.wa_id] = {
          wa_id: a.wa_id, status: a.status, desde: a.desde,
          responsavel: a.responsavel, responsavel_nome: a.responsavel_nome,
        };
        if (a.status === "resolvido") resolvidos[a.wa_id] = a.desde;
      }

      const tagsPorConversa: Record<string, TagConversa[]> = {};
      for (const v of (vinculos ?? []) as any[]) {
        const t = v.carbo_wa_tags;
        if (!t || t.ativo === false) continue;   // tag desativada some da tela
        (tagsPorConversa[v.wa_id] ??= []).push({ id: t.id, nome: t.nome, cor: t.cor });
      }

      // ⚠️ Na régua de CARRINHO o `bling_id` é o id do CHECKOUT, e a view
      // procura o nome do cliente na ESTEIRA — que não tem checkout nenhum.
      // Sem isto toda conversa da caixa da loja nasce "Sem nome" até a pessoa
      // responder (só aí existe o nome do WhatsApp). O nome vem do próprio
      // carrinho, que é o cadastro desta régua, como o pedido é o da outra.
      const lista = (msgs ?? []) as MensagemConversa[];
      const checkouts = [...new Set(lista
        .filter((m) => !m.cliente_pedido && m.bling_id != null
                       && m.sobre_a_etapa?.startsWith("carrinho_"))
        .map((m) => m.bling_id as number))];
      if (checkouts.length > 0) {
        // Falhar aqui não pode derrubar a caixa: sem o nome, a conversa
        // continua aparecendo — como aparecia antes.
        const { data: carrinhos, error: errCar } = await (supabase as any)
          .from("nuvemshop_carrinhos").select("checkout_id, cliente")
          .in("checkout_id", checkouts);
        if (errCar) console.error("[conversas] nome do carrinho:", errCar.message);
        const nomes = new Map<number, string>();
        for (const c of (carrinhos ?? []) as any[]) {
          if (c.cliente?.trim()) nomes.set(Number(c.checkout_id), c.cliente.trim());
        }
        for (const m of lista) {
          if (!m.cliente_pedido && m.bling_id != null && m.sobre_a_etapa?.startsWith("carrinho_")) {
            m.cliente_pedido = nomes.get(Number(m.bling_id)) ?? null;
          }
        }
      }

      // ⚠️ A reserva GERAL: conversa que ficou sem nome pelo pedido, pelo
      // carrinho e pelo WhatsApp (envio de teste, cliente que não respondeu)
      // ganha o nome pelo TELEFONE (`carbo_wa_nomes_por_fone`, migração
      // 20261057). Só apresentação — não liga a conversa a pedido nenhum.
      const comNome = new Set(lista.filter((m) => m.cliente_pedido || m.nome_whatsapp)
                                   .map((m) => m.wa_id));
      const semNome = [...new Set(lista.map((m) => m.wa_id))].filter((w) => !comNome.has(w));
      if (semNome.length > 0) {
        const { data: porFone, error: errFone } = await (supabase as any)
          .rpc("carbo_wa_nomes_por_fone", { p_wa_ids: semNome });
        // Falhar não derruba a caixa (inclusive antes de a migração rodar).
        if (errFone) console.error("[conversas] nome pelo telefone:", errFone.message);
        const nomes = new Map<string, string>();
        for (const r of (porFone ?? []) as any[]) if (r.nome) nomes.set(r.wa_id, r.nome);
        for (const m of lista) {
          if (!m.cliente_pedido && nomes.has(m.wa_id)) m.cliente_pedido = nomes.get(m.wa_id)!;
        }
      }

      return agruparConversas(lista, janelas,
                              resolvidos, atendimentos, tagsPorConversa);
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
    // ⚠️ Sem número escolhido não consulta. Uma consulta sem o filtro voltaria
    // a misturar as três caixas, e misturar é exatamente o que esta tela
    // passou a existir para não fazer.
    enabled: !!numeroId,
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
      // ⚠️ E o recado interno: duas pessoas atendendo é o caso normal, e o
      // recado existe justamente para uma avisar a outra. Chegar 30 s depois é
      // chegar depois da resposta.
      .on("postgres_changes" as never,
          { event: "*", schema: "public", table: "carbo_wa_notas" },
          () => qc.invalidateQueries({ queryKey: ["wa-notas"] }))
      // Status, responsável e etiqueta: duas pessoas na mesma fila é o caso
      // normal, e sem isto a segunda assume uma conversa que a primeira pegou
      // vinte segundos atrás.
      .on("postgres_changes" as never,
          { event: "*", schema: "public", table: "carbo_wa_atendimento" }, invalidar)
      .on("postgres_changes" as never,
          { event: "*", schema: "public", table: "carbo_wa_conversa_tag" }, invalidar)
      .on("postgres_changes" as never,
          { event: "*", schema: "public", table: "carbo_wa_tags" },
          () => { qc.invalidateQueries({ queryKey: ["wa-tags"] }); invalidar(); })
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
    mutationFn: async ({ wa_id, texto, numero_id }:
                       { wa_id: string; texto: string; numero_id?: string | null }) => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Sessão expirada. Faça login novamente.");

      const res = await supabase.functions.invoke("whatsapp-responder", {
        // ⚠️ POR QUAL número a resposta sai. A função tem reserva no número de
        // serviço, então omitir não quebra — manda do número errado, que é pior.
        body: { wa_id, texto, numero_id },
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

// ⚠️ `useResolverConversa` FOI REMOVIDA (25/08/2026).
//
// Ela gravava em `carbo_wa_resolvidas`, e a migração 20260935 mudou a fonte da
// verdade para `carbo_wa_atendimento`. O lado da LEITURA migrou junto (ver o
// comentário na `useConversas`, acima); os botões da tela não. Durante esse
// intervalo o "Marcar resolvida" subia o toast de sucesso, gravava a linha, e a
// conversa continuava aberta — porque ninguém mais lia onde ela era gravada.
//
// Quem resolve agora é a `useDefinirStatus` com `status: "resolvido"`, e
// reabrir é `status: "aberto"` (que devolve a conversa ao status DERIVADO de
// quem falou por último, em vez de apagar uma marca).
//
// A TABELA `carbo_wa_resolvidas` continua no banco, com o histórico de quem
// resolveu o quê antes da mudança. Não foi apagada de propósito: é registro, e
// ninguém escreve mais nela.

// ─── Status, responsável e tags ──────────────────────────────────────────────

/**
 * Muda o status da conversa.
 *
 * ⚠️ `desde` é REESCRITO a cada mudança, e é isso que faz a reabertura
 * funcionar: marcar "aguardando" hoje não pode ser desfeito por uma mensagem de
 * ontem que já estava lá.
 */
export function useDefinirStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ wa_id, status, assumir, numero_id }:
                       { wa_id: string; status: StatusAtendimento; assumir?: boolean;
                         numero_id?: string | null }) => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Sessão expirada. Faça login novamente.");

      const linha: Record<string, unknown> = {
        wa_id, numero_id, status,
        desde: new Date().toISOString(),
        atualizado_em: new Date().toISOString(),
        atualizado_por: session.user.id,
      };

      // Assumir junto com "em atendimento": são a mesma ação na cabeça de quem
      // clica, e deixar em dois passos produz conversa em atendimento sem dono.
      if (assumir) {
        const { data: perfil } = await (supabase as any)
          .from("profiles").select("full_name").eq("id", session.user.id).maybeSingle();
        linha.responsavel = session.user.id;
        linha.responsavel_nome = perfil?.full_name ?? session.user.email ?? null;
      }

      const { error } = await (supabase as any)
        .from("carbo_wa_atendimento").upsert(linha, { onConflict: "numero_id,wa_id" });
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["wa-conversas"] }); },
  });
}

/** Passa a conversa para outra pessoa — ou tira o dono (null). */
export function useDefinirResponsavel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ wa_id, user_id, nome, numero_id }:
                       { wa_id: string; user_id: string | null; nome: string | null;
                         numero_id?: string | null }) => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Sessão expirada. Faça login novamente.");

      // ⚠️ NÃO mexe em `desde`: trocar o responsável não é decidir de novo
      // sobre a conversa, e reescrever a data desfaria uma reabertura pendente.
      const { error } = await (supabase as any).from("carbo_wa_atendimento")
        .upsert({ wa_id, numero_id, responsavel: user_id, responsavel_nome: nome,
                  atualizado_em: new Date().toISOString(),
                  atualizado_por: session.user.id },
                { onConflict: "numero_id,wa_id" });
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["wa-conversas"] }); },
  });
}

export function useAtendentes() {
  return useQuery({
    queryKey: ["wa-atendentes"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("carbo_wa_atendentes").select("user_id, full_name");
      if (error) throw error;
      return (data ?? []) as { user_id: string; full_name: string | null }[];
    },
    staleTime: 5 * 60_000,
  });
}

/** As etiquetas existentes — só as ativas, que são as ofertáveis. */
export function useTags() {
  return useQuery({
    queryKey: ["wa-tags"],
    queryFn: async (): Promise<TagConversa[]> => {
      const { data, error } = await (supabase as any)
        .from("carbo_wa_tags").select("id, nome, cor").eq("ativo", true).order("nome");
      if (error) throw error;
      return (data ?? []) as TagConversa[];
    },
    staleTime: 60_000,
  });
}

export function useCriarTag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ nome, cor }: { nome: string; cor: string }) => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Sessão expirada. Faça login novamente.");
      const { data, error } = await (supabase as any).from("carbo_wa_tags")
        .insert({ nome: nome.trim(), cor, criado_por: session.user.id })
        .select("id, nome, cor").single();
      if (error) {
        // 23505 = já existe uma com esse nome. Dizer isso é melhor que "erro".
        throw new Error(error.code === "23505"
          ? "Já existe uma etiqueta com esse nome."
          : error.message);
      }
      return data as TagConversa;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["wa-tags"] }); },
  });
}

export function useMarcarTag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ wa_id, tag_id, marcar, numero_id }:
                       { wa_id: string; tag_id: string; marcar: boolean;
                         numero_id?: string | null }) => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Sessão expirada. Faça login novamente.");

      if (!marcar) {
        // ⚠️ Aqui DELETE é certo: tirar etiqueta errada é operação do dia, e
        // guardar o vínculo desfeito não serve a ninguém. O que não se apaga é
        // a TAG (vira `ativo = false`), porque conversa antiga aponta para ela.
        const { error } = await (supabase as any).from("carbo_wa_conversa_tag")
          .delete().eq("wa_id", wa_id).eq("tag_id", tag_id);
        if (error) throw error;
        return;
      }
      const { error } = await (supabase as any).from("carbo_wa_conversa_tag")
        .upsert({ wa_id, numero_id, tag_id, por: session.user.id },
                { onConflict: "numero_id,wa_id,tag_id" });
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
    // Rede de segurança do Realtime (WebSocket cai em silêncio), não o
    // mecanismo: o que tira a tarja "Agendada para…" no instante do envio é o
    // evento da `carbo_wa_agendadas`, publicada na 20260932.
    refetchInterval: 30_000,
  });
}

export function useAgendar() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ wa_id, texto, enviar_em, numero_id }:
                       { wa_id: string; texto: string; enviar_em: string;
                         numero_id?: string | null }) => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Sessão expirada. Faça login novamente.");

      const { error } = await (supabase as any).from("carbo_wa_agendadas")
        // ⚠️ A agendada guarda o número: ela sai horas depois, e tem de sair
        // pelo MESMO número em que a conversa aconteceu — senão chega de um
        // desconhecido.
        .insert({ wa_id, numero_id, texto, enviar_em, criado_por: session.user.id });
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

// ─── Recado interno ──────────────────────────────────────────────────────────

export interface Nota {
  id: string;
  wa_id: string;
  texto: string;
  autor: string | null;
  autor_nome: string | null;
  criado_em: string;
}

/**
 * Os recados internos de uma conversa.
 *
 * ⚠️ Tabela SEPARADA das mensagens, e é isso que garante o sigilo — não a cor
 * na tela. Nenhum caminho de envio lê `carbo_wa_notas`; se o recado morasse em
 * `carbo_wa_mensagens` com uma coluna `interna`, o sigilo dependeria de todo
 * SELECT futuro lembrar do filtro.
 */
export function useNotas(wa_id: string | null) {
  return useQuery({
    queryKey: ["wa-notas", wa_id],
    enabled: !!wa_id,
    queryFn: async (): Promise<Nota[]> => {
      const { data, error } = await (supabase as any)
        .from("carbo_wa_notas").select("*")
        .eq("wa_id", wa_id).is("apagada_em", null)
        .order("criado_em", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Nota[];
    },
  });
}

export function useAnotar() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ wa_id, texto, numero_id }:
                       { wa_id: string; texto: string; numero_id?: string | null }) => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Sessão expirada. Faça login novamente.");

      // O nome é COPIADO para a linha: quem escreveu continua sendo quem
      // escreveu depois de sair da empresa ou ter o perfil desativado.
      const { data: perfil } = await (supabase as any)
        .from("profiles").select("full_name").eq("id", session.user.id).maybeSingle();

      const { error } = await (supabase as any).from("carbo_wa_notas").insert({
        wa_id, numero_id, texto: texto.trim(), autor: session.user.id,
        autor_nome: perfil?.full_name ?? session.user.email ?? null,
      });
      if (error) throw error;
    },
    onSuccess: (_d, v) => { qc.invalidateQueries({ queryKey: ["wa-notas", v.wa_id] }); },
  });
}

export function useApagarNota() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id }: { id: string; wa_id: string }) => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Sessão expirada. Faça login novamente.");
      // ⚠️ Marca, não apaga: o recado é registro de quem sabia o quê e quando.
      const { error } = await (supabase as any).from("carbo_wa_notas")
        .update({ apagada_em: new Date().toISOString(), apagada_por: session.user.id })
        .eq("id", id).is("apagada_em", null);
      if (error) throw error;
    },
    onSuccess: (_d, v) => { qc.invalidateQueries({ queryKey: ["wa-notas", v.wa_id] }); },
  });
}

// ─── Foto, documento e áudio ─────────────────────────────────────────────────

/**
 * Envia um arquivo pelo WhatsApp.
 *
 * ⚠️ `multipart`, não JSON com base64. Base64 cresce o arquivo em um terço e
 * uma foto de celular já chega perto do teto de 5 MB da Meta — o que passaria
 * no navegador seria recusado lá, com um erro que não explica o motivo.
 *
 * E NÃO usa `functions.invoke`: ele serializa o corpo como JSON e o `FormData`
 * chegaria vazio do outro lado.
 */
/**
 * Baixa a mídia que o cliente mandou.
 *
 * ⚠️ O navegador não consegue sozinho. O webhook guarda o `media_id`; o arquivo
 * fica na Meta e sai de lá em DUAS chamadas que exigem o nosso token — pôr o
 * token no front seria entregar a conta do WhatsApp a quem abrir o DevTools.
 * Por isso a ponte é uma edge function.
 *
 * ⚠️ `enabled` só liga no CLIQUE. Uma conversa com quinze áudios dispararia
 * quinze pares de chamadas ao Graph a cada abertura da tela — e a Realtime
 * reabre a lista sozinha o tempo todo.
 *
 * O `objectURL` é revogado na saída: sem isso cada reabertura de conversa deixa
 * um blob preso na memória da aba, que fica aberta o dia inteiro no atendimento.
 */
export function useMidia(media_id: string | null, ligado: boolean) {
  const q = useQuery({
    queryKey: ["wa-midia", media_id],
    enabled: !!media_id && ligado,
    // A URL de origem da Meta expira em minutos, mas o blob já baixado não —
    // ele vale enquanto a aba viver. Rebaixar seria pagar duas vezes.
    staleTime: Infinity,
    gcTime: 10 * 60_000,
    retry: false,
    queryFn: async (): Promise<{ url: string; mime: string }> => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Sessão expirada. Faça login novamente.");

      // ⚠️ GET, e o id vai na URL. Com POST o navegador NÃO guarda a resposta
      // no cache de HTTP — o `Cache-Control` da função era ignorado e cada F5
      // baixava o mesmo áudio da Meta de novo, gastando duas chamadas ao Graph
      // por escuta. Em GET a mesma URL responde do disco.
      const res = await fetch(
        `${FUNCTIONS_URL}/whatsapp-midia-baixar?media_id=${encodeURIComponent(media_id!)}`,
        { headers: { "Authorization": `Bearer ${session.access_token}` } },
      );
      if (!res.ok) {
        // A função responde JSON no erro e bytes no sucesso — ler como JSON
        // aqui é o que traz a frase da retenção de 30 dias em vez de "502".
        const corpo = await res.json().catch(() => null);
        throw new Error(corpo?.detalhe || corpo?.error || `Falhou (${res.status})`);
      }
      const blob = await res.blob();
      return { url: URL.createObjectURL(blob), mime: blob.type };
    },
  });

  const url = q.data?.url;
  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);

  return q;
}

export function useEnviarMidia() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ wa_id, arquivo, legenda, numero_id }:
                       { wa_id: string; arquivo: File; legenda?: string;
                         numero_id?: string | null }) => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Sessão expirada. Faça login novamente.");

      const form = new FormData();
      form.append("wa_id", wa_id);
      // ⚠️ O upload e o envio têm de ir para o MESMO número: o `media_id` que a
      // Meta devolve pertence ao número que subiu o arquivo, e cruzá-los volta
      // como erro genérico da Graph API.
      if (numero_id) form.append("numero_id", numero_id);
      form.append("arquivo", arquivo, arquivo.name || "arquivo");
      if (legenda?.trim()) form.append("legenda", legenda.trim());

      const res = await fetch(`${FUNCTIONS_URL}/whatsapp-midia`, {
        method: "POST",
        headers: { "Authorization": `Bearer ${session.access_token}` },
        body: form,
      });
      const corpo = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(corpo?.detalhe || corpo?.error || `Falhou (${res.status})`);
      }
      return corpo;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["wa-conversas"] }); },
  });
}

/**
 * Procurar dentro de UMA conversa — e a busca vai ao SERVIDOR, de propósito.
 *
 * ⚠️ A `useConversas` carrega 30 dias com `.limit(1000)`. Buscar no que está em
 * memória devolveria "nada" para o comprovante de junho, e quem procura,
 * procura justamente o que não está à vista: a pessoa concluiria que a
 * mensagem não existe. É a ausência disfarçada de resposta — o mesmo defeito
 * do `Math.round` inventando `×1` e do `(arquivo)` na prévia da lista.
 *
 * Sem recorte de data, então: a conversa inteira, desde sempre.
 *
 * ⚠️ Só a partir de DOIS caracteres. Com um, o `ilike` varre a conversa
 * inteira para devolver quase tudo — custo de banco para um resultado que não
 * responde nada.
 */
export interface AchadoNaConversa {
  wamid: string;
  texto: string;
  ocorrido_em: string;
  direcao: "entrada" | "saida";
}

export function useBuscaNaConversa(wa_id: string | null, termo: string) {
  const t = termo.trim();
  return useQuery({
    queryKey: ["wa-busca", wa_id, t],
    enabled: !!wa_id && t.length >= 2,
    staleTime: 30_000,
    queryFn: async (): Promise<AchadoNaConversa[]> => {
      // ⚠️ `%` e `_` são curingas do `ilike`: digitar "50%" sem escapar varre
      // tudo o que começa com 50 e o resultado parece aleatório.
      const alvo = `%${t.replace(/[\\%_]/g, (c) => "\\" + c)}%`;
      const { data, error } = await (supabase as any)
        .from("carbo_wa_conversas")
        .select("wamid, texto, ocorrido_em, direcao")
        .eq("wa_id", wa_id)
        .ilike("texto", alvo)
        .order("ocorrido_em", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as AchadoNaConversa[];
    },
  });
}

/**
 * Os arquivos de UMA conversa, do mais novo para o mais antigo.
 *
 * ⚠️ Vai ao servidor pela mesma razão da busca, e por uma segunda: o arquivo
 * que alguém procura na galeria é quase sempre o antigo — o recente ainda está
 * rolando na tela.
 *
 * ⚠️ E ela devolve a LISTA, nunca as imagens. A mídia aqui NÃO é baixada: o
 * webhook guarda só o `midia_id` e o link da Meta expira, então cada arquivo
 * passa pela `whatsapp-midia-baixar` com o nosso token. Montar uma grade de
 * miniaturas baixaria vinte arquivos no clique de abrir a galeria — quem abre
 * quer UM. O download continua sendo por item, no mesmo caminho do balão.
 */
export interface ItemDaGaleria {
  wamid: string;
  tipo: string;
  texto: string | null;
  midia_id: string;
  ocorrido_em: string;
  direcao: "entrada" | "saida";
}

export function useGaleriaDaConversa(wa_id: string | null, ligado: boolean) {
  return useQuery({
    queryKey: ["wa-galeria", wa_id],
    enabled: !!wa_id && ligado,
    staleTime: 60_000,
    queryFn: async (): Promise<ItemDaGaleria[]> => {
      const { data, error } = await (supabase as any)
        .from("carbo_wa_conversas")
        .select("wamid, tipo, texto, midia_id, ocorrido_em, direcao")
        .eq("wa_id", wa_id)
        .not("midia_id", "is", null)
        .order("ocorrido_em", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as ItemDaGaleria[];
    },
  });
}

// ─── Respostas rápidas ───────────────────────────────────────────────────────

/**
 * A lista do time, em ordem de atalho.
 *
 * ⚠️ `staleTime` alto e uma consulta só para a tela inteira: a barra `/` abre a
 * cada tecla, e reconsultar ali faria uma ida ao banco por caractere digitado.
 * A lista é cadastro — muda quando alguém cria uma resposta, não durante o
 * atendimento.
 */
export function useRespostasRapidas() {
  return useQuery({
    queryKey: ["wa-respostas"],
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<RespostaRapida[]> => {
      const { data, error } = await (supabase as any)
        .from("carbo_wa_respostas")
        .select("id, atalho, corpo, criado_por, criado_em")
        .order("atalho");
      if (error) throw error;
      return (data ?? []) as RespostaRapida[];
    },
  });
}

export function useSalvarResposta() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ atalho, corpo }: { atalho: string; corpo: string }) => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Sessão expirada. Faça login novamente.");
      // ⚠️ Manda o bruto: quem normaliza é o gatilho do banco, e mandar daqui
      // já normalizado criaria DUAS regras para a mesma coisa — no dia em que
      // elas divergissem, o índice único deixaria de pegar o duplicado.
      const { data, error } = await (supabase as any).from("carbo_wa_respostas")
        .insert({ atalho, corpo, criado_por: session.user.id })
        .select("id, atalho, corpo, criado_por, criado_em").single();
      if (error) {
        // 23505 = o atalho já existe. Dizer isso é melhor que "erro": o próximo
        // passo de quem vê é escolher outro nome, e "erro" não leva a lugar
        // nenhum. 23514 = o CHECK do formato.
        throw new Error(
          error.code === "23505" ? `Já existe uma resposta com o atalho /${atalho}.`
          : error.code === "23514" ? "O atalho aceita só letras, números, hífen e _ (até 24)."
          : error.message);
      }
      return data as RespostaRapida;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["wa-respostas"] }); },
  });
}

export function useApagarResposta() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error, count } = await (supabase as any)
        .from("carbo_wa_respostas").delete({ count: "exact" }).eq("id", id);
      if (error) throw new Error(error.message);
      // ⚠️ DELETE recusado pela RLS não dá erro — volta com zero linhas. Sem
      // esta conferência, apagar a resposta de outra pessoa mostraria sucesso e
      // a linha continuaria lá até o próximo F5. É a família do
      // `.from().update()` sem checagem, que escondeu por meses que
      // `postos.prefix` não existia.
      if (count === 0) throw new Error("Essa resposta é de outra pessoa — só quem escreveu (ou a chefia) pode apagar.");
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["wa-respostas"] }); },
  });
}

/* ── "Não contatar" — quem pediu para parar de receber ofertas ─────────────
 *
 * ⚠️ Vale para o COMERCIAL (oferta de recompra e lembrete de carrinho), nunca
 * para os avisos do pedido. Quem barra é o `whatsapp-meta`, no envio; aqui só
 * se marca e se mostra. A chave é DDD + últimos 8 dígitos (`chaveDoFone`):
 * marcar no número do Clube vale para a pessoa em todos os números nossos.
 * Escrita só pelas RPCs (migração 20261053) — a tabela não tem policy de
 * escrita. */
export interface NaoContatar { chave: string; motivo: string | null; marcado_em: string }

export function useNaoContatar(wa_id: string | null) {
  const chave = chaveDoFone(wa_id);
  return useQuery({
    queryKey: ["nao-contatar", chave],
    enabled: !!chave,
    queryFn: async (): Promise<NaoContatar | null> => {
      const { data, error } = await (supabase as any)
        .from("carbo_wa_nao_contatar").select("chave, motivo, marcado_em")
        .eq("chave", chave).is("removido_em", null).maybeSingle();
      if (error) throw error;
      return (data ?? null) as NaoContatar | null;
    },
  });
}

export function useMarcarNaoContatar() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ wa_id, numero_id, parar }: { wa_id: string; numero_id?: string | null; parar: boolean }) => {
      const { error } = parar
        ? await (supabase as any).rpc("carbo_wa_nao_contatar_marcar",
            { p_wa_id: wa_id, p_numero_id: numero_id ?? null, p_motivo: "marcado na conversa" })
        : await (supabase as any).rpc("carbo_wa_nao_contatar_desmarcar", { p_wa_id: wa_id });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["nao-contatar"] });
      qc.invalidateQueries({ queryKey: ["nao-contatar-lista"] });
    },
  });
}

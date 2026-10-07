import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { EnvioMsg } from "@/hooks/useMensagensCliente";

/**
 * Esteira do e-commerce — espelho puro.
 *
 * Lê `public.bling2_esteira`, que já entrega a etapa calculada. A tela NÃO
 * recalcula etapa: se a regra mudar, muda na view e todas as pontas mudam
 * juntas. Foi assim que "conta como venda" virou regra duplicada em quinze
 * lugares antes.
 *
 * Nenhum card é arrastável, de propósito. Cada etapa tem uma fonte externa que
 * a prova (Bling, NF, etiqueta, plataforma); um card que alguém pudesse mover à
 * mão passaria a mentir no minuto seguinte, quando o sync trouxesse a verdade.
 */

/**
 * ⚠️ UMA cadência para as duas consultas do quadro, e é obrigatório que seja a
 * mesma.
 *
 * A coluna "Pago" e o resto da esteira mostram fatias COMPLEMENTARES da mesma
 * realidade: `ecommerce_aguardando_bling` exclui exatamente o que
 * `bling2_esteira` inclui (`situacao_id in (9,12)`). No banco não há vão.
 *
 * Com relógios diferentes (eram 30 s e 120 s), havia: quando o pedido cruzava
 * para o Bling, a coluna "Pago" percebia em 30 s e SOLTAVA o card, e o quadro
 * só o recebia até 2 minutos depois. Nesse intervalo o pedido não estava em
 * lugar nenhum, e a tela parecia exigir F5 para funcionar.
 *
 * Duas consultas que se completam não podem andar em ritmos diferentes. Se um
 * dia isto precisar mudar, mude para as duas — por isso é uma constante, e não
 * um número solto em cada `useQuery`.
 *
 * 10 s é escolha do dono do processo: a esteira fica aberta numa tela da
 * logística o dia inteiro, e o card mudando de coluna é o próprio sinal de que
 * a operação andou. Custo: duas consultas por pessoa a cada 10 s, ambas sobre
 * views indexadas e com teto de 1000 linhas.
 */
const RECARGA_MS = 10_000;

export type EtapaEsteira =
  | "confirmado" | "nf_emitida" | "etiqueta" | "em_transito" | "entregue" | "cancelado";

export interface EsteiraRow {
  bling_id: number;
  pedido_numero: string | null;
  pedido_loja: string | null;
  canal: string | null;
  loja_id: number | null;
  /**
   * Veio de canal ON-LINE? (`20260976`)
   *
   * ⚠️ Opcional de propósito. A coluna nasce na migração, e o deploy do front
   * pode chegar antes de alguém rodá-la — aí `select("*")` devolve a linha SEM
   * o campo. Tipando como obrigatório, o filtro trataria `undefined` como
   * "não é on-line" e a esteira apareceria VAZIA. O filtro é
   * `e_online !== false`: ausência mostra, como era antes.
   */
  e_online?: boolean | null;
  data_pedido: string | null;
  total: number;
  cliente: string | null;
  cliente_doc: string | null;
  cliente_fone: string | null;
  entrega_endereco: string | null;
  entrega_bairro: string | null;
  entrega_cidade: string | null;
  entrega_uf: string | null;
  entrega_cep: string | null;
  nf_numero: string | null;
  nf_chave: string | null;
  nf_situacao: string | null;
  nf_data: string | null;
  nf_pdf: string | null;
  transportadora: string | null;
  servico: string | null;
  rastreio: string | null;
  volumes: number | null;
  peso_kg: number | null;
  items: unknown;
  carboze_order_id: string | null;
  carboze_order_number: string | null;
  etapa: EtapaEsteira;
  tem_status_da_plataforma: boolean;
  /** O número que o CLIENTE vê (CZAAAAMMXXXX). Não substitui o do Bling: a
   *  operação fala com o Bling pelo `pedido_numero`, e com o cliente por este. */
  pedido_codigo: string | null;
  /** ⚠️ De onde veio o rastreio: `bling`, `melhorenvio` ou `plataforma`.
   *
   *  Existe para ninguém mais ler ausência de informação como ausência de
   *  envio. Foi exatamente esse erro de leitura que fez 79 pedidos parecerem
   *  parados — a etiqueta existia, só não passava pelo Bling. */
  rastreio_origem: "bling" | "melhorenvio" | "plataforma" | null;
  /** Situação da etiqueta no Melhor Envio: gerado, postado, entregue,
   *  vencido, cancelado, pago, rascunho. */
  me_situacao: string | null;
  me_gerado_em: string | null;
  /** ⚠️ Etiqueta tem validade. Vencida sem uso, o dinheiro do frete foi. */
  me_expirado_em: string | null;
  /** ⚠️ A etiqueta eleita para este pedido está VIVA?
   *
   *  `false` = o pedido não tem nenhuma etiqueta ativa e o que se vê é o último
   *  estado morto (vencida ou cancelada). `null` = não há envio no Melhor Envio
   *  nenhum (etiqueta do Bling, marketplace, retirada) — que é MUITO diferente
   *  de `false` e não deve virar alerta.
   *
   *  Não dá para deduzir isso de `me_situacao`: quando a etiqueta morta tem
   *  carimbo de postagem, a situação devolve "postado" e ela se disfarça de
   *  envio normal. Foi assim que seis etiquetas vencidas (R$ 688,10 de frete)
   *  só apareceram quando alguém montou planilha à mão. */
  me_tem_ativo: boolean | null;
}

/** As colunas do quadro, na ordem do fluxo. `cancelado` fica fora: não é etapa
 *  da esteira, é saída dela — aparece num contador à parte. */
export const ETAPAS: Array<{ key: EtapaEsteira; label: string; descricao: string; color: string }> = [
  { key: "confirmado",  label: "Confirmado",   descricao: "pedido atendido no Bling",           color: "#9333ea" },
  // ⚠️ "Sem etiqueta", e não mais "NF emitida".
  //
  // O rótulo antigo descrevia o que JÁ ACONTECEU (a nota saiu) numa coluna cuja
  // única pergunta é o que FALTA. E ele escondia o problema: enquanto a esteira
  // só enxergava a etiqueta que passava pelo Bling, 89 pedidos moravam aqui —
  // 79 deles com etiqueta gerada, paga e às vezes postada, invisível.
  //
  // Com o Melhor Envio como fonte, o que sobra nesta coluna é o caso real:
  // nota emitida e nenhuma etiqueta em lugar nenhum. Aí o nome tem de dizer
  // isso, porque agora é trabalho de gente, não cegueira de sistema.
  { key: "nf_emitida",  label: "Sem etiqueta", descricao: "nota emitida, nenhuma etiqueta ainda", color: "#f59e0b" },
  { key: "etiqueta",    label: "Etiqueta",     descricao: "gerada, aguardando postagem",        color: "#0ea5e9" },
  { key: "em_transito", label: "Em trânsito",  descricao: "postado — a caminho",                color: "#06b6d4" },
  { key: "entregue",    label: "Entregue",     descricao: "entrega confirmada",                 color: "#10b981" },
];

/**
 * ⚠️ Recebe um INTERVALO, não uma quantidade de dias.
 *
 * A versão anterior aceitava `dias` e a tela oferecia 7, 30 ou 90 — três
 * respostas para uma pergunta que tem infinitas. "Quero ver a primeira semana
 * de julho" não cabia em nenhuma delas, e quem precisava disso não tinha saída
 * nenhuma dentro da tela.
 *
 * Datas explícitas (YYYY-MM-DD, o mesmo formato de `data_pedido`) resolvem os
 * dois casos com um parâmetro só: os atalhos viram contas de data feitas na
 * tela, e o intervalo livre passa a ser possível sem nada de especial aqui.
 */
export function useEsteiraOnline(de: string, ate: string) {
  return useQuery({
    queryKey: ["esteira-online", de, ate],
    enabled: Boolean(de && ate),
    queryFn: async (): Promise<EsteiraRow[]> => {
      const { data, error } = await (supabase as any)
        .from("bling2_esteira")
        .select("*")
        .gte("data_pedido", de)
        .lte("data_pedido", ate)
        .order("data_pedido", { ascending: false })
        .limit(1000);
      if (error) throw error;
      // ⚠️ A Esteira do ON-LINE só mostra pedido on-line. Venda de balcão
      // (loja 0 sem marca da PayT) entrava aqui só porque a view não filtra
      // canal — e a view não filtra de propósito: `carbo_msg_fila` lê dela, e
      // excluir venda direta lá pararia o WhatsApp desses clientes em silêncio.
      // Por isso o corte é AQUI, na tela.
      // ⚠️ `!== false`, não `=== true`: enquanto a migração 20260976 não rodar,
      // a coluna não existe e o campo vem `undefined` — ausência tem de MOSTRAR
      // (comportamento de antes), nunca esvaziar a tela.
      return (data ?? []).filter((r: EsteiraRow) => r.e_online !== false) as EsteiraRow[];
    },
    // A esteira anda sozinha e agora é ao vivo: sync de 1 min, ponte de 2 min,
    // disparo de mensagem de 1 min. Um painel que recarrega mais devagar que a
    // operação que ele mostra atrasa a decisão de quem está olhando.
    refetchInterval: RECARGA_MS,
  });
}

/* ─── O ponto cego da janela ────────────────────────────────────────────────
 *
 * ⚠️ A esteira filtra por período, e isso esconde exatamente o que mais importa.
 *
 * O caso que revelou: o pedido do Edmilson (18/07, R$ 59,90, etiqueta expirada
 * sem postagem) saiu da janela de 30 dias e ficou invisível. Um pedido travado
 * não fica menos travado por envelhecer — fica MAIS. E o filtro de data, que
 * existe para a tela não pesar, tirava da vista justamente o caso pior.
 *
 * A solução não é remover o filtro (a coluna "Entregue" com um ano de histórico
 * seria ilegível), e sim abrir uma exceção estreita: pedido em etapa NÃO
 * terminal, anterior ao início do período, continua alcançável — num bloco à
 * parte, para não se misturar com o que está dentro da janela.
 */

/**
 * UM pedido, pelo `bling_id`, sem janela de tempo.
 *
 * Existe porque a tela de Conversas abre o card do pedido de que a conversa
 * trata, e ali não há período nenhum escolhido — há um `bling_id` que veio do
 * aviso que a esteira mandou, e ele pode ser de qualquer data.
 *
 * ⚠️ É por isso que NÃO dá para reusar o `useEsteiraOnline`: aquele recorta por
 * `data_pedido` e tem teto de 1.000 linhas. Um pedido de junho simplesmente não
 * estaria na resposta — e o sintoma seria o card "não abrir", sem erro nenhum,
 * que é exatamente o aviso âmbar que a Esteira precisa mostrar quando recebe um
 * link fora da janela.
 *
 * ⚠️ `maybeSingle`, não `single`: pedido que saiu da esteira (cancelado fora do
 * corte, ou nunca chegado ao Bling) devolve ZERO linhas, e `single` transforma
 * isso em erro. Ausência aqui é resposta — quem chama precisa distinguir "não
 * existe" de "falhou ao carregar", e são telas diferentes.
 */
export function useEsteiraPedido(blingId: number | null) {
  return useQuery({
    queryKey: ["esteira-pedido", blingId],
    enabled: blingId != null,
    queryFn: async (): Promise<EsteiraRow | null> => {
      const { data, error } = await (supabase as any)
        .from("bling2_esteira")
        .select("*")
        .eq("bling_id", blingId)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as EsteiraRow | null;
    },
  });
}

export function useEsteiraTravadosAntigos(de: string) {
  return useQuery({
    queryKey: ["esteira-travados-antigos", de],
    enabled: Boolean(de),
    queryFn: async (): Promise<EsteiraRow[]> => {
      const { data, error } = await (supabase as any)
        .from("bling2_esteira")
        .select("*")
        .lt("data_pedido", de)
        // Terminais ficam de fora: entregue acabou, cancelado saiu. O que sobra
        // é o que ainda espera alguma coisa — e espera há mais tempo que a
        // janela inteira.
        .not("etapa", "in", "(entregue,cancelado)")
        .order("data_pedido", { ascending: true })
        .limit(200);
      if (error) throw error;
      // ⚠️ A Esteira do ON-LINE só mostra pedido on-line. Venda de balcão
      // (loja 0 sem marca da PayT) entrava aqui só porque a view não filtra
      // canal — e a view não filtra de propósito: `carbo_msg_fila` lê dela, e
      // excluir venda direta lá pararia o WhatsApp desses clientes em silêncio.
      // Por isso o corte é AQUI, na tela.
      // ⚠️ `!== false`, não `=== true`: enquanto a migração 20260976 não rodar,
      // a coluna não existe e o campo vem `undefined` — ausência tem de MOSTRAR
      // (comportamento de antes), nunca esvaziar a tela.
      return (data ?? []).filter((r: EsteiraRow) => r.e_online !== false) as EsteiraRow[];
    },
    refetchInterval: 60_000,
  });
}

/* ─── Parado além do limite da etapa ────────────────────────────────────────
 *
 * ⚠️ A conta NÃO é refeita aqui. Ela mora na view `carbo_esteira_parados`,
 * porque quem também precisa dela é a função que manda o alerta para o sininho
 * — e duas implementações da mesma regra divergem calado. É a doença do
 * `pedidoRaiz` (front × banco) e a do `quotePdf.ts` do mkt.
 *
 * O relógio é POR ETAPA: `nf_emitida` conta da emissão da NF, `etiqueta` conta
 * de quando a etiqueta foi gerada, `em_transito` conta da postagem. Contar da
 * data do pedido misturaria demora de faturamento com demora de expedição, e
 * um pedido faturado ontem (porque o cliente atrasou o pagamento) apareceria
 * como problema de logística.
 *
 * Os limiares vêm de `carbo_esteira_limite`, tabela — a operação ajusta sem
 * deploy, e limiar que não cabe na realidade vira alerta ignorado.
 */

export interface ParadoRow {
  bling_id: number;
  etapa: string;
  dias_parado: number;
  limite_dias: number;
  etiqueta_morta: boolean;
  diagnostico: string;
}

export function useEsteiraParados() {
  return useQuery({
    queryKey: ["esteira-parados"],
    queryFn: async (): Promise<Map<number, ParadoRow>> => {
      const { data, error } = await (supabase as any)
        .from("carbo_esteira_parados")
        .select("bling_id,etapa,dias_parado,limite_dias,etiqueta_morta,diagnostico")
        .limit(500);
      if (error) throw error;
      return new Map((data ?? []).map((r: ParadoRow) => [Number(r.bling_id), r]));
    },
    // Parado é problema de DIAS. Recarregar de minuto em minuto não descobriria
    // nada mais cedo e só gastaria consulta.
    refetchInterval: 10 * 60_000,
  });
}

/* ─── Pago, antes do Bling ──────────────────────────────────────────────────
 *
 * A esteira do Bling só mostra pedido ATENDIDO (`situacao_id in (9,12)`), e
 * pedido novo nasce "Em aberto" lá. Por isso a compra podia levar horas para
 * aparecer no quadro — e não adiantava sincronizar mais vezes: o Bling ainda
 * não dizia Atendido. Não era latência, era estado de negócio.
 *
 * `ecommerce_aguardando_bling` fecha esse buraco lendo a plataforma direto, que
 * chega em ~2 segundos pelo webhook. O pedido some de lá sozinho quando o Bling
 * alcança — as duas consultas nunca mostram o mesmo pedido.
 *
 * ⚠️ View SEPARADA de propósito. A `bling2_esteira` alimenta `carbo_msg_fila`;
 * jogar esses pedidos lá dentro seria apertar o gatilho de um envio em massa.
 */

export interface AguardandoRow {
  platform: string;
  pedido_loja: string;
  canal: string | null;
  data_pedido: string | null;
  ordered_at: string;
  total: number;
  itens: number;
  produtos: string | null;
  cliente: string | null;
  cliente_fone: string | null;
  cliente_email: string | null;
  minutos_parado: number;
}

export function useEcommerceAguardando() {
  return useQuery({
    queryKey: ["ecommerce-aguardando-bling"],
    queryFn: async (): Promise<AguardandoRow[]> => {
      const { data, error } = await (supabase as any)
        .from("ecommerce_aguardando_bling")
        .select("*")
        .order("minutos_parado", { ascending: false });
      if (error) throw error;
      return (data ?? []) as AguardandoRow[];
    },
    // Mesmo relógio do quadro — ver RECARGA_MS. Foi a diferença entre os dois
    // que fazia o card sumir na travessia.
    refetchInterval: RECARGA_MS,
  });
}

/* ─── O aviso saiu? ────────────────────────────────────────────────────────
 *
 * `carbo_msg_envios` tem PK (bling_id, etapa) — uma linha por etapa por pedido,
 * e é ela que garante uma mensagem só. Aqui essa mesma chave vira a resposta
 * para "o cliente foi avisado desta etapa?".
 *
 * ⚠️ Ausência de linha NÃO é falha. Enquanto o template da etapa está
 * desligado, não se espera envio nenhum — e pintar a esteira inteira de aviso
 * vermelho por causa de uma função que ninguém ligou seria ruído puro, do tipo
 * que ensina a equipe a ignorar a cor. Quem decide se a falta é problema é o
 * `ativo` do template, não a ausência em si.
 */

export type StatusAviso = "enviado" | "erro" | "pendente" | "ignorado" | "sem_registro";

export function useAvisosDoPedido(blingIds: number[]) {
  // A chave precisa ser estável: array novo a cada render refaria a consulta
  // para sempre. Mesmo cuidado do `useRastreios`.
  const chave = [...new Set(blingIds)].sort((a, b) => a - b).join(",");
  return useQuery({
    queryKey: ["msg-envios-por-pedido", chave],
    enabled: chave.length > 0,
    queryFn: async (): Promise<Map<string, EnvioMsg>> => {
      const ids = chave.split(",").map(Number).filter(Boolean);
      const achados: EnvioMsg[] = [];
      // Lotes de 200: o PostgREST monta o `in` na URL, e isso continua
      // verdadeiro quando a operação crescer.
      for (let i = 0; i < ids.length; i += 200) {
        const { data, error } = await (supabase as any)
          .from("carbo_msg_envios")
          .select("*")
          .in("bling_id", ids.slice(i, i + 200));
        if (error) throw error;
        achados.push(...((data ?? []) as EnvioMsg[]));
      }
      const mapa = new Map<string, EnvioMsg>();
      for (const e of achados) mapa.set(`${e.bling_id}:${e.etapa}`, e);
      return mapa;
    },
    refetchInterval: 60_000,
  });
}

/* ─── Régua de recompra ─────────────────────────────────────────────────────
 *
 * Segunda pipeline da mesma tela: o cliente recebeu, descansa X dias, recebe a
 * oferta, e volta (ou não). A coluna é CALCULADA pela view
 * `carbo_recompra_pipeline` — nada se arrasta aqui pelo mesmo motivo da esteira
 * de entrega: um card movido à mão mentiria assim que a próxima venda chegasse.
 *
 * ⚠️ `historico` é pedido que já estava entregue quando a régua nasceu, com
 * DATA ESTIMADA. Ele fica fora do disparo automático de propósito — eram 85
 * pessoas que receberiam a oferta no mesmo segundo em que a mensagem fosse
 * ligada. Aparece na tela num bloco à parte, para a decisão de ofertar a essa
 * base ser deliberada em vez de acidental.
 */

export type ColunaRecompra =
  | "entregue" | "ofertar" | "ofertado" | "recomprou" | "sem_retorno" | "historico"
  // ⚠️ As duas abaixo NÃO vêm da view: são calculadas na TELA
  // (`colunaRecompraNaTela`). A view alimenta a fila de WhatsApp, e
  // republicá-la para mudar a ARRUMAÇÃO do quadro seria mexer no gatilho por
  // causa de uma questão de exibição.
  | "sem_telefone" | "erro_envio" | "nao_contatar";

export interface RecompraRow {
  bling_id: number;
  pedido_loja: string | null;
  canal: string | null;
  cliente: string | null;
  cliente_fone: string | null;
  cpf_cnpj: string | null;
  total: number;
  entrega_cidade: string | null;
  entrega_uf: string | null;
  entregue_em: string;
  origem_da_data: "rastreio" | "carimbo" | "historico";
  ofertado_em: string | null;
  recomprou: boolean;
  dias_desde_entrega: number;
  coluna: ColunaRecompra;
}

/** As colunas da régua, na ordem do fluxo. `historico` fica fora: não é etapa,
 *  é a base anterior à régua, e vai num bloco separado. */
export const COLUNAS_RECOMPRA: Array<{ key: ColunaRecompra; label: string; descricao: string; color: string }> = [
  { key: "entregue",    label: "Entregue",         descricao: "descansando até a janela",        color: "#10b981" },
  { key: "ofertar",     label: "Hora de ofertar",  descricao: "passou a janela, sem oferta",     color: "#f59e0b" },
  { key: "ofertado",    label: "Ofertado",         descricao: "mensagem enviada, aguardando",    color: "#0ea5e9" },
  { key: "recomprou",   label: "Recomprou",        descricao: "voltou a comprar após a entrega", color: "#9333ea" },
  { key: "sem_retorno", label: "Sem retorno",      descricao: "não voltou — base de campanha",   color: "#64748b" },
];

/** Colunas que nascem RECOLHIDAS, ao fim do quadro. Quem está nelas nunca vai
 *  receber a oferta (sem telefone) ou já tentou e não chegou (erro): deixá-las
 *  em "Entregue" e "Hora de ofertar" fazia o trabalho parecer maior do que é —
 *  os ~90 do Mercado Livre sem telefone, sozinhos, enchiam a coluna. */
export const COLUNAS_RECOMPRA_RECOLHIDAS: Array<{ key: ColunaRecompra; label: string; descricao: string; color: string }> = [
  { key: "sem_telefone", label: "Sem telefone",     descricao: "não dá para ofertar pelo WhatsApp", color: "#94a3b8" },
  { key: "erro_envio",   label: "Erro ao enviar",   descricao: "a oferta saiu e não chegou",        color: "#ef4444" },
  { key: "nao_contatar", label: "Não contatar",     descricao: "pediu para não receber ofertas",    color: "#a855f7" },
];

const FALHOU = new Set(["erro", "falhou"]);

/** A coluna que a TELA mostra. Parte da coluna da view e só desvia dois casos:
 *  ⚠️ `recomprou` e `historico` nunca saem do lugar — recompra é desfecho, e
 *  vale mais que o motivo de não termos falado com a pessoa. */
/** O pedido de "não contatar" veio no envio (o `whatsapp-meta` o gravou) ou
 *  está na lista — a lista é o que mostra quem ainda NÃO chegou à fila. */
const pediuParaParar = (fone: string | null, envio: EnvioMsg | undefined, lista?: Set<string>) =>
  (envio?.status === "ignorado" && (envio.motivo ?? "").startsWith("não contatar"))
  || (!!lista && !!chaveDoFone(fone) && lista.has(chaveDoFone(fone)!));

export function colunaRecompraNaTela(r: RecompraRow, envio?: EnvioMsg, lista?: Set<string>): ColunaRecompra {
  if (r.coluna === "recomprou" || r.coluna === "historico") return r.coluna;
  // Só antes ou no lugar da oferta: quem já foi ofertado e DEPOIS pediu para
  // parar continua em Ofertado/Sem retorno — a oferta saiu, é fato.
  if ((r.coluna === "entregue" || r.coluna === "ofertar" || r.coluna === "ofertado")
      && pediuParaParar(r.cliente_fone, envio, lista)
      && !(r.coluna === "ofertado" && envio && envio.status !== "ignorado")) return "nao_contatar";
  if (envio && FALHOU.has(envio.status)) return "erro_envio";
  const semFone = !(r.cliente_fone ?? "").trim()
    || (envio?.status === "ignorado" && (envio.motivo ?? "").startsWith("telefone"));
  // Só antes da oferta: quem já foi ofertado TINHA telefone, e o card dele conta
  // a história da oferta, não da falta.
  if (semFone && (r.coluna === "entregue" || r.coluna === "ofertar")) return "sem_telefone";
  return r.coluna;
}

/** DDD + últimos 8 dígitos — a chave da lista "não contatar".
 *  ⚠️ CÓPIA de `public.carbo_fone_chave` e de `chaveDoFone` no
 *  `_shared/metaTemplate.ts`: frouxa de propósito (o 9º dígito varia entre o
 *  cadastro e o `wa_id` da Meta), porque aqui errar é deixar de mandar.
 *  Mudou uma, mude as três. */
export function chaveDoFone(bruto: string | null | undefined): string | null {
  const d = String(bruto ?? "").replace(/\D/g, "");
  if (!d) return null;
  if (d.startsWith("55") && (d.length === 12 || d.length === 13)) return d.slice(2, 4) + d.slice(-8);
  if (d.length === 10 || d.length === 11) return d.slice(0, 2) + d.slice(-8);
  return d;
}

/** As chaves de quem pediu para não receber ofertas (valendo agora). */
export function useNaoContatarLista() {
  return useQuery({
    queryKey: ["nao-contatar-lista"],
    queryFn: async (): Promise<Set<string>> => {
      const { data, error } = await (supabase as any)
        .from("carbo_wa_nao_contatar").select("chave").is("removido_em", null);
      // Antes da migração 20261053 a tabela não existe: a tela segue como era.
      if (error) { console.warn("[esteira] carbo_wa_nao_contatar:", error.message); return new Set(); }
      return new Set(((data ?? []) as { chave: string }[]).map((r) => r.chave));
    },
    refetchInterval: 60_000,
  });
}

/** Os envios das etapas pedidas, por `bling_id` (no carrinho é o id do
 *  checkout). Com mais de uma etapa, vale a ÚLTIMA da lista que existir — é a
 *  mensagem mais recente que diz se o carrinho está com erro AGORA.
 *  Paginado: passa de mil linhas cedo, e o teto silencioso do PostgREST
 *  cortaria o resto sem aviso. */
function useEnviosPorEtapa(etapas: string[]) {
  return useQuery({
    queryKey: ["msg-envios-etapas", etapas.join(",")],
    queryFn: async (): Promise<Map<number, EnvioMsg>> => {
      const mapa = new Map<number, EnvioMsg>();
      const ordem = (e: string) => etapas.indexOf(e);
      for (let de = 0; de < 200_000; de += 1000) {
        const { data, error } = await (supabase as any)
          .from("carbo_msg_envios")
          .select("*")
          .in("etapa", etapas)
          .order("bling_id")
          .order("etapa")
          .range(de, de + 999);
        if (error) throw error;
        for (const e of (data ?? []) as EnvioMsg[]) {
          const atual = mapa.get(e.bling_id);
          if (!atual || ordem(e.etapa) > ordem(atual.etapa)) mapa.set(e.bling_id, e);
        }
        if (!data || data.length < 1000) break;
      }
      return mapa;
    },
    refetchInterval: 60_000,
  });
}

export const useEnviosRecompra = () => useEnviosPorEtapa(["recompra"]);
export const useEnviosCarrinho = () => useEnviosPorEtapa(["carrinho_1", "carrinho_2", "carrinho_3"]);

export function useRecompraPipeline() {
  return useQuery({
    queryKey: ["recompra-pipeline"],
    queryFn: async (): Promise<RecompraRow[]> => {
      const { data, error } = await (supabase as any)
        .from("carbo_recompra_pipeline")
        .select("*")
        .order("dias_desde_entrega", { ascending: false });
      if (error) throw error;
      return (data ?? []) as RecompraRow[];
    },
    // A régua anda em DIAS. Recarregar no ritmo da esteira de entrega (10 s)
    // seria consulta à toa: nada aqui muda de coluna dentro de um minuto.
    refetchInterval: 5 * 60_000,
  });
}

/** Os ajustes da régua, para a tela poder dizer QUAL janela está valendo em vez
 *  de deixar o número implícito. */
export interface RecompraConfig {
  dias_para_ofertar: number;
  dias_para_desistir: number;
}

export function useRecompraConfig() {
  return useQuery({
    queryKey: ["recompra-config"],
    queryFn: async (): Promise<RecompraConfig | null> => {
      const { data, error } = await (supabase as any)
        .from("carbo_recompra_config")
        .select("dias_para_ofertar, dias_para_desistir")
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as RecompraConfig | null;
    },
    staleTime: 5 * 60_000,
  });
}

/* ─── Recuperação de carrinho ───────────────────────────────────────────────
 *
 * Terceira pipeline. As outras duas falam com quem JÁ comprou; esta fala com
 * quem quase comprou — encheu o carrinho, chegou no checkout e não terminou.
 *
 * ⚠️ Só a loja própria (Nuvemshop). Mercado Livre e Amazon fazem a própria
 * recuperação e não expõem o contato de quem abandonou — nem poderiam, o
 * comprador é cliente DELES até o pedido existir. Não é limitação da
 * implementação: é de onde o dado existe.
 *
 * A coluna é CALCULADA pela view `carbo_carrinho_pipeline`, como nas outras
 * duas. Nada se arrasta: um card movido à mão mentiria na rodada seguinte do
 * sync.
 */

export type ColunaCarrinho =
  | "aberto" | "msg1" | "msg2" | "msg3"
  | "recuperado" | "perdido" | "sem_telefone"
  // Calculada na TELA (`colunaCarrinhoNaTela`), nunca na view — ver a mesma
  // nota em `ColunaRecompra`.
  | "erro_envio" | "nao_contatar"
  // Também da TELA: o cliente respondeu e a sequência parou
  // (`carbo_carrinho_respostas`, migração 20261051).
  | "respondeu"
  // As três que ficam FORA do quadro: nenhuma delas vai receber mensagem.
  // `duplicado` é tentativa anterior da mesma pessoa — quem erra o cartão e
  // tenta de novo cria um checkout novo, e sem essa separação receberia a
  // mesma mensagem duas ou três vezes, em minutos, sobre a mesma compra.
  | "historico" | "ignorado" | "duplicado";

export interface CarrinhoRow {
  checkout_id: number;
  abandonado_em: string;
  completado_em: string | null;
  cliente: string | null;
  telefone: string | null;
  email: string | null;
  total: number;
  itens: number;
  produtos: string | null;
  /** A URL que RESTAURA o carrinho. É a peça central da mensagem. */
  link: string | null;
  msg1_em: string | null;
  msg2_em: string | null;
  msg3_em: string | null;
  recuperado: boolean;
  tem_telefone: boolean;
  /** Existe carrinho MAIS NOVO do mesmo contato (e-mail ou telefone). */
  tem_mais_novo: boolean;
  minutos_parado: number;
  /** Quando a próxima mensagem vence. null = não há próxima. */
  proxima_em: string | null;
  coluna: ColunaCarrinho;
}

/** As colunas do quadro, na ordem do fluxo.
 *
 * ⚠️ `sem_telefone` ESTÁ aqui, e as outras três de fora (`historico`,
 * `ignorado`, e nada mais) não. O carrinho sem telefone é a única exceção que
 * merece coluna: ele é trabalho real e possível — dá para mandar e-mail, dá
 * para ligar — e é o número que mede quanto a loja perde por não pedir o
 * telefone antes do fim do checkout. Escondê-lo faria a conta de recuperação
 * parecer melhor do que é. */
export const COLUNAS_CARRINHO: Array<{ key: ColunaCarrinho; label: string; descricao: string; color: string }> = [
  { key: "aberto",       label: "Abandonado",   descricao: "ainda dentro da 1ª janela",        color: "#f59e0b" },
  { key: "msg1",         label: "1ª mensagem",  descricao: "lembrete enviado",                 color: "#0ea5e9" },
  { key: "msg2",         label: "2ª mensagem",  descricao: "segunda tentativa",                color: "#6366f1" },
  { key: "msg3",         label: "3ª mensagem",  descricao: "última — depois desta, não insiste", color: "#9333ea" },
  { key: "respondeu",    label: "Respondeu",    descricao: "parou — uma pessoa assume na conversa", color: "#14b8a6" },
  { key: "recuperado",   label: "Recuperado",   descricao: "voltou e comprou",                 color: "#10b981" },
  { key: "perdido",      label: "Perdido",      descricao: "não voltou — base de campanha",    color: "#64748b" },
];

/** Recolhidas ao fim do quadro, como na régua de recompra. ⚠️ `sem_telefone`
 *  continua CONTADO à vista no trilho — esconder o número faria a conta de
 *  recuperação parecer melhor do que é —, só deixou de disputar espaço com os
 *  carrinhos que dá para avisar. */
export const COLUNAS_CARRINHO_RECOLHIDAS: Array<{ key: ColunaCarrinho; label: string; descricao: string; color: string }> = [
  { key: "sem_telefone", label: "Sem telefone",   descricao: "só e-mail — não dá para avisar", color: "#94a3b8" },
  { key: "erro_envio",   label: "Erro ao enviar", descricao: "a mensagem saiu e não chegou",   color: "#ef4444" },
  { key: "nao_contatar", label: "Não contatar",   descricao: "pediu para não receber ofertas", color: "#a855f7" },
];

/** A coluna que a TELA mostra. Só desvia o carrinho cuja ÚLTIMA mensagem falhou.
 *  ⚠️ `recuperado` nunca sai do lugar: comprou é desfecho. */
export function colunaCarrinhoNaTela(r: CarrinhoRow, envio?: EnvioMsg, resposta?: RespostaCarrinho,
                                     lista?: Set<string>): ColunaCarrinho {
  if (r.coluna === "recuperado") return r.coluna;
  // ⚠️ Antes de "Respondeu": quem respondeu E pediu para parar já foi
  // atendido — o caso está resolvido, não esperando alguém.
  if (["aberto", "msg1", "msg2", "msg3", "perdido"].includes(r.coluna)
      && pediuParaParar(r.telefone, envio, lista)) return "nao_contatar";
  // ⚠️ Antes do erro: quem respondeu está falando com a gente, e o que importa
  // é que alguém atenda. E as colunas da view NÃO servem aqui — o freio grava
  // 'ignorado' nas etapas que faltavam, e a view leria isso como mensagem
  // enviada, empurrando o card para "3ª mensagem" ou "Perdido".
  if (resposta && ["aberto", "msg1", "msg2", "msg3", "perdido"].includes(r.coluna)) return "respondeu";
  if (envio && FALHOU.has(envio.status)) return "erro_envio";
  return r.coluna;
}

/** Quem respondeu a uma mensagem de carrinho. Casado no banco por IDENTIDADE
 *  (o `wa_id` que a Meta devolveu no envio + o mesmo número nosso). */
export interface RespostaCarrinho {
  checkout_id: number;
  wa_id: string;
  numero_id: string | null;
  respondeu_em: string;
}

export function useCarrinhoRespostas() {
  return useQuery({
    queryKey: ["carrinho-respostas"],
    queryFn: async (): Promise<Map<number, RespostaCarrinho>> => {
      const { data, error } = await (supabase as any)
        .from("carbo_carrinho_respostas")
        .select("checkout_id, wa_id, numero_id, respondeu_em");
      // ⚠️ Antes da migração 20261051 a tabela não existe: o quadro tem de
      // continuar como era, não sumir. O erro vai ao console para não passar
      // calado.
      if (error) { console.warn("[esteira] carbo_carrinho_respostas:", error.message); return new Map(); }
      return new Map(((data ?? []) as RespostaCarrinho[]).map((r) => [Number(r.checkout_id), r]));
    },
    refetchInterval: 60_000,
  });
}

export function useCarrinhoPipeline() {
  return useQuery({
    queryKey: ["carrinho-pipeline"],
    queryFn: async (): Promise<CarrinhoRow[]> => {
      const { data, error } = await (supabase as any)
        .from("carbo_carrinho_pipeline")
        .select("*")
        .order("abandonado_em", { ascending: false })
        .limit(1000);
      if (error) throw error;
      return (data ?? []) as CarrinhoRow[];
    },
    // O sync do carrinho roda de 15 em 15 min, e a janela mais curta é de 1 h.
    // Recarregar no ritmo da esteira de entrega (10 s) seria consulta à toa —
    // mas 5 min é curto o bastante para o "vence em 40 min" do card não mentir.
    refetchInterval: 60_000,
  });
}

/** Os ajustes das janelas, para a tela poder dizer QUAL régua está valendo em
 *  vez de deixar os números implícitos. */
export interface CarrinhoConfig {
  minutos_1: number;
  horas_2: number;
  horas_3: number;
  horas_desistir: number;
  valor_minimo: number;
  inicio_em: string;
}

export function useCarrinhoConfig() {
  return useQuery({
    queryKey: ["carrinho-config"],
    queryFn: async (): Promise<CarrinhoConfig | null> => {
      const { data, error } = await (supabase as any)
        .from("carbo_carrinho_config")
        .select("minutos_1, horas_2, horas_3, horas_desistir, valor_minimo, inicio_em")
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as CarrinhoConfig | null;
    },
    staleTime: 5 * 60_000,
  });
}

/* ─── Fonte parada ──────────────────────────────────────────────────────────
 *
 * Os dois espelhos do Bling ficaram 25 horas sem gravar e ninguém percebeu:
 * oito jobs do pg_cron marcados `succeeded` o tempo todo, porque
 * `net.http_post` é assíncrono e o sucesso dele é ter POSTADO. Agora que cada
 * etapa dispara mensagem para cliente, esse silêncio é um dia de gente sem
 * receber "saiu para entrega".
 *
 * A view mede a RODADA, não a última venda — senão a madrugada sem pedido
 * viraria alarme todo dia, e alarme que grita à toa a equipe aprende a ignorar.
 */

export interface FonteSaude {
  fonte: string;
  ultima_rodada: string | null;
  minutos: number | null;
  limite_min: number;
  atrasada: boolean;
  observacao: string | null;
}

export function useFontesSaude() {
  return useQuery({
    queryKey: ["fontes-saude"],
    queryFn: async (): Promise<FonteSaude[]> => {
      const { data, error } = await (supabase as any)
        .from("fontes_saude")
        .select("*");
      if (error) throw error;
      return (data ?? []) as FonteSaude[];
    },
    refetchInterval: 60_000,
  });
}

/* ─── Rastreio ──────────────────────────────────────────────────────────────
 *
 * O trajeto vem de `rastreio_card`, uma consulta SEPARADA da esteira e cruzada
 * pelo código. Não juntei na `bling2_esteira` porque ela foi criada com `o.*`,
 * o que congelou a lista de colunas — um CREATE OR REPLACE nela já falhou antes
 * com "cannot change name of view column". Consulta à parte custa uma ida ao
 * banco e não arrisca a tela que está no ar.
 *
 * Quem preenche são duas fontes: o `ecommerce-sync` (Mercado Envios, que ele já
 * consultava e descartava) e o `rastreio-sync` (Melhor Envio — Jadlog e
 * Correios). A tela não sabe nem precisa saber qual foi.
 */

export interface EventoRastreio {
  ocorrido_em: string;
  descricao: string;
  status: string | null;
  cidade: string | null;
  uf: string | null;
}

export interface RastreioCard {
  codigo: string;
  fonte: string;
  fonte_id: string | null;
  transportadora: string | null;
  servico: string | null;
  status: string | null;
  status_descricao: string | null;
  previsao_entrega: string | null;
  postado_em: string | null;
  entregue_em: string | null;
  ultimo_evento_em: string | null;
  url_rastreio: string | null;
  consultado_em: string | null;
  erro: string | null;
  atrasado: boolean;
  qtd_eventos: number;
  eventos: EventoRastreio[];
}

/**
 * O Mercado Livre usa DOIS formatos de código, e o Bling grava o que recebeu:
 *
 *   UXFQDCNSVVJETJBI4MBHGRKTVQ   26 caracteres
 *   MEL47693987878FMDOF01        MEL + id do envio + sufixo
 *
 * Os dois são válidos — em parte dos pedidos o próprio `tracking_number` da
 * API vem no formato MEL. O problema é que, quando os formatos DIFEREM entre
 * o Bling e a API, o código do card não encontra o trajeto e o pedido aparece
 * sem nada, sem erro nenhum. Foi o que deixou os 48 em trânsito vazios.
 *
 * Os dígitos do meio são o id do envio, que gravamos em `fonte_id`. Por isso o
 * casamento tenta as duas portas: o código exato e, se falhar, o id extraído.
 */
function idDoEnvioML(codigo: string): string | null {
  return codigo.match(/^MEL(\d+)/)?.[1] ?? null;
}

/** Indexado pelo código COMO ELE ESTÁ NA ESTEIRA — é assim que o card acha o
 *  dele, independente de qual dos dois formatos o Bling registrou. */
export function useRastreios(codigos: string[]) {
  // A chave da query precisa ser estável: `codigos` é um array novo a cada
  // render, e sem ordenar/juntar o TanStack refaria a consulta para sempre.
  const chave = [...new Set(codigos)].sort().join(",");
  return useQuery({
    queryKey: ["rastreio-card", chave],
    enabled: chave.length > 0,
    queryFn: async (): Promise<Map<string, RastreioCard>> => {
      const lista = chave.split(",").filter(Boolean);
      const ids = lista.map(idDoEnvioML).filter(Boolean) as string[];

      // O PostgREST monta o `in` na URL; lotes de 200 mantêm isso verdadeiro
      // quando a operação crescer.
      const buscar = async (coluna: string, valores: string[]) => {
        const achados: RastreioCard[] = [];
        for (let i = 0; i < valores.length; i += 200) {
          const { data, error } = await (supabase as any)
            .from("rastreio_card")
            .select("*")
            .in(coluna, valores.slice(i, i + 200));
          if (error) throw error;
          achados.push(...((data ?? []) as RastreioCard[]));
        }
        return achados;
      };

      const porCodigo = new Map<string, RastreioCard>();
      for (const r of await buscar("codigo", lista)) porCodigo.set(r.codigo, r);

      const porFonteId = new Map<string, RastreioCard>();
      if (ids.length) {
        for (const r of await buscar("fonte_id", ids)) {
          if (r.fonte_id) porFonteId.set(r.fonte_id, r);
        }
      }

      const mapa = new Map<string, RastreioCard>();
      for (const c of lista) {
        const achado = porCodigo.get(c)
          ?? (idDoEnvioML(c) ? porFonteId.get(idDoEnvioML(c)!) : undefined);
        if (achado) mapa.set(c, achado);
      }
      return mapa;
    },
    refetchInterval: 120_000,
  });
}

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
}

/** As colunas do quadro, na ordem do fluxo. `cancelado` fica fora: não é etapa
 *  da esteira, é saída dela — aparece num contador à parte. */
export const ETAPAS: Array<{ key: EtapaEsteira; label: string; descricao: string; color: string }> = [
  { key: "confirmado",  label: "Confirmado",   descricao: "pedido atendido no Bling",           color: "#9333ea" },
  { key: "nf_emitida",  label: "NF emitida",   descricao: "nota autorizada",                    color: "#14b8a6" },
  { key: "etiqueta",    label: "Etiqueta",     descricao: "rastreio gerado, aguardando coleta", color: "#0ea5e9" },
  { key: "em_transito", label: "Em trânsito",  descricao: "a plataforma confirmou o envio",     color: "#06b6d4" },
  { key: "entregue",    label: "Entregue",     descricao: "a plataforma confirmou a entrega",   color: "#10b981" },
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
      return (data ?? []) as EsteiraRow[];
    },
    // A esteira anda sozinha e agora é ao vivo: sync de 1 min, ponte de 2 min,
    // disparo de mensagem de 1 min. Um painel que recarrega mais devagar que a
    // operação que ele mostra atrasa a decisão de quem está olhando.
    refetchInterval: RECARGA_MS,
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
  | "entregue" | "ofertar" | "ofertado" | "recomprou" | "sem_retorno" | "historico";

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
  | "recuperado" | "perdido" | "sem_telefone" | "historico" | "ignorado";

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
  { key: "recuperado",   label: "Recuperado",   descricao: "voltou e comprou",                 color: "#10b981" },
  { key: "perdido",      label: "Perdido",      descricao: "não voltou — base de campanha",    color: "#64748b" },
  { key: "sem_telefone", label: "Sem telefone", descricao: "só e-mail — não dá para avisar",   color: "#f43f5e" },
];

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

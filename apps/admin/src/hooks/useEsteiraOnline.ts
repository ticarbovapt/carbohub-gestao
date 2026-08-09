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
    // A esteira anda sozinha (sync :15/:45, ponte :25/:55). Recarregar de 2 em
    // 2 min mantém a tela viva sem transformar um painel em polling agressivo.
    refetchInterval: 120_000,
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
    // Mais curto que os 2 min das outras: é a coluna que existe justamente
    // para ser rápida. De nada adianta o webhook gravar em 2s se a tela só
    // olha de dois em dois minutos.
    refetchInterval: 30_000,
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

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Mensagens automáticas ao cliente — os textos e o histórico de envio.
 *
 * A tela edita `carbo_msg_templates`. Quem detecta a movimentação é o banco (a
 * PK (bling_id, etapa) em `carbo_msg_envios`), quem monta o texto é a edge
 * function `kanban-n8n`, e quem entrega é o n8n. A tela não dispara nada.
 */

export type EtapaMsg =
  | "confirmado" | "nf_emitida" | "etiqueta" | "em_transito" | "saiu_entrega" | "entregue"
  | "recompra"
  | "carrinho_1" | "carrinho_2" | "carrinho_3";

/** Uma variável do corpo do template aprovado na Meta.
 *
 * ⚠️ SEM `fallback` a variável é obrigatória: a Meta recusa parâmetro vazio
 * (132000), então o envio ESPERA o dado em vez de mandar a mensagem torta. É a
 * substituta da regra "linha com variável vazia é removida", que valia no
 * texto livre e não vale mais nas seis etapas da esteira. */
export interface VarMeta {
  nome: string;
  de: string;
  fallback?: string;
}

export interface TemplateMsg {
  etapa: EtapaMsg;
  /** Instância da Evolution por onde a mensagem sai. null = a padrão. */
  instancia: string | null;
  ativo: boolean;
  titulo: string;
  texto: string;
  atraso_min: number;
  atualizado_em: string;
  /** Por onde ESTA etapa sai. As seis da esteira vão pela Cloud API oficial. */
  canal_envio: "evolution" | "meta";
  /** ⚠️ Nas etapas `meta`, é ESTE template que o cliente recebe — não o
   *  `texto` acima, que passa a ser espelho de conferência. */
  meta_template_nome: string | null;
  meta_status: string | null;
  meta_variaveis: VarMeta[] | null;
  /** Coluna que alimenta o botão de rastreio. null = template sem botão. */
  meta_botao_url_de: string | null;
}

export interface EnvioMsg {
  bling_id: number;
  etapa: string;
  detectado_em: string;
  enviado_em: string | null;
  telefone: string | null;
  mensagem: string | null;
  /** ⚠️ `enviado` significa coisas diferentes por canal: na Evolution é "o n8n
   *  aceitou"; na Meta é "a Meta aceitou", e os três seguintes vêm do webhook.
   *  `falhou` traz o código da Meta em `erro_codigo`. */
  status: "pendente" | "enviado" | "erro" | "ignorado" | "entregue" | "lido" | "falhou";
  motivo: string | null;
  canal?: string | null;
  erro_codigo?: number | null;
}

/** Ordem do fluxo, não a alfabética — é a ordem em que o cliente recebe.
 *
 * ⚠️ `saiu_entrega` NÃO é coluna da esteira: ela vai de "Em trânsito" direto
 * para "Entregue". O fato vem do rastreio (`rastreio_envios.status`), e a fila
 * no banco tem duas origens por causa disso. */
export const ORDEM_ETAPAS: EtapaMsg[] =
  ["confirmado", "nf_emitida", "etiqueta", "em_transito", "saiu_entrega", "entregue",
   // ⚠️ `recompra` vem depois da entrega porque é a única que não pertence a
   // ela: dispara DIAS depois, pela régua da segunda pipeline, contando a
   // partir do carimbo de entrega — não pela etapa da esteira.
   "recompra",
   // ⚠️ As três de carrinho fecham a lista, e vêm por último apesar de
   // acontecerem ANTES de tudo no tempo do cliente. A ordem aqui é a do fluxo
   // do PEDIDO, e o carrinho abandonado é o fluxo de um pedido que não
   // existiu — encaixá-lo no começo faria parecer que toda venda passa por ele.
   "carrinho_1", "carrinho_2", "carrinho_3"];

/**
 * A que GRUPO cada mensagem pertence.
 *
 * ⚠️ Não é organização visual — são conversas de naturezas opostas, e é por
 * isso que elas saem de números diferentes.
 *
 *   entrega   serviço. O cliente QUER receber, responder ali é atendimento.
 *   recompra  comercial. Pode ser ignorada, pode incomodar, e quem responde
 *             está comprando.
 *   carrinho  comercial, e a mais delicada das três: vai para quem NÃO é
 *             cliente ainda, sem pedido para justificar o contato. Sai pelo
 *             mesmo número comercial da recompra, nunca pelo de serviço.
 *
 * Empilhar a recompra no fim da lista de entrega, como estava, fazia parecer
 * que ela era a sétima etapa do mesmo fluxo. Não é: ela dispara dias depois da
 * entrega, pela régua da segunda pipeline, e sai por outro número. O carrinho
 * está um passo além disso: ele nem chegou a ser pedido.
 */
export type GrupoMsg = "entrega" | "recompra" | "carrinho";

export const GRUPO_DA_ETAPA: Record<EtapaMsg, GrupoMsg> = {
  confirmado: "entrega", nf_emitida: "entrega", etiqueta: "entrega",
  em_transito: "entrega", saiu_entrega: "entrega", entregue: "entrega",
  recompra: "recompra",
  carrinho_1: "carrinho", carrinho_2: "carrinho", carrinho_3: "carrinho",
};

export const GRUPOS: Array<{ id: GrupoMsg; label: string; descricao: string }> = [
  { id: "entrega",  label: "Da venda à entrega", descricao: "avisos de serviço, do pedido à entrega" },
  { id: "recompra", label: "Recompra",           descricao: "oferta comercial, dias depois da entrega" },
  { id: "carrinho", label: "Carrinho abandonado", descricao: "só da loja própria — os três passos, encadeados" },
];

/** As variáveis que os textos aceitam. A lista é a mesma da view
 *  `carbo_msg_fila`; variável fora daqui vira texto vazio na mensagem. */
export const VARIAVEIS: Array<{ chave: string; descricao: string }> = [
  { chave: "primeiro_nome",  descricao: "Primeiro nome do cliente" },
  { chave: "nome",           descricao: "Nome completo" },
  { chave: "pedido",         descricao: "Número do pedido na loja" },
  { chave: "canal",          descricao: "Mercado Livre, Nuvemshop, Amazon…" },
  { chave: "valor",          descricao: "Valor do pedido (R$)" },
  { chave: "nf",             descricao: "Número da nota fiscal" },
  { chave: "transportadora", descricao: "Correios, Jadlog, J&T…" },
  { chave: "servico",        descricao: "SEDEX, PAC, .Package…" },
  { chave: "rastreio",       descricao: "Código de rastreio" },
  { chave: "link_nota",     descricao: "PDF da nota fiscal (o cliente recebe o arquivo)" },
  { chave: "link_rastreio",  descricao: "Link público de rastreio" },
  { chave: "previsao",       descricao: "Previsão de entrega (qui., 14/08)" },
  { chave: "cidade",         descricao: "Cidade de entrega" },
  { chave: "uf",             descricao: "UF de entrega" },
  // ⚠️ Só existem nas três mensagens de carrinho. Nas outras etapas ficam
  // vazias — e, pela regra do `montar()`, a linha inteira que só tiver elas é
  // REMOVIDA em vez de sair em branco.
  { chave: "link_carrinho",  descricao: "Link que restaura o carrinho (só carrinho abandonado)" },
  { chave: "produtos",       descricao: "O que estava no carrinho (só carrinho abandonado)" },
];

export function useTemplatesMsg() {
  return useQuery({
    queryKey: ["msg-templates"],
    queryFn: async (): Promise<TemplateMsg[]> => {
      const { data, error } = await (supabase as any)
        .from("carbo_msg_templates").select("*");
      if (error) throw error;
      const lista = (data ?? []) as TemplateMsg[];
      return [...lista].sort(
        (a, b) => ORDEM_ETAPAS.indexOf(a.etapa) - ORDEM_ETAPAS.indexOf(b.etapa),
      );
    },
  });
}

export function useSalvarTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (t: Partial<TemplateMsg> & { etapa: EtapaMsg }) => {
      const { error } = await (supabase as any)
        .from("carbo_msg_templates")
        // ⚠️ Nas etapas da Meta o `texto` NÃO é enviado no update. A redação
        // mora na Meta desde a aprovação, e gravar aqui criaria uma tela que
        // mostra uma coisa enquanto o cliente recebe outra — a mesma doença que
        // fez o quotePdf.ts do `mkt` divergir por meses sem dar erro. A tela já
        // trava o campo; isto é o cinto.
        .update({
          ativo: t.ativo, titulo: t.titulo,
          ...(t.canal_envio === "meta" ? {} : { texto: t.texto }),
          atraso_min: t.atraso_min, atualizado_em: new Date().toISOString(),
        })
        .eq("etapa", t.etapa);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["msg-templates"] }); },
  });
}

/** Histórico do que saiu. É onde se confere se o cliente recebeu — e o `motivo`
 *  diz por que não, quando não. */
export function useEnviosMsg(limite = 60) {
  return useQuery({
    queryKey: ["msg-envios", limite],
    queryFn: async (): Promise<EnvioMsg[]> => {
      const { data, error } = await (supabase as any)
        .from("carbo_msg_envios")
        .select("*")
        .neq("motivo", "já existia quando o aviso foi ligado")
        .order("detectado_em", { ascending: false })
        .limit(limite);
      if (error) throw error;
      return (data ?? []) as EnvioMsg[];
    },
    refetchInterval: 60_000,
  });
}

/** Quantos pedidos estão esperando aviso agora. */
export function useFilaMsg() {
  return useQuery({
    queryKey: ["msg-fila"],
    queryFn: async (): Promise<number> => {
      const { count, error } = await (supabase as any)
        .from("carbo_msg_fila").select("bling_id", { count: "exact", head: true });
      if (error) throw error;
      return count ?? 0;
    },
    refetchInterval: 60_000,
  });
}

/**
 * Pré-visualização com a MESMA regra da função de envio.
 *
 * ⚠️ Linha cujas variáveis estão todas vazias é REMOVIDA, não vira espaço em
 * branco. Um pedido sem link (Mercado Envios não tem página pública) mandaria
 * "Acompanhe aqui:" seguido de nada, e o cliente responde perguntando qual
 * link. Se esta regra mudar aqui, muda também no `kanban-n8n`.
 */
export function montarPreview(texto: string, vars: Record<string, string>): string {
  return texto
    .split("\n")
    .map((linha) => {
      const marcadores = [...linha.matchAll(/\{\{\s*(\w+)\s*\}\}/g)];
      if (marcadores.length && marcadores.every((m) => !vars[m[1]])) return null;
      return linha.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => vars[k] ?? "");
    })
    .filter((l) => l !== null)
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Pré-visualização das etapas da META, com a regra da Meta.
 *
 * ⚠️ É o OPOSTO do `montarPreview`: lá, linha com variável vazia some; aqui,
 * variável obrigatória vazia SEGURA o envio inteiro. Mostrar o preview do jeito
 * antigo faria a tela prometer uma mensagem que a Meta recusaria.
 */
export function montarPreviewMeta(
  texto: string,
  vars: Record<string, string>,
  meta: VarMeta[] | null,
  botaoDe: string | null,
): { texto: string; faltando: string[] } {
  const faltando: string[] = [];
  const valores: Record<string, string> = {};

  for (const v of meta ?? []) {
    const valor = (vars[v.de] ?? "").trim();
    if (valor) { valores[v.nome] = valor; continue; }
    const reserva = (v.fallback ?? "").trim();
    if (reserva) valores[v.nome] = reserva;
    else faltando.push(v.nome);
  }
  if (botaoDe && !(vars[botaoDe] ?? "").trim()) faltando.push(`botão (${botaoDe})`);

  return {
    texto: texto.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => valores[k] ?? `{{${k}}}`),
    faltando,
  };
}

/** Exemplo realista para a pré-visualização — dados de um pedido de verdade
 *  desta operação, não "João da Silva". */
/**
 * Valores de exemplo da pré-visualização.
 *
 * ⚠️ Precisam refletir o FORMATO REAL, não um valor plausível qualquer. O
 * `pedido` ficou meses como "278" — o número cru da loja — e continuou assim
 * depois de o sistema passar a mandar `CZAAAAMMXXXX`. Quem escrevia o texto via
 * um número na tela e o cliente recebia outro, o que é o pior tipo de
 * pré-visualização: a que parece conferir e não confere.
 *
 * Ao mudar o formato de qualquer variável na `carbo_msg_fila`, mude aqui junto.
 */
export const EXEMPLO: Record<string, string> = {
  primeiro_nome: "Ana",
  nome: "Ana Cristina Dantas",
  pedido: "CZ2026080042",
  canal: "Nuvemshop",
  valor: "R$ 149,50",
  nf: "000199",
  transportadora: "Jadlog",
  servico: ".Package Centralizado",
  rastreio: "ME262BTONG0BR",
  link_rastreio: "https://www.melhorrastreio.com.br/rastreio/ME262BTONG0BR",
  link_nota: "https://bling.com.br/nfe/danfe/000199.pdf",
  // ⚠️ Formato da Evolution. Nas etapas da Meta a previsão sai DD/MM/AAAA,
  // porque foi assim que o template foi aprovado — ver EXEMPLO_META.
  previsao: "qui., 14/08",
  cidade: "Parnamirim",
  uf: "RN",
  link_carrinho: "https://loja.grupocarbo.com.br/checkout/v3/cart/9f2a1c",
  produtos: "CarboZé 100ml ×2 · Kit 5 unidades ×1",
};

/**
 * O mesmo exemplo, no formato que as etapas da META recebem.
 *
 * ⚠️ Difere em UM campo, e o campo importa: a previsão. O template foi aprovado
 * com `26/08/2026`, e o envio formata assim. Um preview em "qui., 14/08" faria
 * a tela conferir um formato que o cliente nunca vê.
 */
export const EXEMPLO_META: Record<string, string> = {
  ...EXEMPLO,
  previsao: "26/08/2026",
};

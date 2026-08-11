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
  | "recompra";

export interface TemplateMsg {
  etapa: EtapaMsg;
  /** Instância da Evolution por onde a mensagem sai. null = a padrão. */
  instancia: string | null;
  ativo: boolean;
  titulo: string;
  texto: string;
  atraso_min: number;
  atualizado_em: string;
}

export interface EnvioMsg {
  bling_id: number;
  etapa: string;
  detectado_em: string;
  enviado_em: string | null;
  telefone: string | null;
  mensagem: string | null;
  status: "pendente" | "enviado" | "erro" | "ignorado";
  motivo: string | null;
}

/** Ordem do fluxo, não a alfabética — é a ordem em que o cliente recebe.
 *
 * ⚠️ `saiu_entrega` NÃO é coluna da esteira: ela vai de "Em trânsito" direto
 * para "Entregue". O fato vem do rastreio (`rastreio_envios.status`), e a fila
 * no banco tem duas origens por causa disso. */
export const ORDEM_ETAPAS: EtapaMsg[] =
  ["confirmado", "nf_emitida", "etiqueta", "em_transito", "saiu_entrega", "entregue",
   // ⚠️ `recompra` fecha a lista porque é a única que não pertence à entrega:
   // ela dispara DIAS depois, pela régua da segunda pipeline, contando a
   // partir do carimbo de entrega — não pela etapa da esteira.
   "recompra"];

/**
 * A que GRUPO cada mensagem pertence.
 *
 * ⚠️ Não é organização visual — são conversas de naturezas opostas, e é por
 * isso que elas saem de números diferentes.
 *
 *   entrega   serviço. O cliente QUER receber, responder ali é atendimento.
 *   recompra  comercial. Pode ser ignorada, pode incomodar, e quem responde
 *             está comprando.
 *
 * Empilhar a recompra no fim da lista de entrega, como estava, fazia parecer
 * que ela era a sétima etapa do mesmo fluxo. Não é: ela dispara dias depois da
 * entrega, pela régua da segunda pipeline, e sai por outro número.
 */
export type GrupoMsg = "entrega" | "recompra";

export const GRUPO_DA_ETAPA: Record<EtapaMsg, GrupoMsg> = {
  confirmado: "entrega", nf_emitida: "entrega", etiqueta: "entrega",
  em_transito: "entrega", saiu_entrega: "entrega", entregue: "entrega",
  recompra: "recompra",
};

export const GRUPOS: Array<{ id: GrupoMsg; label: string; descricao: string }> = [
  { id: "entrega",  label: "Da venda à entrega", descricao: "avisos de serviço, do pedido à entrega" },
  { id: "recompra", label: "Recompra",           descricao: "oferta comercial, dias depois da entrega" },
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
  { chave: "link_rastreio",  descricao: "Link público de rastreio" },
  { chave: "previsao",       descricao: "Previsão de entrega (qui., 14/08)" },
  { chave: "cidade",         descricao: "Cidade de entrega" },
  { chave: "uf",             descricao: "UF de entrega" },
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
        .update({
          ativo: t.ativo, titulo: t.titulo, texto: t.texto,
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

/** Exemplo realista para a pré-visualização — dados de um pedido de verdade
 *  desta operação, não "João da Silva". */
export const EXEMPLO: Record<string, string> = {
  primeiro_nome: "Ana",
  nome: "Ana Cristina Dantas",
  pedido: "278",
  canal: "Nuvemshop",
  valor: "R$ 149,50",
  nf: "000199",
  transportadora: "Jadlog",
  servico: ".Package Centralizado",
  rastreio: "ME262BTONG0BR",
  link_rastreio: "https://www.melhorrastreio.com.br/rastreio/ME262BTONG0BR",
  previsao: "qui., 14/08",
  cidade: "Parnamirim",
  uf: "RN",
};

// ─────────────────────────────────────────────────────────────────────────────
// Etapas do pós-venda — FONTE ÚNICA.
//
// Por que isto virou pacote: o Carbo Ops (que CONTROLA as etapas) e o Carbo
// Sales (que só ACOMPANHA) tinham cada um a sua lista. O Ops declarava 11
// etapas, o Sales declarava 7. As quatro que faltavam no Sales não viravam
// coluna vazia — o pedido parado numa delas SUMIA do quadro. O vendedor não
// via a coluna nem o pedido, e o dado seguia intacto no banco.
//
// Esse é o tipo de divergência que não dá erro, não quebra build e não aparece
// em teste: ela ESCONDE. E comentário de "mantenha em sinc" não segura, porque
// quem mexe num app não abre o arquivo do outro.
//
// ⚠️ A lista precisa continuar batendo com o CHECK de fulfillment_stage em
// carboze_orders (migração 20260630120000 e as que a estenderam). Etapa nova
// aqui sem migração lá vira erro de constraint na hora de mover o card.
//
// De propósito este pacote não importa NADA — nem React, nem Supabase. É dado
// puro, então qualquer app pode consumir sem arrastar dependência junto.
// ─────────────────────────────────────────────────────────────────────────────

export type FulfillmentStage =
  | "agendado" | "nova_venda" | "separacao_pendente" | "criar_op" | "separando" | "separado"
  | "gerar_nf" | "emitir_etiqueta" | "etiqueta_emitida"
  | "em_transporte" | "entregue" | "cancelado"
  // ⚠️ LEGADO: deixou de ser coluna em 29/10/2026 (ver ETAPA_ANTIGA abaixo).
  | "nf_finalizada";

export interface PosVendaStage {
  key: FulfillmentStage;
  label: string;
  color: string;
  /** Linha pequena sob o nome, no cabeçalho da coluna. Existe porque o nome
   *  inteiro ("Etiqueta emitida · aguardando despacho") não cabe numa coluna
   *  de 280 px, e cortado ele perdia justamente a parte que diz o que falta. */
  sub?: string;
}

/** Ordem das colunas do quadro. É a jornada real do pedido, da venda à entrega. */
export const POSVENDA_STAGES: PosVendaStage[] = [
  // Parcela de recorrência cujo mês ainda não chegou. Card PARADO de propósito:
  // não é trabalho a fazer hoje, é o que vem pela frente. Sai daqui sozinha
  // quando o mês dela chega (carboze_ativar_parcelas_devidas).
  { key: "agendado",            label: "Agendado (recorrência)",  color: "#8b5cf6" },
  { key: "nova_venda",          label: "Nova Venda",              color: "#9333ea" },
  { key: "separacao_pendente",  label: "Pedido Recebido",         color: "#f59e0b" },
  { key: "criar_op",            label: "Criar Ordem de Produção", color: "#ec4899" },
  { key: "separando",           label: "Em Separação",            color: "#3b82f6" },
  { key: "separado",            label: "Separado",                color: "#8b5cf6" },
  { key: "gerar_nf",            label: "Gerar Nota Fiscal",       color: "#f43f5e" },
  // A NF vinculada traz o card DIRETO para cá (gatilho
  // `carboze_orders_nf_autostage`). Até 29/10/2026 havia "NF Finalizada" no
  // meio, uma coluna em que nada acontecia: o card esperava alguém arrastá-lo
  // para "Emitir Etiqueta".
  { key: "emitir_etiqueta",     label: "Emitir Etiqueta",         color: "#0ea5e9" },
  // Etiqueta gerada, caixa esperando a coleta da transportadora.
  { key: "etiqueta_emitida",    label: "Etiqueta emitida",        color: "#6366f1", sub: "aguardando despacho" },
  { key: "em_transporte",       label: "Em Transporte",           color: "#06b6d4" },
  { key: "entregue",            label: "Entregue",                color: "#10b981" },
  { key: "cancelado",           label: "Cancelado",               color: "#ef4444" },
];

/**
 * Etapa que deixou de ser coluna → a coluna em que o card aparece.
 *
 * ⚠️ Não é enfeite: o front sobe ANTES de a migração rodar, e pedido parado
 * numa etapa sem coluna SOME do quadro — o defeito que fez este pacote existir.
 * Mesmo depois da migração, aba antiga aberta ainda grava o valor velho.
 */
export const ETAPA_ANTIGA: Partial<Record<string, FulfillmentStage>> = {
  nf_finalizada: "emitir_etiqueta",
};

/** A coluna do quadro em que o card fica (resolve etapa legada). */
export const colunaDaEtapa = (k: FulfillmentStage | string): FulfillmentStage =>
  (ETAPA_ANTIGA[k] ?? k) as FulfillmentStage;

/** Rótulo da etapa. Devolve a própria chave quando não conhece — melhor mostrar
 *  "gerar_nf" do que uma célula vazia se alguém adicionar etapa no banco. */
export const stageLabel = (k: FulfillmentStage | string): string =>
  POSVENDA_STAGES.find((s) => s.key === colunaDaEtapa(k))?.label ?? String(k);

/** Ordem da etapa na jornada. -1 quando desconhecida. Usado nos portões que
 *  perguntam "já passou de X?". */
export const stageIndex = (k: FulfillmentStage | string): number =>
  POSVENDA_STAGES.findIndex((s) => s.key === colunaDaEtapa(k));

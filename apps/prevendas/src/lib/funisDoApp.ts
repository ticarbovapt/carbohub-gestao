// ─────────────────────────────────────────────────────────────────────────────
// Quais pipelines ESTE app mostra — o único pedaço do CRM que é próprio de cada
// app. `types/crm.ts`, `pages/Pipelines.tsx`, os componentes de `crm/` e os
// hooks são IDÊNTICOS no Sales e no Pré-Vendas; a diferença mora só aqui.
//
// O Pré-Vendas mostra UMA pipeline, a dos SDRs (f14). O card que o repasse cria
// no Inbound (f11) é do closer e vive no Sales.
// ─────────────────────────────────────────────────────────────────────────────
import type { FunnelType } from "@/types/crm";

export const FUNIS_VISIVEIS: FunnelType[] = ["f14"];
export const funilVisivel = (id: FunnelType) => FUNIS_VISIVEIS.includes(id);

/** Pipeline aberta quando a URL não diz qual. */
export const FUNIL_PADRAO: FunnelType = "f14";

/**
 * Recorte da visão "Todos" (e da contagem das abas). Aqui é SÓ o f14: sem isso
 * o gestor, que enxerga a base inteira pela RLS, carregaria todos os leads do
 * Sales para contar uma aba.
 */
export function recorteDoApp<Q extends { eq: (c: string, v: string) => Q }>(q: Q): Q {
  return q.eq("funnel_type", "f14");
}

/**
 * O lead tem SEGMENTO (PDV, frotista, licenciado…)? No Sales sim: é o que
 * substituiu as 9 pipelines por tipo. No Pré-Vendas não — o lead vem sempre do
 * SDR, e escolher segmento ali era um campo obrigatório que não decidia nada.
 * Desligado, some do formulário, do card, do detalhe e do filtro; o valor
 * gravado continua `a_definir`, e o closer o define no Sales depois do repasse.
 */
export const USA_SEGMENTO = false;

/**
 * Os cartões "Quentes" e "Média Tentativas" no topo da pipeline. Desligados no
 * Pré-Vendas a pedido do dono do processo (06/10/2026): a etapa do SDR não tem
 * como dizer que um lead é quente, e "tentativas" só é contada nas colunas
 * Tentativa 1/2 do Sales — lá o número existe; aqui seria sempre zero.
 */
export const MOSTRA_QUENTES_E_TENTATIVAS = false;

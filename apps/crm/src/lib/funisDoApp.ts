// ─────────────────────────────────────────────────────────────────────────────
// Quais pipelines ESTE app mostra — o único pedaço do CRM que é próprio de cada
// app. `types/crm.ts`, `pages/Pipelines.tsx`, os componentes de `crm/` e os
// hooks são IDÊNTICOS no Sales e no Pré-Vendas; a diferença mora só aqui, no
// mesmo molde do `appKey.ts` do carbohub-produtos.
//
// ⚠️ Sales: as 9 antigas (f1..f9) viraram SEGMENTO dentro da Comercial
// Expansão, mas continuam em FUNNEL_CONFIG: links antigos e a timeline ainda
// resolvem nome/ícone. Apagá-las deixaria o detalhe do lead em tela branca.
//
// ⚠️ O f14 (Pré-Vendas) é do app dos SDRs e fica FORA daqui, inclusive da
// visão "Todos": a pipeline deles "não tem nada a ver com o Sales" (dono do
// processo, 06/10/2026). O que chega ao Sales é o card que o repasse cria no
// Inbound — esse é do closer.
// ─────────────────────────────────────────────────────────────────────────────
import type { FunnelType } from "@/types/crm";

export const FUNIS_VISIVEIS: FunnelType[] = ["f13", "f12", "f11", "f10"];
export const funilVisivel = (id: FunnelType) => FUNIS_VISIVEIS.includes(id);

/** Pipeline aberta quando a URL não diz qual. */
export const FUNIL_PADRAO: FunnelType = "f13";

/**
 * Recorte da visão "Todos" (e da contagem das abas). No Sales é tudo MENOS o
 * Pré-Vendas — e não "só as visíveis", porque lead remanescente de f1..f9 ainda
 * aparecia ali, e esconder isso agora seria mudar o Sales de lambuja.
 */
export function recorteDoApp<Q extends { neq: (c: string, v: string) => Q }>(q: Q): Q {
  return q.neq("funnel_type", "f14");
}

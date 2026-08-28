// ─────────────────────────────────────────────────────────────────────────────
// Plataformas de e-commerce — a lista ÚNICA do Ops
//
// ⚠️ Era uma SEGUNDA lista, ao lado da de `VendasOnline.tsx`, com o comentário
// "mesmas da tela de Vendas Online". Não eram: a Shopee entrou lá e nunca
// chegou aqui, e ninguém percebeu porque divergir aqui não dá erro — dá uma
// tela de metas sem um canal. É a mesma doença do `quotePdf.ts` do `mkt`.
//
// Hoje o `VendasOnline.tsx` DERIVA desta lista (id, rótulo, cor, emoji e as
// classes de tema), e as telas de meta usam o subconjunto ativo. Canal novo
// entra numa linha só.
//
// ⚠️ Cor e emoji têm de bater com os do admin (`EcommerceVendas.tsx` e
// `PLATFORM_META` em `useMetaEcommerce.ts`): duas telas do mesmo sistema com
// cores diferentes para a mesma marca é divergência silenciosa.
// ─────────────────────────────────────────────────────────────────────────────

export type EcomPlatformId =
  | "mercadolivre" | "amazon" | "nuvemshop" | "payt" | "shopee";

export interface EcomPlatform {
  id: EcomPlatformId;
  label: string;
  emoji: string;
  color: string;
  textClass: string;
  bgClass: string;
  borderClass: string;
  /** Canal ainda não usado por esta tela: aparece cinza, sem clique. */
  disabled?: boolean;
}

export const ECOM_PLATFORMS: EcomPlatform[] = [
  { id: "mercadolivre", label: "Mercado Livre", emoji: "🛒", color: "#FFD700", textClass: "text-yellow-600 dark:text-yellow-300", bgClass: "bg-yellow-500/10", borderClass: "border-yellow-500/50" },
  { id: "amazon",       label: "Amazon",        emoji: "📦", color: "#FF9900", textClass: "text-orange-600 dark:text-orange-300", bgClass: "bg-orange-500/10", borderClass: "border-orange-500/50" },
  { id: "nuvemshop",    label: "Nuvemshop",     emoji: "🏪", color: "#2D7FF9", textClass: "text-blue-600 dark:text-blue-300",     bgClass: "bg-blue-500/10",   borderClass: "border-blue-500/50" },
  // PayT — checkout próprio (app.payt.com.br), vende os MESMOS produtos da loja
  // própria. Ocupa o lugar do TikTok Shop, que nunca foi integrado — e, ao
  // contrário dele, nasce ATIVA. Verde-azulado é o único ponto livre entre o
  // amarelo do ML, o laranja da Amazon, o azul da Nuvemshop e o
  // laranja-avermelhado da Shopee.
  { id: "payt",         label: "PayT",          emoji: "💳", color: "#14B8A6", textClass: "text-teal-600 dark:text-teal-300",     bgClass: "bg-teal-500/10",   borderClass: "border-teal-500/50" },
  { id: "shopee",       label: "Shopee",        emoji: "🧡", color: "#EE4D2D", textClass: "text-red-600 dark:text-red-300",       bgClass: "bg-red-500/10",    borderClass: "border-red-500/50", disabled: true },
];

/** Os canais que estas telas do Ops realmente mostram. */
export const ECOM_PLATFORMS_ATIVAS = ECOM_PLATFORMS.filter((p) => !p.disabled);

export const brl = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 0, maximumFractionDigits: 0 });

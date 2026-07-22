// ─────────────────────────────────────────────────────────────────────────────
// Preço de referência / sugerido — MAPA TEMPORÁRIO ("por hora").
//
// Hoje a tela /vender usa preço em campo livre (não há cadastro formal de preço
// de venda em uso). Enquanto isso, o dashboard de Suprimentos (Admin) mostra um
// "preço sugerido" ao lado do custo de fabricação, resolvido nesta ordem:
//   1) se o produto tem um PREÇO PRATICADO conhecido aqui embaixo → usa ele
//      (marcado como "referência" — é a verdade de mercado);
//   2) senão, se a ficha técnica está COMPLETA → sugere custo ÷ (1 − margem-alvo);
//   3) senão → "custo incompleto" (não sugere preço a partir de custo parcial,
//      pra não mostrar número enganoso numa tela de decisão).
//
// Manutenção: pra adicionar/ajustar um preço praticado, é só editar o objeto
// abaixo (chave = product_code). Pra recalibrar a sugestão, mude MARGEM_ALVO.
// ─────────────────────────────────────────────────────────────────────────────

/** Preços praticados conhecidos, por product_code. Prioridade máxima. */
export const PRECO_REFERENCIA: Record<string, number> = {
  CZ100: 15.60,   // CarboZé 100ml
  CZ1L: 130.00,   // CarboZé 1L
  // adicione novos produtos aqui: PRODCODE: preco,
};

// Margem-alvo bruta (sobre o preço) usada p/ SUGERIR preço a partir do custo.
// O custo de ficha é "estreito" (só insumos — sem mão de obra, frete de envio,
// impostos, taxas de marketplace, comissão), então miramos 70% sobre ele como
// planejamento conservador. Troque este número p/ recalibrar todas as sugestões.
export const MARGEM_ALVO_PADRAO = 0.70;

/** Override opcional de margem-alvo por categoria (ex.: { "Produto Final": 0.65 }). */
export const MARGEM_ALVO_POR_CATEGORIA: Partial<Record<string, number>> = {};

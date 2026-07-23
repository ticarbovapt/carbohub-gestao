-- ─────────────────────────────────────────────────────────────────────────────
-- Caderno de Caixa do Estoque (Carbo Ops) — tendência diária de movimentações.
--
-- Por que um RPC: o gráfico de linha precisa somar quantidades por DIA ao longo
-- do período, sem o teto de 300 linhas da lista (mesmo problema que o
-- useStockMovementStats já resolveu para as contagens). Aqui o SUM/GROUP BY roda
-- no Postgres, escopado por warehouse + faixa de created_at.
--
-- Três séries (bucketização por categoria + tipo + origem):
--   • insumo_in  = entrada de insumos      → tipo='entrada', categoria ≠ produto final
--   • final_prod = produção de produto final→ tipo='entrada', origem='OP', categoria de produto final
--   • final_out  = saída de produto final  → tipo='saida',  categoria de produto final
--
-- "Produto final" segue a MESMA convenção do app (ProdutosMrp.HAS_BOM_CATEGORIES):
-- categorias com ficha técnica própria = 'Produto Final' e 'Semi-acabado'.
-- Categoria nula/qualquer outra cai no balde de insumo.
--
-- Datas agrupadas no fuso America/Sao_Paulo para o "dia" bater com o operador.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.ops_stock_movement_trend(
  p_warehouse_code text,
  p_from           timestamptz,
  p_to             timestamptz
)
RETURNS TABLE (
  dia        date,
  insumo_in  numeric,
  final_prod numeric,
  final_out  numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH wh AS (
    SELECT id FROM public.warehouses WHERE code = p_warehouse_code
  )
  SELECT
    (sm.created_at AT TIME ZONE 'America/Sao_Paulo')::date AS dia,
    COALESCE(SUM(sm.quantidade) FILTER (
      WHERE sm.tipo = 'entrada'
        AND p.category IS DISTINCT FROM 'Produto Final'
        AND p.category IS DISTINCT FROM 'Semi-acabado'
    ), 0) AS insumo_in,
    COALESCE(SUM(sm.quantidade) FILTER (
      WHERE sm.tipo = 'entrada'
        AND sm.origem = 'OP'
        AND p.category IN ('Produto Final', 'Semi-acabado')
    ), 0) AS final_prod,
    COALESCE(SUM(sm.quantidade) FILTER (
      WHERE sm.tipo = 'saida'
        AND p.category IN ('Produto Final', 'Semi-acabado')
    ), 0) AS final_out
  FROM public.stock_movements sm
  JOIN public.mrp_products p ON p.id = sm.product_id
  WHERE sm.warehouse_id = (SELECT id FROM wh)
    AND sm.created_at >= p_from
    AND sm.created_at <= p_to
  GROUP BY 1
  ORDER BY 1;
$$;

GRANT EXECUTE ON FUNCTION public.ops_stock_movement_trend(text, timestamptz, timestamptz) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- Etapa B: Metas passam a somar de carboze_orders (fonte única), não crm_vendas.
-- Mesma assinatura da RPC → nenhuma tela precisa mudar; só a fonte muda.
--   • Realizado = vendas reais (status != quote/cancelled), fora de excluir_metricas.
--   • Por vendedor (vendedor_id) no intervalo [p_from, p_to) por created_at.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.crm_vendas_agregado(p_from timestamptz, p_to timestamptz)
RETURNS TABLE (vendedor_id uuid, total numeric, qtd bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT o.vendedor_id,
         COALESCE(SUM(o.total), 0)::numeric AS total,
         COUNT(*)::bigint AS qtd
  FROM public.carboze_orders o
  WHERE o.vendedor_id IS NOT NULL
    AND o.status NOT IN ('quote', 'cancelled')
    AND COALESCE(o.excluir_metricas, false) = false
    AND o.created_at >= p_from
    AND o.created_at <  p_to
  GROUP BY o.vendedor_id;
$$;

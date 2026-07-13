-- Dashboard Comercial server-side: antes o cliente puxava TODOS os
-- carboze_orders não-cancelados e agregava em JS. Agora uma RPC STABLE
-- devolve vendedores, série mensal e KPIs prontos (jsonb), filtrando por
-- vendedor no servidor. A projeção de crescimento fica no cliente (só math).

CREATE OR REPLACE FUNCTION public.ops_comercial_dashboard(p_vendedor text DEFAULT 'all')
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH base AS (
    SELECT total, customer_name, vendedor_name,
           coalesce(sale_date, created_at::date) AS d
    FROM public.carboze_orders
    WHERE status <> 'cancelled'
  ),
  filt AS (
    SELECT * FROM base WHERE p_vendedor = 'all' OR coalesce(vendedor_name, '') = p_vendedor
  ),
  monthly AS (
    SELECT extract(year FROM d)::int AS y, extract(month FROM d)::int AS m,
           coalesce(sum(total), 0) AS faturado, count(*)::int AS pedidos
    FROM filt GROUP BY 1, 2
  ),
  cliente_cnt AS (
    SELECT coalesce(customer_name, '—') AS c, count(*)::int AS q
    FROM filt GROUP BY 1 ORDER BY q DESC LIMIT 1
  ),
  maior AS (
    SELECT coalesce(total, 0) AS t, coalesce(customer_name, '—') AS c
    FROM filt ORDER BY coalesce(total, 0) DESC LIMIT 1
  )
  SELECT jsonb_build_object(
    'vendedores', (SELECT coalesce(jsonb_agg(v ORDER BY v), '[]'::jsonb)
                   FROM (SELECT DISTINCT vendedor_name AS v FROM base WHERE vendedor_name IS NOT NULL) s),
    'monthly', (SELECT coalesce(jsonb_agg(jsonb_build_object('y', y, 'm', m, 'faturado', round(faturado), 'pedidos', pedidos) ORDER BY y, m), '[]'::jsonb) FROM monthly),
    'totalVendas',  (SELECT count(*) FROM filt),
    'totalBRL',     (SELECT coalesce(sum(total), 0) FROM filt),
    'maiorVenda',   (SELECT t FROM maior),
    'maiorCliente', (SELECT c FROM maior),
    'topCliente',   (SELECT c FROM cliente_cnt),
    'topQtd',       (SELECT q FROM cliente_cnt)
  );
$$;

GRANT EXECUTE ON FUNCTION public.ops_comercial_dashboard(text) TO authenticated;

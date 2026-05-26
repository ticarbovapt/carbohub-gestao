-- Aggregates ecommerce_orders by month+platform server-side.
-- Bypasses PostgREST max_rows limit by returning only ~26 rows (months × platforms).

CREATE OR REPLACE FUNCTION ecommerce_monthly_summary(
  p_platforms text[],
  p_from      date,
  p_to        date
)
RETURNS TABLE (
  platform         text,
  month_str        text,
  total_orders     bigint,
  total_units      bigint,
  total_revenue    numeric,
  cancelled_orders bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT
    platform,
    to_char(date_trunc('month', ordered_at AT TIME ZONE 'America/Sao_Paulo'), 'YYYY-MM') AS month_str,
    COUNT(*)                                              AS total_orders,
    COALESCE(SUM(units_real), 0)                         AS total_units,
    ROUND(COALESCE(SUM(total), 0)::numeric, 2)           AS total_revenue,
    COUNT(*) FILTER (WHERE status = 'cancelled')         AS cancelled_orders
  FROM ecommerce_orders
  WHERE platform = ANY(p_platforms)
    AND ordered_at >= p_from::timestamptz
    AND ordered_at <  (p_to + INTERVAL '1 month')::timestamptz
  GROUP BY platform, date_trunc('month', ordered_at AT TIME ZONE 'America/Sao_Paulo')
  ORDER BY date_trunc('month', ordered_at AT TIME ZONE 'America/Sao_Paulo'), platform;
$$;

GRANT EXECUTE ON FUNCTION ecommerce_monthly_summary TO authenticated;

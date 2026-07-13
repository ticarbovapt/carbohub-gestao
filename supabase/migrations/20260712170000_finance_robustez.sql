-- Robustez financeira:
--  1) coluna currency em purchase_payables/orders (default BRL) — honra o tipo
--     e permite a guarda multi-moeda.
--  2) todas as RPCs de dinheiro passam a filtrar currency='BRL' (nunca somam
--     BRL+USD silenciosamente; USD fica pra um painel próprio no futuro).
--  3) fluxo de caixa inclui o VENCIDO em aberto na semana atual (o maior risco
--     de caixa) — antes só projetava o futuro.

ALTER TABLE public.purchase_payables ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'BRL';
ALTER TABLE public.purchase_orders   ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'BRL';

-- ── Payables (guarda currency='BRL') ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fin_payables_aging(p_source text DEFAULT 'all')
RETURNS TABLE (bucket text, qtd bigint, total numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT bucket, count(*)::bigint, coalesce(sum(amount), 0)
  FROM (
    SELECT amount,
      CASE
        WHEN due_date < current_date - 30 THEN 'vencido_30_mais'
        WHEN due_date < current_date THEN 'vencido_1_30'
        WHEN due_date = current_date THEN 'vence_hoje'
        WHEN due_date <= current_date + 7 THEN 'a_vencer_7'
        WHEN due_date <= current_date + 30 THEN 'a_vencer_30'
        ELSE 'a_vencer_mais'
      END AS bucket
    FROM public.purchase_payables
    WHERE status NOT IN ('pago', 'cancelado') AND currency = 'BRL'
      AND (p_source = 'all' OR source = p_source)
  ) t GROUP BY bucket;
$$;

CREATE OR REPLACE FUNCTION public.fin_payables_forecast(p_source text DEFAULT 'all', p_weeks int DEFAULT 8)
RETURNS TABLE (semana date, total numeric, qtd bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT (date_trunc('week', due_date))::date AS semana, coalesce(sum(amount), 0), count(*)::bigint
  FROM public.purchase_payables
  WHERE status NOT IN ('pago', 'cancelado') AND currency = 'BRL'
    AND due_date >= current_date AND due_date < current_date + (p_weeks * 7)
    AND (p_source = 'all' OR source = p_source)
  GROUP BY 1 ORDER BY 1;
$$;

CREATE OR REPLACE FUNCTION public.fin_payables_status_summary(p_source text DEFAULT 'all', p_from date DEFAULT NULL, p_to date DEFAULT NULL)
RETURNS TABLE (status_efetivo text, qtd bigint, total numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE WHEN status = 'pago' THEN 'pago' WHEN status = 'cancelado' THEN 'cancelado'
              WHEN due_date < current_date THEN 'atrasado' ELSE 'programado' END,
         count(*)::bigint, coalesce(sum(amount), 0)
  FROM public.purchase_payables
  WHERE currency = 'BRL'
    AND (p_source = 'all' OR source = p_source)
    AND (p_from IS NULL OR due_date >= p_from) AND (p_to IS NULL OR due_date <= p_to)
  GROUP BY 1;
$$;

CREATE OR REPLACE FUNCTION public.fin_payables_monthly(p_source text DEFAULT 'all', p_from date DEFAULT NULL, p_to date DEFAULT NULL)
RETURNS TABLE (mes date, pago numeric, aberto numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT date_trunc('month', due_date)::date,
         coalesce(sum(amount) FILTER (WHERE status = 'pago'), 0),
         coalesce(sum(amount) FILTER (WHERE status NOT IN ('pago', 'cancelado')), 0)
  FROM public.purchase_payables
  WHERE currency = 'BRL'
    AND (p_source = 'all' OR source = p_source)
    AND (p_from IS NULL OR due_date >= p_from) AND (p_to IS NULL OR due_date <= p_to)
  GROUP BY 1 ORDER BY 1;
$$;

CREATE OR REPLACE FUNCTION public.fin_payables_top_suppliers(p_source text DEFAULT 'all', p_from date DEFAULT NULL, p_to date DEFAULT NULL, p_limit int DEFAULT 10)
RETURNS TABLE (supplier_name text, total numeric, qtd bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(nullif(btrim(supplier_name), ''), 'Não identificado'), coalesce(sum(amount), 0), count(*)::bigint
  FROM public.purchase_payables
  WHERE status <> 'cancelado' AND currency = 'BRL'
    AND (p_source = 'all' OR source = p_source)
    AND (p_from IS NULL OR due_date >= p_from) AND (p_to IS NULL OR due_date <= p_to)
  GROUP BY 1 ORDER BY 2 DESC LIMIT p_limit;
$$;

CREATE OR REPLACE FUNCTION public.fin_payables_on_time(p_source text DEFAULT 'all', p_from date DEFAULT NULL, p_to date DEFAULT NULL)
RETURNS TABLE (pagos bigint, no_prazo bigint, atrasados bigint, pct_no_prazo numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT count(*)::bigint,
         count(*) FILTER (WHERE paid_at::date <= due_date)::bigint,
         count(*) FILTER (WHERE paid_at::date > due_date)::bigint,
         round(100.0 * count(*) FILTER (WHERE paid_at::date <= due_date) / nullif(count(*), 0), 1)
  FROM public.purchase_payables
  WHERE status = 'pago' AND paid_at IS NOT NULL AND currency = 'BRL'
    AND (p_source = 'all' OR source = p_source)
    AND (p_from IS NULL OR paid_at::date >= p_from) AND (p_to IS NULL OR paid_at::date <= p_to);
$$;

-- ── Receivables (guarda currency='BRL') ──────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fin_receivables_aging(p_source text DEFAULT 'all')
RETURNS TABLE (bucket text, qtd bigint, total numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT bucket, count(*)::bigint, coalesce(sum(amount), 0)
  FROM (
    SELECT amount,
      CASE
        WHEN due_date < current_date - 30 THEN 'vencido_30_mais'
        WHEN due_date < current_date THEN 'vencido_1_30'
        WHEN due_date = current_date THEN 'vence_hoje'
        WHEN due_date <= current_date + 7 THEN 'a_vencer_7'
        WHEN due_date <= current_date + 30 THEN 'a_vencer_30'
        ELSE 'a_vencer_mais'
      END AS bucket
    FROM public.receivables
    WHERE status NOT IN ('recebido', 'cancelado') AND currency = 'BRL'
      AND (p_source = 'all' OR source = p_source)
  ) t GROUP BY bucket;
$$;

CREATE OR REPLACE FUNCTION public.fin_receivables_top_customers(p_source text DEFAULT 'all', p_from date DEFAULT NULL, p_to date DEFAULT NULL, p_limit int DEFAULT 8)
RETURNS TABLE (customer_name text, total numeric, qtd bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(nullif(btrim(customer_name), ''), 'Não identificado'), coalesce(sum(amount), 0), count(*)::bigint
  FROM public.receivables
  WHERE status <> 'cancelado' AND currency = 'BRL'
    AND (p_source = 'all' OR source = p_source)
    AND (p_from IS NULL OR due_date >= p_from) AND (p_to IS NULL OR due_date <= p_to)
  GROUP BY 1 ORDER BY 2 DESC LIMIT p_limit;
$$;

CREATE OR REPLACE FUNCTION public.fin_receivables_on_time(p_source text DEFAULT 'all', p_from date DEFAULT NULL, p_to date DEFAULT NULL)
RETURNS TABLE (recebidos bigint, no_prazo bigint, atrasados bigint, pct_no_prazo numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT count(*)::bigint,
         count(*) FILTER (WHERE received_at::date <= due_date)::bigint,
         count(*) FILTER (WHERE received_at::date > due_date)::bigint,
         round(100.0 * count(*) FILTER (WHERE received_at::date <= due_date) / nullif(count(*), 0), 1)
  FROM public.receivables
  WHERE status = 'recebido' AND received_at IS NOT NULL AND currency = 'BRL'
    AND (p_source = 'all' OR source = p_source)
    AND (p_from IS NULL OR received_at::date >= p_from) AND (p_to IS NULL OR received_at::date <= p_to);
$$;

-- ── Fluxo de caixa: BRL + inclui vencido em aberto na semana atual ───────────
CREATE OR REPLACE FUNCTION public.fin_cashflow_weekly(p_source text DEFAULT 'all', p_weeks int DEFAULT 8)
RETURNS TABLE (semana date, entrada numeric, saida numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH base AS (
    SELECT (date_trunc('week', GREATEST(due_date, current_date)))::date AS semana,
           coalesce(sum(amount), 0) AS entrada, 0::numeric AS saida
    FROM public.receivables
    WHERE status NOT IN ('recebido', 'cancelado') AND currency = 'BRL'
      AND due_date < current_date + (p_weeks * 7)
      AND (p_source = 'all' OR source = p_source)
    GROUP BY 1
    UNION ALL
    SELECT (date_trunc('week', GREATEST(due_date, current_date)))::date, 0::numeric, coalesce(sum(amount), 0)
    FROM public.purchase_payables
    WHERE status NOT IN ('pago', 'cancelado') AND currency = 'BRL'
      AND due_date < current_date + (p_weeks * 7)
      AND (p_source = 'all' OR source = p_source)
    GROUP BY 1
  )
  SELECT semana, sum(entrada), sum(saida) FROM base GROUP BY semana ORDER BY semana;
$$;

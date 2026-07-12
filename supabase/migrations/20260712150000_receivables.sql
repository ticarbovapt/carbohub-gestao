-- ONDA 3 — Contas a Receber + Fluxo de caixa consolidado.
-- Espelha a mecânica de purchase_payables pro lado da RECEITA. source: 'interno'
-- (gerado no sistema) | 'bling' (espelho do Bling). "Atrasado" é computado
-- (em aberto e due_date < hoje), igual às contas a pagar.

CREATE TABLE IF NOT EXISTS public.receivables (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source        TEXT NOT NULL DEFAULT 'interno',   -- interno | bling
  bling_id      BIGINT,
  bling_numero  TEXT,
  customer_name TEXT,
  order_id      UUID,                              -- vínculo opcional com carboze_orders
  amount        NUMERIC(14,2) NOT NULL DEFAULT 0,
  currency      TEXT NOT NULL DEFAULT 'BRL',
  due_date      DATE NOT NULL,
  status        TEXT NOT NULL DEFAULT 'programado',-- programado | recebido | cancelado
  received_at   TIMESTAMPTZ,
  received_by   UUID,
  notes         TEXT,
  bling_raw     JSONB,
  created_by    UUID,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_receivables_bling_id ON public.receivables (bling_id) WHERE bling_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_receivables_status_due ON public.receivables (status, due_date);
CREATE INDEX IF NOT EXISTS idx_receivables_source ON public.receivables (source);
CREATE INDEX IF NOT EXISTS idx_receivables_received_at ON public.receivables (received_at);

ALTER TABLE public.receivables ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS receivables_all ON public.receivables;
CREATE POLICY receivables_all ON public.receivables FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ── Lista paginada (mesmo contrato do usePurchasePayablesPaged) ───────────────
-- feito no cliente via supabase.from(...).range(); aqui só ficam as agregações.

-- 1) Aging de recebíveis em aberto.
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
    WHERE status NOT IN ('recebido', 'cancelado')
      AND (p_source = 'all' OR source = p_source)
  ) t
  GROUP BY bucket;
$$;

-- 2) Top clientes a receber (para curva ABC de recebíveis / concentração).
CREATE OR REPLACE FUNCTION public.fin_receivables_top_customers(p_source text DEFAULT 'all', p_from date DEFAULT NULL, p_to date DEFAULT NULL, p_limit int DEFAULT 8)
RETURNS TABLE (customer_name text, total numeric, qtd bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(nullif(btrim(customer_name), ''), 'Não identificado'),
         coalesce(sum(amount), 0), count(*)::bigint
  FROM public.receivables
  WHERE status <> 'cancelado'
    AND (p_source = 'all' OR source = p_source)
    AND (p_from IS NULL OR due_date >= p_from)
    AND (p_to IS NULL OR due_date <= p_to)
  GROUP BY 1 ORDER BY 2 DESC LIMIT p_limit;
$$;

-- 3) Fluxo de caixa semanal consolidado: ENTRADA (receber) x SAÍDA (pagar).
--    Só contas em aberto com vencimento nas próximas N semanas. BRL.
CREATE OR REPLACE FUNCTION public.fin_cashflow_weekly(p_source text DEFAULT 'all', p_weeks int DEFAULT 8)
RETURNS TABLE (semana date, entrada numeric, saida numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH base AS (
    SELECT (date_trunc('week', due_date))::date AS semana,
           coalesce(sum(amount), 0) AS entrada, 0::numeric AS saida
    FROM public.receivables
    WHERE status NOT IN ('recebido', 'cancelado')
      AND due_date >= current_date AND due_date < current_date + (p_weeks * 7)
      AND (p_source = 'all' OR source = p_source)
    GROUP BY 1
    UNION ALL
    SELECT (date_trunc('week', due_date))::date, 0::numeric,
           coalesce(sum(amount), 0)
    FROM public.purchase_payables
    WHERE status NOT IN ('pago', 'cancelado')
      AND due_date >= current_date AND due_date < current_date + (p_weeks * 7)
      AND (p_source = 'all' OR source = p_source)
    GROUP BY 1
  )
  SELECT semana, sum(entrada), sum(saida) FROM base GROUP BY semana ORDER BY semana;
$$;

-- 4) % recebido no prazo (por data de recebimento no período).
CREATE OR REPLACE FUNCTION public.fin_receivables_on_time(p_source text DEFAULT 'all', p_from date DEFAULT NULL, p_to date DEFAULT NULL)
RETURNS TABLE (recebidos bigint, no_prazo bigint, atrasados bigint, pct_no_prazo numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT count(*)::bigint,
         count(*) FILTER (WHERE received_at::date <= due_date)::bigint,
         count(*) FILTER (WHERE received_at::date > due_date)::bigint,
         round(100.0 * count(*) FILTER (WHERE received_at::date <= due_date) / nullif(count(*), 0), 1)
  FROM public.receivables
  WHERE status = 'recebido' AND received_at IS NOT NULL
    AND (p_source = 'all' OR source = p_source)
    AND (p_from IS NULL OR received_at::date >= p_from)
    AND (p_to IS NULL OR received_at::date <= p_to);
$$;

GRANT EXECUTE ON FUNCTION public.fin_receivables_aging(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fin_receivables_top_customers(text, date, date, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fin_cashflow_weekly(text, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fin_receivables_on_time(text, date, date) TO authenticated;

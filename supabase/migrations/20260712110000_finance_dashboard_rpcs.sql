-- Funções agregadoras do Dashboard financeiro. Retornam JÁ somado (KBs, não a
-- tabela inteira) — resolvem o gargalo de puxar todo o histórico do Bling pro
-- cliente. SECURITY DEFINER: autorização é na borda (quem enxerga o dashboard).
-- p_source: 'all' | 'interno' | 'bling'. Regra de "atrasado" = em aberto e
-- due_date < hoje (mesma da lista de Contas a Pagar).

-- Índices de apoio (source já indexado na migração do Bling).
CREATE INDEX IF NOT EXISTS idx_pp_status_due ON public.purchase_payables (status, due_date);
CREATE INDEX IF NOT EXISTS idx_pp_paid_at ON public.purchase_payables (paid_at);

-- 1) Aging de contas EM ABERTO por faixa de vencimento.
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
    WHERE status NOT IN ('pago', 'cancelado')
      AND (p_source = 'all' OR source = p_source)
  ) t
  GROUP BY bucket;
$$;

-- 2) Previsão de desembolso: contas em aberto por semana, próximas N semanas.
CREATE OR REPLACE FUNCTION public.fin_payables_forecast(p_source text DEFAULT 'all', p_weeks int DEFAULT 8)
RETURNS TABLE (semana date, total numeric, qtd bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT (date_trunc('week', due_date))::date AS semana,
         coalesce(sum(amount), 0), count(*)::bigint
  FROM public.purchase_payables
  WHERE status NOT IN ('pago', 'cancelado')
    AND due_date >= current_date
    AND due_date < current_date + (p_weeks * 7)
    AND (p_source = 'all' OR source = p_source)
  GROUP BY 1 ORDER BY 1;
$$;

-- 3) Resumo por status EFETIVO (pra pizza) num período (por vencimento).
CREATE OR REPLACE FUNCTION public.fin_payables_status_summary(p_source text DEFAULT 'all', p_from date DEFAULT NULL, p_to date DEFAULT NULL)
RETURNS TABLE (status_efetivo text, qtd bigint, total numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE
           WHEN status = 'pago' THEN 'pago'
           WHEN status = 'cancelado' THEN 'cancelado'
           WHEN due_date < current_date THEN 'atrasado'
           ELSE 'programado'
         END AS status_efetivo,
         count(*)::bigint, coalesce(sum(amount), 0)
  FROM public.purchase_payables
  WHERE (p_source = 'all' OR source = p_source)
    AND (p_from IS NULL OR due_date >= p_from)
    AND (p_to IS NULL OR due_date <= p_to)
  GROUP BY 1;
$$;

-- 4) Gasto mensal (por vencimento), separando pago x em aberto.
CREATE OR REPLACE FUNCTION public.fin_payables_monthly(p_source text DEFAULT 'all', p_from date DEFAULT NULL, p_to date DEFAULT NULL)
RETURNS TABLE (mes date, pago numeric, aberto numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT date_trunc('month', due_date)::date AS mes,
         coalesce(sum(amount) FILTER (WHERE status = 'pago'), 0) AS pago,
         coalesce(sum(amount) FILTER (WHERE status NOT IN ('pago', 'cancelado')), 0) AS aberto
  FROM public.purchase_payables
  WHERE (p_source = 'all' OR source = p_source)
    AND (p_from IS NULL OR due_date >= p_from)
    AND (p_to IS NULL OR due_date <= p_to)
  GROUP BY 1 ORDER BY 1;
$$;

-- 5) Top fornecedores por gasto no período (base da curva ABC).
CREATE OR REPLACE FUNCTION public.fin_payables_top_suppliers(p_source text DEFAULT 'all', p_from date DEFAULT NULL, p_to date DEFAULT NULL, p_limit int DEFAULT 10)
RETURNS TABLE (supplier_name text, total numeric, qtd bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(nullif(btrim(supplier_name), ''), 'Não identificado') AS supplier_name,
         coalesce(sum(amount), 0) AS total, count(*)::bigint
  FROM public.purchase_payables
  WHERE status <> 'cancelado'
    AND (p_source = 'all' OR source = p_source)
    AND (p_from IS NULL OR due_date >= p_from)
    AND (p_to IS NULL OR due_date <= p_to)
  GROUP BY 1 ORDER BY 2 DESC LIMIT p_limit;
$$;

-- 6) % pago no prazo (por data de pagamento no período).
CREATE OR REPLACE FUNCTION public.fin_payables_on_time(p_source text DEFAULT 'all', p_from date DEFAULT NULL, p_to date DEFAULT NULL)
RETURNS TABLE (pagos bigint, no_prazo bigint, atrasados bigint, pct_no_prazo numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT count(*)::bigint,
         count(*) FILTER (WHERE paid_at::date <= due_date)::bigint,
         count(*) FILTER (WHERE paid_at::date > due_date)::bigint,
         round(100.0 * count(*) FILTER (WHERE paid_at::date <= due_date) / nullif(count(*), 0), 1)
  FROM public.purchase_payables
  WHERE status = 'pago' AND paid_at IS NOT NULL
    AND (p_source = 'all' OR source = p_source)
    AND (p_from IS NULL OR paid_at::date >= p_from)
    AND (p_to IS NULL OR paid_at::date <= p_to);
$$;

-- 7) Tempos de ciclo do fluxo interno (dias), média e mediana por etapa.
CREATE OR REPLACE FUNCTION public.fin_purchase_cycle_times()
RETURNS TABLE (etapa text, ordem int, media_dias numeric, p50_dias numeric, n bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH c AS (
    SELECT 'RC → aprovação' AS etapa, 1 AS ordem,
           extract(epoch FROM (approved_at - created_at)) / 86400.0 AS dias
    FROM public.purchase_requests WHERE approved_at IS NOT NULL
    UNION ALL
    SELECT 'OC → compra', 2, extract(epoch FROM (purchased_at - created_at)) / 86400.0
    FROM public.purchase_orders WHERE purchased_at IS NOT NULL
    UNION ALL
    SELECT 'OC → recebimento', 3, extract(epoch FROM (r.received_at - o.created_at)) / 86400.0
    FROM public.purchase_receivings r JOIN public.purchase_orders o ON o.id = r.purchase_order_id
    UNION ALL
    SELECT 'Recebimento → NF', 4, extract(epoch FROM (i.verified_at - r.received_at)) / 86400.0
    FROM public.purchase_invoices i JOIN public.purchase_receivings r ON r.id = i.receiving_id
    WHERE i.verified_at IS NOT NULL
  )
  SELECT etapa, ordem,
         round(avg(dias)::numeric, 1),
         round((percentile_cont(0.5) WITHIN GROUP (ORDER BY dias))::numeric, 1),
         count(*)::bigint
  FROM c WHERE dias >= 0 GROUP BY etapa, ordem ORDER BY ordem;
$$;

-- 8) Saúde do 3-way match.
CREATE OR REPLACE FUNCTION public.fin_3way_summary()
RETURNS TABLE (total bigint, ok bigint, divergentes bigint, pct_ok numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT count(*)::bigint,
         count(*) FILTER (WHERE oc_match AND receiving_match AND value_match)::bigint,
         count(*) FILTER (WHERE NOT (oc_match AND receiving_match AND value_match))::bigint,
         round(100.0 * count(*) FILTER (WHERE oc_match AND receiving_match AND value_match) / nullif(count(*), 0), 1)
  FROM public.purchase_invoices;
$$;

-- 9) Economia de cotação: estimado (RC) x escolhido (cotação vencedora).
CREATE OR REPLACE FUNCTION public.fin_quote_savings()
RETURNS TABLE (total_estimado numeric, total_escolhido numeric, economia numeric, n bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH sel AS (
    SELECT request_id, sum(unit_price * quantidade) AS escolhido
    FROM public.purchase_quotes WHERE selected GROUP BY request_id
  )
  SELECT coalesce(sum(r.estimated_value), 0),
         coalesce(sum(s.escolhido), 0),
         coalesce(sum(r.estimated_value), 0) - coalesce(sum(s.escolhido), 0),
         count(*)::bigint
  FROM sel s JOIN public.purchase_requests r ON r.id = s.request_id;
$$;

GRANT EXECUTE ON FUNCTION public.fin_payables_aging(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fin_payables_forecast(text, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fin_payables_status_summary(text, date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fin_payables_monthly(text, date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fin_payables_top_suppliers(text, date, date, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fin_payables_on_time(text, date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fin_purchase_cycle_times() TO authenticated;
GRANT EXECUTE ON FUNCTION public.fin_3way_summary() TO authenticated;
GRANT EXECUTE ON FUNCTION public.fin_quote_savings() TO authenticated;

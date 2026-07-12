-- ONDA 4 — Comissão confiável: regras de % + memória de cálculo (quais NFs).

-- 1) Regras de comissão: % por vendedor (vendedor_id NULL = regra PADRÃO).
CREATE TABLE IF NOT EXISTS public.commission_rules (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendedor_id UUID,                                  -- NULL = padrão
  vendedor_name TEXT,
  rate_pct    NUMERIC(7,3) NOT NULL DEFAULT 0,
  active      BOOLEAN NOT NULL DEFAULT true,
  notes       TEXT,
  created_by  UUID,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Uma regra por vendedor; e só uma regra PADRÃO.
CREATE UNIQUE INDEX IF NOT EXISTS uq_commission_rule_vendedor ON public.commission_rules(vendedor_id) WHERE vendedor_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_commission_rule_default  ON public.commission_rules((vendedor_id IS NULL)) WHERE vendedor_id IS NULL;

ALTER TABLE public.commission_rules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "read commission_rules" ON public.commission_rules;
CREATE POLICY "read commission_rules" ON public.commission_rules FOR SELECT USING (auth.role() = 'authenticated');
DROP POLICY IF EXISTS "gestor write commission_rules" ON public.commission_rules;
CREATE POLICY "gestor write commission_rules" ON public.commission_rules
  FOR ALL USING (public.carbo_is_gestor(auth.uid())) WITH CHECK (public.carbo_is_gestor(auth.uid()));

-- 2) Memória de cálculo: as NFs/pedidos que compõem cada fechamento (snapshot).
CREATE TABLE IF NOT EXISTS public.commission_statement_items (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  statement_id  UUID NOT NULL REFERENCES public.commission_statements(id) ON DELETE CASCADE,
  order_id      UUID,
  order_number  TEXT,
  customer_name TEXT,
  total         NUMERIC(14,2) NOT NULL DEFAULT 0,
  sale_date     DATE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_commission_items_statement ON public.commission_statement_items(statement_id);

ALTER TABLE public.commission_statement_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "read commission_items" ON public.commission_statement_items;
CREATE POLICY "read commission_items" ON public.commission_statement_items FOR SELECT USING (auth.role() = 'authenticated');
DROP POLICY IF EXISTS "gestor write commission_items" ON public.commission_statement_items;
CREATE POLICY "gestor write commission_items" ON public.commission_statement_items
  FOR ALL USING (public.carbo_is_gestor(auth.uid())) WITH CHECK (public.carbo_is_gestor(auth.uid()));

-- 3) Detalhe: os pedidos faturados que compõem a base de um vendedor no período
-- (mesma regra do agregado). Alimenta a memória de cálculo.
CREATE OR REPLACE FUNCTION public.crm_comissao_detalhe(p_vendedor uuid, p_from date, p_to date)
RETURNS TABLE (order_id uuid, order_number text, customer_name text, total numeric, sale_date date)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT o.id, o.order_number, o.customer_name, COALESCE(o.total, 0)::numeric,
         COALESCE(o.sale_date, o.created_at::date)
  FROM public.carboze_orders o
  WHERE o.vendedor_id = p_vendedor
    AND o.bling_nf_id IS NOT NULL
    AND o.status NOT IN ('quote', 'cancelled')
    AND COALESCE(o.excluir_metricas, false) = false
    AND COALESCE(o.sale_date, o.created_at::date) >= p_from
    AND COALESCE(o.sale_date, o.created_at::date) <= p_to
  ORDER BY 5;
$$;
GRANT EXECUTE ON FUNCTION public.crm_comissao_detalhe(uuid, date, date) TO authenticated;

-- 4) Resolve o % de comissão de um vendedor (regra específica > padrão).
CREATE OR REPLACE FUNCTION public.crm_comissao_rate(p_vendedor uuid)
RETURNS numeric
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT rate_pct FROM public.commission_rules
  WHERE active AND (vendedor_id = p_vendedor OR vendedor_id IS NULL)
  ORDER BY vendedor_id NULLS LAST
  LIMIT 1;
$$;
GRANT EXECUTE ON FUNCTION public.crm_comissao_rate(uuid) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- Carbo Finanças — Comissionamento + Dados financeiros de funcionários
--
-- 3 tabelas novas + 1 RPC de agregação. Regras acordadas com o financeiro:
--  • Base da comissão = vendas FATURADAS (com NF vinculada) do vendedor no período.
--  • % é digitado a cada fechamento (não há regra fixa) → gera um "fechamento".
--  • Pagamento pode ser total ou PARCIAL; o saldo é acompanhado.
--  • Acesso: qualquer usuário autenticado do Carbo Finanças (RLS = authenticated).
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Dados financeiros do funcionário (PIX / banco / contato) ───────────────
CREATE TABLE IF NOT EXISTS public.employee_finance (
  user_id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name        TEXT,
  cpf              TEXT,
  pix_key          TEXT,
  pix_type         TEXT,            -- cpf | cnpj | email | telefone | aleatoria
  bank_name        TEXT,
  bank_code        TEXT,
  bank_agency      TEXT,
  bank_account     TEXT,
  account_type     TEXT,            -- corrente | poupanca
  phone            TEXT,
  emergency_name   TEXT,
  emergency_phone  TEXT,
  notes            TEXT,
  updated_by       UUID,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.employee_finance ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read employee_finance"  ON public.employee_finance FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "auth write employee_finance" ON public.employee_finance FOR ALL
  USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

-- ── 2. Fechamento de comissão (por vendedor / período) ────────────────────────
CREATE TABLE IF NOT EXISTS public.commission_statements (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendedor_id   UUID NOT NULL,
  vendedor_name TEXT,
  period_start  DATE NOT NULL,
  period_end    DATE NOT NULL,
  base_sales    NUMERIC(14,2) NOT NULL DEFAULT 0,   -- soma das vendas faturadas no período
  sales_count   INTEGER NOT NULL DEFAULT 0,
  rate_pct      NUMERIC(7,3) NOT NULL DEFAULT 0,     -- % digitado
  amount_due    NUMERIC(14,2) NOT NULL DEFAULT 0,    -- base_sales * rate_pct/100
  amount_paid   NUMERIC(14,2) NOT NULL DEFAULT 0,    -- mantido pelo trigger
  status        TEXT NOT NULL DEFAULT 'aberto',      -- aberto | parcial | pago
  notes         TEXT,
  created_by    UUID,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_commission_statements_vendedor ON public.commission_statements(vendedor_id);
CREATE INDEX IF NOT EXISTS idx_commission_statements_period   ON public.commission_statements(period_start, period_end);

ALTER TABLE public.commission_statements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read commission_statements"  ON public.commission_statements FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "auth write commission_statements" ON public.commission_statements FOR ALL
  USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

-- ── 3. Pagamentos da comissão (histórico; permite pagamento parcial) ──────────
CREATE TABLE IF NOT EXISTS public.commission_payments (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  statement_id UUID NOT NULL REFERENCES public.commission_statements(id) ON DELETE CASCADE,
  amount       NUMERIC(14,2) NOT NULL,
  paid_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  method       TEXT,
  notes        TEXT,
  paid_by      UUID,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_commission_payments_statement ON public.commission_payments(statement_id);

ALTER TABLE public.commission_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read commission_payments"  ON public.commission_payments FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "auth write commission_payments" ON public.commission_payments FOR ALL
  USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

-- ── Trigger: recalcula amount_paid + status do fechamento a cada pagamento ─────
CREATE OR REPLACE FUNCTION public.commission_recalc_paid()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  sid  UUID := COALESCE(NEW.statement_id, OLD.statement_id);
  paid NUMERIC;
  due  NUMERIC;
BEGIN
  SELECT COALESCE(SUM(amount), 0) INTO paid FROM public.commission_payments WHERE statement_id = sid;
  SELECT amount_due INTO due FROM public.commission_statements WHERE id = sid;
  UPDATE public.commission_statements
     SET amount_paid = paid,
         status = CASE WHEN paid <= 0 THEN 'aberto'
                       WHEN paid >= due THEN 'pago'
                       ELSE 'parcial' END,
         updated_at = now()
   WHERE id = sid;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS trg_commission_recalc ON public.commission_payments;
CREATE TRIGGER trg_commission_recalc
AFTER INSERT OR UPDATE OR DELETE ON public.commission_payments
FOR EACH ROW EXECUTE FUNCTION public.commission_recalc_paid();

-- ── RPC: total FATURADO por vendedor no período (base da comissão) ────────────
-- Faturada = tem NF vinculada (bling_nf_id NOT NULL). Ignora orçamento/cancelada
-- e vendas marcadas fora de métrica. Período pela data efetiva da venda.
CREATE OR REPLACE FUNCTION public.crm_comissao_agregado(p_from DATE, p_to DATE)
RETURNS TABLE (vendedor_id UUID, vendedor_name TEXT, total NUMERIC, qtd BIGINT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT o.vendedor_id,
         MAX(o.vendedor_name)               AS vendedor_name,
         COALESCE(SUM(o.total), 0)::numeric AS total,
         COUNT(*)::bigint                   AS qtd
  FROM public.carboze_orders o
  WHERE o.vendedor_id IS NOT NULL
    AND o.bling_nf_id IS NOT NULL
    AND o.status NOT IN ('quote', 'cancelled')
    AND COALESCE(o.excluir_metricas, false) = false
    AND COALESCE(o.sale_date, o.created_at::date) >= p_from
    AND COALESCE(o.sale_date, o.created_at::date) <= p_to
  GROUP BY o.vendedor_id;
$$;
GRANT EXECUTE ON FUNCTION public.crm_comissao_agregado(DATE, DATE) TO authenticated;

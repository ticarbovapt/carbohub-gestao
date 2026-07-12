-- Auditoria geral do Carbo Finanças — ONDA 1 (riscos urgentes).
-- Usa public.carbo_is_gestor(uid) (já existe) pra restringir a gestores.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) employee_finance: dados bancários/PIX só pra GESTOR + log de alteração.
--    Antes: qualquer autenticado lia/editava PII de todo mundo, sem rastro.
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "auth read employee_finance"  ON public.employee_finance;
DROP POLICY IF EXISTS "auth write employee_finance" ON public.employee_finance;
CREATE POLICY "gestor read employee_finance"  ON public.employee_finance
  FOR SELECT USING (public.carbo_is_gestor(auth.uid()));
CREATE POLICY "gestor write employee_finance" ON public.employee_finance
  FOR ALL USING (public.carbo_is_gestor(auth.uid())) WITH CHECK (public.carbo_is_gestor(auth.uid()));

CREATE TABLE IF NOT EXISTS public.employee_finance_audit (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID,
  action      TEXT NOT NULL,               -- INSERT | UPDATE | DELETE
  changed_by  UUID,
  changed_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  old_data    JSONB,
  new_data    JSONB
);
ALTER TABLE public.employee_finance_audit ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "gestor read ef_audit" ON public.employee_finance_audit;
CREATE POLICY "gestor read ef_audit" ON public.employee_finance_audit
  FOR SELECT USING (public.carbo_is_gestor(auth.uid()));

CREATE OR REPLACE FUNCTION public.employee_finance_log()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.employee_finance_audit(employee_id, action, changed_by, old_data, new_data)
  VALUES (
    COALESCE(NEW.id, OLD.id),
    TG_OP,
    auth.uid(),
    CASE WHEN TG_OP <> 'INSERT' THEN to_jsonb(OLD) END,
    CASE WHEN TG_OP <> 'DELETE' THEN to_jsonb(NEW) END
  );
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS trg_employee_finance_log ON public.employee_finance;
CREATE TRIGGER trg_employee_finance_log
AFTER INSERT OR UPDATE OR DELETE ON public.employee_finance
FOR EACH ROW EXECUTE FUNCTION public.employee_finance_log();

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) Comissão: sem fechamento duplicado, escrita só gestor, teto no pagamento.
-- ─────────────────────────────────────────────────────────────────────────────
-- ⚠️ Se já existirem fechamentos duplicados (mesmo vendedor+período), este índice
-- falha. Rode antes pra achar/limpar:
--   SELECT vendedor_id, period_start, period_end, count(*)
--   FROM public.commission_statements
--   GROUP BY 1,2,3 HAVING count(*) > 1;
CREATE UNIQUE INDEX IF NOT EXISTS uq_commission_statement_periodo
  ON public.commission_statements(vendedor_id, period_start, period_end);

DROP POLICY IF EXISTS "auth write commission_statements" ON public.commission_statements;
CREATE POLICY "gestor write commission_statements" ON public.commission_statements
  FOR ALL USING (public.carbo_is_gestor(auth.uid())) WITH CHECK (public.carbo_is_gestor(auth.uid()));
DROP POLICY IF EXISTS "auth write commission_payments" ON public.commission_payments;
CREATE POLICY "gestor write commission_payments" ON public.commission_payments
  FOR ALL USING (public.carbo_is_gestor(auth.uid())) WITH CHECK (public.carbo_is_gestor(auth.uid()));

-- Teto: um pagamento não pode fazer o total pago passar do devido.
CREATE OR REPLACE FUNCTION public.commission_payment_guard()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE pago NUMERIC; due NUMERIC;
BEGIN
  IF NEW.amount <= 0 THEN RAISE EXCEPTION 'Valor do pagamento deve ser positivo.'; END IF;
  SELECT COALESCE(SUM(amount), 0) INTO pago FROM public.commission_payments
    WHERE statement_id = NEW.statement_id AND id <> NEW.id;
  SELECT amount_due INTO due FROM public.commission_statements WHERE id = NEW.statement_id;
  IF pago + NEW.amount > due + 0.01 THEN
    RAISE EXCEPTION 'Pagamento excede o saldo devido (saldo: %).', round(due - pago, 2);
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_commission_payment_guard ON public.commission_payments;
CREATE TRIGGER trg_commission_payment_guard
BEFORE INSERT OR UPDATE ON public.commission_payments
FOR EACH ROW EXECUTE FUNCTION public.commission_payment_guard();

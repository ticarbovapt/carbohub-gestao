-- ─────────────────────────────────────────────────────────────────────────────
-- Carbo Ops — abre purchase_payables (Contas a Pagar) removendo travas legadas
-- (gestor/admin). Mesmo padrão das demais tabelas do pipeline de compras.
-- ─────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Payable viewable by authorized" ON public.purchase_payables;
DROP POLICY IF EXISTS "Payable insertable by gestors"  ON public.purchase_payables;
DROP POLICY IF EXISTS "Payable updatable by gestors"   ON public.purchase_payables;
DROP POLICY IF EXISTS "Payable deletable by admin"     ON public.purchase_payables;
DROP POLICY IF EXISTS purchase_payables_ops_all        ON public.purchase_payables;
CREATE POLICY purchase_payables_ops_all ON public.purchase_payables
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

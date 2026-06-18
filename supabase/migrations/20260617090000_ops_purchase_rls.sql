-- ─────────────────────────────────────────────────────────────────────────────
-- Carbo Ops — Compras sobre o pipeline oficial purchase_requests → purchase_orders.
-- Abre RLS (autenticado) removendo travas legadas is_ceo/is_gestor/admin.
-- Recebimento/NF/Contas a Pagar ficam pra próxima fase.
-- ─────────────────────────────────────────────────────────────────────────────

-- purchase_requests
DROP POLICY IF EXISTS "RC viewable by authorized" ON public.purchase_requests;
DROP POLICY IF EXISTS "RC insertable by authenticated" ON public.purchase_requests;
DROP POLICY IF EXISTS "RC updatable by authorized" ON public.purchase_requests;
DROP POLICY IF EXISTS "RC deletable by admin" ON public.purchase_requests;
DROP POLICY IF EXISTS purchase_requests_ops_all ON public.purchase_requests;
CREATE POLICY purchase_requests_ops_all ON public.purchase_requests
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- purchase_orders
DROP POLICY IF EXISTS "OC viewable by authorized" ON public.purchase_orders;
DROP POLICY IF EXISTS "OC insertable by gestors" ON public.purchase_orders;
DROP POLICY IF EXISTS "OC updatable by gestors" ON public.purchase_orders;
DROP POLICY IF EXISTS "OC deletable by admin" ON public.purchase_orders;
DROP POLICY IF EXISTS purchase_orders_ops_all ON public.purchase_orders;
CREATE POLICY purchase_orders_ops_all ON public.purchase_orders
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

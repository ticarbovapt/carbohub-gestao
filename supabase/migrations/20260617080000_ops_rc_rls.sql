-- ─────────────────────────────────────────────────────────────────────────────
-- Carbo Ops — abre rc_requests (Requisições de Compra) removendo travas legadas
-- (is_employee / is_gestor / admin). Aberto a autenticado por ora.
-- ─────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "RC viewable by authorized"      ON public.rc_requests;
DROP POLICY IF EXISTS "RC insertable by authenticated" ON public.rc_requests;
DROP POLICY IF EXISTS "RC updatable by gestors"        ON public.rc_requests;
DROP POLICY IF EXISTS "RC updatable by employee"       ON public.rc_requests;
DROP POLICY IF EXISTS "RC deletable by admin"          ON public.rc_requests;
DROP POLICY IF EXISTS "RC deletable by employee"       ON public.rc_requests;
DROP POLICY IF EXISTS rc_requests_ops_all              ON public.rc_requests;
CREATE POLICY rc_requests_ops_all ON public.rc_requests
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

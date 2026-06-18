-- ─────────────────────────────────────────────────────────────────────────────
-- Conserta regressão de RLS: a migration 20260617080000_ops_rc_rls.sql abriu a
-- rc_requests (tabela do sistema "controle", viva em produção) achando que o
-- Carbo Ops a usaria. O Ops migrou para purchase_requests (20260617090000), então
-- aqui REMOVEMOS a policy permissiva e RESTAURAMOS as policies originais da tabela
-- (estado pós role-matrix: SELECT por solicitante/CEO/gestor, escrita por funcionário).
-- ─────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS rc_requests_ops_all ON public.rc_requests;

DROP POLICY IF EXISTS "RC viewable by authorized" ON public.rc_requests;
CREATE POLICY "RC viewable by authorized" ON public.rc_requests
FOR SELECT USING (
  auth.uid() IS NOT NULL AND (
    solicitante_id = auth.uid() OR is_ceo(auth.uid()) OR is_gestor(auth.uid())
  )
);

DROP POLICY IF EXISTS "RC insertable by authenticated" ON public.rc_requests;
CREATE POLICY "RC insertable by authenticated" ON public.rc_requests
FOR INSERT WITH CHECK (auth.uid() IS NOT NULL AND solicitante_id = auth.uid());

DROP POLICY IF EXISTS "RC updatable by employee" ON public.rc_requests;
CREATE POLICY "RC updatable by employee" ON public.rc_requests
FOR UPDATE USING (public.is_employee(auth.uid()));

DROP POLICY IF EXISTS "RC deletable by employee" ON public.rc_requests;
CREATE POLICY "RC deletable by employee" ON public.rc_requests
FOR DELETE USING (public.is_employee(auth.uid()));

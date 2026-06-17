-- ─────────────────────────────────────────────────────────────────────────────
-- Carbo Ops — abre machines (CRUD) e leitura de licensees (pro dropdown/nome).
-- Remove travas is_manager/carbo_roles. Aberto a autenticado por ora.
-- ─────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Authenticated users can view machines" ON public.machines;
DROP POLICY IF EXISTS "Managers can view machines"            ON public.machines;
DROP POLICY IF EXISTS "Managers can manage machines"          ON public.machines;
DROP POLICY IF EXISTS machines_ops_all                        ON public.machines;
CREATE POLICY machines_ops_all ON public.machines
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Managers can view licensees"          ON public.licensees;
DROP POLICY IF EXISTS "Authenticated users can view licensees" ON public.licensees;
DROP POLICY IF EXISTS licensees_ops_select                   ON public.licensees;
CREATE POLICY licensees_ops_select ON public.licensees
  FOR SELECT TO authenticated USING (true);

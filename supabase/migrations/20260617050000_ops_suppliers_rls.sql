-- ─────────────────────────────────────────────────────────────────────────────
-- Carbo Ops — abre escrita/leitura de mrp_suppliers (remove a trava is_employee
-- da Role Matrix). Aberto a autenticado por ora (restringe a gestor depois).
-- ─────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Employees can manage mrp_suppliers" ON public.mrp_suppliers;
DROP POLICY IF EXISTS "Employees can view mrp_suppliers"   ON public.mrp_suppliers;
DROP POLICY IF EXISTS mrp_suppliers_ops_all                ON public.mrp_suppliers;
CREATE POLICY mrp_suppliers_ops_all ON public.mrp_suppliers
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

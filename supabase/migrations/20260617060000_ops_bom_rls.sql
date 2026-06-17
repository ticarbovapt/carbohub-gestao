-- ─────────────────────────────────────────────────────────────────────────────
-- Carbo Ops — abre escrita de mrp_bom (ficha técnica). A escrita estava travada
-- em profiles.role admin/manager (legado). Aberto a autenticado por ora.
-- ─────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "mrp_bom_insert" ON public.mrp_bom;
DROP POLICY IF EXISTS "mrp_bom_update" ON public.mrp_bom;
DROP POLICY IF EXISTS "mrp_bom_delete" ON public.mrp_bom;
DROP POLICY IF EXISTS mrp_bom_ops_write ON public.mrp_bom;
CREATE POLICY mrp_bom_ops_write ON public.mrp_bom
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

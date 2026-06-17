-- ─────────────────────────────────────────────────────────────────────────────
-- Carbo Ops — abre escrita do catálogo (mrp_products, sku, sku_bom) removendo a
-- trava is_employee (Role Matrix) do controle. Por ora aberto a autenticado;
-- restringe a gestor depois (carbo_is_gestor já existe).
-- ─────────────────────────────────────────────────────────────────────────────

-- mrp_products
DROP POLICY IF EXISTS "Employees can manage mrp_products" ON public.mrp_products;
DROP POLICY IF EXISTS "Employees can view mrp_products"   ON public.mrp_products;
DROP POLICY IF EXISTS mrp_products_ops_all                ON public.mrp_products;
CREATE POLICY mrp_products_ops_all ON public.mrp_products
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- sku
DROP POLICY IF EXISTS "Employees can manage sku" ON public.sku;
DROP POLICY IF EXISTS "Employees can view sku"   ON public.sku;
DROP POLICY IF EXISTS sku_ops_all                ON public.sku;
CREATE POLICY sku_ops_all ON public.sku
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- sku_bom
DROP POLICY IF EXISTS "Employees can manage sku_bom" ON public.sku_bom;
DROP POLICY IF EXISTS "Employees can view sku_bom"   ON public.sku_bom;
DROP POLICY IF EXISTS sku_bom_ops_all                ON public.sku_bom;
CREATE POLICY sku_bom_ops_all ON public.sku_bom
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

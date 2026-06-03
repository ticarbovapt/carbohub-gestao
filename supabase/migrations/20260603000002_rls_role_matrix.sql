-- ============================================================
-- L1: Substituir RLS legacy (is_admin/is_ceo/is_gestor) por
--     verificação baseada em profiles (qualquer funcionário
--     autenticado). O controle de tela já é feito pela Role
--     Matrix (function_screen_access) no front-end.
-- ============================================================

-- ─── Helpers ────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.is_employee(uid uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = uid);
$$;

CREATE OR REPLACE FUNCTION public.is_ti_head(uid uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = uid
      AND department::text = 'ti_suporte'
      AND funcao = 'head'
  );
$$;

-- ─── warehouses ─────────────────────────────────────────────

DROP POLICY IF EXISTS "Warehouses manageable by admin" ON public.warehouses;

CREATE POLICY "Warehouses manageable by employee"
  ON public.warehouses FOR ALL
  USING (public.is_employee(auth.uid()))
  WITH CHECK (public.is_employee(auth.uid()));

-- ─── warehouse_stock ────────────────────────────────────────

DROP POLICY IF EXISTS "Stock manageable by gestor+" ON public.warehouse_stock;

CREATE POLICY "Stock manageable by employee"
  ON public.warehouse_stock FOR ALL
  USING (public.is_employee(auth.uid()))
  WITH CHECK (public.is_employee(auth.uid()));

-- ─── stock_transfers ────────────────────────────────────────

DROP POLICY IF EXISTS "Admins can create transfers" ON public.stock_transfers;
DROP POLICY IF EXISTS "Admins can update transfers" ON public.stock_transfers;

CREATE POLICY "Employees can create transfers"
  ON public.stock_transfers FOR INSERT
  TO authenticated
  WITH CHECK (public.is_employee(auth.uid()));

CREATE POLICY "Employees can update transfers"
  ON public.stock_transfers FOR UPDATE
  TO authenticated
  USING (public.is_employee(auth.uid()));

-- ─── mrp_products ───────────────────────────────────────────

DROP POLICY IF EXISTS "mrp_products_admin_select"  ON public.mrp_products;
DROP POLICY IF EXISTS "mrp_products_admin_insert"  ON public.mrp_products;
DROP POLICY IF EXISTS "mrp_products_admin_update"  ON public.mrp_products;
DROP POLICY IF EXISTS "mrp_products_admin_delete"  ON public.mrp_products;
DROP POLICY IF EXISTS "mrp_products_gestor_select" ON public.mrp_products;

CREATE POLICY "Employees can manage mrp_products"
  ON public.mrp_products FOR ALL
  USING (public.is_employee(auth.uid()))
  WITH CHECK (public.is_employee(auth.uid()));

-- ─── mrp_suppliers ──────────────────────────────────────────

DROP POLICY IF EXISTS "mrp_suppliers_admin_select"  ON public.mrp_suppliers;
DROP POLICY IF EXISTS "mrp_suppliers_admin_insert"  ON public.mrp_suppliers;
DROP POLICY IF EXISTS "mrp_suppliers_admin_update"  ON public.mrp_suppliers;
DROP POLICY IF EXISTS "mrp_suppliers_admin_delete"  ON public.mrp_suppliers;
DROP POLICY IF EXISTS "mrp_suppliers_gestor_select" ON public.mrp_suppliers;

CREATE POLICY "Employees can manage mrp_suppliers"
  ON public.mrp_suppliers FOR ALL
  USING (public.is_employee(auth.uid()))
  WITH CHECK (public.is_employee(auth.uid()));

-- ─── pending_actions ────────────────────────────────────────

DROP POLICY IF EXISTS "pending_actions_admin_select" ON public.pending_actions;
DROP POLICY IF EXISTS "pending_actions_admin_update" ON public.pending_actions;

CREATE POLICY "Employees can select pending_actions"
  ON public.pending_actions FOR SELECT
  USING (public.is_employee(auth.uid()));

CREATE POLICY "Employees can update pending_actions"
  ON public.pending_actions FOR UPDATE
  USING (public.is_employee(auth.uid()));

-- ─── sku ────────────────────────────────────────────────────

DROP POLICY IF EXISTS "sku_admin_all"        ON public.sku;
DROP POLICY IF EXISTS "sku_gestor_all"       ON public.sku;
DROP POLICY IF EXISTS "sku_operador_select"  ON public.sku;

CREATE POLICY "Employees can manage sku"
  ON public.sku FOR ALL
  USING (public.is_employee(auth.uid()))
  WITH CHECK (public.is_employee(auth.uid()));

-- ─── sku_bom ────────────────────────────────────────────────

DROP POLICY IF EXISTS "sku_bom_admin_all"       ON public.sku_bom;
DROP POLICY IF EXISTS "sku_bom_gestor_all"      ON public.sku_bom;
DROP POLICY IF EXISTS "sku_bom_operador_select" ON public.sku_bom;

CREATE POLICY "Employees can manage sku_bom"
  ON public.sku_bom FOR ALL
  USING (public.is_employee(auth.uid()))
  WITH CHECK (public.is_employee(auth.uid()));

-- ─── inventory_lot ──────────────────────────────────────────

DROP POLICY IF EXISTS "inventory_lot_admin_all"       ON public.inventory_lot;
DROP POLICY IF EXISTS "inventory_lot_gestor_all"      ON public.inventory_lot;
DROP POLICY IF EXISTS "inventory_lot_operador_select" ON public.inventory_lot;

CREATE POLICY "Employees can manage inventory_lot"
  ON public.inventory_lot FOR ALL
  USING (public.is_employee(auth.uid()))
  WITH CHECK (public.is_employee(auth.uid()));

-- ─── inventory_lot_consumption ──────────────────────────────

DROP POLICY IF EXISTS "lot_consumption_admin_all"       ON public.inventory_lot_consumption;
DROP POLICY IF EXISTS "lot_consumption_gestor_all"      ON public.inventory_lot_consumption;
DROP POLICY IF EXISTS "lot_consumption_operador_select" ON public.inventory_lot_consumption;

CREATE POLICY "Employees can manage inventory_lot_consumption"
  ON public.inventory_lot_consumption FOR ALL
  USING (public.is_employee(auth.uid()))
  WITH CHECK (public.is_employee(auth.uid()));

-- ─── production_orders ──────────────────────────────────────

DROP POLICY IF EXISTS "production_orders_operador_select" ON public.production_orders;
DROP POLICY IF EXISTS "production_orders_operador_update" ON public.production_orders;
DROP POLICY IF EXISTS "production_orders_gestor_all"      ON public.production_orders;

CREATE POLICY "Employees can manage production_orders"
  ON public.production_orders FOR ALL
  USING (public.is_employee(auth.uid()))
  WITH CHECK (public.is_employee(auth.uid()));

-- ─── production_order_material ──────────────────────────────

DROP POLICY IF EXISTS "po_material_admin_all"       ON public.production_order_material;
DROP POLICY IF EXISTS "po_material_gestor_all"      ON public.production_order_material;
DROP POLICY IF EXISTS "po_material_operador_select" ON public.production_order_material;

CREATE POLICY "Employees can manage production_order_material"
  ON public.production_order_material FOR ALL
  USING (public.is_employee(auth.uid()))
  WITH CHECK (public.is_employee(auth.uid()));

-- ─── production_confirmation ────────────────────────────────

DROP POLICY IF EXISTS "po_confirm_admin_all"         ON public.production_confirmation;
DROP POLICY IF EXISTS "po_confirm_gestor_all"        ON public.production_confirmation;
DROP POLICY IF EXISTS "po_confirm_operador_insert"   ON public.production_confirmation;
DROP POLICY IF EXISTS "po_confirm_operador_select"   ON public.production_confirmation;

CREATE POLICY "Employees can manage production_confirmation"
  ON public.production_confirmation FOR ALL
  USING (public.is_employee(auth.uid()))
  WITH CHECK (public.is_employee(auth.uid()));

-- ─── production_confirmation_item ───────────────────────────

DROP POLICY IF EXISTS "po_confirm_item_admin_all"       ON public.production_confirmation_item;
DROP POLICY IF EXISTS "po_confirm_item_gestor_all"      ON public.production_confirmation_item;
DROP POLICY IF EXISTS "po_confirm_item_operador_insert" ON public.production_confirmation_item;
DROP POLICY IF EXISTS "po_confirm_item_operador_select" ON public.production_confirmation_item;

CREATE POLICY "Employees can manage production_confirmation_item"
  ON public.production_confirmation_item FOR ALL
  USING (public.is_employee(auth.uid()))
  WITH CHECK (public.is_employee(auth.uid()));

-- ─── quality_check ──────────────────────────────────────────

DROP POLICY IF EXISTS "quality_check_admin_all"  ON public.quality_check;
DROP POLICY IF EXISTS "quality_check_gestor_all" ON public.quality_check;

CREATE POLICY "Employees can manage quality_check"
  ON public.quality_check FOR ALL
  USING (public.is_employee(auth.uid()))
  WITH CHECK (public.is_employee(auth.uid()));

-- ─── stations ───────────────────────────────────────────────

DROP POLICY IF EXISTS "stations_admin_all"       ON public.stations;
DROP POLICY IF EXISTS "stations_gestor_all"      ON public.stations;
DROP POLICY IF EXISTS "stations_operador_select" ON public.stations;

CREATE POLICY "Employees can manage stations"
  ON public.stations FOR ALL
  USING (public.is_employee(auth.uid()))
  WITH CHECK (public.is_employee(auth.uid()));

-- ─── stock_movements ────────────────────────────────────────

DROP POLICY IF EXISTS "Stock movements viewable by authorized"  ON public.stock_movements;
DROP POLICY IF EXISTS "Stock movements insertable by gestors"   ON public.stock_movements;

CREATE POLICY "Employees can view stock_movements"
  ON public.stock_movements FOR SELECT
  USING (public.is_employee(auth.uid()));

CREATE POLICY "Employees can insert stock_movements"
  ON public.stock_movements FOR INSERT
  WITH CHECK (public.is_employee(auth.uid()));

-- ─── rc_requests ────────────────────────────────────────────

DROP POLICY IF EXISTS "RC updatable by gestors" ON public.rc_requests;
DROP POLICY IF EXISTS "RC deletable by admin"   ON public.rc_requests;

CREATE POLICY "RC updatable by employee"
  ON public.rc_requests FOR UPDATE
  USING (public.is_employee(auth.uid()));

CREATE POLICY "RC deletable by employee"
  ON public.rc_requests FOR DELETE
  USING (public.is_employee(auth.uid()));

-- ─── rc_quotations ──────────────────────────────────────────

DROP POLICY IF EXISTS "Quotations insertable by gestors" ON public.rc_quotations;
DROP POLICY IF EXISTS "Quotations updatable by gestors"  ON public.rc_quotations;
DROP POLICY IF EXISTS "Quotations deletable by admin"    ON public.rc_quotations;

CREATE POLICY "Quotations insertable by employee"
  ON public.rc_quotations FOR INSERT
  WITH CHECK (public.is_employee(auth.uid()));

CREATE POLICY "Quotations updatable by employee"
  ON public.rc_quotations FOR UPDATE
  USING (public.is_employee(auth.uid()));

CREATE POLICY "Quotations deletable by employee"
  ON public.rc_quotations FOR DELETE
  USING (public.is_employee(auth.uid()));

-- ─── rc_analysis ────────────────────────────────────────────

DROP POLICY IF EXISTS "Analysis insertable by system" ON public.rc_analysis;

CREATE POLICY "Analysis insertable by employee"
  ON public.rc_analysis FOR INSERT
  WITH CHECK (public.is_employee(auth.uid()));

-- ─── rc_approval_logs ───────────────────────────────────────

DROP POLICY IF EXISTS "Approval logs insertable by gestors" ON public.rc_approval_logs;

CREATE POLICY "Approval logs insertable by employee"
  ON public.rc_approval_logs FOR INSERT
  WITH CHECK (public.is_employee(auth.uid()));

-- ─── carboze_orders ─────────────────────────────────────────

DROP POLICY IF EXISTS "Managers can insert orders" ON public.carboze_orders;
DROP POLICY IF EXISTS "Admins can update orders"   ON public.carboze_orders;
DROP POLICY IF EXISTS "Admins can delete orders"   ON public.carboze_orders;

CREATE POLICY "Employees can insert orders"
  ON public.carboze_orders FOR INSERT
  WITH CHECK (public.is_employee(auth.uid()));

CREATE POLICY "Employees can update orders"
  ON public.carboze_orders FOR UPDATE
  USING (public.is_employee(auth.uid()));

CREATE POLICY "Employees can delete orders"
  ON public.carboze_orders FOR DELETE
  USING (public.is_employee(auth.uid()));

-- ─── bling_integration ──────────────────────────────────────

DROP POLICY IF EXISTS "bling_integration_admin_all" ON public.bling_integration;

CREATE POLICY "Employees can manage bling_integration"
  ON public.bling_integration FOR ALL
  USING (public.is_employee(auth.uid()))
  WITH CHECK (public.is_employee(auth.uid()));

-- ─── bling_products ─────────────────────────────────────────

DROP POLICY IF EXISTS "bling_products_admin_write" ON public.bling_products;

CREATE POLICY "Employees can write bling_products"
  ON public.bling_products FOR ALL
  USING (public.is_employee(auth.uid()))
  WITH CHECK (public.is_employee(auth.uid()));

-- ─── bling_contacts ─────────────────────────────────────────

DROP POLICY IF EXISTS "bling_contacts_admin_write" ON public.bling_contacts;

CREATE POLICY "Employees can write bling_contacts"
  ON public.bling_contacts FOR ALL
  USING (public.is_employee(auth.uid()))
  WITH CHECK (public.is_employee(auth.uid()));

-- ─── bling_orders ───────────────────────────────────────────

DROP POLICY IF EXISTS "bling_orders_admin_write" ON public.bling_orders;

CREATE POLICY "Employees can write bling_orders"
  ON public.bling_orders FOR ALL
  USING (public.is_employee(auth.uid()))
  WITH CHECK (public.is_employee(auth.uid()));

-- ─── bling_sync_log ─────────────────────────────────────────

DROP POLICY IF EXISTS "bling_sync_log_admin_write" ON public.bling_sync_log;

CREATE POLICY "Employees can write bling_sync_log"
  ON public.bling_sync_log FOR ALL
  USING (public.is_employee(auth.uid()))
  WITH CHECK (public.is_employee(auth.uid()));

-- ─── purchase_approval_config ───────────────────────────────

DROP POLICY IF EXISTS "Config managed by CEO" ON public.purchase_approval_config;

CREATE POLICY "Config managed by ti_head"
  ON public.purchase_approval_config FOR ALL
  USING (public.is_ti_head(auth.uid()))
  WITH CHECK (public.is_ti_head(auth.uid()));

-- ─── department_labels ──────────────────────────────────────

DROP POLICY IF EXISTS "Admins manage department labels" ON public.department_labels;

CREATE POLICY "Ti head manages department labels"
  ON public.department_labels FOR ALL
  USING (public.is_ti_head(auth.uid()))
  WITH CHECK (public.is_ti_head(auth.uid()));

-- ─── suppliers (from 20260212182423) ────────────────────────

DROP POLICY IF EXISTS "Managers can insert suppliers" ON public.suppliers;
DROP POLICY IF EXISTS "Managers can update suppliers" ON public.suppliers;
DROP POLICY IF EXISTS "Admins can delete suppliers"   ON public.suppliers;

CREATE POLICY "Employees can insert suppliers"
  ON public.suppliers FOR INSERT
  WITH CHECK (public.is_employee(auth.uid()));

CREATE POLICY "Employees can update suppliers"
  ON public.suppliers FOR UPDATE
  USING (public.is_employee(auth.uid()));

CREATE POLICY "Employees can delete suppliers"
  ON public.suppliers FOR DELETE
  USING (public.is_employee(auth.uid()));

-- ─── Licensee / CGC module tables ───────────────────────────
-- Plans, subscriptions, wallets, transactions, catalog, requests, user_licensee

DROP POLICY IF EXISTS "Admins can manage plans"          ON public.licensee_plans;
DROP POLICY IF EXISTS "Admins can manage subscriptions"  ON public.licensee_subscriptions;
DROP POLICY IF EXISTS "Admins can manage wallets"        ON public.licensee_wallets;
DROP POLICY IF EXISTS "Admins can manage transactions"   ON public.licensee_transactions;
DROP POLICY IF EXISTS "Admins can manage catalog"        ON public.licensee_service_catalog;
DROP POLICY IF EXISTS "Admins can manage requests"       ON public.licensee_service_requests;
DROP POLICY IF EXISTS "Admins can manage user linkages"  ON public.user_licensee;

CREATE POLICY "Employees can manage licensee_plans"
  ON public.licensee_plans FOR ALL
  USING (public.is_employee(auth.uid()))
  WITH CHECK (public.is_employee(auth.uid()));

CREATE POLICY "Employees can manage licensee_subscriptions"
  ON public.licensee_subscriptions FOR ALL
  USING (public.is_employee(auth.uid()))
  WITH CHECK (public.is_employee(auth.uid()));

CREATE POLICY "Employees can manage licensee_wallets"
  ON public.licensee_wallets FOR ALL
  USING (public.is_employee(auth.uid()))
  WITH CHECK (public.is_employee(auth.uid()));

CREATE POLICY "Employees can manage licensee_transactions"
  ON public.licensee_transactions FOR ALL
  USING (public.is_employee(auth.uid()))
  WITH CHECK (public.is_employee(auth.uid()));

CREATE POLICY "Employees can manage licensee_service_catalog"
  ON public.licensee_service_catalog FOR ALL
  USING (public.is_employee(auth.uid()))
  WITH CHECK (public.is_employee(auth.uid()));

CREATE POLICY "Employees can manage licensee_service_requests"
  ON public.licensee_service_requests FOR ALL
  USING (public.is_employee(auth.uid()))
  WITH CHECK (public.is_employee(auth.uid()));

CREATE POLICY "Employees can manage user_licensee"
  ON public.user_licensee FOR ALL
  USING (public.is_employee(auth.uid()))
  WITH CHECK (public.is_employee(auth.uid()));

-- ─── Stage config (checklist flow) ──────────────────────────

DROP POLICY IF EXISTS "Stage config managed by CEO" ON public.stage_config;

CREATE POLICY "Stage config managed by ti_head"
  ON public.stage_config FOR ALL
  USING (public.is_ti_head(auth.uid()))
  WITH CHECK (public.is_ti_head(auth.uid()));

-- ─── Validations / stage history ────────────────────────────

DROP POLICY IF EXISTS "Validations creatable by stage executors" ON public.stage_validations;
DROP POLICY IF EXISTS "Validations updatable by authorized users" ON public.stage_validations;

CREATE POLICY "Employees can insert stage_validations"
  ON public.stage_validations FOR INSERT
  WITH CHECK (public.is_employee(auth.uid()));

CREATE POLICY "Employees can update stage_validations"
  ON public.stage_validations FOR UPDATE
  USING (public.is_employee(auth.uid()));

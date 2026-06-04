-- ============================================================================
-- Migração legado → Role Matrix · FASE 4 (banco — parte 2)
--
-- Remove TODAS as dependências restantes de user_roles / carbo_user_roles:
--   - 6 funções passam a ler profiles (shims is_admin/is_gestor/is_employee).
--   - Policies inline reescritas com as funções shim.
--   - Policies carbo_roles_* redundantes (mrp_*/production_orders, já cobertas
--     por "Employees manage") são dropadas.
--
-- De-para: admin→is_admin · manager→is_gestor · {admin,manager,operator}→
-- is_employee · {admin,manager}→is_gestor · carbo {ceo,gestor_*}→is_gestor.
--
-- O DROP das tabelas vai numa migração SEPARADA (irreversível), após confirmar
-- que a query de descoberta volta limpa.
-- ============================================================================

-- ── 1) Funções ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.is_manager_or_admin(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_admin(_user_id) OR public.is_gestor(_user_id);
$$;

-- OS: visualizar = qualquer funcionário interno
CREATE OR REPLACE FUNCTION public.can_access_os(_user_id uuid, _os_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_employee(_user_id);
$$;

-- OS: executar etapa = liderança OU departamento do usuário == etapa atual
CREATE OR REPLACE FUNCTION public.can_execute_os_stage(_user_id uuid, _os_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_admin(_user_id) OR EXISTS (
    SELECT 1
    FROM public.service_orders so
    JOIN public.profiles p ON p.id = _user_id
    WHERE so.id = _os_id
      AND (so.current_department::text = p.department
        OR so.current_department::text = p.secondary_department)
  );
$$;

-- OS: validar etapa = gestão/liderança
CREATE OR REPLACE FUNCTION public.can_validate_stage(_user_id uuid, _stage os_workflow_stage)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_gestor(_user_id);
$$;

-- carbo_roles sintetizados a partir do perfil (compat)
CREATE OR REPLACE FUNCTION public.get_carbo_roles(_user_id uuid)
RETURNS carbo_role[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE
    WHEN public.is_ceo(_user_id)    THEN ARRAY['ceo']::carbo_role[]
    WHEN public.is_gestor(_user_id) THEN ARRAY['gestor_adm']::carbo_role[]
    ELSE ARRAY[]::carbo_role[]
  END;
$$;

-- Notificação de bug → liderança (sem user_roles)
CREATE OR REPLACE FUNCTION public.notify_admins_on_bug_report()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.notifications (user_id, type, title, body, reference_type, reference_id)
  SELECT p.id, 'bug_report', 'Novo bug reportado', NEW.title, 'bug_report', NEW.id::text
  FROM public.profiles p
  WHERE p.status = 'approved'
    AND ( (p.department = 'ti_suporte' AND p.funcao = 'head')
       OR (p.secondary_department = 'ti_suporte' AND p.secondary_funcao = 'head')
       OR p.funcao IN ('ceo','head') OR p.secondary_funcao IN ('ceo','head')
       OR p.department = 'command' OR p.secondary_department = 'command' );
  RETURN NEW;
END;
$$;

-- ── 2) Policies redundantes (já há "Employees manage") → dropar ──────────────
DROP POLICY IF EXISTS "carbo_roles_write_mrp_products"       ON public.mrp_products;
DROP POLICY IF EXISTS "carbo_roles_update_mrp_products"      ON public.mrp_products;
DROP POLICY IF EXISTS "carbo_roles_delete_mrp_products"      ON public.mrp_products;
DROP POLICY IF EXISTS "carbo_roles_write_mrp_suppliers"      ON public.mrp_suppliers;
DROP POLICY IF EXISTS "carbo_roles_update_mrp_suppliers"     ON public.mrp_suppliers;
DROP POLICY IF EXISTS "carbo_roles_write_production_orders"  ON public.production_orders;
DROP POLICY IF EXISTS "carbo_roles_update_production_orders" ON public.production_orders;

-- ── 3) Policies reescritas com shim ─────────────────────────────────────────
DROP POLICY IF EXISTS "admin can delete bug_reports" ON public.bug_reports;
CREATE POLICY "admin can delete bug_reports" ON public.bug_reports FOR DELETE USING (public.is_admin(auth.uid()));
DROP POLICY IF EXISTS "admin can update" ON public.bug_reports;
CREATE POLICY "admin can update" ON public.bug_reports FOR UPDATE USING (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "descarb_clients_insert" ON public.descarb_clients;
CREATE POLICY "descarb_clients_insert" ON public.descarb_clients FOR INSERT WITH CHECK (public.is_employee(auth.uid()));
DROP POLICY IF EXISTS "descarb_clients_update" ON public.descarb_clients;
CREATE POLICY "descarb_clients_update" ON public.descarb_clients FOR UPDATE USING (public.is_gestor(auth.uid()));

DROP POLICY IF EXISTS "descarb_sales_insert" ON public.descarb_sales;
CREATE POLICY "descarb_sales_insert" ON public.descarb_sales FOR INSERT WITH CHECK (public.is_employee(auth.uid()));
DROP POLICY IF EXISTS "descarb_sales_update" ON public.descarb_sales;
CREATE POLICY "descarb_sales_update" ON public.descarb_sales FOR UPDATE USING (public.is_gestor(auth.uid()));

DROP POLICY IF EXISTS "descarb_vehicles_insert" ON public.descarb_vehicles;
CREATE POLICY "descarb_vehicles_insert" ON public.descarb_vehicles FOR INSERT WITH CHECK (public.is_employee(auth.uid()));
DROP POLICY IF EXISTS "descarb_vehicles_update" ON public.descarb_vehicles;
CREATE POLICY "descarb_vehicles_update" ON public.descarb_vehicles FOR UPDATE USING (public.is_gestor(auth.uid()));

DROP POLICY IF EXISTS "licensee_product_stock_insert" ON public.licensee_product_stock;
CREATE POLICY "licensee_product_stock_insert" ON public.licensee_product_stock FOR INSERT WITH CHECK (public.is_gestor(auth.uid()));
DROP POLICY IF EXISTS "licensee_product_stock_update" ON public.licensee_product_stock;
CREATE POLICY "licensee_product_stock_update" ON public.licensee_product_stock FOR UPDATE USING (public.is_gestor(auth.uid()));

DROP POLICY IF EXISTS "reagent_stock_insert" ON public.licensee_reagent_stock;
CREATE POLICY "reagent_stock_insert" ON public.licensee_reagent_stock FOR INSERT WITH CHECK (public.is_gestor(auth.uid()));
DROP POLICY IF EXISTS "reagent_stock_update" ON public.licensee_reagent_stock;
CREATE POLICY "reagent_stock_update" ON public.licensee_reagent_stock FOR UPDATE USING (public.is_gestor(auth.uid()));

DROP POLICY IF EXISTS "reagent_movements_insert" ON public.reagent_movements;
CREATE POLICY "reagent_movements_insert" ON public.reagent_movements FOR INSERT WITH CHECK (public.is_employee(auth.uid()));

DROP POLICY IF EXISTS "carbo_roles_select_licensees" ON public.licensees;
CREATE POLICY "carbo_roles_select_licensees" ON public.licensees FOR SELECT USING (public.is_employee(auth.uid()));
DROP POLICY IF EXISTS "carbo_roles_update_licensees" ON public.licensees;
CREATE POLICY "carbo_roles_update_licensees" ON public.licensees FOR UPDATE USING (public.is_gestor(auth.uid()));
DROP POLICY IF EXISTS "carbo_roles_write_licensees" ON public.licensees;
CREATE POLICY "carbo_roles_write_licensees" ON public.licensees FOR INSERT WITH CHECK (public.is_gestor(auth.uid()));

DROP POLICY IF EXISTS "admin write nfse" ON public.nfse_imports;
CREATE POLICY "admin write nfse" ON public.nfse_imports FOR ALL USING (public.is_gestor(auth.uid())) WITH CHECK (public.is_gestor(auth.uid()));

DROP POLICY IF EXISTS "ops_alerts_update" ON public.ops_alerts;
CREATE POLICY "ops_alerts_update" ON public.ops_alerts FOR UPDATE USING (public.is_gestor(auth.uid()));

DROP POLICY IF EXISTS "org_chart_nodes_admin_all" ON public.org_chart_nodes;
CREATE POLICY "org_chart_nodes_admin_all" ON public.org_chart_nodes FOR ALL USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

-- ============================================================================
-- Depois de rodar, RE-RODE a query de descoberta. Deve sobrar APENAS:
--   policy | carbo_user_roles | Admin can manage all carbo roles
-- (a policy da própria tabela, que sai junto no DROP). Se for só isso,
-- aplique a migração de DROP (parte 3).
-- ============================================================================

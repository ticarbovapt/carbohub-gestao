-- ============================================================================
-- Migração legado → Role Matrix · FASE 3a/3b (banco/RLS)
--
-- Objetivo: remover a dependência das FUNÇÕES legadas
--   is_admin / is_ceo / is_gestor / has_role / has_carbo_role / can_access_macro_flow
-- nas POLICIES de RLS, passando tudo para is_employee() / is_ti_head() (Role Matrix).
--
-- Estratégia segura:
--   1) PRIMEIRO garante policy de funcionário nas tabelas internas que ainda
--      não têm (purchase_* documentos + storage de compras).
--   2) DEPOIS dropa as policies que ainda citam funções legadas, mas SOMENTE
--      numa allowlist de tabelas que comprovadamente já têm policy de
--      funcionário (criada aqui ou na migração 20260603000002). Assim nenhum
--      acesso é perdido.
--   3) Reaponta a RPC get_last_login_summary (gate sem is_ceo/is_admin).
--
-- FORA DESTA FASE (passos dedicados, por terem escopo fino ou risco):
--   - service_orders / os_stage_history / os_checklists / os_stage_access
--     (acesso por etapa/departamento — decisão à parte).
--   - DROP das funções/tabelas/enums legados → Fase 3c (migração separada).
--   - Views/RPC de carboze_orders que citam is_ceo (20260405) → Fase 3c.
-- ============================================================================

-- 1) Policies de funcionário para os documentos de compra (ainda no legado) ---
DO $phase3a$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'purchase_requests','purchase_orders','purchase_receivings',
    'purchase_invoices','purchase_payables'
  ] LOOP
    IF to_regclass('public.'||t) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
      EXECUTE format('DROP POLICY IF EXISTS "Employees manage %1$s" ON public.%1$I', t);
      EXECUTE format(
        'CREATE POLICY "Employees manage %1$s" ON public.%1$I FOR ALL TO authenticated '
        'USING (public.is_employee(auth.uid())) WITH CHECK (public.is_employee(auth.uid()))', t);
    END IF;
  END LOOP;
END $phase3a$;

-- 2) Storage: documentos de compras acessíveis a funcionários -----------------
DROP POLICY IF EXISTS "Employees manage purchase-documents" ON storage.objects;
CREATE POLICY "Employees manage purchase-documents" ON storage.objects
  FOR ALL TO authenticated
  USING (bucket_id = 'purchase-documents' AND public.is_employee(auth.uid()))
  WITH CHECK (bucket_id = 'purchase-documents' AND public.is_employee(auth.uid()));

-- 3) Dropa as policies legadas SOMENTE nas tabelas com cobertura de funcionário
DO $phase3b$
DECLARE
  r record;
  allow text[] := ARRAY[
    -- documentos de compra (cobertos no passo 1)
    'purchase_requests','purchase_orders','purchase_receivings',
    'purchase_invoices','purchase_payables','purchase_approval_config',
    -- módulo OP / estoque (cobertos em 20260603000002)
    'sku','sku_bom','inventory_lot','inventory_lot_consumption',
    'production_orders','production_order_material','production_confirmation',
    'production_confirmation_item','quality_check','stations','stock_movements',
    'warehouses','warehouse_stock','stock_transfers','pending_actions',
    'mrp_products','mrp_suppliers','suppliers','department_labels',
    -- RC / compras
    'rc_requests','rc_quotations','rc_analysis','rc_approval_logs',
    -- pedidos
    'carboze_orders',
    -- bling
    'bling_integration','bling_products','bling_contacts','bling_orders','bling_sync_log'
  ];
BEGIN
  FOR r IN
    SELECT schemaname, tablename, policyname, qual, with_check
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = ANY(allow)
      AND (
        coalesce(qual,'')       ~* '(is_admin|is_ceo|is_gestor|has_role|has_carbo_role|can_access_macro_flow)' OR
        coalesce(with_check,'') ~* '(is_admin|is_ceo|is_gestor|has_role|has_carbo_role|can_access_macro_flow)'
      )
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, r.tablename);
    RAISE NOTICE 'Dropada policy legada: % em %', r.policyname, r.tablename;
  END LOOP;
END $phase3b$;

-- Storage: dropa policies legadas do bucket de compras (já há policy de funcionário)
DO $phase3b_storage$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND (
        coalesce(qual,'')       ~* '(is_admin|is_ceo|is_gestor|has_role|has_carbo_role)' OR
        coalesce(with_check,'') ~* '(is_admin|is_ceo|is_gestor|has_role|has_carbo_role)'
      )
      AND coalesce(qual,'') || coalesce(with_check,'') ~* 'purchase-documents'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', r.policyname);
  END LOOP;
END $phase3b_storage$;

-- 4) RPC get_last_login_summary: gate por Role Matrix (sem is_ceo/is_admin) ----
CREATE OR REPLACE FUNCTION public.get_last_login_summary()
RETURNS TABLE (
  user_id uuid,
  full_name text,
  department text,
  funcao text,
  secondary_department text,
  secondary_funcao text,
  last_login_at timestamptz,
  user_area text,
  region text,
  orders_last_30_days bigint,
  last_replenishment_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Acesso: superusuário TI/head, diretoria (ceo/head) ou Command.
  IF NOT EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = auth.uid()
      AND (
        (p.department = 'ti_suporte' AND p.funcao = 'head') OR
        (p.secondary_department = 'ti_suporte' AND p.secondary_funcao = 'head') OR
        p.funcao IN ('ceo','head') OR p.secondary_funcao IN ('ceo','head') OR
        p.department = 'command' OR p.secondary_department = 'command'
      )
  ) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  RETURN QUERY
  -- Usuários internos (Carbo Controle) — departamento + função do perfil
  SELECT
    p.id as user_id,
    p.full_name,
    p.department::text,
    p.funcao as funcao,
    p.secondary_department::text as secondary_department,
    p.secondary_funcao as secondary_funcao,
    p.last_login_at,
    'internal'::text as user_area,
    NULL::text as region,
    0::bigint as orders_last_30_days,
    NULL::timestamptz as last_replenishment_at
  FROM profiles p
  WHERE p.status = 'approved'
    AND NOT EXISTS (SELECT 1 FROM licensee_users lu WHERE lu.user_id = p.id)
    AND NOT EXISTS (SELECT 1 FROM pdv_users pu WHERE pu.user_id = p.id)

  UNION ALL

  SELECT
    p.id as user_id,
    l.name as full_name,
    COALESCE(l.address_state, 'N/A') as department,
    NULL::text as funcao,
    NULL::text as secondary_department,
    NULL::text as secondary_funcao,
    p.last_login_at,
    'licensee'::text as user_area,
    COALESCE(l.address_state, 'N/A') as region,
    COALESCE((
      SELECT COUNT(*)::bigint
      FROM licensee_requests lr
      WHERE lr.licensee_id = lu.licensee_id
        AND lr.created_at >= NOW() - INTERVAL '30 days'
    ), 0) as orders_last_30_days,
    NULL::timestamptz as last_replenishment_at
  FROM licensee_users lu
  JOIN profiles p ON p.id = lu.user_id
  JOIN licensees l ON l.id = lu.licensee_id
  WHERE lu.is_primary = true

  UNION ALL

  SELECT
    p.id as user_id,
    pdv.name as full_name,
    COALESCE(pdv.address_state, 'N/A') as department,
    NULL::text as funcao,
    NULL::text as secondary_department,
    NULL::text as secondary_funcao,
    p.last_login_at,
    'produtos'::text as user_area,
    COALESCE(pdv.address_state, 'N/A') as region,
    0::bigint as orders_last_30_days,
    pdv.last_replenishment_at as last_replenishment_at
  FROM pdv_users pu
  JOIN profiles p ON p.id = pu.user_id
  JOIN pdvs pdv ON pdv.id = pu.pdv_id

  ORDER BY last_login_at DESC NULLS LAST;
END;
$$;

-- ============================================================================
-- VERIFICAÇÃO (rode após aplicar): deve listar SÓ service_orders/os_* e,
-- possivelmente, views/RPC — nenhuma das tabelas migradas acima.
--
--   SELECT schemaname, tablename, policyname
--   FROM pg_policies
--   WHERE coalesce(qual,'') || coalesce(with_check,'')
--         ~* '(is_admin|is_ceo|is_gestor|has_role|has_carbo_role|can_access_macro_flow)'
--   ORDER BY tablename;
-- ============================================================================

-- Realinha get_last_login_summary ao modelo do Role Matrix.
--
-- Antes: a coluna `role` para usuários internos era derivada de
-- user_roles / carbo_user_roles (admin/manager/operador) — modelo legado que
-- não usamos mais. Agora a tela de acessos deve refletir o PERFIL real:
-- departamento + função (profiles.department / profiles.funcao), incluindo a
-- função secundária quando existir.
--
-- A assinatura de retorno muda (role -> funcao + colunas secundárias), então é
-- necessário DROP antes de recriar.

DROP FUNCTION IF EXISTS public.get_last_login_summary();

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
  -- Apenas CEO e admin podem chamar
  IF NOT (is_ceo(auth.uid()) OR is_admin(auth.uid())) THEN
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

  -- Licenciados
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

  -- PDVs (Lojas)
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

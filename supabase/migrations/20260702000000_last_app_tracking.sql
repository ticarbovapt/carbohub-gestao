-- ─────────────────────────────────────────────────────────────────────────────
-- "Último acesso" no Carbo Admin: além do last_login_at, registra QUAL sistema
-- a pessoa acessou por último (Admin/Sales/Ops/Finanças/Licenciados/Lojas).
-- ─────────────────────────────────────────────────────────────────────────────

-- 1) Colunas de rastreio do último app acessado.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS last_app     text,
  ADD COLUMN IF NOT EXISTS last_app_at  timestamptz;

-- 2) RPC chamada por cada app no login: grava o app + carimba o acesso.
CREATE OR REPLACE FUNCTION public.record_app_access(_app text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.profiles
  SET last_app      = _app,
      last_app_at   = now(),
      last_login_at = now()
  WHERE id = auth.uid();
END;
$$;
GRANT EXECUTE ON FUNCTION public.record_app_access(text) TO authenticated;

-- 3) get_last_login_summary + last_app/last_app_at (aditivo). Gate agora também
--    aceita gestor do modelo novo (carbo_is_gestor), pra o Admin poder chamar.
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
  last_replenishment_at timestamptz,
  last_app text,
  last_app_at timestamptz
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT (public.carbo_is_gestor(auth.uid()) OR is_ceo(auth.uid()) OR is_admin(auth.uid())) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  RETURN QUERY
  -- Internos (logam pelo Hub e acessam um dos sistemas). TODOS os perfis internos
  -- (exceto rejeitados) — para que todo usuário criado apareça, mesmo sem 1º acesso.
  SELECT
    p.id, p.full_name, p.department::text, p.funcao,
    p.secondary_department::text, p.secondary_funcao,
    p.last_login_at, 'internal'::text, NULL::text, 0::bigint, NULL::timestamptz,
    p.last_app, p.last_app_at
  FROM profiles p
  WHERE COALESCE(p.status, 'approved') <> 'rejected'
    AND NOT EXISTS (SELECT 1 FROM licensee_users lu WHERE lu.user_id = p.id)
    AND NOT EXISTS (SELECT 1 FROM pdv_users pu WHERE pu.user_id = p.id)

  UNION ALL

  -- Licenciados
  SELECT
    p.id, l.name, COALESCE(l.address_state, 'N/A'),
    NULL::text, NULL::text, NULL::text,
    p.last_login_at, 'licensee'::text, COALESCE(l.address_state, 'N/A'),
    COALESCE((
      SELECT COUNT(*)::bigint FROM licensee_requests lr
      WHERE lr.licensee_id = lu.licensee_id AND lr.created_at >= NOW() - INTERVAL '30 days'
    ), 0),
    NULL::timestamptz, p.last_app, p.last_app_at
  FROM licensee_users lu
  JOIN profiles p ON p.id = lu.user_id
  JOIN licensees l ON l.id = lu.licensee_id
  WHERE lu.is_primary = true

  UNION ALL

  -- Lojas (PDV) — segmentadas por REDE (assigned_licensee_id = licenciado dono da loja)
  SELECT
    p.id, pdv.name, COALESCE(l.name, 'Sem rede'),
    NULL::text, NULL::text, NULL::text,
    p.last_login_at, 'produtos'::text, COALESCE(l.name, pdv.address_state, 'Sem rede'),
    0::bigint, pdv.last_replenishment_at, p.last_app, p.last_app_at
  FROM pdv_users pu
  JOIN profiles p ON p.id = pu.user_id
  JOIN pdvs pdv ON pdv.id = pu.pdv_id
  LEFT JOIN licensees l ON l.id = pdv.assigned_licensee_id

  ORDER BY last_login_at DESC NULLS LAST;
END;
$$;

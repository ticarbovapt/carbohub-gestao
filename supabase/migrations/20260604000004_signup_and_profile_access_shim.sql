-- ============================================================================
-- Migração legado → Role Matrix · FASE 4 (banco — parte 1)
--
-- Remove duas dependências críticas das tabelas legadas user_roles/
-- carbo_user_roles, ANTES de poder dropá-las:
--   1) handle_new_user: parava de inserir role padrão em user_roles no cadastro.
--   2) can_access_profile: visibilidade de perfis agora por is_admin (shim) +
--      mesmo departamento, sem ler user_roles.
--
-- NÃO dropa tabelas ainda — restam policies inline em tabelas de licenciados/
-- descarb (ver query de descoberta no fim) que precisam ser migradas primeiro.
-- ============================================================================

-- 1) Signup: cria só o perfil. Papel agora é department + funcao (definidos
--    depois pelo admin via tela de Equipe).
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email));
  RETURN NEW;
END;
$$;

-- 2) Visibilidade de perfil: liderança (is_admin shim) vê todos; demais veem
--    o próprio, os do mesmo departamento e os que criaram. Sem user_roles.
CREATE OR REPLACE FUNCTION public.can_access_profile(_viewer_id uuid, _profile_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    _viewer_id IS NOT NULL
    AND _profile_id IS NOT NULL
    AND (
      _viewer_id = _profile_id
      OR public.is_admin(_viewer_id)
      OR EXISTS (
        SELECT 1 FROM public.profiles v
        JOIN public.profiles t ON t.id = _profile_id
        WHERE v.id = _viewer_id
          AND v.department = t.department
          AND v.department IS NOT NULL
      )
      OR EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = _profile_id AND created_by_manager = _viewer_id
      )
    )
$$;

-- ============================================================================
-- DESCOBERTA (rode para listar o que AINDA lê as tabelas legadas direto —
-- policies/funções a migrar antes do drop final):
--
--   SELECT 'policy' AS tipo, schemaname, tablename, policyname AS nome
--   FROM pg_policies
--   WHERE coalesce(qual,'') || coalesce(with_check,'') ~* '(user_roles|carbo_user_roles)'
--   UNION ALL
--   SELECT 'function', n.nspname, NULL, p.proname
--   FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--   WHERE n.nspname = 'public'
--     AND pg_get_functiondef(p.oid) ~* '(user_roles|carbo_user_roles)'
--     AND p.proname NOT IN ('handle_new_user','can_access_profile')
--   ORDER BY 1,3;
-- ============================================================================

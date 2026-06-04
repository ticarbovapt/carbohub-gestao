-- ============================================================================
-- Migração legado → Role Matrix · FASE 4 (banco — parte 3 / FIM)
--
-- DROP definitivo das tabelas legadas de papéis. A esta altura NADA mais
-- depende delas (funções viram shims sobre profiles; policies inline
-- reescritas; AuthContext e telas migrados). A query de descoberta voltou
-- apenas com a policy da própria carbo_user_roles, que é removida junto.
--
-- Mantemos os enums app_role / carbo_role (ainda usados como parâmetro de
-- has_role/has_carbo_role, retorno de get_carbo_roles e profiles.requested_role).
-- ============================================================================

DROP TABLE IF EXISTS public.user_roles;
DROP TABLE IF EXISTS public.carbo_user_roles;

-- Verificação final (deve retornar 0 linhas):
--   SELECT 'policy', tablename, policyname FROM pg_policies
--   WHERE coalesce(qual,'')||coalesce(with_check,'') ~* '(user_roles|carbo_user_roles)'
--   UNION ALL
--   SELECT 'function', NULL, proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
--   WHERE n.nspname='public' AND pg_get_functiondef(p.oid) ~* '(user_roles|carbo_user_roles)';
-- ============================================================================

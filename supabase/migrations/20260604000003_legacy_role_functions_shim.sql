-- ============================================================================
-- Migração legado → Role Matrix · FASE 3 (continuação)
--
-- Transforma as funções legadas de papel em ATALHOS do Role Matrix: passam a
-- decidir por profiles.department + funcao (e secundárias), em vez de ler as
-- tabelas user_roles / carbo_user_roles. Assim, TODAS as policies que ainda
-- chamam is_admin/is_ceo/is_gestor/has_role/has_carbo_role/can_access_macro_flow
-- passam a usar o modelo novo automaticamente — sem reescrever policy.
--
-- De-para aprovado (liderança = ceo/head/command/TI):
--   is_ceo / is_admin = TI/head OU funcao(ceo|head) OU department=command
--   is_gestor         = (is_ceo) OU funcao(gerente|coordenador|supervisor)
--   has_role          = admin→is_admin · manager→is_gestor · resto→is_employee
--   has_carbo_role    = ceo→is_ceo · gestor_*→is_gestor · operador*→is_employee
--   can_access_macro_flow = qualquer funcionário interno (is_employee)
--
-- NÃO dropa tabelas/enuns legados aqui (user_roles, carbo_user_roles,
-- os_stage_access ainda são lidos pelo frontend / por can_access_os) — isso
-- vai na Fase 4/3c, depois de migrar o frontend.
-- ============================================================================

-- is_ceo: liderança máxima
CREATE OR REPLACE FUNCTION public.is_ceo(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_ti_head(_user_id) OR EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = _user_id AND (
      p.funcao IN ('ceo','head') OR p.secondary_funcao IN ('ceo','head') OR
      p.department = 'command' OR p.secondary_department = 'command'
    )
  );
$$;

-- is_admin: mesmo conjunto de liderança
CREATE OR REPLACE FUNCTION public.is_admin(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_ceo(_user_id);
$$;

-- is_gestor: liderança + tier gerencial/supervisão
CREATE OR REPLACE FUNCTION public.is_gestor(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_ceo(_user_id) OR EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = _user_id AND (
      p.funcao IN ('gerente','coordenador','supervisor') OR
      p.secondary_funcao IN ('gerente','coordenador','supervisor')
    )
  );
$$;

-- has_role(app_role): admin→is_admin, manager→is_gestor, resto→funcionário
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE
    WHEN _role = 'admin'   THEN public.is_admin(_user_id)
    WHEN _role = 'manager' THEN public.is_gestor(_user_id)
    ELSE public.is_employee(_user_id)
  END;
$$;

-- has_carbo_role(carbo_role): ceo→is_ceo, gestor_*→is_gestor, operador*→funcionário
CREATE OR REPLACE FUNCTION public.has_carbo_role(_user_id uuid, _role carbo_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE
    WHEN _role = 'ceo' THEN public.is_ceo(_user_id)
    WHEN _role IN ('gestor_adm','gestor_fin','gestor_compras') THEN public.is_gestor(_user_id)
    ELSE public.is_employee(_user_id)
  END;
$$;

-- can_access_macro_flow: qualquer funcionário interno
CREATE OR REPLACE FUNCTION public.can_access_macro_flow(_user_id uuid, _flow macro_flow)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_employee(_user_id);
$$;

-- ============================================================================
-- VERIFICAÇÃO (rode após aplicar): confirma que as funções NÃO leem mais as
-- tabelas legadas (devem retornar 0 linhas).
--
--   SELECT proname
--   FROM pg_proc
--   WHERE proname IN ('is_admin','is_ceo','is_gestor','has_role','has_carbo_role','can_access_macro_flow')
--     AND pg_get_functiondef(oid) ~* '(user_roles|carbo_user_roles)';
-- ============================================================================

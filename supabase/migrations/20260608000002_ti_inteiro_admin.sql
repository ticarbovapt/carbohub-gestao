-- ============================================================================
-- TI inteiro = admin (não só o head)
--
-- Contexto: a edge function create-team-member exige is_admin(). Hoje is_admin
-- → is_ceo (shim legado), que só reconhece liderança (head/ceo/command).
-- Um colaborador do TI (ex.: estagiário) caía no 403 ao criar usuário.
--
-- Decisão (usuário, 2026-06-08): qualquer pessoa do department 'ti_suporte'
-- — independente da função — tem o mesmo poder de admin que o head do TI.
--
-- Redefine is_admin de forma AUTOSSUFICIENTE: lê profiles direto, sem depender
-- de is_ceo/is_ti_head (o is_ceo é só um shim e pode sair a qualquer momento).
-- Mantém o conjunto antigo de liderança + adiciona todo o ti_suporte.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.is_admin(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = _user_id AND (
      p.funcao IN ('ceo','head') OR p.secondary_funcao IN ('ceo','head') OR
      p.department IN ('command','ti_suporte') OR
      p.secondary_department IN ('command','ti_suporte')
    )
  );
$$;

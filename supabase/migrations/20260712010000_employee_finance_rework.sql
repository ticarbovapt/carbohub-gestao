-- ─────────────────────────────────────────────────────────────────────────────
-- Funcionários (employee_finance) v2 — desacopla do usuário do sistema.
--
-- Antes: 1 linha por auth.users (user_id era PK NOT NULL) → só dava pra cadastrar
-- quem já era usuário, e a lista dependia do escopo de equipe.
-- Agora: cadastro próprio (id PK), com vínculo de usuário OPCIONAL (user_id
-- nullable + único). Assim dá pra: criar funcionário aqui mesmo (sem usuário) e,
-- depois que o usuário existir no sistema, vincular. A tela lista TODOS os perfis
-- do sistema (RPC abaixo) + os funcionários avulsos.
-- ─────────────────────────────────────────────────────────────────────────────

-- id próprio como PK (preserva linhas existentes)
ALTER TABLE public.employee_finance ADD COLUMN IF NOT EXISTS id UUID DEFAULT gen_random_uuid();
UPDATE public.employee_finance SET id = gen_random_uuid() WHERE id IS NULL;
ALTER TABLE public.employee_finance ALTER COLUMN id SET NOT NULL;
ALTER TABLE public.employee_finance DROP CONSTRAINT IF EXISTS employee_finance_pkey;
ALTER TABLE public.employee_finance ADD CONSTRAINT employee_finance_pkey PRIMARY KEY (id);

-- user_id passa a ser opcional (vínculo com o usuário do sistema) e único quando setado
ALTER TABLE public.employee_finance ALTER COLUMN user_id DROP NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_employee_finance_user
  ON public.employee_finance(user_id) WHERE user_id IS NOT NULL;

-- flag de ativo (pra poder desligar sem apagar histórico)
ALTER TABLE public.employee_finance ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT true;

-- ── RPC: todos os perfis do sistema (pra listar todo mundo, sem escopo de equipe)
-- SECURITY DEFINER → o financeiro enxerga todos os funcionários, não só o próprio
-- departamento. Retorna só dados de identificação (sem PII sensível).
CREATE OR REPLACE FUNCTION public.carbo_all_profiles()
RETURNS TABLE (id UUID, full_name TEXT, username TEXT, email TEXT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.id, p.full_name, p.username, p.email
  FROM public.profiles p
  ORDER BY p.full_name NULLS LAST;
$$;
GRANT EXECUTE ON FUNCTION public.carbo_all_profiles() TO authenticated;

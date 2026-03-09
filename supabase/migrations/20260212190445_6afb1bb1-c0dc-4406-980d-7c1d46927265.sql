
-- =====================================================
-- FASE 1: Novos departamentos organizacionais (enum)
-- =====================================================
ALTER TYPE department_type ADD VALUE IF NOT EXISTS 'b2b';
ALTER TYPE department_type ADD VALUE IF NOT EXISTS 'command';
ALTER TYPE department_type ADD VALUE IF NOT EXISTS 'expansao';
ALTER TYPE department_type ADD VALUE IF NOT EXISTS 'finance';
ALTER TYPE department_type ADD VALUE IF NOT EXISTS 'growth';
ALTER TYPE department_type ADD VALUE IF NOT EXISTS 'ops';

-- =====================================================
-- FASE 2: Colunas de hierarquia no profiles
-- =====================================================
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS manager_user_id UUID;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS funcao TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS escopo TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS allowed_interfaces TEXT[] DEFAULT '{}';

-- =====================================================
-- FASE 3: Tabela de solicitação de reset de senha hierárquico
-- =====================================================
CREATE TABLE IF NOT EXISTS public.password_reset_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  manager_user_id UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  resolved_at TIMESTAMPTZ,
  resolved_by UUID,
  new_temp_password_set BOOLEAN DEFAULT false,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.password_reset_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can request password reset"
  ON public.password_reset_requests
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view own reset requests"
  ON public.password_reset_requests
  FOR SELECT
  USING (auth.uid() = user_id OR auth.uid() = manager_user_id OR is_admin(auth.uid()) OR is_ceo(auth.uid()));

CREATE POLICY "Manager or admin can resolve reset requests"
  ON public.password_reset_requests
  FOR UPDATE
  USING (auth.uid() = manager_user_id OR is_admin(auth.uid()) OR is_ceo(auth.uid()));

CREATE TRIGGER update_password_reset_requests_updated_at
  BEFORE UPDATE ON public.password_reset_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- =====================================================
-- FASE 4: Sequências de username para novos departamentos
-- =====================================================
INSERT INTO public.department_username_sequences (department_prefix, last_sequence)
VALUES ('B2B', 0), ('COM', 0), ('EXP', 0), ('FIN', 0), ('GRO', 0), ('OPS', 0)
ON CONFLICT DO NOTHING;

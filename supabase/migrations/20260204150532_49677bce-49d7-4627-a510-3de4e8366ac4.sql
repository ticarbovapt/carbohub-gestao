-- ============================================================
-- CARBO OPS - Reestruturação de Governança por Pessoas e Roles
-- ============================================================

-- 1. CRIAR NOVO ENUM DE ROLES DO GRUPO CARBO
-- Os 6 novos papéis baseados na realidade da empresa
CREATE TYPE public.carbo_role AS ENUM (
  'ceo',                  -- Admin Estratégico (CEO)
  'gestor_adm',           -- Gestor Administrativo
  'gestor_fin',           -- Gestor Financeiro
  'gestor_compras',       -- Gestor Compras & Logística
  'operador_fiscal',      -- Operador Fiscal
  'operador'              -- Operadores Operacionais
);

-- 2. CRIAR ENUM DE MACROFLUXOS
CREATE TYPE public.macro_flow AS ENUM (
  'comercial',            -- Cria OS, cadastra cliente, define expectativa
  'operacional',          -- Executa serviço, anexa evidências, valida
  'adm_financeiro'        -- Formaliza, emite docs, cobra, finaliza OS
);

-- 3. CRIAR TABELA DE MAPEAMENTO DEPARTAMENTO -> MACROFLUXO
CREATE TABLE public.department_macro_flow_mapping (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  department_type department_type NOT NULL UNIQUE,
  macro_flow macro_flow NOT NULL,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Inserir mapeamento
INSERT INTO public.department_macro_flow_mapping (department_type, macro_flow, display_order) VALUES
  ('venda', 'comercial', 1),
  ('preparacao', 'operacional', 2),
  ('expedicao', 'operacional', 3),
  ('operacao', 'operacional', 4),
  ('pos_venda', 'adm_financeiro', 5);

-- Habilitar RLS
ALTER TABLE public.department_macro_flow_mapping ENABLE ROW LEVEL SECURITY;

-- Política de leitura para todos autenticados
CREATE POLICY "Anyone can read mapping" ON public.department_macro_flow_mapping
  FOR SELECT USING (true);

-- 4. CRIAR NOVA TABELA DE ROLES DO CARBO
CREATE TABLE public.carbo_user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role carbo_role NOT NULL,
  scope_departments department_type[] DEFAULT '{}',  -- Departamentos que pode acessar
  scope_macro_flows macro_flow[] DEFAULT '{}',       -- Macrofluxos que pode acessar
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id),
  UNIQUE (user_id, role)
);

-- Habilitar RLS
ALTER TABLE public.carbo_user_roles ENABLE ROW LEVEL SECURITY;

-- 5. FUNÇÃO PARA VERIFICAR CARBO ROLE
CREATE OR REPLACE FUNCTION public.has_carbo_role(_user_id UUID, _role carbo_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.carbo_user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- 6. FUNÇÃO PARA VERIFICAR SE É CEO
CREATE OR REPLACE FUNCTION public.is_ceo(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.carbo_user_roles
    WHERE user_id = _user_id AND role = 'ceo'
  )
$$;

-- 7. FUNÇÃO PARA VERIFICAR SE É GESTOR (qualquer tipo)
CREATE OR REPLACE FUNCTION public.is_gestor(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.carbo_user_roles
    WHERE user_id = _user_id AND role IN ('ceo', 'gestor_adm', 'gestor_fin', 'gestor_compras')
  )
$$;

-- 8. FUNÇÃO PARA VERIFICAR ACESSO A MACROFLUXO
CREATE OR REPLACE FUNCTION public.can_access_macro_flow(_user_id UUID, _flow macro_flow)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.carbo_user_roles
    WHERE user_id = _user_id 
      AND (
        role = 'ceo'  -- CEO vê tudo
        OR _flow = ANY(scope_macro_flows)
      )
  )
$$;

-- 9. FUNÇÃO PARA OBTER ROLES DO USUÁRIO
CREATE OR REPLACE FUNCTION public.get_carbo_roles(_user_id UUID)
RETURNS carbo_role[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(array_agg(role), '{}')
  FROM public.carbo_user_roles
  WHERE user_id = _user_id
$$;

-- 10. POLÍTICAS RLS PARA carbo_user_roles

-- CEO pode gerenciar todos os roles
CREATE POLICY "CEO can manage all roles" ON public.carbo_user_roles
  FOR ALL USING (is_ceo(auth.uid()));

-- Gestores podem ver roles do seu escopo
CREATE POLICY "Gestores can view scoped roles" ON public.carbo_user_roles
  FOR SELECT USING (
    auth.uid() IS NOT NULL AND (
      is_ceo(auth.uid())
      OR user_id = auth.uid()
      OR is_gestor(auth.uid())
    )
  );

-- Gestores Administrativos podem criar operadores
CREATE POLICY "Gestor Adm can create operators" ON public.carbo_user_roles
  FOR INSERT WITH CHECK (
    has_carbo_role(auth.uid(), 'gestor_adm') 
    AND role IN ('operador', 'operador_fiscal')
  );

-- 11. CRIAR TABELA DE ESCOPO DE ACESSO POR ETAPA DA OS
CREATE TABLE public.os_stage_access (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role carbo_role NOT NULL,
  department_type department_type NOT NULL,
  can_view BOOLEAN NOT NULL DEFAULT false,
  can_execute BOOLEAN NOT NULL DEFAULT false,
  can_validate BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (role, department_type)
);

-- Habilitar RLS
ALTER TABLE public.os_stage_access ENABLE ROW LEVEL SECURITY;

-- Política de leitura
CREATE POLICY "Anyone can read stage access" ON public.os_stage_access
  FOR SELECT USING (true);

-- Política de gerenciamento para CEO
CREATE POLICY "CEO can manage stage access" ON public.os_stage_access
  FOR ALL USING (is_ceo(auth.uid()));

-- 12. INSERIR MATRIZ DE ACESSO POR ROLE E ETAPA

-- CEO - Acesso total a tudo
INSERT INTO public.os_stage_access (role, department_type, can_view, can_execute, can_validate) VALUES
  ('ceo', 'venda', true, true, true),
  ('ceo', 'preparacao', true, true, true),
  ('ceo', 'expedicao', true, true, true),
  ('ceo', 'operacao', true, true, true),
  ('ceo', 'pos_venda', true, true, true);

-- Gestor Administrativo - Foco em venda e pós-venda
INSERT INTO public.os_stage_access (role, department_type, can_view, can_execute, can_validate) VALUES
  ('gestor_adm', 'venda', true, true, true),
  ('gestor_adm', 'preparacao', true, false, false),
  ('gestor_adm', 'expedicao', true, false, false),
  ('gestor_adm', 'operacao', true, false, false),
  ('gestor_adm', 'pos_venda', true, true, true);

-- Gestor Financeiro - Foco em pós-venda (cobrança, faturamento)
INSERT INTO public.os_stage_access (role, department_type, can_view, can_execute, can_validate) VALUES
  ('gestor_fin', 'venda', true, false, false),
  ('gestor_fin', 'preparacao', false, false, false),
  ('gestor_fin', 'expedicao', false, false, false),
  ('gestor_fin', 'operacao', false, false, false),
  ('gestor_fin', 'pos_venda', true, true, true);

-- Gestor Compras & Logística - Foco em preparação e expedição
INSERT INTO public.os_stage_access (role, department_type, can_view, can_execute, can_validate) VALUES
  ('gestor_compras', 'venda', true, false, false),
  ('gestor_compras', 'preparacao', true, true, true),
  ('gestor_compras', 'expedicao', true, true, true),
  ('gestor_compras', 'operacao', true, false, false),
  ('gestor_compras', 'pos_venda', false, false, false);

-- Operador Fiscal - Foco em documentação fiscal
INSERT INTO public.os_stage_access (role, department_type, can_view, can_execute, can_validate) VALUES
  ('operador_fiscal', 'venda', true, false, false),
  ('operador_fiscal', 'preparacao', false, false, false),
  ('operador_fiscal', 'expedicao', true, true, false),
  ('operador_fiscal', 'operacao', false, false, false),
  ('operador_fiscal', 'pos_venda', true, true, false);

-- Operador - Foco em execução operacional
INSERT INTO public.os_stage_access (role, department_type, can_view, can_execute, can_validate) VALUES
  ('operador', 'venda', false, false, false),
  ('operador', 'preparacao', true, true, false),
  ('operador', 'expedicao', true, true, false),
  ('operador', 'operacao', true, true, false),
  ('operador', 'pos_venda', false, false, false);

-- 13. ADICIONAR COLUNA macro_flow NA TABELA departments
ALTER TABLE public.departments 
  ADD COLUMN IF NOT EXISTS macro_flow macro_flow;

-- Atualizar departamentos existentes com seus macrofluxos
UPDATE public.departments SET macro_flow = 'comercial' WHERE type = 'venda';
UPDATE public.departments SET macro_flow = 'operacional' WHERE type IN ('preparacao', 'expedicao', 'operacao');
UPDATE public.departments SET macro_flow = 'adm_financeiro' WHERE type = 'pos_venda';

-- 14. FUNÇÃO PARA VERIFICAR ACESSO A UMA OS BASEADO NO ROLE
CREATE OR REPLACE FUNCTION public.can_access_os(_user_id UUID, _os_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 
    FROM public.service_orders so
    JOIN public.os_stage_access osa ON osa.department_type = so.current_department
    JOIN public.carbo_user_roles cur ON cur.role = osa.role AND cur.user_id = _user_id
    WHERE so.id = _os_id AND osa.can_view = true
  )
  OR is_ceo(_user_id)
$$;

-- 15. FUNÇÃO PARA VERIFICAR SE PODE EXECUTAR AÇÃO NA ETAPA ATUAL
CREATE OR REPLACE FUNCTION public.can_execute_os_stage(_user_id UUID, _os_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 
    FROM public.service_orders so
    JOIN public.os_stage_access osa ON osa.department_type = so.current_department
    JOIN public.carbo_user_roles cur ON cur.role = osa.role AND cur.user_id = _user_id
    WHERE so.id = _os_id AND osa.can_execute = true
  )
  OR is_ceo(_user_id)
$$;

-- 16. CRIAR TABELA DE LOGS DE AUDITORIA SILENCIOSOS
CREATE TABLE IF NOT EXISTS public.governance_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  action_type TEXT NOT NULL,  -- view_os, execute_stage, validate_stage, etc.
  resource_type TEXT NOT NULL, -- service_order, checklist, etc.
  resource_id UUID,
  department department_type,
  macro_flow macro_flow,
  details JSONB DEFAULT '{}',
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Índices para performance
CREATE INDEX idx_governance_audit_user ON public.governance_audit_log(user_id);
CREATE INDEX idx_governance_audit_resource ON public.governance_audit_log(resource_type, resource_id);
CREATE INDEX idx_governance_audit_date ON public.governance_audit_log(created_at);

-- Habilitar RLS
ALTER TABLE public.governance_audit_log ENABLE ROW LEVEL SECURITY;

-- Apenas CEO pode ver logs de governança
CREATE POLICY "CEO can view governance logs" ON public.governance_audit_log
  FOR SELECT USING (is_ceo(auth.uid()));

-- Sistema pode inserir logs
CREATE POLICY "System can insert logs" ON public.governance_audit_log
  FOR INSERT WITH CHECK (true);

-- 17. FUNÇÃO PARA REGISTRAR AÇÃO DE GOVERNANÇA
CREATE OR REPLACE FUNCTION public.log_governance_action(
  _action_type TEXT,
  _resource_type TEXT,
  _resource_id UUID DEFAULT NULL,
  _department department_type DEFAULT NULL,
  _macro_flow macro_flow DEFAULT NULL,
  _details JSONB DEFAULT '{}'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_id UUID;
BEGIN
  INSERT INTO public.governance_audit_log (
    user_id, action_type, resource_type, resource_id, 
    department, macro_flow, details
  )
  VALUES (
    auth.uid(), _action_type, _resource_type, _resource_id,
    _department, _macro_flow, _details
  )
  RETURNING id INTO new_id;
  
  RETURN new_id;
END;
$$;
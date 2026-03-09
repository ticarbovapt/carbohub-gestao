-- =============================================
-- CARBO OPS - SISTEMA DE ORDEM DE SERVIÇO (OS)
-- =============================================

-- 1. ENUM: Roles do sistema
CREATE TYPE public.app_role AS ENUM ('admin', 'manager', 'operator', 'viewer');

-- 2. ENUM: Status da OS
CREATE TYPE public.os_status AS ENUM ('draft', 'active', 'paused', 'completed', 'cancelled');

-- 3. ENUM: Status de etapa
CREATE TYPE public.stage_status AS ENUM ('pending', 'in_progress', 'completed', 'blocked');

-- 4. ENUM: Departamentos Core
CREATE TYPE public.department_type AS ENUM ('venda', 'preparacao', 'expedicao', 'operacao', 'pos_venda');

-- =============================================
-- TABELA: Perfis de Usuário
-- =============================================
CREATE TABLE public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name TEXT,
    avatar_url TEXT,
    department department_type,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile"
ON public.profiles FOR SELECT
TO authenticated
USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
ON public.profiles FOR UPDATE
TO authenticated
USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile"
ON public.profiles FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = id);

-- =============================================
-- TABELA: Roles de Usuário (separada por segurança)
-- =============================================
CREATE TABLE public.user_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    role app_role NOT NULL DEFAULT 'operator',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    UNIQUE (user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Função de segurança para verificar roles
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.user_roles
        WHERE user_id = _user_id
        AND role = _role
    )
$$;

-- Função para verificar se é admin ou manager
CREATE OR REPLACE FUNCTION public.is_manager_or_admin(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.user_roles
        WHERE user_id = _user_id
        AND role IN ('admin', 'manager')
    )
$$;

CREATE POLICY "Users can view own roles"
ON public.user_roles FOR SELECT
TO authenticated
USING (auth.uid() = user_id OR public.is_manager_or_admin(auth.uid()));

CREATE POLICY "Admins can manage roles"
ON public.user_roles FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- =============================================
-- TABELA: Departamentos
-- =============================================
CREATE TABLE public.departments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type department_type UNIQUE NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    icon TEXT DEFAULT '📋',
    color TEXT DEFAULT '#3B82F6',
    display_order INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Departments are viewable by all authenticated"
ON public.departments FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Only admins can manage departments"
ON public.departments FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Inserir departamentos core
INSERT INTO public.departments (type, name, description, icon, color, display_order) VALUES
('venda', 'Venda', 'Comercial - Origem da OS', '💰', '#10B981', 1),
('preparacao', 'Preparação', 'Logística e Estoque', '📦', '#F59E0B', 2),
('expedicao', 'Expedição', 'Envio e Transporte', '🚚', '#3B82F6', 3),
('operacao', 'Operação', 'Execução em Campo', '⚙️', '#8B5CF6', 4),
('pos_venda', 'Pós-Venda', 'Suporte e Feedback', '🎯', '#EC4899', 5);

-- =============================================
-- TABELA: Clientes (simplificado)
-- =============================================
CREATE TABLE public.customers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    company TEXT,
    notes TEXT,
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Customers viewable by authenticated"
ON public.customers FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Managers can manage customers"
ON public.customers FOR ALL
TO authenticated
USING (public.is_manager_or_admin(auth.uid()));

-- =============================================
-- TABELA: Ordens de Serviço (OS)
-- =============================================
CREATE TABLE public.service_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    os_number TEXT UNIQUE NOT NULL,
    customer_id UUID REFERENCES public.customers(id),
    title TEXT NOT NULL,
    description TEXT,
    status os_status DEFAULT 'draft' NOT NULL,
    current_department department_type DEFAULT 'venda' NOT NULL,
    priority INTEGER DEFAULT 2 CHECK (priority >= 1 AND priority <= 5),
    due_date TIMESTAMP WITH TIME ZONE,
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    created_by UUID REFERENCES auth.users(id) NOT NULL,
    assigned_to UUID REFERENCES auth.users(id),
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

ALTER TABLE public.service_orders ENABLE ROW LEVEL SECURITY;

-- Todos autenticados podem ver OS (modo leitura pública)
CREATE POLICY "OS viewable by authenticated"
ON public.service_orders FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Managers can create OS"
ON public.service_orders FOR INSERT
TO authenticated
WITH CHECK (public.is_manager_or_admin(auth.uid()));

CREATE POLICY "Managers can update OS"
ON public.service_orders FOR UPDATE
TO authenticated
USING (public.is_manager_or_admin(auth.uid()) OR created_by = auth.uid() OR assigned_to = auth.uid());

-- Função para gerar número de OS
CREATE OR REPLACE FUNCTION public.generate_os_number()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    year_prefix TEXT;
    next_seq INTEGER;
BEGIN
    year_prefix := to_char(now(), 'YYYY');
    
    SELECT COALESCE(MAX(
        CAST(SUBSTRING(os_number FROM 'OS-\d{4}-(\d+)') AS INTEGER)
    ), 0) + 1
    INTO next_seq
    FROM public.service_orders
    WHERE os_number LIKE 'OS-' || year_prefix || '-%';
    
    NEW.os_number := 'OS-' || year_prefix || '-' || LPAD(next_seq::TEXT, 5, '0');
    RETURN NEW;
END;
$$;

CREATE TRIGGER set_os_number
BEFORE INSERT ON public.service_orders
FOR EACH ROW
WHEN (NEW.os_number IS NULL OR NEW.os_number = '')
EXECUTE FUNCTION public.generate_os_number();

-- =============================================
-- TABELA: Histórico de Etapas da OS
-- =============================================
CREATE TABLE public.os_stage_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    service_order_id UUID REFERENCES public.service_orders(id) ON DELETE CASCADE NOT NULL,
    department department_type NOT NULL,
    status stage_status DEFAULT 'pending' NOT NULL,
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    completed_by UUID REFERENCES auth.users(id),
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

ALTER TABLE public.os_stage_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Stage history viewable by authenticated"
ON public.os_stage_history FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Operators can update stages"
ON public.os_stage_history FOR ALL
TO authenticated
USING (true);

-- =============================================
-- TABELA: Templates de Checklist por Departamento
-- =============================================
CREATE TABLE public.checklist_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    department department_type NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    items JSONB NOT NULL DEFAULT '[]',
    is_active BOOLEAN DEFAULT true,
    version INTEGER DEFAULT 1,
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

ALTER TABLE public.checklist_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Templates viewable by authenticated"
ON public.checklist_templates FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Admins can manage templates"
ON public.checklist_templates FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- =============================================
-- TABELA: Checklists Preenchidos da OS
-- =============================================
CREATE TABLE public.os_checklists (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    service_order_id UUID REFERENCES public.service_orders(id) ON DELETE CASCADE NOT NULL,
    template_id UUID REFERENCES public.checklist_templates(id),
    department department_type NOT NULL,
    items JSONB NOT NULL DEFAULT '[]',
    is_completed BOOLEAN DEFAULT false,
    completed_at TIMESTAMP WITH TIME ZONE,
    completed_by UUID REFERENCES auth.users(id),
    signature_data TEXT,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

ALTER TABLE public.os_checklists ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Checklists viewable by authenticated"
ON public.os_checklists FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Operators can manage checklists"
ON public.os_checklists FOR ALL
TO authenticated
USING (true);

-- =============================================
-- TRIGGERS: Auto-create profile e role on signup
-- =============================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Criar perfil
    INSERT INTO public.profiles (id, full_name)
    VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email));
    
    -- Criar role padrão (operator)
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'operator');
    
    RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.handle_new_user();

-- =============================================
-- FUNÇÃO: Atualizar updated_at automaticamente
-- =============================================
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

CREATE TRIGGER update_profiles_updated_at
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_customers_updated_at
BEFORE UPDATE ON public.customers
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_service_orders_updated_at
BEFORE UPDATE ON public.service_orders
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_os_checklists_updated_at
BEFORE UPDATE ON public.os_checklists
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_checklist_templates_updated_at
BEFORE UPDATE ON public.checklist_templates
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- =============================================
-- ÍNDICES para performance
-- =============================================
CREATE INDEX idx_service_orders_status ON public.service_orders(status);
CREATE INDEX idx_service_orders_department ON public.service_orders(current_department);
CREATE INDEX idx_service_orders_customer ON public.service_orders(customer_id);
CREATE INDEX idx_os_stage_history_order ON public.os_stage_history(service_order_id);
CREATE INDEX idx_os_checklists_order ON public.os_checklists(service_order_id);
CREATE INDEX idx_user_roles_user ON public.user_roles(user_id);
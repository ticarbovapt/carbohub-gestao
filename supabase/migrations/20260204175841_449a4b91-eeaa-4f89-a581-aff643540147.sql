-- ============================================================
-- PLATAFORMA CARBO — MIGRAÇÃO COMPLETA
-- PDVs CarboZé + Gamificação + Comissões
-- ============================================================

-- ============================================================
-- PARTE 1: PDVs CARBOZÉ (ENTIDADE SEPARADA)
-- ============================================================

-- Criar tabela de PDVs CarboZé
CREATE TABLE public.pdvs (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    pdv_code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    contact_name TEXT,
    contact_phone TEXT,
    email TEXT,
    
    -- Endereço
    address_street TEXT,
    address_city TEXT,
    address_state TEXT,
    address_zip TEXT,
    latitude NUMERIC(10, 8),
    longitude NUMERIC(11, 8),
    
    -- Estoque e consumo
    current_stock INTEGER NOT NULL DEFAULT 0,
    min_stock_threshold INTEGER NOT NULL DEFAULT 10,
    avg_daily_consumption NUMERIC(10, 2) DEFAULT 0,
    last_replenishment_at TIMESTAMP WITH TIME ZONE,
    last_replenishment_qty INTEGER DEFAULT 0,
    
    -- Status
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'suspended')),
    has_stock_alert BOOLEAN DEFAULT false,
    last_alert_at TIMESTAMP WITH TIME ZONE,
    
    -- Relacionamentos
    assigned_licensee_id UUID REFERENCES public.licensees(id) ON DELETE SET NULL,
    
    -- Metadados
    notes TEXT,
    metadata JSONB DEFAULT '{}',
    created_by UUID,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Trigger para gerar código do PDV automaticamente
CREATE OR REPLACE FUNCTION public.generate_pdv_code()
RETURNS TRIGGER AS $$
DECLARE
    next_seq INTEGER;
BEGIN
    SELECT COALESCE(MAX(
        CAST(SUBSTRING(pdv_code FROM 'PDV-(\d+)') AS INTEGER)
    ), 0) + 1
    INTO next_seq
    FROM public.pdvs;
    
    NEW.pdv_code := 'PDV-' || LPAD(next_seq::TEXT, 4, '0');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER set_pdv_code
    BEFORE INSERT ON public.pdvs
    FOR EACH ROW
    WHEN (NEW.pdv_code IS NULL OR NEW.pdv_code = '')
    EXECUTE FUNCTION public.generate_pdv_code();

-- Histórico de reposições do PDV
CREATE TABLE public.pdv_replenishment_history (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    pdv_id UUID NOT NULL REFERENCES public.pdvs(id) ON DELETE CASCADE,
    quantity INTEGER NOT NULL,
    previous_stock INTEGER NOT NULL,
    new_stock INTEGER NOT NULL,
    service_order_id UUID REFERENCES public.service_orders(id),
    notes TEXT,
    replenished_by UUID,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Usuários vinculados a PDVs
CREATE TABLE public.pdv_users (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    pdv_id UUID NOT NULL REFERENCES public.pdvs(id) ON DELETE CASCADE,
    user_id UUID NOT NULL,
    is_primary BOOLEAN DEFAULT false,
    can_request_replenishment BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    UNIQUE(pdv_id, user_id)
);

-- RLS para PDVs
ALTER TABLE public.pdvs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pdv_replenishment_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pdv_users ENABLE ROW LEVEL SECURITY;

-- Política: Admins/Gestores podem ver e gerenciar todos os PDVs
CREATE POLICY "Admins can manage PDVs"
    ON public.pdvs FOR ALL
    USING (is_ceo(auth.uid()) OR is_gestor(auth.uid()) OR is_admin(auth.uid()));

-- Política: Usuários de PDV podem ver seu próprio PDV
CREATE POLICY "PDV users can view own PDV"
    ON public.pdvs FOR SELECT
    USING (
        id IN (SELECT pdv_id FROM public.pdv_users WHERE user_id = auth.uid())
    );

-- Histórico de reposições
CREATE POLICY "Admins can manage replenishment history"
    ON public.pdv_replenishment_history FOR ALL
    USING (is_ceo(auth.uid()) OR is_gestor(auth.uid()) OR is_admin(auth.uid()));

CREATE POLICY "PDV users can view own history"
    ON public.pdv_replenishment_history FOR SELECT
    USING (
        pdv_id IN (SELECT pdv_id FROM public.pdv_users WHERE user_id = auth.uid())
    );

-- PDV Users
CREATE POLICY "Admins can manage PDV users"
    ON public.pdv_users FOR ALL
    USING (is_ceo(auth.uid()) OR is_gestor(auth.uid()) OR is_admin(auth.uid()));

CREATE POLICY "Users can view own PDV linkage"
    ON public.pdv_users FOR SELECT
    USING (user_id = auth.uid());

-- Função para verificar se usuário é de um PDV
CREATE OR REPLACE FUNCTION public.is_pdv_user(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.pdv_users
        WHERE user_id = _user_id
    )
$$;

-- Função para obter o ID do PDV do usuário
CREATE OR REPLACE FUNCTION public.get_user_pdv_id(_user_id UUID)
RETURNS UUID
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
    SELECT pdv_id FROM public.pdv_users
    WHERE user_id = _user_id
    LIMIT 1
$$;

-- ============================================================
-- PARTE 2: GAMIFICAÇÃO DE LICENCIADOS
-- ============================================================

-- Níveis de licenciado
CREATE TYPE public.licensee_level AS ENUM ('bronze', 'prata', 'ouro', 'diamante');

-- Tabela de pontuação mensal
CREATE TABLE public.licensee_gamification (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    licensee_id UUID NOT NULL REFERENCES public.licensees(id) ON DELETE CASCADE,
    period_year INTEGER NOT NULL,
    period_month INTEGER NOT NULL,
    
    -- KPIs com pesos (calculados)
    order_volume_score NUMERIC(5, 2) DEFAULT 0,           -- 25%
    customer_recurrence_score NUMERIC(5, 2) DEFAULT 0,    -- 30%
    growth_score NUMERIC(5, 2) DEFAULT 0,                 -- 20%
    sla_score NUMERIC(5, 2) DEFAULT 0,                    -- 15%
    platform_usage_score NUMERIC(5, 2) DEFAULT 0,         -- 10%
    
    -- Pontuação total (0-100)
    total_score NUMERIC(5, 2) NOT NULL DEFAULT 0,
    
    -- Nível resultante
    level public.licensee_level NOT NULL DEFAULT 'bronze',
    
    -- Métricas brutas para cálculo
    total_orders INTEGER DEFAULT 0,
    unique_customers INTEGER DEFAULT 0,
    returning_customers INTEGER DEFAULT 0,
    previous_month_orders INTEGER DEFAULT 0,
    avg_sla_hours NUMERIC(10, 2) DEFAULT 0,
    rework_count INTEGER DEFAULT 0,
    
    -- Metadata
    calculated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    is_visible BOOLEAN DEFAULT false, -- Oculto inicialmente
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    
    UNIQUE(licensee_id, period_year, period_month)
);

-- RLS para gamificação
ALTER TABLE public.licensee_gamification ENABLE ROW LEVEL SECURITY;

-- Admins/Gestores podem ver e gerenciar
CREATE POLICY "Admins can manage gamification"
    ON public.licensee_gamification FOR ALL
    USING (is_ceo(auth.uid()) OR is_gestor(auth.uid()));

-- Licenciados podem ver sua própria pontuação (quando visível)
CREATE POLICY "Licensees can view own gamification"
    ON public.licensee_gamification FOR SELECT
    USING (
        licensee_id = get_user_licensee_id(auth.uid())
        AND is_visible = true
    );

-- Função para calcular nível baseado na pontuação
CREATE OR REPLACE FUNCTION public.calculate_licensee_level(_score NUMERIC)
RETURNS public.licensee_level
LANGUAGE sql
IMMUTABLE
AS $$
    SELECT CASE
        WHEN _score >= 90 THEN 'diamante'::public.licensee_level
        WHEN _score >= 70 THEN 'ouro'::public.licensee_level
        WHEN _score >= 50 THEN 'prata'::public.licensee_level
        ELSE 'bronze'::public.licensee_level
    END
$$;

-- Adicionar coluna de nível atual no licenciado (cache)
ALTER TABLE public.licensees 
    ADD COLUMN IF NOT EXISTS current_level public.licensee_level DEFAULT 'bronze',
    ADD COLUMN IF NOT EXISTS current_score NUMERIC(5, 2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS gamification_visible BOOLEAN DEFAULT false;

-- ============================================================
-- PARTE 3: MODELO DE COMISSÕES
-- ============================================================

-- Status de comissão
CREATE TYPE public.commission_status AS ENUM ('pending', 'approved', 'paid', 'cancelled');

-- Tabela de comissões
CREATE TABLE public.licensee_commissions (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    licensee_id UUID NOT NULL REFERENCES public.licensees(id) ON DELETE CASCADE,
    
    -- Referências (vinculado a OS validada)
    service_order_id UUID REFERENCES public.service_orders(id),
    carboze_order_id UUID REFERENCES public.carboze_orders(id),
    licensee_request_id UUID REFERENCES public.licensee_requests(id),
    
    -- Tipo de comissão
    commission_type TEXT NOT NULL CHECK (commission_type IN ('order', 'recurrence', 'growth_bonus')),
    
    -- Valores
    base_amount NUMERIC(10, 2) NOT NULL,
    commission_rate NUMERIC(5, 4) NOT NULL, -- Ex: 0.10 = 10%
    commission_amount NUMERIC(10, 2) NOT NULL,
    bonus_amount NUMERIC(10, 2) DEFAULT 0,
    total_amount NUMERIC(10, 2) NOT NULL,
    
    -- Status e validação
    status public.commission_status NOT NULL DEFAULT 'pending',
    validated_at TIMESTAMP WITH TIME ZONE,
    validated_by UUID,
    approved_at TIMESTAMP WITH TIME ZONE,
    approved_by UUID,
    paid_at TIMESTAMP WITH TIME ZONE,
    paid_by UUID,
    
    -- Período de referência
    reference_month INTEGER NOT NULL,
    reference_year INTEGER NOT NULL,
    
    -- Metadata
    notes TEXT,
    rejection_reason TEXT,
    payment_reference TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Extrato consolidado mensal
CREATE TABLE public.licensee_commission_statements (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    licensee_id UUID NOT NULL REFERENCES public.licensees(id) ON DELETE CASCADE,
    period_year INTEGER NOT NULL,
    period_month INTEGER NOT NULL,
    
    -- Totais
    total_orders INTEGER DEFAULT 0,
    total_order_commission NUMERIC(10, 2) DEFAULT 0,
    total_recurrence_commission NUMERIC(10, 2) DEFAULT 0,
    total_bonus NUMERIC(10, 2) DEFAULT 0,
    gross_total NUMERIC(10, 2) DEFAULT 0,
    
    -- Status
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed', 'paid')),
    closed_at TIMESTAMP WITH TIME ZONE,
    paid_at TIMESTAMP WITH TIME ZONE,
    
    -- Metadata
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    
    UNIQUE(licensee_id, period_year, period_month)
);

-- RLS para comissões
ALTER TABLE public.licensee_commissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.licensee_commission_statements ENABLE ROW LEVEL SECURITY;

-- Políticas para comissões
CREATE POLICY "Admins can manage commissions"
    ON public.licensee_commissions FOR ALL
    USING (is_ceo(auth.uid()) OR is_gestor(auth.uid()));

CREATE POLICY "Licensees can view own commissions"
    ON public.licensee_commissions FOR SELECT
    USING (licensee_id = get_user_licensee_id(auth.uid()));

-- Políticas para extratos
CREATE POLICY "Admins can manage statements"
    ON public.licensee_commission_statements FOR ALL
    USING (is_ceo(auth.uid()) OR is_gestor(auth.uid()));

CREATE POLICY "Licensees can view own statements"
    ON public.licensee_commission_statements FOR SELECT
    USING (licensee_id = get_user_licensee_id(auth.uid()));

-- ============================================================
-- PARTE 4: TRIGGERS E AUTOMAÇÕES
-- ============================================================

-- Trigger para atualizar updated_at nas novas tabelas
CREATE TRIGGER update_pdvs_updated_at
    BEFORE UPDATE ON public.pdvs
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_gamification_updated_at
    BEFORE UPDATE ON public.licensee_gamification
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_commissions_updated_at
    BEFORE UPDATE ON public.licensee_commissions
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_statements_updated_at
    BEFORE UPDATE ON public.licensee_commission_statements
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- Índices para performance
CREATE INDEX idx_pdvs_status ON public.pdvs(status);
CREATE INDEX idx_pdvs_stock_alert ON public.pdvs(has_stock_alert) WHERE has_stock_alert = true;
CREATE INDEX idx_pdvs_licensee ON public.pdvs(assigned_licensee_id);

CREATE INDEX idx_gamification_licensee_period ON public.licensee_gamification(licensee_id, period_year, period_month);
CREATE INDEX idx_gamification_level ON public.licensee_gamification(level);

CREATE INDEX idx_commissions_licensee ON public.licensee_commissions(licensee_id);
CREATE INDEX idx_commissions_status ON public.licensee_commissions(status);
CREATE INDEX idx_commissions_period ON public.licensee_commissions(reference_year, reference_month);

CREATE INDEX idx_statements_licensee_period ON public.licensee_commission_statements(licensee_id, period_year, period_month);
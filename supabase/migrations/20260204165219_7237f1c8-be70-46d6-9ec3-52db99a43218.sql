-- =============================================
-- ÁREA DO LICENCIADO - ESTRUTURA DE DADOS
-- =============================================

-- 1. Adicionar novo role para licenciados
ALTER TYPE public.carbo_role ADD VALUE IF NOT EXISTS 'licensed_user';

-- 2. Enum para tipos de operação
CREATE TYPE public.operation_type AS ENUM ('carbo_vapt', 'carbo_ze');

-- 3. Enum para SLA levels
CREATE TYPE public.sla_level AS ENUM ('basic', 'pro', 'premium');

-- 4. Tabela de Planos de Assinatura
CREATE TABLE public.subscription_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  sla_level sla_level NOT NULL DEFAULT 'basic',
  -- Limites do plano
  max_vapt_operations INTEGER, -- NULL = ilimitado
  max_ze_orders INTEGER, -- NULL = ilimitado
  included_credits INTEGER DEFAULT 0,
  -- SLA em horas
  sla_response_hours INTEGER DEFAULT 48,
  sla_execution_hours INTEGER DEFAULT 72,
  -- Preços
  monthly_price NUMERIC DEFAULT 0,
  price_per_vapt NUMERIC DEFAULT 0,
  price_per_ze_order NUMERIC DEFAULT 0,
  -- Flags
  is_active BOOLEAN DEFAULT true,
  is_featured BOOLEAN DEFAULT false,
  -- Metadata
  features JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 5. Tabela de Assinaturas de Licenciados
CREATE TABLE public.licensee_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  licensee_id UUID NOT NULL REFERENCES public.licensees(id) ON DELETE CASCADE,
  plan_id UUID NOT NULL REFERENCES public.subscription_plans(id),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'cancelled', 'expired')),
  -- Período
  started_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  -- Uso no período atual
  vapt_used INTEGER DEFAULT 0,
  ze_used INTEGER DEFAULT 0,
  billing_cycle_start DATE DEFAULT CURRENT_DATE,
  -- Metadata
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(licensee_id) -- Um licenciado só pode ter uma assinatura ativa
);

-- 6. Wallet de Créditos
CREATE TABLE public.licensee_wallets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  licensee_id UUID NOT NULL REFERENCES public.licensees(id) ON DELETE CASCADE UNIQUE,
  balance INTEGER DEFAULT 0,
  total_earned INTEGER DEFAULT 0,
  total_spent INTEGER DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 7. Histórico de Transações de Créditos
CREATE TABLE public.credit_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_id UUID NOT NULL REFERENCES public.licensee_wallets(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL, -- Positivo = crédito, Negativo = débito
  balance_after INTEGER NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('purchase', 'consumption', 'refund', 'bonus', 'expiry')),
  description TEXT,
  -- Referências opcionais
  service_order_id UUID REFERENCES public.service_orders(id),
  order_id UUID REFERENCES public.carboze_orders(id),
  -- Validade (para créditos com expiração)
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 8. Catálogo de Serviços (CarboVAPT e CarboZé)
CREATE TABLE public.service_catalog (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_type operation_type NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  -- Preços e créditos
  credit_cost INTEGER DEFAULT 0,
  base_price NUMERIC DEFAULT 0,
  -- SLA padrão em horas
  default_sla_hours INTEGER DEFAULT 48,
  -- Configurações
  requires_scheduling BOOLEAN DEFAULT true,
  is_recurring_eligible BOOLEAN DEFAULT false,
  min_lead_time_hours INTEGER DEFAULT 24,
  -- Metadata
  icon TEXT DEFAULT '🔧',
  display_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 9. Solicitações/Pedidos do Licenciado (Checkout)
CREATE TABLE public.licensee_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  licensee_id UUID NOT NULL REFERENCES public.licensees(id),
  service_id UUID NOT NULL REFERENCES public.service_catalog(id),
  request_number TEXT NOT NULL UNIQUE,
  operation_type operation_type NOT NULL,
  -- Detalhes da solicitação
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'processing', 'completed', 'cancelled')),
  -- Endereço da operação
  operation_address TEXT,
  operation_city TEXT,
  operation_state TEXT,
  operation_zip TEXT,
  -- Agendamento
  preferred_date DATE,
  preferred_time_start TIME,
  preferred_time_end TIME,
  scheduled_date TIMESTAMPTZ,
  -- Pagamento
  payment_method TEXT DEFAULT 'credits' CHECK (payment_method IN ('credits', 'invoice', 'plan')),
  credits_used INTEGER DEFAULT 0,
  amount_charged NUMERIC DEFAULT 0,
  -- SLA
  sla_deadline TIMESTAMPTZ,
  sla_breached BOOLEAN DEFAULT false,
  -- Referências geradas
  service_order_id UUID REFERENCES public.service_orders(id),
  carboze_order_id UUID REFERENCES public.carboze_orders(id),
  -- Recorrência
  is_recurring BOOLEAN DEFAULT false,
  recurrence_interval_days INTEGER,
  parent_request_id UUID REFERENCES public.licensee_requests(id),
  -- Metadata
  notes TEXT,
  internal_notes TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 10. Vincular licenciado a usuário (para login)
CREATE TABLE public.licensee_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  licensee_id UUID NOT NULL REFERENCES public.licensees(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  is_primary BOOLEAN DEFAULT false,
  can_order BOOLEAN DEFAULT true,
  can_view_financials BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(licensee_id, user_id)
);

-- 11. Triggers para auto-geração de números
CREATE OR REPLACE FUNCTION public.generate_request_number()
RETURNS TRIGGER AS $$
DECLARE
    year_prefix TEXT;
    next_seq INTEGER;
BEGIN
    year_prefix := to_char(now(), 'YYYY');
    
    SELECT COALESCE(MAX(
        CAST(SUBSTRING(request_number FROM 'REQ-\d{4}-(\d+)') AS INTEGER)
    ), 0) + 1
    INTO next_seq
    FROM public.licensee_requests
    WHERE request_number LIKE 'REQ-' || year_prefix || '-%';
    
    NEW.request_number := 'REQ-' || year_prefix || '-' || LPAD(next_seq::TEXT, 5, '0');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER generate_request_number_trigger
BEFORE INSERT ON public.licensee_requests
FOR EACH ROW EXECUTE FUNCTION generate_request_number();

-- 12. Trigger para atualizar updated_at
CREATE TRIGGER update_subscription_plans_updated_at
BEFORE UPDATE ON public.subscription_plans
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_licensee_subscriptions_updated_at
BEFORE UPDATE ON public.licensee_subscriptions
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_service_catalog_updated_at
BEFORE UPDATE ON public.service_catalog
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_licensee_requests_updated_at
BEFORE UPDATE ON public.licensee_requests
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 13. Função auxiliar para verificar se é licenciado
CREATE OR REPLACE FUNCTION public.is_licensed_user(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.licensee_users
    WHERE user_id = _user_id
  )
$$;

-- 14. Função para obter licensee_id do usuário
CREATE OR REPLACE FUNCTION public.get_user_licensee_id(_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT licensee_id FROM public.licensee_users
  WHERE user_id = _user_id
  LIMIT 1
$$;

-- =============================================
-- RLS POLICIES
-- =============================================

-- subscription_plans (público para leitura)
ALTER TABLE public.subscription_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view active plans"
ON public.subscription_plans FOR SELECT
USING (is_active = true);

CREATE POLICY "Admins can manage plans"
ON public.subscription_plans FOR ALL
USING (is_ceo(auth.uid()) OR is_gestor(auth.uid()));

-- licensee_subscriptions
ALTER TABLE public.licensee_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Licensees can view own subscription"
ON public.licensee_subscriptions FOR SELECT
USING (
  auth.uid() IS NOT NULL AND (
    is_ceo(auth.uid()) OR is_gestor(auth.uid()) OR
    licensee_id = get_user_licensee_id(auth.uid())
  )
);

CREATE POLICY "Admins can manage subscriptions"
ON public.licensee_subscriptions FOR ALL
USING (is_ceo(auth.uid()) OR is_gestor(auth.uid()));

-- licensee_wallets
ALTER TABLE public.licensee_wallets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Licensees can view own wallet"
ON public.licensee_wallets FOR SELECT
USING (
  auth.uid() IS NOT NULL AND (
    is_ceo(auth.uid()) OR is_gestor(auth.uid()) OR
    licensee_id = get_user_licensee_id(auth.uid())
  )
);

CREATE POLICY "Admins can manage wallets"
ON public.licensee_wallets FOR ALL
USING (is_ceo(auth.uid()) OR is_gestor(auth.uid()));

-- credit_transactions
ALTER TABLE public.credit_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Licensees can view own transactions"
ON public.credit_transactions FOR SELECT
USING (
  auth.uid() IS NOT NULL AND (
    is_ceo(auth.uid()) OR is_gestor(auth.uid()) OR
    wallet_id IN (
      SELECT id FROM public.licensee_wallets 
      WHERE licensee_id = get_user_licensee_id(auth.uid())
    )
  )
);

CREATE POLICY "Admins can manage transactions"
ON public.credit_transactions FOR ALL
USING (is_ceo(auth.uid()) OR is_gestor(auth.uid()));

-- service_catalog
ALTER TABLE public.service_catalog ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view active services"
ON public.service_catalog FOR SELECT
USING (is_active = true);

CREATE POLICY "Admins can manage catalog"
ON public.service_catalog FOR ALL
USING (is_ceo(auth.uid()) OR is_gestor(auth.uid()));

-- licensee_requests
ALTER TABLE public.licensee_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Licensees can view own requests"
ON public.licensee_requests FOR SELECT
USING (
  auth.uid() IS NOT NULL AND (
    is_ceo(auth.uid()) OR is_gestor(auth.uid()) OR
    licensee_id = get_user_licensee_id(auth.uid())
  )
);

CREATE POLICY "Licensees can create requests"
ON public.licensee_requests FOR INSERT
WITH CHECK (
  auth.uid() IS NOT NULL AND (
    is_ceo(auth.uid()) OR is_gestor(auth.uid()) OR
    (licensee_id = get_user_licensee_id(auth.uid()) AND 
     EXISTS (SELECT 1 FROM public.licensee_users WHERE user_id = auth.uid() AND can_order = true))
  )
);

CREATE POLICY "Admins can manage requests"
ON public.licensee_requests FOR ALL
USING (is_ceo(auth.uid()) OR is_gestor(auth.uid()));

-- licensee_users
ALTER TABLE public.licensee_users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own linkage"
ON public.licensee_users FOR SELECT
USING (auth.uid() = user_id OR is_ceo(auth.uid()) OR is_gestor(auth.uid()));

CREATE POLICY "Admins can manage user linkages"
ON public.licensee_users FOR ALL
USING (is_ceo(auth.uid()) OR is_gestor(auth.uid()));

-- =============================================
-- DADOS INICIAIS
-- =============================================

-- Planos padrão
INSERT INTO public.subscription_plans (name, slug, description, sla_level, max_vapt_operations, max_ze_orders, included_credits, sla_response_hours, sla_execution_hours, monthly_price, features, is_featured) VALUES
('Básico', 'basic', 'Ideal para operações de baixo volume', 'basic', 5, 10, 100, 48, 72, 299, '["Até 5 operações VAPT/mês", "Até 10 pedidos CarboZé/mês", "100 créditos inclusos", "Suporte por email"]', false),
('Pro', 'pro', 'Para licenciados em crescimento', 'pro', 15, 30, 300, 24, 48, 799, '["Até 15 operações VAPT/mês", "Até 30 pedidos CarboZé/mês", "300 créditos inclusos", "Suporte prioritário", "Relatórios mensais"]', true),
('Premium', 'premium', 'Operações de alto volume', 'premium', NULL, NULL, 1000, 12, 24, 1999, '["Operações VAPT ilimitadas", "Pedidos CarboZé ilimitados", "1000 créditos inclusos", "Suporte dedicado", "Dashboard analytics", "API de integração"]', false);

-- Catálogo de serviços CarboVAPT
INSERT INTO public.service_catalog (operation_type, name, description, credit_cost, base_price, default_sla_hours, requires_scheduling, icon, display_order) VALUES
('carbo_vapt', 'Descarbonização Completa', 'Serviço completo de descarbonização do veículo', 50, 250, 48, true, '🚗', 1),
('carbo_vapt', 'Descarbonização Express', 'Descarbonização rápida para manutenção preventiva', 30, 150, 24, true, '⚡', 2),
('carbo_vapt', 'Diagnóstico Pré-Descarbonização', 'Análise do estado do motor antes do serviço', 10, 50, 24, true, '🔍', 3);

-- Catálogo de serviços CarboZé
INSERT INTO public.service_catalog (operation_type, name, description, credit_cost, base_price, default_sla_hours, requires_scheduling, is_recurring_eligible, icon, display_order) VALUES
('carbo_ze', 'Reposição de Insumos Padrão', 'Kit de insumos para operação regular', 20, 100, 72, false, true, '📦', 1),
('carbo_ze', 'Kit Premium de Insumos', 'Kit completo com insumos especiais', 40, 200, 72, false, true, '🎁', 2),
('carbo_ze', 'Peças de Reposição', 'Peças e componentes para manutenção', 15, 80, 48, false, false, '🔧', 3);